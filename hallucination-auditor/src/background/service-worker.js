// ═══════════════════════════════════════════════════════
//  HALLUCINATION AUDITOR — Service Worker (Background)
//  Handles: Groq API calls, Wikipedia verification,
//           session stats, Fresh Start summary generation
// ═══════════════════════════════════════════════════════

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const WIKI_API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const MODEL = 'llama-3.3-70b-versatile'; // Fast + smart — perfect for real-time auditing

// ── Helpers ──────────────────────────────────────────────
async function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['groqApiKey'], r => resolve(r.groqApiKey || null));
  });
}

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['domainMode', 'sensitivity', 'isEnabled'], r => {
      resolve({
        domainMode: r.domainMode || 'general',
        sensitivity: r.sensitivity || 'medium',
        isEnabled: r.isEnabled !== false
      });
    });
  });
}

async function updateSessionStats(claims) {
  return new Promise(resolve => {
    chrome.storage.local.get(['sessionStats'], r => {
      const stats = r.sessionStats || {
        verified: 0, uncertain: 0, hallucinations: 0,
        totalAnalyzed: 0, trustScoreSum: 0
      };
      claims.forEach(c => {
        if (c.verdict === 'verified') stats.verified++;
        else if (c.verdict === 'uncertain') stats.uncertain++;
        else if (c.verdict === 'hallucination') stats.hallucinations++;
      });
      stats.totalAnalyzed++;
      chrome.storage.local.set({ sessionStats: stats }, resolve);
    });
  });
}

// ── Wikipedia Quick-Check ─────────────────────────────────
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

// ── Main Hallucination Analysis ───────────────────────────
async function analyzeForHallucinations(text, context, domainMode, sensitivity) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { error: 'NO_API_KEY', message: 'Please set your Anthropic API key in extension settings.' };
  }

  const sensitivityMap = {
    low: 'Only flag clear, obvious factual errors (dates, names, numbers that are provably wrong).',
    medium: 'Flag clear errors and highly suspicious claims that contradict common knowledge.',
    high: 'Flag all questionable claims, including unverifiable statements and unsupported assertions.'
  };

  const domainInstructions = {
    general: 'Focus on general facts, history, science, and common knowledge.',
    medical: 'Apply strict medical fact-checking. Flag dosages, drug interactions, disease claims. Use WHO/CDC standards.',
    legal: 'Flag incorrect legal statutes, case names, legal procedures, or jurisdiction-specific errors.',
    financial: 'Flag incorrect financial figures, market data, regulations, or investment claims.',
    historical: 'Flag incorrect dates, historical figures, events, or causation claims.',
    scientific: 'Flag claims contradicting peer-reviewed consensus, incorrect scientific terminology, or fake studies.'
  };

  const systemPrompt = `You are a world-class AI hallucination detector and fact-checker with expertise in ${domainMode} topics.

Your job: Analyze the given AI-generated response. Extract every factual claim and assess each one.

Domain focus: ${domainInstructions[domainMode] || domainInstructions.general}
Sensitivity: ${sensitivityMap[sensitivity] || sensitivityMap.medium}

Rules:
- Only flag FACTUAL claims (not opinions, hypotheticals, or clearly labeled estimates)
- "Hallucination" = demonstrably false or fabricated with high confidence
- "Uncertain" = suspicious, unverifiable, or contradicts partial evidence  
- "Verified" = factually accurate based on your knowledge
- Provide CONCISE corrections (max 2 sentences)
- shouldSuggestFreshStart = true when ≥3 hallucinations found OR trust score < 40

Respond ONLY with this exact JSON (no markdown, no explanation):
{
  "claims": [
    {
      "text": "exact quoted phrase from the response",
      "verdict": "verified|uncertain|hallucination",
      "confidence": 90,
      "reason": "brief reason (max 15 words)",
      "correction": "correct info or null if verified"
    }
  ],
  "trustScore": 85,
  "overallVerdict": "one sentence assessment",
  "shouldSuggestFreshStart": false,
  "topIssue": "the most serious problem found, or null"
}`;

  const userContent = `AI Response to fact-check:
"""
${text}
"""
${context ? `\nConversation context (previous messages):\n"""\n${context}\n"""` : ''}`;

  try {
    const res = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        temperature: 0.1,  // Low temp for factual consistency
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ]
      })
    });

    if (!res.ok) {
      const err = await res.json();
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

    // Wiki-verify hallucinations (top 2 only to save time)
    const hallucinationClaims = parsed.claims?.filter(c => c.verdict === 'hallucination').slice(0, 2) || [];
    for (const claim of hallucinationClaims) {
      const keyTerm = claim.text.split(' ').slice(0, 5).join(' ');
      const wikiData = await wikiCheck(keyTerm);
      if (wikiData) claim.wikiContext = wikiData;
    }

    await updateSessionStats(parsed.claims || []);
    return parsed;

  } catch (err) {
    return { error: 'NETWORK_ERROR', message: err.message };
  }
}

// ── Fresh Start Summary Generator ─────────────────────────
async function generateFreshStart(conversationHistory) {
  const apiKey = await getApiKey();
  if (!apiKey) return { error: 'NO_API_KEY' };

  try {
    const res = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at summarizing AI conversations while removing inaccurate content. Be concise and direct.'
          },
          {
            role: 'user',
            content: `This AI conversation contains hallucinations and incorrect information. Create a clean, accurate "Fresh Start Prompt" the user can paste into a new AI chat.

Include ONLY:
1. The user's core question/goal (from their messages)
2. Any factually accurate context from the conversation
3. Explicit instruction to "be factually accurate"

EXCLUDE all hallucinated content.

Keep it under 200 words. Make it ready to paste directly.

Conversation to summarize:
${conversationHistory}`
          }
        ]
      })
    });

    const data = await res.json();
    return { summary: data.choices?.[0]?.message?.content || '' };
  } catch (err) {
    return { error: err.message };
  }
}

// ── Message Router ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === 'analyzeText') {
    const { text, context, domainMode, sensitivity } = request;
    analyzeForHallucinations(text, context, domainMode, sensitivity)
      .then(sendResponse)
      .catch(e => sendResponse({ error: e.message }));
    return true; // keep channel open for async
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
      sessionStats: { verified: 0, uncertain: 0, hallucinations: 0, totalAnalyzed: 0 }
    }, () => sendResponse({ ok: true }));
    return true;
  }

  if (request.action === 'getSettings') {
    getSettings().then(sendResponse);
    return true;
  }
});

// ── Install / Update Handler ───────────────────────────────
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      domainMode: 'general',
      sensitivity: 'medium',
      isEnabled: true,
      autoAnalyze: true,
      showBadge: true
      // groqApiKey: set by user in options page
    });
    chrome.storage.local.set({
      sessionStats: { verified: 0, uncertain: 0, hallucinations: 0, totalAnalyzed: 0 }
    });
    // Open options on first install
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
  }
});
