'use client';

import { useEffect, useState } from 'react';

export default function TrustScore({ score, totalClaims, verified, hallucinations, isComplete }) {
    const [displayScore, setDisplayScore] = useState(0);

    useEffect(() => {
        if (score === null) return;
        const duration = 1500;
        const steps = 60;
        const increment = score / steps;
        let current = 0;
        const interval = setInterval(() => {
            current += increment;
            if (current >= score) {
                setDisplayScore(score);
                clearInterval(interval);
            } else {
                setDisplayScore(Math.round(current));
            }
        }, duration / steps);
        return () => clearInterval(interval);
    }, [score]);

    const circumference = 2 * Math.PI * 78;
    const offset = score !== null
        ? circumference - (displayScore / 100) * circumference
        : circumference;

    const getColor = (s) => {
        if (s >= 80) return '#22c55e';
        if (s >= 60) return '#4ade80';
        if (s >= 40) return '#f59e0b';
        if (s >= 20) return '#f97316';
        return '#ef4444';
    };

    const getLabel = (s) => {
        if (s >= 80) return 'Highly Trustworthy';
        if (s >= 60) return 'Generally Reliable';
        if (s >= 40) return 'Proceed with Caution';
        if (s >= 20) return 'Significant Concerns';
        return 'Unreliable';
    };

    const strokeColor = score !== null ? getColor(displayScore) : '#333';

    return (
        <div className="trust-score-container">
            <div className="trust-gauge">
                <svg width="180" height="180" viewBox="0 0 180 180">
                    <circle className="trust-gauge-bg" cx="90" cy="90" r="78" />
                    <circle
                        className="trust-gauge-fill"
                        cx="90" cy="90" r="78"
                        stroke={strokeColor}
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                    />
                </svg>
                <div className="trust-gauge-value">
                    <div className="trust-gauge-number" style={{ color: strokeColor }}>
                        {score !== null ? displayScore : '—'}
                    </div>
                    <div className="trust-gauge-label">Trust Score</div>
                </div>
            </div>

            {score !== null && isComplete && (
                <p style={{
                    fontSize: '13px',
                    color: getColor(score),
                    fontWeight: 600,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    marginBottom: '8px'
                }}>
                    {getLabel(score)}
                </p>
            )}

            <div className="trust-stats">
                <div className="trust-stat">
                    <div className="trust-stat-value" style={{ color: '#e8e6e1' }}>{totalClaims}</div>
                    <div className="trust-stat-label">Claims</div>
                </div>
                <div className="trust-stat">
                    <div className="trust-stat-value" style={{ color: '#22c55e' }}>{verified}</div>
                    <div className="trust-stat-label">Verified</div>
                </div>
                <div className="trust-stat">
                    <div className="trust-stat-value" style={{ color: '#ef4444' }}>{hallucinations}</div>
                    <div className="trust-stat-label">Flagged</div>
                </div>
            </div>
        </div>
    );
}
