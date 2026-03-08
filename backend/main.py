"""
TrustLayer Python Backend — FastAPI Application
Real-time AI hallucination verification engine with SSE streaming.
Features: Multi-LLM (Gemini/Groq), domain-specific verification,
correction suggestions, enterprise compliance mode.
"""

import asyncio
import json
import os
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from pdf_extractor import extract_text_from_pdf

from gemini_client import (
    decompose_claims as gemini_decompose,
    analyze_claim_against_source as gemini_analyze,
    gemini_generate_text,
)
from groq_client import (
    groq_decompose_claims as groq_decompose,
    groq_analyze_claim as groq_analyze,
    groq_generate_text,
)
from correction_engine import generate_correction
from compliance import ComplianceLedger
from numerical_checker import run_numerical_check
from scoring import triangulate, calculate_overall_score
from sources.wikipedia import search_wikipedia
from sources.wikidata import search_wikidata
from sources.factcheck import search_factcheck
from sources.pubmed import search_pubmed
from sources.courtlistener import search_courtlistener
from sources.sec_edgar import search_sec_edgar
from sources.academic import search_academic
from sources.gnews import search_gnews

load_dotenv()

app = FastAPI(title="Veridex API", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_llm_functions(provider: str = None):
    """Auto-detect available LLM. Prefers specified provider, else Groq, then Gemini."""
    if provider == "groq" and os.getenv("GROQ_API_KEY"):
        return groq_decompose, groq_analyze, groq_generate_text, "groq"
    if provider == "gemini" and os.getenv("GEMINI_API_KEY"):
        return gemini_decompose, gemini_analyze, gemini_generate_text, "gemini"
        
    if os.getenv("GROQ_API_KEY"):
        return groq_decompose, groq_analyze, groq_generate_text, "groq"
    if os.getenv("GEMINI_API_KEY"):
        return gemini_decompose, gemini_analyze, gemini_generate_text, "gemini"
    # Fallback to Gemini
    return gemini_decompose, gemini_analyze, gemini_generate_text, "gemini"


def get_source_tasks(mode: str, query: str) -> dict:
    """Get authoritative source search coroutines based on domain mode.
    
    Only uses verified, authoritative sources:
    - Wikipedia (encyclopedia)
    - Wikidata (structured facts database)
    - Google Fact Check (known misinformation database)
    - PubMed (medical/scientific literature - NCBI)
    - CourtListener (legal case database)
    - SEC EDGAR (financial filings - US govt)
    - CrossRef + Semantic Scholar (academic papers)
    - GNews (verified news sources)
    """
    # Core authoritative sources for ALL modes
    tasks = {
        "Wikipedia": search_wikipedia(query),
        "Wikidata": search_wikidata(query),
        "Google Fact Check": search_factcheck(query),
    }

    # News API for recent events (all modes)
    tasks["GNews"] = search_gnews(query)

    # Domain-specific authoritative sources
    if mode == "medical":
        tasks["PubMed"] = search_pubmed(query)
    elif mode == "legal":
        tasks["CourtListener"] = search_courtlistener(query)
    elif mode == "financial":
        tasks["SEC EDGAR"] = search_sec_edgar(query)
    elif mode == "academic":
        tasks["Academic"] = search_academic(query)
    else:
        # General mode: add PubMed for science claims + Academic for citations
        tasks["PubMed"] = search_pubmed(query)
        tasks["Academic"] = search_academic(query)

    return tasks


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": "3.0",
        "engine": "Veridex Python",
        "providers": {
            "gemini": bool(os.getenv("GEMINI_API_KEY")),
            "groq": bool(os.getenv("GROQ_API_KEY")),
        },
        "modes": ["general", "medical", "legal", "financial", "academic"],
    }


