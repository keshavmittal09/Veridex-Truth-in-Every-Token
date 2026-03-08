import os
import re
import json
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

model = genai.GenerativeModel("gemini-2.5-flash")


async def decompose_claims(text: str, mode: str = "general") -> list:
    prompt = f"""You are an expert fact-checking analyst. Given the following text, decompose it into individual atomic claims. For each claim, provide:

1. "claim": The exact claim text extracted from the source
2. "type": One of: STATISTICAL_FACT, VERIFIABLE_FACT, HISTORICAL_FACT, REASONING, PREDICTION, OPINION, DEFINITION
3. "checkable": true if this claim can be verified against external data sources, false otherwise
4. "searchQueries": An array of 2-3 specific search queries that would help verify this claim against encyclopedias and databases
5. "sentenceIndex": Which sentence (0-indexed) in the original text this claim appears in
6. "numericalValues": An array of any specific numbers, dates, percentages, or quantities mentioned in the claim (empty array if none)

Domain context: {mode}

Rules:
- Extract EVERY factual claim, no matter how small
- Even implied claims should be extracted
- Separate compound claims into individual atomic claims
- Pay special attention to numerical values - extract exact numbers
- Be exhaustive and precise
- Return ONLY a valid JSON array, no other text

Text to analyze:
\"\"\"
{text}
\"\"\""""

    for attempt in range(3):
        try:
            response = await model.generate_content_async(prompt)
            text_response = response.text
            json_match = re.search(r'\[[\s\S]*\]', text_response)
            if not json_match:
                raise ValueError("No JSON array found in response")
            claims = json.loads(json_match.group())
            return [{"id": i, **c} for i, c in enumerate(claims)]
        except Exception as e:
            if "429" in str(e) and attempt < 2:
                import asyncio
                await asyncio.sleep(2 ** attempt * 2)
            else:
                raise


async def gemini_generate_text(prompt: str) -> str:
    """Generic text generation with Gemini for correction engine and other tasks."""
    for attempt in range(3):
        try:
            response = await model.generate_content_async(prompt)
            return response.text
        except Exception as e:
            if "429" in str(e) and attempt < 2:
                import asyncio
                await asyncio.sleep(2 ** attempt * 2)
            else:
                return ""


async def analyze_claim_against_source(claim: str, source_text: str, source_name: str) -> dict:
    prompt = f"""You are a fact-checking analyst. Compare this claim against the provided source text and determine if the source SUPPORTS, CONTRADICTS, or provides INSUFFICIENT evidence.

Claim: "{claim}"

Source ({source_name}):
\"\"\"
{source_text[:3000]}
\"\"\"

Respond with ONLY a JSON object:
{{
  "verdict": "SUPPORTS" | "CONTRADICTS" | "INSUFFICIENT",
  "confidence": 0.0 to 1.0,
  "evidence": "Brief quote or explanation from the source",
  "explanation": "One sentence explaining your reasoning"
}}"""

    for attempt in range(3):
        try:
            response = await model.generate_content_async(prompt)
            text_response = response.text
            json_match = re.search(r'\{[\s\S]*\}', text_response)
            if not json_match:
                return {"verdict": "INSUFFICIENT", "confidence": 0, "evidence": "", "explanation": "Could not analyze"}
            return json.loads(json_match.group())
        except Exception as e:
            if "429" in str(e) and attempt < 2:
                import asyncio
                await asyncio.sleep(2 ** attempt * 2)
            else:
                return {"verdict": "INSUFFICIENT", "confidence": 0, "evidence": "", "explanation": str(e)}
