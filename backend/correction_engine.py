"""
Correction Engine — Auto-suggests corrected versions of hallucinated claims
with source citations inline. Not just flagging, but fixing.

When a hallucination is detected, this module generates:
1. A corrected version of the claim based on source evidence
2. An explanation of what was wrong
3. Inline citations from the verifying sources
"""

import re
import json


async def generate_correction(claim_text: str, source_analyses: list, generate_fn) -> dict:
    """Generate a corrected version of a hallucinated claim.

    Args:
        claim_text: The original hallucinated claim
        source_analyses: List of source analysis results with evidence
        generate_fn: Async function to generate text (gemini_generate_text or groq_generate_text)

    Returns:
        Correction dict with correctedClaim, explanation, and citations, or None if unavailable
    """
    # Build evidence from sources that provided useful data
    evidence_parts = []
    for src in source_analyses:
        verdict = src.get("verdict", "INSUFFICIENT")
        if verdict in ("CONTRADICTS", "SUPPORTS"):
            name = src.get("sourceName", "Unknown")
            evidence = src.get("evidence", src.get("explanation", ""))
            url = src.get("sourceUrl", "")
            if evidence:
                evidence_parts.append(
                    f"[{name}] ({verdict}): {evidence}"
                    + (f" — URL: {url}" if url else "")
                )

    if not evidence_parts:
        return None

    evidence_text = "\n".join(evidence_parts)

    prompt = f"""A fact-checking system has identified the following claim as inaccurate or hallucinated.
Based on the evidence from trusted sources, generate a corrected version.

HALLUCINATED CLAIM: "{claim_text}"

EVIDENCE FROM SOURCES:
{evidence_text}

Respond with ONLY a JSON object (no other text):
{{
    "correctedClaim": "The factually accurate version of the claim, rewritten to reflect the truth",
    "explanation": "2-3 sentences explaining what was wrong and what the actual facts are",
    "confidence": 0.0 to 1.0,
    "citations": [
        {{"source": "source name", "quote": "relevant evidence from that source", "url": "source url if available"}}
    ]
}}"""

    try:
        response_text = await generate_fn(prompt)
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if not json_match:
            return None
        correction = json.loads(json_match.group())
        # Validate required fields exist
        if "correctedClaim" not in correction:
            return None
        return correction
    except Exception:
        return None