@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """Extract text from an uploaded PDF for compliance verification."""
    if not file.filename.lower().endswith(".pdf"):
        return JSONResponse({"error": "Only PDF files are accepted"}, status_code=400)

    try:
        pdf_bytes = await file.read()
        if len(pdf_bytes) > 20 * 1024 * 1024:  # 20MB limit
            return JSONResponse({"error": "PDF exceeds 20MB limit"}, status_code=400)

        result = extract_text_from_pdf(pdf_bytes)

        if result.get("error"):
            return JSONResponse({"error": f"PDF extraction failed: {result['error']}"}, status_code=500)

        if not result["text"].strip():
            return JSONResponse({"error": "No readable text found in PDF"}, status_code=400)

        return {
            "text": result["text"],
            "pages": result["pages"],
            "filename": file.filename,
        }
    except Exception as e:
        return JSONResponse({"error": f"Upload failed: {str(e)}"}, status_code=500)


@app.post("/api/decompose")
async def decompose(request: Request):
    body = await request.json()
    text = body.get("text", "")
    mode = body.get("mode", "general")

    if not text.strip():
        return JSONResponse({"error": "No text provided"}, status_code=400)

    decompose_fn, _, _, provider_name = get_llm_functions()

    try:
        claims = await decompose_fn(text, mode)
        return {"claims": claims, "llmProvider": provider_name}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/verify")
