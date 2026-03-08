"""Triangulation scoring engine — combines results from multiple sources into a final verdict."""


TYPE_WEIGHTS = {
    "STATISTICAL_FACT": 1.5,
    "VERIFIABLE_FACT": 1.0,
    "HISTORICAL_FACT": 1.2,
    "REASONING": 0.6,
    "PREDICTION": 0.3,
    "OPINION": 0.2,
    "DEFINITION": 0.8,
}


def triangulate(source_results: list, claim_type: str = "VERIFIABLE_FACT", numerical_result: dict = None) -> dict:
    """Combine results from multiple verification sources into a single verdict.
    
    Args:
        source_results: List of {verdict, confidence, ...} from each source
        claim_type: Type of claim for weighting
        numerical_result: Optional numerical checker result
    
    Returns:
        Final verdict with confidence and explanation
    """
    if not source_results:
        return {
            "verdict": "UNVERIFIABLE",
            "confidence": 0.0,
            "explanation": "No source data available for verification.",
        }

    if claim_type == "OPINION":
        return {
            "verdict": "OPINION",
            "confidence": 1.0,
            "explanation": "This is a subjective statement, not a verifiable fact.",
        }

    supports = [r for r in source_results if r.get("verdict") == "SUPPORTS"]
    contradicts = [r for r in source_results if r.get("verdict") == "CONTRADICTS"]
    insufficient = [r for r in source_results if r.get("verdict") == "INSUFFICIENT"]

    total = len(source_results)
    support_ratio = len(supports) / total if total > 0 else 0
    contradict_ratio = len(contradicts) / total if total > 0 else 0

    # Factor in numerical analysis
    numerical_penalty = 0
    if numerical_result and numerical_result.get("hasNumericalData"):
        nv = numerical_result.get("numericalVerdict", "")
        if nv == "NUMERICAL_MISMATCH":
            numerical_penalty = 0.3
        elif nv == "NUMERICAL_DISPUTED":
            numerical_penalty = 0.15

    # Calculate weighted confidence
    if supports:
        avg_support_conf = sum(r.get("confidence", 0.5) for r in supports) / len(supports)
    else:
        avg_support_conf = 0

    if contradicts:
        avg_contradict_conf = sum(r.get("confidence", 0.5) for r in contradicts) / len(contradicts)
    else:
        avg_contradict_conf = 0

    # Determine verdict
    if contradict_ratio >= 0.5 or (contradicts and avg_contradict_conf > 0.8):
        verdict = "HALLUCINATION" if avg_contradict_conf > 0.7 else "LIKELY_HALLUCINATION"
        confidence = avg_contradict_conf * contradict_ratio
    elif contradict_ratio > 0 and support_ratio > 0:
        verdict = "DISPUTED"
        confidence = 0.5
    elif support_ratio >= 0.6:
        confidence = avg_support_conf * support_ratio
        if numerical_penalty > 0:
            confidence -= numerical_penalty
            verdict = "PARTIALLY_VERIFIED"
        elif confidence > 0.7:
            verdict = "VERIFIED"
        else:
            verdict = "LIKELY_ACCURATE"
    elif support_ratio > 0:
        verdict = "PARTIALLY_VERIFIED"
        confidence = avg_support_conf * support_ratio
    else:
        verdict = "UNVERIFIABLE"
        confidence = 0.0

    confidence = max(0.0, min(1.0, confidence - numerical_penalty))

    return {
        "verdict": verdict,
        "confidence": round(confidence, 3),
        "explanation": _build_explanation(supports, contradicts, insufficient, numerical_result),
        "sourceBreakdown": {
            "supports": len(supports),
            "contradicts": len(contradicts),
            "insufficient": len(insufficient),
            "total": total,
        },
    }


def _build_explanation(supports, contradicts, insufficient, numerical_result):
    parts = []
    if supports:
        names = ", ".join(set(r.get("sourceName", "?") for r in supports))
        parts.append(f"Supported by {len(supports)} source(s): {names}")
    if contradicts:
        names = ", ".join(set(r.get("sourceName", "?") for r in contradicts))
        parts.append(f"Contradicted by {len(contradicts)} source(s): {names}")
    if insufficient:
        parts.append(f"{len(insufficient)} source(s) had insufficient data")
    if numerical_result and numerical_result.get("hasNumericalData"):
        nv = numerical_result.get("numericalVerdict", "")
        if nv == "NUMERICAL_MISMATCH":
            parts.append("⚠️ Numerical values do NOT match source data")
        elif nv == "NUMERICAL_DISPUTED":
            parts.append("⚠️ Some numerical values conflict with sources")
        elif nv == "NUMERICAL_VERIFIED":
            parts.append("✓ Numerical values confirmed by sources")
    return ". ".join(parts) if parts else "Unable to determine."


def calculate_overall_score(claim_results: list) -> int:
    """Calculate overall trust score from all claim results.
    
    Maps each claim to a 0-1 trust value based on verdict and confidence,
    then computes a weighted average scaled to 0-100.
    """
    if not claim_results:
        return 0

    # Verdict-to-trust mapping: how much trust does each verdict contribute?
    VERDICT_TRUST = {
        "VERIFIED": lambda c: 0.85 + 0.15 * c,          # 0.85-1.0
        "LIKELY_ACCURATE": lambda c: 0.65 + 0.15 * c,    # 0.65-0.80
        "PARTIALLY_VERIFIED": lambda c: 0.40 + 0.20 * c, # 0.40-0.60
        "DISPUTED": lambda c: 0.25 + 0.10 * c,           # 0.25-0.35
        "UNVERIFIABLE": lambda c: 0.30,                   # flat 0.30
        "LIKELY_HALLUCINATION": lambda c: 0.20 - 0.10 * c, # 0.10-0.20
        "HALLUCINATION": lambda c: 0.10 - 0.08 * c,      # 0.02-0.10
    }

    weighted_sum = 0.0
    total_weight = 0.0

    for result in claim_results:
        claim_type = result.get("type", "VERIFIABLE_FACT")
        verdict = result.get("verdict", "UNVERIFIABLE")

        if verdict == "OPINION":
            continue

        weight = TYPE_WEIGHTS.get(claim_type, 1.0)
        confidence = result.get("confidence", 0.0)
        trust_fn = VERDICT_TRUST.get(verdict, lambda c: 0.30)
        trust_value = max(0.0, min(1.0, trust_fn(confidence)))

        weighted_sum += trust_value * weight
        total_weight += weight

    return round((weighted_sum / total_weight) * 100) if total_weight > 0 else 0
