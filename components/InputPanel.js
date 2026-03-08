'use client';

import { useState, useRef } from 'react';

const EXAMPLES = [
    {
        label: 'Test with hallucinations',
        text: `Tesla's revenue grew by 40% in 2024, making it the world's most valuable car company by market capitalization. The company was founded in 2003 by Elon Musk in San Francisco. Tesla's Model 3 was the best-selling electric vehicle globally in 2023, with over 5 million units sold that year alone. Experts predict that electric vehicles will account for 80% of all car sales by 2027.`,
    },
    {
        label: 'Scientific claims',
        text: `Water boils at 100 degrees Celsius at sea level. The human body contains approximately 206 bones in adulthood. Light travels at roughly 300,000 kilometers per second in a vacuum. The Great Wall of China is visible from space with the naked eye. DNA was first discovered by James Watson and Francis Crick in 1953.`,
    },
    {
        label: 'Historical facts',
        text: `The French Revolution began in 1789 with the storming of the Bastille. Napoleon Bonaparte was born in Corsica in 1769 and became Emperor of France in 1804. The Declaration of Independence was signed on July 4, 1776 by all 56 delegates simultaneously. World War II ended in 1945 when Germany surrendered on May 8th, known as V-E Day.`,
    },
];

export default function InputPanel({ text, setText, onVerify, isLoading, complianceMode }) {
    const [pdfLoading, setPdfLoading] = useState(false);
    const [pdfInfo, setPdfInfo] = useState(null);
    const [pdfError, setPdfError] = useState(null);
    const fileInputRef = useRef(null);

    const handlePdfUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.pdf')) {
            setPdfError('Please upload a PDF file');
            return;
        }

        if (file.size > 20 * 1024 * 1024) {
            setPdfError('PDF exceeds 20MB limit');
            return;
        }

        setPdfLoading(true);
        setPdfError(null);
        setPdfInfo(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/upload-pdf', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to extract text from PDF');
            }

            setText(data.text);
            setPdfInfo({ filename: data.filename, pages: data.pages });
        } catch (err) {
            setPdfError(err.message);
        } finally {
            setPdfLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <section className="input-section">
            <div className="input-card">
                <div className="input-header">
                    <span className="input-label">
                        {complianceMode ? 'Paste Text or Upload PDF' : 'Paste AI-Generated Text'}
                    </span>
                    <span className="char-count">{text.length} chars</span>
                </div>

                {/* PDF Upload — Compliance Mode Only */}
                {complianceMode && (
                    <div className="pdf-upload-area">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf"
                            onChange={handlePdfUpload}
                            style={{ display: 'none' }}
                            disabled={isLoading || pdfLoading}
                        />
                        <button
                            className="pdf-upload-btn"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isLoading || pdfLoading}
                        >
                            {pdfLoading ? (
                                <>
                                    <span className="pdf-icon">⏳</span>
                                    Extracting text from PDF...
                                </>
                            ) : (
                                <>
                                    <span className="pdf-icon">📄</span>
                                    Upload PDF Document
                                </>
                            )}
                        </button>
                        {pdfInfo && (
                            <span className="pdf-info">
                                ✓ {pdfInfo.filename} — {pdfInfo.pages} page{pdfInfo.pages !== 1 ? 's' : ''} extracted
                            </span>
                        )}
                        {pdfError && (
                            <span className="pdf-error">{pdfError}</span>
                        )}
                    </div>
                )}

                <textarea
                    className="text-input"
                    placeholder="Paste any AI-generated text here — ChatGPT responses, Gemini outputs, Claude answers, AI reports — and Veridex will verify every claim..."
                    value={text}
                    onChange={e => setText(e.target.value)}
                    disabled={isLoading}
                />

                <div className="input-footer">
                    <div className="example-prompts">
                        {EXAMPLES.map((ex, i) => (
                            <button
                                key={i}
                                className="example-btn"
                                onClick={() => setText(ex.text)}
                                disabled={isLoading}
                            >
                                {ex.label}
                            </button>
                        ))}
                    </div>

                    <button
                        className="verify-btn"
                        onClick={onVerify}
                        disabled={isLoading || !text.trim()}
                    >
                        {isLoading ? 'Verifying...' : 'Verify'}
                    </button>
                </div>
            </div>
        </section>
    );
}
