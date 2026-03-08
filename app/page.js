'use client';

import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import HeroSection from '@/components/HeroSection';
import InputPanel from '@/components/InputPanel';
import ResultsView from '@/components/ResultsView';
import ResultCharts from '@/components/ResultCharts';
import NumericalAnalysis from '@/components/NumericalAnalysis';
import CompliancePanel from '@/components/CompliancePanel';

export default function Home() {
  const [mode, setMode] = useState('general');
  const [complianceMode, setComplianceMode] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.8);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [claims, setClaims] = useState([]);
  const [claimResults, setClaimResults] = useState({});
  const [checkingClaims, setCheckingClaims] = useState(new Set());
  const [overallScore, setOverallScore] = useState(null);
  const [visualizationData, setVisualizationData] = useState(null);
  const [complianceReport, setComplianceReport] = useState(null);
  const [error, setError] = useState(null);

  const resetState = useCallback(() => {
    setClaims([]);
    setClaimResults({});
    setCheckingClaims(new Set());
    setOverallScore(null);
    setVisualizationData(null);
    setComplianceReport(null);
    setError(null);
  }, []);

  const handleVerify = useCallback(async () => {
    if (!inputText.trim()) return;

    resetState();
    setStatus('decomposing');
    setStatusMessage('Decomposing text into atomic claims...');

    try {
      // Step 1: Decompose claims
      const decomposeRes = await fetch('/api/decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, mode }),
      });

      if (!decomposeRes.ok) {
        const errData = await decomposeRes.json();
        throw new Error(errData.error || 'Failed to decompose claims');
      }

      const decomposeData = await decomposeRes.json();
      const decomposed = decomposeData.claims;
      if (!decomposed || !Array.isArray(decomposed)) {
        throw new Error(decomposeData.error || 'Failed to decompose claims — no claims returned');
      }
      setClaims(decomposed);
      setStatus('verifying');
      setStatusMessage(`Verifying ${decomposed.length} claims across authoritative sources...`);

      // Step 2: Stream verification
      const verifyRes = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claims: decomposed,
          mode,
          complianceMode,
          confidenceThreshold,
        }),
      });

      const reader = verifyRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.includes('data: ')) continue;
          const dataLine = line.split('data: ').slice(1).join('data: ');
          try {
            const data = JSON.parse(dataLine);

            switch (data.event) {
              case 'claim_checking':
                setCheckingClaims(prev => new Set([...prev, data.claimId]));
                setStatusMessage(`Checking: "${data.claim?.slice(0, 60)}..."`);
                break;

              case 'checking_source':
                setStatusMessage(`Consulting ${data.sourceName}: ${data.sourceTitle?.slice(0, 40)}...`);
                break;

              case 'claim_result':
                setCheckingClaims(prev => {
                  const next = new Set(prev);
                  next.delete(data.claimId);
                  return next;
                });
                setClaimResults(prev => ({ ...prev, [data.claimId]: data }));
                break;

              case 'verification_complete':
                setStatus('complete');
                setStatusMessage('Verification complete');
                setOverallScore(data.overallScore);
                setVisualizationData(data.visualizationData);
                if (data.complianceReport) setComplianceReport(data.complianceReport);
                break;

              case 'error':
                setError(data.message);
                setStatus('error');
                break;
            }
          } catch (e) {
            // skip malformed events
          }
        }
      }

      setStatus('complete');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [inputText, mode, complianceMode, confidenceThreshold, resetState]);

  const showResults = status === 'verifying' || status === 'complete';

  return (
    <>
      <Header
        mode={mode}
        onModeChange={setMode}
        complianceMode={complianceMode}
        onComplianceChange={setComplianceMode}
        confidenceThreshold={confidenceThreshold}
        onThresholdChange={setConfidenceThreshold}
      />
      <main className="main">
        {!showResults && status !== 'decomposing' && (
          <HeroSection />
        )}

        <InputPanel
          text={inputText}
          setText={setInputText}
          onVerify={handleVerify}
          isLoading={status === 'decomposing' || status === 'verifying'}
          complianceMode={complianceMode}
        />

        {status === 'decomposing' && (
          <div className="loading-container fade-in">
            <div className="loading-spinner" />
            <div className="loading-text">{statusMessage}</div>
            <div className="loading-step">Using AI to identify verifiable claims</div>
          </div>
        )}

        {error && (
          <div className="error-card fade-in">
            <h3>Verification Error</h3>
            <p>{error}</p>
          </div>
        )}

        {showResults && (
          <>
            <ResultsView
              inputText={inputText}
              claims={claims}
              claimResults={claimResults}
              checkingClaims={checkingClaims}
              statusMessage={statusMessage}
              isComplete={status === 'complete'}
              overallScore={overallScore}
            />

            {status === 'complete' && (
              <>
                <ResultCharts visualizationData={visualizationData} />
                <NumericalAnalysis claims={claims} claimResults={claimResults} />
                {complianceReport && <CompliancePanel report={complianceReport} />}
              </>
            )}
          </>
        )}
      </main>

      <footer className="footer">
        <p className="footer-text">Veridex — Truth in Every Token</p>
        <p className="footer-sub">Powered by Wikipedia · Wikidata · Google Fact Check · PubMed · CourtListener · SEC EDGAR · CrossRef · Semantic Scholar</p>
      </footer>
    </>
  );
}
