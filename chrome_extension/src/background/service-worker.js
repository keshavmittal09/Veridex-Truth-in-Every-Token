// ═══════════════════════════════════════════════════════
//  VERIDEX — Service Worker (Background)
//  Primary: Calls Veridex backend API for full multi-source verification
//  Fallback: Uses Groq API for LLM-only analysis when backend unavailable
//  Sources: Wikipedia, Wikidata, Google Fact Check, PubMed, CourtListener,
//           SEC EDGAR, Academic (CrossRef/Semantic Scholar), GNews
// ═══════════════════════════════════════════════════════

const DEFAULT_BACKEND_URL = 'https://veridex-backend-4dxt.onrender.com';
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const WIKI_API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const MODEL = 'llama-3.3-70b-versatile';

// ── Helpers ──────────────────────────────────────────────
async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(
      ['groqApiKey', 'backendUrl', 'domainMode', 'sensitivity', 'isEnabled', 'useBackend'],
      r => resolve({
        groqApiKey: r.groqApiKey || null,
        backendUrl: r.backendUrl || DEFAULT_BACKEND_URL,
        domainMode: r.domainMode || 'general',
        sensitivity: r.sensitivity || 'medium',
        isEnabled: r.isEnabled !== false,
        useBackend: r.useBackend !== false,
      })
    );
  });
}

async function updateSessionStats(claims) {
  return new Promise(resolve => {
    chrome.storage.local.get(['sessionStats'], r => {
      const stats = r.sessionStats || {
        verified: 0, uncertain: 0, hallucinations: 0,
        totalAnalyzed: 0, sourcesQueried: 0,
      };
      (claims || []).forEach(c => {
        if (c.verdict === 'verified') stats.verified++;
        else if (c.verdict === 'uncertain') stats.uncertain++;
        else if (c.verdict === 'hallucination') stats.hallucinations++;
      });
      stats.totalAnalyzed++;
      chrome.storage.local.set({ sessionStats: stats }, resolve);
    });
  });
}

