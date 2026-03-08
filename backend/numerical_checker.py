"""
Numerical Value Checker — Dedicated module for extracting and cross-verifying
numerical claims (dates, percentages, quantities, monetary values) against
source data from verifiers.
"""

import re
from typing import Optional


def extract_numbers_from_text(text: str) -> list:
    """Extract all numerical values with context from text."""
    patterns = [
        (r'\b(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*%', 'percentage'),
        (r'\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(billion|million|trillion|thousand)?', 'monetary'),
        (r'\b(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(billion|million|trillion|thousand)', 'quantity'),
        (r'\b((?:19|20)\d{2})\b', 'year'),
        (r'\b(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:km|miles|meters|feet|kg|pounds|lbs|tons|tonnes)', 'measurement'),
        (r'\b(\d{1,3}(?:,\d{3})*)\s+(?:units?|people|users?|employees?|customers?|vehicles?|cars?)', 'count'),
    ]

    extracted = []
    for pattern, num_type in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            raw = match.group(0)
            value = match.group(1).replace(',', '')
            try:
                numeric = float(value)
            except ValueError:
                continue

            multiplier_match = match.group(2) if match.lastindex >= 2 else None
            if multiplier_match:
                mult = multiplier_match.lower()
                if mult == 'billion':
                    numeric *= 1_000_000_000
                elif mult == 'million':
                    numeric *= 1_000_000
                elif mult == 'trillion':
                    numeric *= 1_000_000_000_000
                elif mult == 'thousand':
                    numeric *= 1_000

            extracted.append({
                "raw": raw.strip(),
                "value": numeric,
                "type": num_type,
                "position": match.start(),
            })

    return extracted


def compare_numerical_values(claim_numbers: list, source_numbers: list, tolerance: float = 0.15) -> list:
    """Compare numbers from claim against numbers from source data.
    
    Returns a list of comparison results with match status.
    tolerance: 0.15 = 15% deviation allowed before flagging.
    """
    comparisons = []

    for cn in claim_numbers:
        best_match = None
        best_deviation = float('inf')

        for sn in source_numbers:
            if cn["type"] != sn["type"]:
                continue

            if cn["value"] == 0 or sn["value"] == 0:
                deviation = abs(cn["value"] - sn["value"])
            else:
                deviation = abs(cn["value"] - sn["value"]) / max(abs(cn["value"]), abs(sn["value"]))

            if deviation < best_deviation:
                best_deviation = deviation
                best_match = sn

        if best_match:
            is_match = best_deviation <= tolerance
            comparisons.append({
                "claimValue": cn["raw"],
                "claimNumeric": cn["value"],
                "sourceValue": best_match["raw"],
                "sourceNumeric": best_match["value"],
                "type": cn["type"],
                "deviation": round(best_deviation * 100, 1),
                "match": is_match,
                "status": "MATCH" if is_match else "MISMATCH",
            })
        else:
            comparisons.append({
                "claimValue": cn["raw"],
                "claimNumeric": cn["value"],
                "sourceValue": None,
                "sourceNumeric": None,
                "type": cn["type"],
                "deviation": None,
                "match": False,
                "status": "NO_SOURCE_DATA",
            })

    return comparisons


def run_numerical_check(claim_text: str, source_texts: dict) -> dict:
    """Run full numerical verification on a claim against all source texts.
    
    Args:
        claim_text: The claim to check
        source_texts: dict of {source_name: source_content}
    
    Returns:
        Numerical analysis result with comparisons from each source.
    """
    claim_numbers = extract_numbers_from_text(claim_text)

    if not claim_numbers:
        return {
            "hasNumericalData": False,
            "claimNumbers": [],
            "comparisons": [],
            "numericalVerdict": "NO_NUMERICAL_DATA",
        }

    all_comparisons = []
    for source_name, source_text in source_texts.items():
        source_numbers = extract_numbers_from_text(source_text)
        comparisons = compare_numerical_values(claim_numbers, source_numbers)
        for c in comparisons:
            c["sourceName"] = source_name
        all_comparisons.extend(comparisons)

    # Determine overall numerical verdict
    if not all_comparisons:
        verdict = "NO_SOURCE_DATA"
    else:
        matches = [c for c in all_comparisons if c["status"] == "MATCH"]
        mismatches = [c for c in all_comparisons if c["status"] == "MISMATCH"]

        if mismatches and not matches:
            verdict = "NUMERICAL_MISMATCH"
        elif mismatches and matches:
            verdict = "NUMERICAL_DISPUTED"
        elif matches:
            verdict = "NUMERICAL_VERIFIED"
        else:
            verdict = "NUMERICAL_UNVERIFIABLE"

    return {
        "hasNumericalData": True,
        "claimNumbers": [{"raw": n["raw"], "value": n["value"], "type": n["type"]} for n in claim_numbers],
        "comparisons": all_comparisons,
        "numericalVerdict": verdict,
    }
