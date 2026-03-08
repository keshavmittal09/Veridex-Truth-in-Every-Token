"""
Enterprise Compliance Mode — Audit trail, verification certificates,
and confidence threshold enforcement for AI-generated content.

Features:
- Log every claim, confidence score, and source into a compliance ledger
- Evaluate documents against a minimum confidence threshold
- Generate audit hashes for tamper-proof verification records
- Block documents below threshold from being sent externally
"""

import json
import hashlib
from datetime import datetime, timezone


class ComplianceLedger:
    """In-memory compliance audit ledger for a single verification session."""

    def __init__(self, session_id: str, threshold: float = 0.8):
        self.session_id = session_id
        self.threshold = threshold
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.entries = []
        self.blocked = False
        self.block_reason = None

    def log_claim(self, claim_id, claim_text, claim_type, verdict, confidence,
                  sources=None, correction=None, numerical=None):
        """Log a single claim verification to the audit trail."""
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "claimId": claim_id,
            "claim": claim_text[:200],
            "type": claim_type,
            "verdict": verdict,
            "confidence": round(confidence, 4) if confidence is not None else 0,
            "sourcesChecked": len(sources) if sources else 0,
            "sourceNames": list(set(
                s.get("sourceName", "?") for s in (sources or [])
            )),
            "passesThreshold": (confidence or 0) >= self.threshold,
            "hasCorrectionSuggestion": correction is not None,
            "numericalCheck": (
                numerical.get("numericalVerdict")
                if numerical and numerical.get("hasNumericalData")
                else None
            ),
        }
        self.entries.append(entry)
        return entry

    def evaluate_document(self, overall_score: int) -> dict:
        """Evaluate if the document passes the compliance threshold.

        Args:
            overall_score: 0-100 trust score

        Returns:
            Full compliance report dict
        """
        threshold_pct = round(self.threshold * 100)

        if overall_score < threshold_pct:
            self.blocked = True
            self.block_reason = (
                f"Document trust score ({overall_score}%) is below the minimum "
                f"compliance threshold ({threshold_pct}%). This document should "
                f"NOT be distributed externally without manual review and correction."
            )

        failed_claims = [
            e for e in self.entries
            if not e["passesThreshold"]
            and e["verdict"] not in ("OPINION", "UNVERIFIABLE")
        ]

        return {
            "sessionId": self.session_id,
            "timestamp": self.created_at,
            "overallScore": overall_score,
            "threshold": self.threshold,
            "thresholdPercent": threshold_pct,
            "documentBlocked": self.blocked,
            "blockReason": self.block_reason,
            "totalClaims": len(self.entries),
            "claimsPassing": len([e for e in self.entries if e["passesThreshold"]]),
            "claimsFailing": len(failed_claims),
            "failedClaims": [
                {
                    "claim": e["claim"],
                    "verdict": e["verdict"],
                    "confidence": e["confidence"],
                }
                for e in failed_claims
            ],
            "documentHash": self._compute_hash(),
            "auditTrail": self.entries,
        }

    def _compute_hash(self) -> str:
        """Compute a SHA-256 hash of the session for tamper-proof audit."""
        content = json.dumps({
            "session": self.session_id,
            "created": self.created_at,
            "entries": len(self.entries),
            "claims": [
                {"id": e["claimId"], "verdict": e["verdict"], "confidence": e["confidence"]}
                for e in self.entries
            ],
        }, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()[:32]