// ── Sanitize text to prevent XSS ─────────────────────────
function sanitize(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ══════════════════════════════════════════════════════════
//  PRIMARY: Backend API Verification (matches webapp results)
// ══════════════════════════════════════════════════════════
async function analyzeViaBackend(text, domainMode, backendUrl) {
  const url = `${backendUrl}/msg/`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response: text,
        mode: domainMode,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Backend returned ${res.status}`);
    }

    const data = await res.json();

    // Sanitize all text fields from backend response
    if (data.claims) {
      data.claims = data.claims.map(c => ({
        ...c,
        text: sanitize(c.text),
        reason: sanitize(c.reason),
        correction: c.correction ? sanitize(c.correction) : null,
        wikiContext: c.wikiContext ? sanitize(c.wikiContext) : '',
      }));
    }
    if (data.overallVerdict) data.overallVerdict = sanitize(data.overallVerdict);
    if (data.topIssue) data.topIssue = sanitize(data.topIssue);

    await updateSessionStats(data.claims || []);
    return data;

  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('BACKEND_TIMEOUT');
    }
    throw err;
  }
}

// ══════════════════════════════════════════════════════════
//  FALLBACK: Groq LLM-only Analysis (when backend unavailable)
// ══════════════════════════════════════════════════════════
async function analyzeViaGroq(text, context, domainMode, sensitivity) {
  const settings = await getSettings();
  const apiKey = settings.groqApiKey;
  if (!apiKey) {
    return { error: 'NO_API_KEY', message: 'Backend unavailable and no Groq API key set.' };
  }

  const sensitivityMap = {
    low: 'Only flag clear, obvious factual errors.',
    medium: 'Flag clear errors and highly suspicious claims.',
    high: 'Flag all questionable claims including unverifiable statements.',
  };

  const domainInstructions = {
    general: 'Focus on general facts, history, science, and common knowledge.',
    medical: 'Apply strict medical fact-checking. Use WHO/CDC standards.',
    legal: 'Flag incorrect legal statutes, cases, procedures.',
    financial: 'Flag incorrect financial figures, regulations, investment claims.',
    historical: 'Flag incorrect dates, figures, events.',
    scientific: 'Flag claims contradicting peer-reviewed consensus.',
  };

  const systemPrompt = `You are an expert AI fact-checker specializing in ${domainMode} topics.

Analyze the AI response below. Extract factual claims and assess each against your training knowledge.

Domain: ${domainInstructions[domainMode] || domainInstructions.general}
Sensitivity: ${sensitivityMap[sensitivity] || sensitivityMap.medium}

Rules:
- Only flag FACTUAL claims (not opinions or hypotheticals)
- "hallucination" = demonstrably false or fabricated
- "uncertain" = suspicious, unverifiable, or partially correct
- "verified" = factually accurate based on reliable knowledge
- Provide concise corrections (max 2 sentences)
- shouldSuggestFreshStart = true when 3+ hallucinations or trust score < 40

Respond ONLY with valid JSON:
{
  "claims": [
    {
      "text": "exact quoted phrase",
      "verdict": "verified|uncertain|hallucination",
      "confidence": 90,
      "reason": "brief reason (max 15 words)",
      "correction": "correct info or null if verified"
    }
  ],
  "trustScore": 85,
  "overallVerdict": "one sentence assessment",
  "shouldSuggestFreshStart": false,
  "topIssue": "most serious problem or null"
}`;

  try {
    const res = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `AI Response to fact-check:\n"""\n${text}\n"""${context ? `\n\nContext:\n"""\n${context}\n"""` : ''}` },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: 'API_ERROR', message: err.error?.message || `Groq API error ${res.status}` };
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '';

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else return { error: 'PARSE_ERROR', raw };
    }

    // Sanitize LLM output
    if (parsed.claims) {
      parsed.claims = parsed.claims.map(c => ({
        ...c,
        text: sanitize(c.text),
        reason: sanitize(c.reason),
        correction: c.correction ? sanitize(c.correction) : null,
      }));
    }
    if (parsed.overallVerdict) parsed.overallVerdict = sanitize(parsed.overallVerdict);
    if (parsed.topIssue) parsed.topIssue = sanitize(parsed.topIssue);

    // Wiki-verify top 2 hallucinations
    const hallClaims = parsed.claims?.filter(c => c.verdict === 'hallucination').slice(0, 2) || [];
    for (const claim of hallClaims) {
      const keyTerm = claim.text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, '').split(' ').slice(0, 5).join(' ');
      const wikiData = await wikiCheck(keyTerm);
      if (wikiData) claim.wikiContext = sanitize(wikiData);
    }

    // Mark as fallback mode
    parsed.sourcesUsed = ['Groq LLM (fallback)', 'Wikipedia'];
    parsed.provider = 'groq-fallback';

    await updateSessionStats(parsed.claims || []);
    return parsed;

  } catch (err) {
    return { error: 'NETWORK_ERROR', message: err.message };
  }
}

// ── Wikipedia Quick-Check ────────────────────────────────
async function wikiCheck(term) {
  try {
    const encoded = encodeURIComponent(term.trim().split(' ').slice(0, 4).join(' '));
    const res = await fetch(`${WIKI_API}${encoded}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.extract ? data.extract.slice(0, 400) : null;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════
//  MAIN ANALYSIS — tries backend first, then falls back
// ══════════════════════════════════════════════════════════
async function analyzeForHallucinations(text, context, domainMode, sensitivity) {
  const settings = await getSettings();

  if (!settings.isEnabled) {
    return { error: 'DISABLED', message: 'Extension is disabled.' };
  }

  // Try backend first (matches webapp results)
  if (settings.useBackend) {
    try {
      const result = await analyzeViaBackend(text, domainMode, settings.backendUrl);
      return result;
    } catch (err) {
      console.warn('[Veridex] Backend unavailable, falling back to Groq:', err.message);
      // Fall through to Groq fallback
    }
  }

  // Fallback to Groq-only analysis
  return analyzeViaGroq(text, context, domainMode, sensitivity);
}

// ── Fresh Start Summary Generator ────────────────────────
async function generateFreshStart(conversationHistory) {
  const settings = await getSettings();

  // Try backend first
  if (settings.useBackend) {
    try {
      const res = await fetch(`${settings.backendUrl}/api/health`);
      if (res.ok) {
        // Backend is alive, use Groq through it won't help for summary
        // Fall through to direct Groq
      }
    } catch { /* backend down */ }
  }

  const apiKey = settings.groqApiKey;
  if (!apiKey) return { error: 'NO_API_KEY' };

  try {
    const res = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at summarizing AI conversations while removing inaccurate content. Be concise and direct.',
          },
          {
            role: 'user',
            content: `This AI conversation contains hallucinations. Create a "Fresh Start Prompt" the user can paste into a new AI chat.

Include ONLY:
1. The user's core question/goal
2. Factually accurate context
3. Instruction to "be factually accurate"

EXCLUDE all hallucinated content. Keep under 200 words. Make it ready to paste.

Conversation:
${conversationHistory}`,
          },
        ],
      }),
    });

    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content || '';
    return { summary: sanitize(summary) };
  } catch (err) {
    return { error: err.message };
  }
}

// ── Message Router ──────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === 'analyzeText') {
    const { text, context, domainMode, sensitivity } = request;
    analyzeForHallucinations(text, context, domainMode, sensitivity)
      .then(sendResponse)
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }

  if (request.action === 'generateFreshStart') {
    generateFreshStart(request.history)
      .then(sendResponse)
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }

  if (request.action === 'getSessionStats') {
    chrome.storage.local.get(['sessionStats'], r => {
      sendResponse(r.sessionStats || { verified: 0, uncertain: 0, hallucinations: 0, totalAnalyzed: 0 });
    });
    return true;
  }

  if (request.action === 'resetStats') {
    chrome.storage.local.set({
      sessionStats: { verified: 0, uncertain: 0, hallucinations: 0, totalAnalyzed: 0, sourcesQueried: 0 },
    }, () => sendResponse({ ok: true }));
    return true;
  }

  if (request.action === 'getSettings') {
    getSettings().then(sendResponse);
    return true;
  }

  if (request.action === 'checkBackendHealth') {
    getSettings().then(async settings => {
      try {
        const res = await fetch(`${settings.backendUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          sendResponse({ online: true, ...data });
        } else {
          sendResponse({ online: false });
        }
      } catch {
        sendResponse({ online: false });
      }
    });
    return true;
  }
});

// ── Install / Update Handler ────────────────────────────
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      domainMode: 'general',
      sensitivity: 'medium',
      isEnabled: true,
      autoAnalyze: true,
      showBadge: true,
      useBackend: true,
      backendUrl: DEFAULT_BACKEND_URL,
    });
    chrome.storage.local.set({
      sessionStats: { verified: 0, uncertain: 0, hallucinations: 0, totalAnalyzed: 0, sourcesQueried: 0 },
    });
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
  }
});
