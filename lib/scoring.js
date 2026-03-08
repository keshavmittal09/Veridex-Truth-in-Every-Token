export function calculateTrustScore(claimResults) {
    if (!claimResults || claimResults.length === 0) return 0;

    const typeWeights = {
        STATISTICAL_FACT: 1.5,
        VERIFIABLE_FACT: 1.0,
        HISTORICAL_FACT: 1.2,
        REASONING: 0.6,
        PREDICTION: 0.3,
        OPINION: 0.2,
        DEFINITION: 0.8,
    };

    // Map verdict + confidence to a 0-1 trust value
    const verdictTrust = {
        VERIFIED: c => 0.85 + 0.15 * c,
        LIKELY_ACCURATE: c => 0.65 + 0.15 * c,
        PARTIALLY_VERIFIED: c => 0.40 + 0.20 * c,
        DISPUTED: c => 0.25 + 0.10 * c,
        UNVERIFIABLE: () => 0.30,
        LIKELY_HALLUCINATION: c => 0.20 - 0.10 * c,
        HALLUCINATION: c => 0.10 - 0.08 * c,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const result of claimResults) {
        if (result.verdict === 'OPINION') continue;

        const weight = typeWeights[result.type] || 1.0;
        const confidence = result.confidence || 0;
        const trustFn = verdictTrust[result.verdict] || (() => 0.30);
        const trustValue = Math.max(0, Math.min(1, trustFn(confidence)));

        weightedSum += trustValue * weight;
        totalWeight += weight;
    }

    return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;
}

export function triangulate(sourceResults) {
    if (!sourceResults || sourceResults.length === 0) {
        return { confidence: 0, verdict: 'UNVERIFIABLE' };
    }

    const validResults = sourceResults.filter(r => r && r.verdict !== 'INSUFFICIENT');

    if (validResults.length === 0) {
        return { confidence: 0.3, verdict: 'UNVERIFIABLE' };
    }

    const supports = validResults.filter(r => r.verdict === 'SUPPORTS').length;
    const contradicts = validResults.filter(r => r.verdict === 'CONTRADICTS').length;
    const total = validResults.length;

    if (contradicts > 0 && supports === 0) {
        return {
            confidence: Math.max(0.05, 0.15 - (contradicts * 0.05)),
            verdict: 'HALLUCINATION',
        };
    }

    if (contradicts > 0 && supports > 0) {
        const ratio = supports / (supports + contradicts);
        return {
            confidence: ratio * 0.6,
            verdict: ratio > 0.5 ? 'DISPUTED' : 'LIKELY_HALLUCINATION',
        };
    }

    if (supports >= 3) {
        return { confidence: 0.95, verdict: 'VERIFIED' };
    }

    if (supports === 2) {
        return { confidence: 0.8, verdict: 'LIKELY_ACCURATE' };
    }

    if (supports === 1) {
        return { confidence: 0.6, verdict: 'PARTIALLY_VERIFIED' };
    }

    return { confidence: 0.3, verdict: 'UNVERIFIABLE' };
}

export function getVerdictColor(verdict) {
    const colors = {
        VERIFIED: '#22c55e',
        LIKELY_ACCURATE: '#4ade80',
        PARTIALLY_VERIFIED: '#a3e635',
        UNVERIFIABLE: '#6b7280',
        DISPUTED: '#f59e0b',
        LIKELY_HALLUCINATION: '#f97316',
        HALLUCINATION: '#ef4444',
    };
    return colors[verdict] || '#6b7280';
}

export function getVerdictLabel(verdict) {
    const labels = {
        VERIFIED: 'Verified',
        LIKELY_ACCURATE: 'Likely Accurate',
        PARTIALLY_VERIFIED: 'Partially Verified',
        UNVERIFIABLE: 'Unverifiable',
        DISPUTED: 'Disputed',
        LIKELY_HALLUCINATION: 'Likely Hallucination',
        HALLUCINATION: 'Hallucination Detected',
    };
    return labels[verdict] || 'Unknown';
}