async def verify(request: Request):
    body = await request.json()
    claims = body.get("claims", [])
    mode = body.get("mode", "general")
    compliance_mode = body.get("complianceMode", False)
    confidence_threshold = body.get("confidenceThreshold", 0.8)
    # Normalize: if someone sends 70 instead of 0.7, convert to 0-1 scale
    if confidence_threshold > 1:
        confidence_threshold = confidence_threshold / 100.0

    if not claims:
        return JSONResponse({"error": "No claims provided"}, status_code=400)

    _, analyze_fn, generate_fn, _ = get_llm_functions()

    # Initialize compliance ledger if needed
    ledger = None
    if compliance_mode:
        session_id = str(uuid.uuid4())[:12]
        ledger = ComplianceLedger(session_id, confidence_threshold)

    async def event_generator():
        all_results = []

        for claim_data in claims:
            claim_id = claim_data.get("id", 0)
            claim_text = claim_data.get("claim", "")
            claim_type = claim_data.get("type", "VERIFIABLE_FACT")
            search_queries = claim_data.get("searchQueries", [claim_text])
            checkable = claim_data.get("checkable", True)
            sentence_index = claim_data.get("sentenceIndex", 0)

            # Signal: checking this claim
            yield {
                "event": "claim_checking",
                "data": json.dumps({
                    "event": "claim_checking",
                    "claimId": claim_id,
                    "claim": claim_text,
                }),
            }

            if not checkable or claim_type == "OPINION":
                result = {
                    "event": "claim_result",
                    "claimId": claim_id,
                    "claim": claim_text,
                    "type": claim_type,
                    "sentenceIndex": sentence_index,
                    "verdict": "OPINION",
                    "confidence": None,
                    "explanation": "Subjective statement — not a verifiable fact.",
                    "sources": [],
                    "numericalAnalysis": None,
                    "correction": None,
                }
                all_results.append(result)
                if ledger:
                    ledger.log_claim(claim_id, claim_text, claim_type, "OPINION", 1.0, [])
                yield {"event": "claim_result", "data": json.dumps(result)}
                continue

            query = search_queries[0] if search_queries else claim_text

            # Fetch domain-specific sources in parallel
            yield {
                "event": "checking_source",
                "data": json.dumps({
                    "event": "checking_source",
                    "claimId": claim_id,
                    "sourceName": "All Sources",
                    "sourceTitle": f"Querying sources for {mode} mode...",
                }),
            }

            source_task_map = get_source_tasks(mode, query)
            source_names_list = list(source_task_map.keys())
            source_coros = list(source_task_map.values())

            source_results = await asyncio.gather(*source_coros, return_exceptions=True)

            fetched_sources = []
            for src_result, src_name in zip(source_results, source_names_list):
                if isinstance(src_result, Exception):
                    continue
                if isinstance(src_result, dict) and src_result.get("found"):
                    fetched_sources.append(src_result)

            # Analyze claim against each source using selected LLM
            analysis_results = []
            source_texts_for_numerical = {}

            for src in fetched_sources:
                src_name = src.get("source", "Unknown")
                src_title = src.get("title", "")
                src_content = src.get("content", "")
                src_url = src.get("url", "")

                if not src_content.strip():
                    continue

                source_texts_for_numerical[src_name] = src_content

                yield {
                    "event": "checking_source",
                    "data": json.dumps({
                        "event": "checking_source",
                        "claimId": claim_id,
                        "sourceName": src_name,
                        "sourceTitle": src_title,
                    }),
                }

                try:
                    analysis = await analyze_fn(claim_text, src_content, src_name)
                    analysis["sourceName"] = src_name
                    analysis["sourceTitle"] = src_title
                    analysis["sourceUrl"] = src_url
                    analysis_results.append(analysis)
                except Exception:
                    analysis_results.append({
                        "verdict": "INSUFFICIENT",
                        "confidence": 0,
                        "evidence": "",
                        "explanation": "Analysis failed",
                        "sourceName": src_name,
                        "sourceTitle": src_title,
                        "sourceUrl": src_url,
                    })

            # Run numerical checker
            numerical_result = run_numerical_check(claim_text, source_texts_for_numerical)

            # Triangulate
            tri = triangulate(analysis_results, claim_type, numerical_result)

            # Generate correction for hallucinated/disputed claims
            correction = None
            if tri["verdict"] in ("HALLUCINATION", "LIKELY_HALLUCINATION", "DISPUTED"):
                try:
                    correction = await generate_correction(
                        claim_text, analysis_results, generate_fn
                    )
                except Exception:
                    pass

            result = {
                "event": "claim_result",
                "claimId": claim_id,
                "claim": claim_text,
                "type": claim_type,
                "sentenceIndex": sentence_index,
                "verdict": tri["verdict"],
                "confidence": tri["confidence"],
                "explanation": tri["explanation"],
                "sources": analysis_results,
                "sourceBreakdown": tri.get("sourceBreakdown", {}),
                "numericalAnalysis": numerical_result if numerical_result.get("hasNumericalData") else None,
                "correction": correction,
            }
            all_results.append(result)

            # Log to compliance ledger
            if ledger:
                ledger.log_claim(
                    claim_id, claim_text, claim_type,
                    tri["verdict"], tri["confidence"],
                    analysis_results, correction,
                    numerical_result if numerical_result.get("hasNumericalData") else None,
                )

            yield {"event": "claim_result", "data": json.dumps(result)}

        # Final event — overall score + visualization
        overall_score = calculate_overall_score(all_results)

        verdict_counts = {}
        type_counts = {}
        source_agreement = {"supports": 0, "contradicts": 0, "insufficient": 0}

        for r in all_results:
            v = r.get("verdict", "UNVERIFIABLE")
            verdict_counts[v] = verdict_counts.get(v, 0) + 1
            t = r.get("type", "VERIFIABLE_FACT")
            type_counts[t] = type_counts.get(t, 0) + 1
            sb = r.get("sourceBreakdown", {})
            source_agreement["supports"] += sb.get("supports", 0)
            source_agreement["contradicts"] += sb.get("contradicts", 0)
            source_agreement["insufficient"] += sb.get("insufficient", 0)

        # Compliance evaluation
        compliance_report = None
        if ledger:
            compliance_report = ledger.evaluate_document(overall_score)

        yield {
            "event": "verification_complete",
            "data": json.dumps({
                "event": "verification_complete",
                "overallScore": overall_score,
                "totalClaims": len(all_results),
                "visualizationData": {
                    "verdictDistribution": verdict_counts,
                    "claimTypeBreakdown": type_counts,
                    "sourceAgreement": source_agreement,
                },
                "complianceReport": compliance_report,
            }),
        }

    return EventSourceResponse(event_generator())


