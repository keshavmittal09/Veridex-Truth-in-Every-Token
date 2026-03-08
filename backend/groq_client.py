"""
Groq LLM Client — Fast inference alternative to Gemini using Llama models.
Provides the same interface as gemini_client for seamless switching.
"""

import os
import re
import json
import asyncio

from dotenv import load_dotenv

load_dotenv()

_client = None


def _get_client():
    global _client
    if _client is None:
        try:
            from groq import AsyncGroq
            api_key = os.getenv("GROQ_API_KEY", "")
            if not api_key:
                raise ValueError("GROQ_API_KEY not set")
            _client = AsyncGroq(api_key=api_key)
        except ImportError:
            raise ImportError("groq package not installed. Run: pip install groq")
    return _client


MODEL = "llama-3.1-8b-instant"


async def groq_decompose_claims(text: str, mode: str = "general") -> list:
    """Decompose text into atomic claims using Groq/Llama."""
    client = _get_client()

    prompt = f"""You are an expert fact-checking analyst. Given the following text, decompose it into individual atomic claims. For each claim, provide:

1. "claim": The exact claim text extracted from the source
2. "type": One of: STATISTICAL_FACT, VERIFIABLE_FACT, HISTORICAL_FACT, REASONING, PREDICTION, OPINION, DEFINITION
3. "checkable": true if this claim can be verified against external data sources, false otherwise
4. "searchQueries": An array of 2-3 specific search queries that would help verify this claim
5. "sentenceIndex": Which sentence (0-indexed) in the original text this claim appears in
6. "numericalValues": An array of any specific numbers, dates, percentages, or quantities mentioned (empty array if none)

Domain context: {mode}

Rules:
- Extract EVERY factual claim, no matter how small
- Even implied claims should be extracted
- Separate compound claims into individual atomic claims
- Pay special attention to numerical values
- Be exhaustive and precise
- Return ONLY a valid JSON array, no other text

Text to analyze:
\"\"\"
{text}
\"\"\""""

    for attempt in range(3):
        try:
            response = await client.chat.completions.create(
                model=MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=4096,
            )
            text_response = response.choices[0].message.content
            json_match = re.search(r'\[[\s\S]*\]', text_response)
            if not json_match:
                raise ValueError("No JSON array found in Groq response")
            claims = json.loads(json_match.group())
            return [{"id": i, **c} for i, c in enumerate(claims)]
        except Exception as e:
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)
            else:
                raise


async def groq_analyze_claim(claim: str, source_text: str, source_name: str) -> dict:
    """Analyze a claim against source text using Groq/Llama."""
    client = _get_client()

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
            response = await client.chat.completions.create(
                model=MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=1024,
            )
            text_response = response.choices[0].message.content
            json_match = re.search(r'\{[\s\S]*\}', text_response)
            if not json_match:
                return {"verdict": "INSUFFICIENT", "confidence": 0, "evidence": "", "explanation": "Could not parse"}
            return json.loads(json_match.group())
        except Exception as e:
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)
            else:
                return {"verdict": "INSUFFICIENT", "confidence": 0, "evidence": "", "explanation": str(e)}


async def groq_generate_text(prompt: str) -> str:
    """Generic text generation with Groq for correction engine and other tasks."""
    client = _get_client()
    try:
        response = await client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=2048,
        )
        return response.choices[0].message.content
    except Exception:
        return ""
