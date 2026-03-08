import React, { useMemo, useState } from 'react';
import TrustScore from './TrustScore';
import ClaimCard from './ClaimCard';

function getVerdictClass(verdict) {
    const map = {
        VERIFIED: 'verified',
        LIKELY_ACCURATE: 'likely',
        PARTIALLY_VERIFIED: 'partial',
        UNVERIFIABLE: 'unverifiable',
        DISPUTED: 'disputed',
        LIKELY_HALLUCINATION: 'danger',
        HALLUCINATION: 'danger',
        OPINION: 'opinion',
    };
    return map[verdict] || 'pending';
}

function HeatmapPanel({ inputText, claims, claimResults, checkingClaims }) {
    const sentences = useMemo(() => {
        return inputText.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    }, [inputText]);

    const sentenceStates = useMemo(() => {
        return sentences.map((_, idx) => {
            const relatedClaims = claims.filter(c => c.sentenceIndex === idx);
            const results = relatedClaims
                .map(c => claimResults[c.id])
                .filter(Boolean);

            if (results.length === 0) {
                const isChecking = relatedClaims.some(c => checkingClaims.has(c.id));
                return { state: isChecking ? 'checking' : 'pending', confidence: 0, verdicts: [] };
            }

            const verdicts = results.map(r => r.verdict);
            const avgConf = results.reduce((s, r) => s + (r.confidence || 0), 0) / results.length;

            let state = 'unverifiable';
            if (verdicts.includes('HALLUCINATION') || verdicts.includes('LIKELY_HALLUCINATION')) state = 'danger';
            else if (verdicts.includes('DISPUTED')) state = 'disputed';
            else if (verdicts.every(v => v === 'OPINION')) state = 'opinion';
            else if (verdicts.every(v => v === 'UNVERIFIABLE' || v === 'OPINION')) state = 'unverifiable';
            else if (verdicts.includes('VERIFIED') || verdicts.includes('LIKELY_ACCURATE')) state = 'verified';
            else if (verdicts.includes('PARTIALLY_VERIFIED')) state = 'partial';

            return { state, confidence: avgConf, verdicts };
        });
    }, [sentences, claims, claimResults, checkingClaims]);

    // Heatmap summary counts
    const summary = useMemo(() => {
        const counts = { verified: 0, danger: 0, disputed: 0, opinion: 0, partial: 0, unverifiable: 0, pending: 0, checking: 0 };
        sentenceStates.forEach(s => { counts[s.state] = (counts[s.state] || 0) + 1; });
        return counts;
    }, [sentenceStates]);

    const total = sentences.length || 1;

    return (
        <div className="panel">
            <div className="panel-header">
                <span className="panel-title">Source Text — Heatmap</span>
            </div>
            <div className="panel-body">
                {/* Heatmap intensity bar */}
                <div style={{
                    display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden',
                    marginBottom: '12px', background: 'var(--bg-surface)',
                }}>
                    {summary.verified > 0 && (
                        <div style={{ width: `${(summary.verified / total) * 100}%`, background: 'var(--trust-verified)', transition: 'width 0.5s ease' }} />
                    )}
                    {summary.partial > 0 && (
                        <div style={{ width: `${(summary.partial / total) * 100}%`, background: 'var(--trust-partial)', transition: 'width 0.5s ease' }} />
                    )}
                    {summary.disputed > 0 && (
                        <div style={{ width: `${(summary.disputed / total) * 100}%`, background: 'var(--trust-disputed)', transition: 'width 0.5s ease' }} />
                    )}
                    {summary.danger > 0 && (
                        <div style={{ width: `${(summary.danger / total) * 100}%`, background: 'var(--trust-danger)', transition: 'width 0.5s ease' }} />
                    )}
                    {summary.opinion > 0 && (
                        <div style={{ width: `${(summary.opinion / total) * 100}%`, background: 'var(--trust-opinion)', transition: 'width 0.5s ease' }} />
                    )}
                    {(summary.unverifiable + summary.pending + summary.checking) > 0 && (
                        <div style={{ width: `${((summary.unverifiable + summary.pending + summary.checking) / total) * 100}%`, background: 'var(--trust-neutral)', transition: 'width 0.5s ease' }} />
                    )}
                </div>

                {/* Legend */}
                <div className="heatmap-legend" style={{ marginBottom: '14px' }}>
                    <div className="heatmap-legend-item"><div className="heatmap-legend-dot verified" /><span>Verified ({summary.verified})</span></div>
                    {summary.partial > 0 && <div className="heatmap-legend-item"><div className="heatmap-legend-dot partial" /><span>Partial ({summary.partial})</span></div>}
                    {summary.disputed > 0 && <div className="heatmap-legend-item"><div className="heatmap-legend-dot disputed" /><span>Disputed ({summary.disputed})</span></div>}
                    <div className="heatmap-legend-item"><div className="heatmap-legend-dot danger" /><span>Hallucination ({summary.danger})</span></div>
                    {summary.opinion > 0 && <div className="heatmap-legend-item"><div className="heatmap-legend-dot opinion" /><span>Opinion ({summary.opinion})</span></div>}
                    {summary.unverifiable > 0 && <div className="heatmap-legend-item"><div className="heatmap-legend-dot unverifiable" /><span>Unverifiable ({summary.unverifiable})</span></div>}
                </div>

                {/* Heatmap text with confidence-based opacity */}
                <div className="heatmap-text">
                    {sentences.map((sentence, idx) => {
                        const { state, confidence } = sentenceStates[idx];
                        // Scale opacity based on confidence (min 0.6 for readability)
                        const opacity = state === 'pending' || state === 'checking'
                            ? undefined
                            : Math.max(0.6, confidence);
                        return (
                            <span
                                key={idx}
                                className={`heatmap-sentence ${state}`}
                                style={opacity ? { opacity } : undefined}
                                title={confidence ? `Confidence: ${Math.round(confidence * 100)}%` : ''}
                            >
                                {sentence}{' '}
                            </span>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default function ResultsView({
    inputText,
    claims,
    claimResults,
    checkingClaims,
    statusMessage,
    isComplete,
    overallScore,
}) {
    const completedResults = Object.values(claimResults);
    const verifiedCount = completedResults.filter(r =>
        r.verdict === 'VERIFIED' || r.verdict === 'LIKELY_ACCURATE'
    ).length;
    const hallucinationCount = completedResults.filter(r =>
        r.verdict === 'HALLUCINATION' || r.verdict === 'LIKELY_HALLUCINATION'
    ).length;
    const correctionCount = completedResults.filter(r => r.correction).length;
    const progress = claims.length > 0
        ? Math.round((completedResults.length / claims.length) * 100)
        : 0;

    // Use backend score if available, otherwise calculate client-side
    const trustScore = useMemo(() => {
        if (overallScore !== null && overallScore !== undefined) return overallScore;
        if (completedResults.length === 0) return null;

        const typeWeights = {
            STATISTICAL_FACT: 1.5,
            VERIFIABLE_FACT: 1.0,
            HISTORICAL_FACT: 1.2,
            REASONING: 0.6,
            PREDICTION: 0.3,
            OPINION: 0.2,
            DEFINITION: 0.8,
        };

        let weightedSum = 0;
        let totalWeight = 0;

        for (const result of completedResults) {
            if (result.verdict === 'OPINION') continue;
            const weight = typeWeights[result.type] || 1.0;
            const confidence = result.confidence || 0;
            weightedSum += confidence * weight;
            totalWeight += weight;
        }

        return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;
    }, [completedResults]);

    const handleExportCertificate = () => {
        import('jspdf').then(({ jsPDF }) => {
            const doc = new jsPDF();
            const now = new Date().toISOString();

            // Header
            doc.setFillColor(5, 5, 7);
            doc.rect(0, 0, 210, 297, 'F');

            doc.setTextColor(200, 168, 78);
            doc.setFontSize(28);
            doc.setFont('helvetica', 'bold');
            doc.text('VERIDEX', 105, 35, { align: 'center' });

            doc.setFontSize(10);
            doc.setTextColor(140, 135, 128);
            doc.text('AI OUTPUT VERIFICATION CERTIFICATE', 105, 44, { align: 'center' });

            // Score
            doc.setFontSize(60);
            const scoreColor = trustScore >= 70 ? [34, 197, 94] : trustScore >= 40 ? [245, 158, 11] : [239, 68, 68];
            doc.setTextColor(...scoreColor);
            doc.text(`${trustScore}`, 105, 80, { align: 'center' });

            doc.setFontSize(12);
            doc.setTextColor(140, 135, 128);
            doc.text('TRUST SCORE', 105, 90, { align: 'center' });

            // Stats
            doc.setFontSize(11);
            doc.setTextColor(232, 230, 225);
            doc.text(`Total Claims Analyzed: ${claims.length}`, 25, 110);
            doc.text(`Verified: ${verifiedCount}`, 25, 120);
            doc.text(`Hallucinations Detected: ${hallucinationCount}`, 25, 130);
            doc.text(`Verification Date: ${now}`, 25, 140);
            doc.text(`Mode: ${claims[0]?.mode || 'General'}`, 25, 150);

            // Claims detail
            doc.setFontSize(12);
            doc.setTextColor(200, 168, 78);
            doc.text('CLAIM VERIFICATION DETAILS', 25, 170);

            let y = 182;
            doc.setFontSize(9);

            for (const result of completedResults.slice(0, 15)) {
                if (y > 270) {
                    doc.addPage();
                    doc.setFillColor(5, 5, 7);
                    doc.rect(0, 0, 210, 297, 'F');
                    y = 25;
                }

                const icon = result.verdict === 'VERIFIED' || result.verdict === 'LIKELY_ACCURATE' ? '[PASS]' : result.verdict === 'HALLUCINATION' || result.verdict === 'LIKELY_HALLUCINATION' ? '[FAIL]' : '[----]';
                const vColor = result.verdict === 'VERIFIED' || result.verdict === 'LIKELY_ACCURATE' ? [34, 197, 94] : result.verdict === 'HALLUCINATION' || result.verdict === 'LIKELY_HALLUCINATION' ? [239, 68, 68] : [140, 135, 128];

                doc.setTextColor(...vColor);
                doc.text(icon, 25, y);
                doc.setTextColor(232, 230, 225);
                const claimText = result.claim.length > 80 ? result.claim.slice(0, 80) + '...' : result.claim;
                doc.text(claimText, 42, y);
                y += 10;
            }

            // Footer
            doc.setFontSize(8);
            doc.setTextColor(90, 88, 80);
            doc.text('Generated by Veridex — Truth in Every Token', 105, 285, { align: 'center' });
            doc.text(`Document Hash: ${btoa(now + trustScore).slice(0, 24)}`, 105, 290, { align: 'center' });

            doc.save(`veridex-certificate-${Date.now()}.pdf`);
        });
    };

    return (
        <div className="fade-in">
            {/* Status Banner */}
            <div className="status-banner">
                <div className={`status-dot ${isComplete ? 'complete' : 'active'}`} />
                <span className="status-text">
                    {isComplete ? (
                        <><strong>Verification complete.</strong> {completedResults.length} claims analyzed across multiple sources.{correctionCount > 0 && ` ${correctionCount} correction(s) suggested.`}</>
                    ) : (
                        <>{statusMessage}</>
                    )}
                </span>
            </div>

            {!isComplete && (
                <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
            )}

            {/* Results Grid */}
            <div className="results-grid">
                <HeatmapPanel
                    inputText={inputText}
                    claims={claims}
                    claimResults={claimResults}
                    checkingClaims={checkingClaims}
                />

                <div className="panel">
                    <div className="panel-header">
                        <span className="panel-title">Trust Analysis</span>
                    </div>
                    <div className="panel-body">
                        <TrustScore
                            score={trustScore}
                            totalClaims={claims.length}
                            verified={verifiedCount}
                            hallucinations={hallucinationCount}
                            isComplete={isComplete}
                        />
                    </div>
                </div>
            </div>

            {/* Claims Detail */}
            <div className="claims-section">
                <div className="panel">
                    <div className="panel-header">
                        <span className="panel-title">
                            Claim-by-Claim Verification — {completedResults.length} / {claims.length}
                        </span>
                    </div>
                    <div className="panel-body">
                        <div className="claims-list">
                            {claims.map(claim => (
                                <ClaimCard
                                    key={claim.id}
                                    claim={claim}
                                    result={claimResults[claim.id]}
                                    isChecking={checkingClaims.has(claim.id)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Certificate Export */}
            {isComplete && trustScore !== null && (
                <div className="certificate-section fade-in">
                    <button className="certificate-btn" onClick={handleExportCertificate}>
                        ↓ Export Trust Certificate (PDF)
                    </button>
                </div>
            )}
        </div>
    );
}
