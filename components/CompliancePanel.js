'use client';

export default function CompliancePanel({ report }) {
    if (!report) return null;

    const passed = !report.documentBlocked;

    return (
        <div className={`compliance-panel fade-in ${passed ? 'compliance-passed' : 'compliance-blocked'}`}>
            <div className="compliance-header">
                <div>
                    <h3 className="compliance-title">Enterprise Compliance Report</h3>
                    <p className="compliance-session">Session: {report.sessionId} · {new Date(report.timestamp).toLocaleString()}</p>
                </div>
                <span className={`compliance-badge ${passed ? 'pass' : 'fail'}`}>
                    {passed ? '✅ PASSED' : '⛔ BLOCKED'}
                </span>
            </div>

            {report.documentBlocked && (
                <div className="compliance-warning">
                    <strong>⚠ Distribution Blocked</strong>
                    <p>{report.blockReason}</p>
                </div>
            )}

            <div className="compliance-stats">
                <div className="compliance-stat">
                    <div className="compliance-stat-value">{report.thresholdPercent}%</div>
                    <div className="compliance-stat-label">Threshold</div>
                </div>
                <div className="compliance-stat">
                    <div className="compliance-stat-value" style={{
                        color: report.overallScore >= report.thresholdPercent ? '#22c55e' : '#ef4444'
                    }}>
                        {report.overallScore}%
                    </div>
                    <div className="compliance-stat-label">Score</div>
                </div>
                <div className="compliance-stat">
                    <div className="compliance-stat-value" style={{ color: '#22c55e' }}>
                        {report.claimsPassing}
                    </div>
                    <div className="compliance-stat-label">Passing</div>
                </div>
                <div className="compliance-stat">
                    <div className="compliance-stat-value" style={{ color: '#ef4444' }}>
                        {report.claimsFailing}
                    </div>
                    <div className="compliance-stat-label">Failing</div>
                </div>
            </div>

            {report.failedClaims && report.failedClaims.length > 0 && (
                <div className="compliance-failed-list">
                    <h4 className="compliance-section-title">Claims Failing Threshold</h4>
                    {report.failedClaims.map((claim, i) => (
                        <div key={i} className="compliance-failed-item">
                            <span className="compliance-failed-claim">"{claim.claim}"</span>
                            <span className="compliance-failed-meta">
                                {claim.verdict?.replace(/_/g, ' ')} · {Math.round((claim.confidence || 0) * 100)}%
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <div className="compliance-footer">
                <span>Document Hash: {report.documentHash}</span>
            </div>
        </div>
    );
}
