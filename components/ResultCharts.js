'use client';

import { useEffect, useRef } from 'react';

const VERDICT_COLORS = {
    VERIFIED: '#22c55e',
    LIKELY_ACCURATE: '#4ade80',
    PARTIALLY_VERIFIED: '#a3e635',
    UNVERIFIABLE: '#6b7280',
    DISPUTED: '#f59e0b',
    LIKELY_HALLUCINATION: '#f97316',
    HALLUCINATION: '#ef4444',
    OPINION: '#8b5cf6',
};

const TYPE_COLORS = {
    STATISTICAL_FACT: '#3b82f6',
    VERIFIABLE_FACT: '#06b6d4',
    HISTORICAL_FACT: '#8b5cf6',
    REASONING: '#f59e0b',
    PREDICTION: '#f97316',
    OPINION: '#a855f7',
    DEFINITION: '#14b8a6',
};

function drawDonutChart(canvas, data, colors, title) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2 - 10;
    const radius = Math.min(w, h) / 2 - 40;
    const innerRadius = radius * 0.6;

    ctx.clearRect(0, 0, w, h);

    const total = Object.values(data).reduce((a, b) => a + b, 0);
    if (total === 0) return;

    let startAngle = -Math.PI / 2;
    const entries = Object.entries(data);

    entries.forEach(([label, value]) => {
        const sliceAngle = (value / total) * 2 * Math.PI;
        const color = colors[label] || '#555';

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
        ctx.arc(cx, cy, innerRadius, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();

        startAngle += sliceAngle;
    });

    // Center text
    ctx.fillStyle = '#e8e6e1';
    ctx.font = 'bold 24px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total.toString(), cx, cy - 5);
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = '#8c8780';
    ctx.fillText('TOTAL', cx, cy + 15);

    // Legend
    let legendY = h - 20;
    let legendX = 10;
    ctx.font = '11px Inter, sans-serif';
    entries.forEach(([label, value]) => {
        const color = colors[label] || '#555';
        const text = `${label.replace(/_/g, ' ')}: ${value}`;
        ctx.fillStyle = color;
        ctx.fillRect(legendX, legendY - 8, 10, 10);
        ctx.fillStyle = '#b0aca5';
        ctx.fillText(text, legendX + 14, legendY);
        legendX += ctx.measureText(text).width + 28;
        if (legendX > w - 50) {
            legendX = 10;
            legendY += 18;
        }
    });
}

function drawBarChart(canvas, data, title) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Title
    ctx.fillStyle = '#8c8780';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, 20);

    const barColors = {
        supports: '#22c55e',
        contradicts: '#ef4444',
        insufficient: '#6b7280',
    };

    const entries = Object.entries(data);
    const total = Object.values(data).reduce((a, b) => a + b, 0);
    if (total === 0) return;

    const barAreaTop = 40;
    const barAreaHeight = h - 70;
    const barWidth = (w - 80) / entries.length;
    const maxVal = Math.max(...Object.values(data), 1);

    entries.forEach(([label, value], i) => {
        const barH = (value / maxVal) * barAreaHeight;
        const x = 40 + i * barWidth + barWidth * 0.15;
        const bw = barWidth * 0.7;
        const y = barAreaTop + barAreaHeight - barH;

        ctx.fillStyle = barColors[label] || '#555';
        ctx.beginPath();
        ctx.roundRect(x, y, bw, barH, [4, 4, 0, 0]);
        ctx.fill();

        // Value on top
        ctx.fillStyle = '#e8e6e1';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(value.toString(), x + bw / 2, y - 8);

        // Label below
        ctx.fillStyle = '#8c8780';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText(label.toUpperCase(), x + bw / 2, barAreaTop + barAreaHeight + 18);
    });
}

export default function ResultCharts({ visualizationData }) {
    const donutRef = useRef(null);
    const barRef = useRef(null);
    const typeRef = useRef(null);

    useEffect(() => {
        if (!visualizationData) return;

        if (donutRef.current && visualizationData?.verdictDistribution) {
            const canvas = donutRef.current;
            canvas.width = canvas.offsetWidth * 2;
            canvas.height = canvas.offsetHeight * 2;
            canvas.getContext('2d').scale(2, 2);
            drawDonutChart(canvas, visualizationData.verdictDistribution, VERDICT_COLORS, 'Verdict Distribution');
        }

        if (barRef.current && visualizationData?.sourceAgreement) {
            const canvas = barRef.current;
            canvas.width = canvas.offsetWidth * 2;
            canvas.height = canvas.offsetHeight * 2;
            canvas.getContext('2d').scale(2, 2);
            drawBarChart(canvas, visualizationData.sourceAgreement, 'Source Agreement');
        }

        if (typeRef.current && visualizationData?.claimTypeBreakdown) {
            const canvas = typeRef.current;
            canvas.width = canvas.offsetWidth * 2;
            canvas.height = canvas.offsetHeight * 2;
            canvas.getContext('2d').scale(2, 2);
            drawDonutChart(canvas, visualizationData.claimTypeBreakdown, TYPE_COLORS, 'Claim Types');
        }
    }, [visualizationData]);

    if (!visualizationData) return null;

    return (
        <div className="charts-section fade-in">
            <div className="panel">
                <div className="panel-header">
                    <span className="panel-title">Verification Analytics</span>
                </div>
                <div className="panel-body">
                    <div className="charts-grid">
                        <div className="chart-container">
                            <h4 className="chart-title">Verdict Distribution</h4>
                            <canvas ref={donutRef} style={{ width: '100%', height: '240px' }} />
                        </div>
                        <div className="chart-container">
                            <h4 className="chart-title">Source Agreement</h4>
                            <canvas ref={barRef} style={{ width: '100%', height: '240px' }} />
                        </div>
                        <div className="chart-container">
                            <h4 className="chart-title">Claim Types</h4>
                            <canvas ref={typeRef} style={{ width: '100%', height: '240px' }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
