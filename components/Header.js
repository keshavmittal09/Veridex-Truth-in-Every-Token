'use client';

export default function Header({
    mode, onModeChange,
    complianceMode, onComplianceChange,
    confidenceThreshold, onThresholdChange,
}) {
    const modes = [
        { id: 'general', label: '📰 General' },
        { id: 'medical', label: '🏥 Medical' },
        { id: 'legal', label: '⚖️ Legal' },
        { id: 'financial', label: '💰 Financial' },
        { id: 'academic', label: '🎓 Academic' },
    ];

    return (
        <header className="header">
            <div className="header-inner">
                <div className="logo">
                    <div className="logo-mark">VX</div>
                    <div>
                        <div className="logo-text">Veridex</div>
                        <div className="logo-sub">Truth in Every Token</div>
                    </div>
                </div>

                <div className="header-controls">
                    <div className="mode-selector">
                        {modes.map(m => (
                            <button
                                key={m.id}
                                className={`mode-btn ${mode === m.id ? 'active' : ''}`}
                                onClick={() => onModeChange(m.id)}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>

                    <label className="compliance-toggle" title="Enable enterprise compliance mode with audit trail and threshold enforcement">
                        <input
                            type="checkbox"
                            checked={complianceMode}
                            onChange={e => onComplianceChange(e.target.checked)}
                        />
                        <span className="compliance-toggle-label">Compliance</span>
                    </label>

                    {complianceMode && (
                        <div className="threshold-control">
                            <input
                                type="range"
                                min="50"
                                max="95"
                                step="5"
                                value={Math.round(confidenceThreshold * 100)}
                                onChange={e => onThresholdChange(Number(e.target.value) / 100)}
                            />
                            <span className="threshold-value">{Math.round(confidenceThreshold * 100)}%</span>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