@app.post("/msg/")
async def extension_fact_check(request: Request):
    try:
        data = await request.json()
        ai_response = data.get("response", "")
        provider = data.get("provider", "groq") # groq or gemini
        
        if not ai_response:
            return JSONResponse({"error": "No AI response text provided"}, status_code=400)
            
        # Get specified provider functions
        decompose_fn, analyze_fn, _, _ = get_llm_functions(provider)
        
        # 1. Decompose claims
        claims = await decompose_fn(ai_response, "general")
        
        if not claims:
            return JSONResponse({
                "Trust Score": 100,
                "Historical Facts": [],
                "Verifiable Facts": [{"fact": "No verifiable facts extracted from text"}]
            })
            
        all_results = []
        historical = []
        verifiable = []
        
        # 2. Verify claims
        for claim_data in claims:
            claim_text = claim_data.get("claim", "")
            claim_type = claim_data.get("type", "VERIFIABLE_FACT")
            search_queries = claim_data.get("searchQueries", [claim_text])
            checkable = claim_data.get("checkable", True)
            
            if not checkable or claim_type == "OPINION":
                continue
                
            query = search_queries[0] if search_queries else claim_text
            source_task_map = get_source_tasks("general", query)
            source_names_list = list(source_task_map.keys())
            source_coros = list(source_task_map.values())
            
            # Run cross checks
            source_results = await asyncio.gather(*source_coros, return_exceptions=True)
            
            fetched_sources = []
            for src_result in source_results:
                if isinstance(src_result, Exception): continue
                if isinstance(src_result, dict) and src_result.get("found"):
                    fetched_sources.append(src_result)
                    
            analysis_results = []
            for src in fetched_sources:
                src_name = src.get("source", "Unknown")
                src_content = src.get("content", "")
                if not src_content.strip(): continue
                
                try:
                    analysis = await analyze_fn(claim_text, src_content, src_name)
                    analysis_results.append(analysis)
                except Exception:
                    pass
                    
            # Triangulate
            numerical_result = run_numerical_check(claim_text, {src.get("source"): src.get("content") for src in fetched_sources})
            tri = triangulate(analysis_results, claim_type, numerical_result)
            
            result_item = {
                "claim": claim_text,
                "verdict": tri["verdict"],
                "confidence": tri["confidence"],
                "explanation": tri["explanation"]
            }
            all_results.append(result_item)
            
            summary_fact = f"{claim_text}"
            if len(summary_fact) > 100:
                summary_fact = summary_fact[:97] + "..."
                
            if result_item["verdict"] in ["HALLUCINATION", "LIKELY_HALLUCINATION", "DISPUTED", "FALSE"]:
                historical.append({"fact": f"{summary_fact} - {result_item['explanation']}"})
            elif result_item["verdict"] in ["VERIFIED", "MOSTLY_VERIFIED", "TRUE"]:
                verifiable.append({"fact": summary_fact})
                
        # 3. Compile report
        total_claims = len(all_results)
        if total_claims == 0:
            score = 100
        else:
            score = calculate_overall_score([{
                "verdict": r["verdict"], 
                "confidence": r["confidence"], 
                "type": "VERIFIABLE_FACT", 
                "sourceBreakdown": {}
            } for r in all_results])
            
        if len(historical) == 0 and len(verifiable) == 0:
             verifiable.append({"fact": "Checked against Wikipedia, Search, and FactCheck APIs. All assertions appear standard."})
            
        return JSONResponse({
            "Trust Score": score,
            "Historical Facts": historical,
            "Verifiable Facts": verifiable
        })
        
    except Exception as e:
        print(f"Extension Fact Check Error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
