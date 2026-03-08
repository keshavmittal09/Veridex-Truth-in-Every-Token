'use client';

export default function NumericalAnalysis({ claims, claimResults }) {
    // Collect all claims that have numerical analysis data
    const numericalClaims = claims
        .map(c => ({
            claim: c,
            result: claimResults[c.id],
        }))
        .filter(({ result }) => result?.numericalAnalysis?.hasNumericalData);

    if (numericalClaims.length === 0) return null;

    const getStatusColor = (status) => {
        switch (status) {
            case 'MATCH': return '#22c55e';
            case 'MISMATCH': return '#ef4444';
            case 'NO_SOURCE_DATA': return '#6b7280';
            default: return '#8c8780';
        }
    };

    const getVerdictBadge = (verdict) => {
        const styles = {
            NUMERICAL_VERIFIED: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', label: '✓ Numbers Verified' },
            NUMERICAL_MISMATCH: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: '✗ Numbers Mismatch' },
            NUMERICAL_DISPUTED: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: '⚠ Numbers Disputed' },
            NUMERICAL_UNVERIFIABLE: { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: '— Cannot Verify' },
        };
        return styles[verdict] || styles.NUMERICAL_UNVERIFIABLE;
    };

    return (
        <div className="numerical-section fade-in">
            <div className="panel">
                <div className="panel-header">
                    <span className="panel-title">🔢 Numerical Value Verification</span>
                    <span style={{ fontSize: '12px', color: '#8c8780' }}>
                        {numericalClaims.length} claim(s) with numerical data
                    </span>
                </div>
                <div className="panel-body">
                    {numericalClaims.map(({ claim, result }) => {
                        const na = result.numericalAnalysis;
                        const badge = getVerdictBadge(na.numericalVerdict);

                        return (
                            <div key={claim.id} className="numerical-card">
                                <div className="numerical-card-header">
                                    <p className="numerical-claim-text">"{claim.claim}"</p>
                                    <span
                                        className="numerical-verdict-badge"
                                        style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}` }}
                                    >
                                        {badge.label}
                                    </span>
                                </div>

                                {na?.claimNumbers?.length > 0 && (
                                    <div className="numerical-values">
                                        <span className="numerical-label">Extracted Values: </span>
                                        {na.claimNumbers.map((n, i) => (
                                            <span key={i} className="numerical-value-badge">
                                                {n.raw} <span className="numerical-type">({n.type})</span>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {na?.comparisons?.length > 0 && (
                                    <table className="numerical-table">
                                        <thead>
                                            <tr>
                                                <th>Claim Value</th>
                                                <th>Source Value</th>
                                                <th>Source</th>
                                                <th>Deviation</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {na.comparisons.map((comp, i) => (
                                                <tr key={i}>
                                                    <td className="num-cell">{comp.claimValue}</td>
                                                    <td className="num-cell">{comp.sourceValue || '—'}</td>
                                                    <td>{comp.sourceName}</td>
                                                    <td>
                                                        {comp.deviation !== null
                                                            ? <span style={{ color: comp.deviation > 15 ? '#ef4444' : '#22c55e' }}>
                                                                {comp.deviation}%
                                                            </span>
                                                            : '—'
                                                        }
                                                    </td>
                                                    <td>
                                                        <span style={{ color: getStatusColor(comp.status), fontWeight: 600 }}>
                                                            {comp.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
