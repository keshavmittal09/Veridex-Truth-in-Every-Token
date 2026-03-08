'use client';

import { useState } from 'react';

function getTypeBadgeClass(type) {
    const map = {
        STATISTICAL_FACT: 'statistical',
        VERIFIABLE_FACT: 'verifiable',
        HISTORICAL_FACT: 'historical',
        OPINION: 'opinion',
        PREDICTION: 'prediction',
        REASONING: 'reasoning',
        DEFINITION: 'definition',
    };
    return map[type] || 'verifiable';
}

function getVerdictStyle(verdict) {
    const styles = {
        VERIFIED: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '#22c55e' },
        LIKELY_ACCURATE: { bg: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', border: '#4ade80' },
        PARTIALLY_VERIFIED: { bg: 'rgba(163, 230, 53, 0.15)', color: '#a3e635', border: '#a3e635' },
        UNVERIFIABLE: { bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280', border: '#6b7280' },
        DISPUTED: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '#f59e0b' },
        LIKELY_HALLUCINATION: { bg: 'rgba(249, 115, 22, 0.15)', color: '#f97316', border: '#f97316' },
        HALLUCINATION: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '#ef4444' },
        OPINION: { bg: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', border: '#8b5cf6' },
    };
    return styles[verdict] || styles.UNVERIFIABLE;
}

function getSourceIcon(verdict) {
    if (verdict === 'SUPPORTS') return '✓';
    if (verdict === 'CONTRADICTS') return '✗';
    return '—';
}

function getSourceIconClass(verdict) {
    if (verdict === 'SUPPORTS') return 'supports';
    if (verdict === 'CONTRADICTS') return 'contradicts';
    return 'insufficient';
}

export default function ClaimCard({ claim, result, isChecking }) {
    const [expanded, setExpanded] = useState(false);

    const verdictStyle = result ? getVerdictStyle(result.verdict) : null;
    const confidence = result?.confidence;

    return (
        <div className={`claim-card ${expanded ? 'expanded' : ''}`}>
            <div className="claim-card-header" onClick={() => result && setExpanded(!expanded)}>
                <div
                    className="claim-verdict-indicator"
                    style={{
                        background: isChecking
                            ? 'linear-gradient(180deg, #c8a84e, transparent)'
                            : verdictStyle
                                ? verdictStyle.color
                                : '#333',
                        animation: isChecking ? 'shimmer 1.5s infinite' : 'none',
                    }}
                />

                <div className="claim-content">
                    <p className="claim-text">"{claim.claim}"</p>
                    <div className="claim-meta">
                        <span className={`claim-type-badge ${getTypeBadgeClass(claim.type)}`}>
                            {claim.type?.replace(/_/g, ' ')}
                        </span>

                        {result && (
                            <span
                                className="claim-verdict-badge"
                                style={{
                                    background: verdictStyle.bg,
                                    color: verdictStyle.color,
                                    border: `1px solid ${verdictStyle.border}`,
                                }}
                            >
                                {result.verdict?.replace(/_/g, ' ')}
                            </span>
                        )}

                        {isChecking && (
                            <span style={{ fontSize: '11px', color: '#c8a84e', fontStyle: 'italic' }}>
                                Verifying...
                            </span>
                        )}

                        {confidence !== null && confidence !== undefined && (
                            <span className="claim-confidence">
                                {Math.round(confidence * 100)}% confidence
                            </span>
                        )}
                    </div>
                </div>

                {result && (
                    <span className="claim-expand-icon">▼</span>
                )}
            </div>

            {expanded && result && (
                <div className="claim-details slide-down">
                    {result.explanation && (
                        <div className="claim-explanation">{result.explanation}</div>
                    )}

                    {result.correction && (
                        <div className="correction-panel">
                            <div className="correction-header">
                                <span className="correction-icon">✏️</span>
                                <span className="correction-title">Suggested Correction</span>
                            </div>
                            <div className="correction-body">
                                <p className="correction-text">{result.correction.correctedClaim}</p>
                                {result.correction.explanation && (
                                    <p className="correction-explanation">{result.correction.explanation}</p>
                                )}
                                {result.correction.citations && result.correction.citations.length > 0 && (
                                    <div className="correction-citations">
                                        {result.correction.citations.map((cite, i) => (
                                            <div key={i} className="correction-citation">
                                                <span className="correction-cite-source">{cite.source}:</span>
                                                <span className="correction-cite-quote">"{cite.quote}"</span>
                                                {cite.url && (
                                                    <a href={cite.url} target="_blank" rel="noopener noreferrer" className="correction-cite-link">↗</a>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {result.sources && result.sources.length > 0 && (
                        <div className="sources-grid">
                            {result.sources.map((source, idx) => (
                                <div key={idx} className="source-item">
                                    <div className={`source-verdict-icon ${getSourceIconClass(source.verdict)}`}>
                                        {getSourceIcon(source.verdict)}
                                    </div>
                                    <div className="source-info">
                                        <div className="source-name">
                                            {source.sourceUrl ? (
                                                <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
                                                    {source.sourceName} — {source.sourceTitle}
                                                </a>
                                            ) : (
                                                <>{source.sourceName} — {source.sourceTitle}</>
                                            )}
                                        </div>
                                        {source.evidence && (
                                            <div className="source-evidence">"{source.evidence}"</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
