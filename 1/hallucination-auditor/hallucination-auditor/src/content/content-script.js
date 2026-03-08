// ═══════════════════════════════════════════════════════
//  HALLUCINATION AUDITOR — Content Script
//  Injects into: ChatGPT, Claude.ai, Gemini
//  Handles: DOM observation, highlight injection,
//           trust badge, fresh start button, tooltips
// ═══════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  const state = {
    platform: detectPlatform(),
    analyzedIds: new Set(),
    conversationLog: [],      // [{role, text}] for context
    hallucinationTotal: 0,
    settings: { domainMode: 'general', sensitivity: 'medium', isEnabled: true, autoAnalyze: true },
    activeTooltip: null,
    freshStartPanel: null,
    isAnalyzing: false
  };

  // ── Platform Detection ─────────────────────────────────
  function detectPlatform() {
    const h = window.location.hostname;
    if (h.includes('chatgpt.com') || h.includes('chat.openai.com')) return 'chatgpt';
    if (h.includes('claude.ai')) return 'claude';
    if (h.includes('gemini.google.com')) return 'gemini';
    return 'unknown';
  }

  // Platform-specific selectors (battle-tested against live sites)
  const PLATFORMS = {
    chatgpt: {
      aiMsg: '[data-message-author-role="assistant"]',
      userMsg: '[data-message-author-role="user"]',
      msgContent: '.markdown, .prose',
      root: '#__next'
    },
    claude: {
      aiMsg: '[data-testid="assistant-message"], .font-claude-message',
      userMsg: '[data-testid="human-message"]',
      msgContent: '.prose, p',
      root: 'body'
    },
    gemini: {
      aiMsg: 'model-response, .response-container',
      userMsg: 'user-query, .query-text',
      msgContent: '.markdown, p',
      root: 'body'
    }
  };

  const sel = PLATFORMS[state.platform] || PLATFORMS.chatgpt;

  // ── Unique Message ID ─────────────────────────────────
  function getMessageId(el) {
    return el.dataset.messageId ||
      el.closest('[data-message-id]')?.dataset.messageId ||
      'msg_' + [...document.querySelectorAll(sel.aiMsg)].indexOf(el);
  }

  // ── Extract Text Content ───────────────────────────────
  function extractText(el) {
    const contentEl = el.querySelector(sel.msgContent) || el;
    return contentEl.innerText.trim();
  }

  // ── Build Conversation Context (last 6 turns) ─────────
  function buildContext() {
    return state.conversationLog
      .slice(-6)
      .map(m => `${m.role.toUpperCase()}: ${m.text}`)
      .join('\n---\n');
  }

  // ── Collect All User Messages for Fresh Start ─────────
  function buildFullHistory() {
    return state.conversationLog
      .map(m => `${m.role.toUpperCase()}: ${m.text}`)
      .join('\n\n');
  }

  // ── Load Settings ──────────────────────────────────────
  async function loadSettings() {
    return new Promise(resolve => {
      chrome.storage.sync.get(
        ['domainMode', 'sensitivity', 'isEnabled', 'autoAnalyze', 'showBadge'],
        r => {
          state.settings = {
            domainMode: r.domainMode || 'general',
            sensitivity: r.sensitivity || 'medium',
            isEnabled: r.isEnabled !== false,
            autoAnalyze: r.autoAnalyze !== false,
            showBadge: r.showBadge !== false
          };
          resolve();
        }
      );
    });
  }

  // ══════════════════════════════════════════════════════
  //  HIGHLIGHT ENGINE
  // ══════════════════════════════════════════════════════

  // Escape for safe regex matching
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Find a text node containing the claim and wrap it
  function highlightClaimInElement(rootEl, claim) {
    const verdict = claim.verdict;
    if (verdict === 'verified') return; // don't annotate verified claims

    const claimText = claim.text;
    if (!claimText || claimText.length < 8) return;

    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
    let node;

    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(claimText);
      if (idx === -1) continue;

      // Split: [before, claim, after]
      const before = document.createTextNode(node.textContent.slice(0, idx));
      const after = document.createTextNode(node.textContent.slice(idx + claimText.length));

      const span = document.createElement('span');
      span.className = `ha-claim ha-${verdict}`;
      span.textContent = claimText;
      span.dataset.verdict = verdict;
      span.dataset.confidence = claim.confidence;
      span.dataset.reason = claim.reason || '';
      span.dataset.correction = claim.correction || '';
      span.dataset.wiki = claim.wikiContext || '';

      span.addEventListener('mouseenter', showTooltip);
      span.addEventListener('mouseleave', hideTooltip);

      const parent = node.parentNode;
      parent.insertBefore(before, node);
      parent.insertBefore(span, node);
      parent.insertBefore(after, node);
      parent.removeChild(node);

      break; // only first occurrence
    }
  }

  // ══════════════════════════════════════════════════════
  //  TOOLTIP
  // ══════════════════════════════════════════════════════
  function showTooltip(e) {
    hideTooltip();
    const span = e.currentTarget;
    const verdict = span.dataset.verdict;
    const reason = span.dataset.reason;
    const correction = span.dataset.correction;
    const confidence = span.dataset.confidence;
    const wiki = span.dataset.wiki;

    const tip = document.createElement('div');
    tip.className = `ha-tooltip ha-tip-${verdict}`;

    const icons = { hallucination: '🔴', uncertain: '🟡', verified: '🟢' };
    const labels = { hallucination: 'HALLUCINATION DETECTED', uncertain: 'UNCERTAIN CLAIM', verified: 'VERIFIED' };

    tip.innerHTML = `
      <div class="ha-tip-header">
        <span class="ha-tip-icon">${icons[verdict]}</span>
        <span class="ha-tip-label">${labels[verdict]}</span>
        <span class="ha-tip-conf">${confidence}% confidence</span>
      </div>
      <div class="ha-tip-reason">${reason}</div>
      ${correction ? `<div class="ha-tip-correction"><strong>✅ Correction:</strong> ${correction}</div>` : ''}
      ${wiki ? `<div class="ha-tip-wiki"><strong>📖 Wikipedia says:</strong> ${wiki.slice(0, 200)}${wiki.length > 200 ? '…' : ''}</div>` : ''}
      <div class="ha-tip-footer">Powered by Hallucination Auditor</div>
    `;

    document.body.appendChild(tip);
    state.activeTooltip = tip;

    // Position tooltip
    const rect = span.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let top = window.scrollY + rect.bottom + 8;
    let left = window.scrollX + rect.left;

    if (left + tipRect.width > window.innerWidth - 20) {
      left = window.innerWidth - tipRect.width - 20;
    }
    if (top + tipRect.height > window.scrollY + window.innerHeight - 20) {
      top = window.scrollY + rect.top - tipRect.height - 8;
    }

    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
    tip.style.opacity = '1';
  }

  function hideTooltip() {
    if (state.activeTooltip) {
      state.activeTooltip.remove();
      state.activeTooltip = null;
    }
  }

  document.addEventListener('click', hideTooltip);

  // ══════════════════════════════════════════════════════
  //  TRUST SCORE BADGE
  // ══════════════════════════════════════════════════════
  function injectTrustBadge(msgEl, result) {
    // Remove old badge if exists
    msgEl.querySelector('.ha-badge')?.remove();

    const score = result.trustScore ?? 100;
    const counts = { v: 0, u: 0, h: 0 };
    (result.claims || []).forEach(c => {
      if (c.verdict === 'verified') counts.v++;
      else if (c.verdict === 'uncertain') counts.u++;
      else if (c.verdict === 'hallucination') counts.h++;
    });

    const color = score >= 80 ? '#00c47d' : score >= 55 ? '#f5a623' : '#ff3d5a';
    const emoji = score >= 80 ? '✅' : score >= 55 ? '⚠️' : '🚨';

    const badge = document.createElement('div');
    badge.className = 'ha-badge';
    badge.innerHTML = `
      <div class="ha-badge-inner" style="border-color: ${color}40; background: ${color}12;">
        <span class="ha-badge-emoji">${emoji}</span>
        <div class="ha-badge-score-wrap">
          <span class="ha-badge-score" style="color:${color}">
            <span class="ha-score-num" data-target="${score}">0</span>%
          </span>
          <span class="ha-badge-label">Trust Score</span>
        </div>
        <div class="ha-badge-pills">
          ${counts.v > 0 ? `<span class="ha-pill ha-pill-v">✓${counts.v}</span>` : ''}
          ${counts.u > 0 ? `<span class="ha-pill ha-pill-u">?${counts.u}</span>` : ''}
          ${counts.h > 0 ? `<span class="ha-pill ha-pill-h">✗${counts.h}</span>` : ''}
        </div>
      </div>
    `;

    // Append after message
    const insertAfter = msgEl.querySelector(sel.msgContent)?.parentElement || msgEl;
    insertAfter.after(badge);

    // Animate score counter
    animateCounter(badge.querySelector('.ha-score-num'), score);
  }

  function animateCounter(el, target) {
    let current = 0;
    const step = Math.max(1, Math.floor(target / 30));
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current;
      if (current >= target) clearInterval(timer);
    }, 30);
  }

  // ══════════════════════════════════════════════════════
  //  ANALYZING SPINNER (while API call is in progress)
  // ══════════════════════════════════════════════════════
  function showAnalyzingSpinner(msgEl) {
    const spinner = document.createElement('div');
    spinner.className = 'ha-analyzing';
    spinner.innerHTML = `<span class="ha-spinner"></span> Hallucination Auditor scanning...`;
    msgEl.after(spinner);
    return spinner;
  }

  // ══════════════════════════════════════════════════════
  //  FRESH START PANEL
  // ══════════════════════════════════════════════════════
  function showFreshStartButton(msgEl, topIssue) {
    if (msgEl.querySelector('.ha-fresh-btn')) return;

    const btn = document.createElement('div');
    btn.className = 'ha-fresh-btn';
    btn.innerHTML = `
      <div class="ha-fresh-inner">
        <div class="ha-fresh-left">
          <span class="ha-fresh-icon">⚡</span>
          <div>
            <div class="ha-fresh-title">Too many hallucinations detected!</div>
            <div class="ha-fresh-sub">${topIssue || 'This conversation may have drifted into inaccurate territory.'}</div>
          </div>
        </div>
        <button class="ha-fresh-cta">Fresh Start →</button>
      </div>
    `;

    btn.querySelector('.ha-fresh-cta').addEventListener('click', () => triggerFreshStart(btn));
    msgEl.after(btn);
  }

  async function triggerFreshStart(triggerEl) {
    const btn = triggerEl.querySelector('.ha-fresh-cta');
    if (btn) { btn.textContent = 'Summarizing…'; btn.disabled = true; }

    const history = buildFullHistory();
    const result = await chrome.runtime.sendMessage({
      action: 'generateFreshStart',
      history
    });

    showFreshStartPanel(result.summary || 'Could not generate summary. Please try again.');
  }

  function showFreshStartPanel(summary) {
    state.freshStartPanel?.remove();

    const panel = document.createElement('div');
    panel.className = 'ha-fs-panel';
    panel.innerHTML = `
      <div class="ha-fs-header">
        <span>⚡ Fresh Start Prompt</span>
        <button class="ha-fs-close">✕</button>
      </div>
      <p class="ha-fs-desc">We've summarized your conversation, removing hallucinated content. Copy this and paste it into a new chat:</p>
      <textarea class="ha-fs-text" readonly>${summary}</textarea>
      <div class="ha-fs-actions">
        <button class="ha-fs-copy">📋 Copy to Clipboard</button>
        <button class="ha-fs-new">🔗 Open New Chat</button>
      </div>
    `;

    panel.querySelector('.ha-fs-close').addEventListener('click', () => panel.remove());
    panel.querySelector('.ha-fs-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(summary);
      const copyBtn = panel.querySelector('.ha-fs-copy');
      copyBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyBtn.textContent = '📋 Copy to Clipboard'; }, 2000);
    });
    panel.querySelector('.ha-fs-new').addEventListener('click', () => {
      const urls = { chatgpt: 'https://chatgpt.com/', claude: 'https://claude.ai/new', gemini: 'https://gemini.google.com/' };
      window.open(urls[state.platform] || 'https://chatgpt.com/', '_blank');
    });

    document.body.appendChild(panel);
    state.freshStartPanel = panel;
  }

  // ══════════════════════════════════════════════════════
  //  MAIN ANALYSIS PIPELINE
  // ══════════════════════════════════════════════════════
  async function analyzeMessage(msgEl) {
    if (!state.settings.isEnabled) return;
    if (state.isAnalyzing) return;

    const msgId = getMessageId(msgEl);
    if (state.analyzedIds.has(msgId)) return;
    state.analyzedIds.add(msgId);

    const text = extractText(msgEl);
    if (!text || text.length < 40) return; // skip very short responses

    state.isAnalyzing = true;
    const spinner = showAnalyzingSpinner(msgEl);

    // Add to conversation log
    state.conversationLog.push({ role: 'assistant', text: text.slice(0, 1000) });

    try {
      const result = await chrome.runtime.sendMessage({
        action: 'analyzeText',
        text: text.slice(0, 3000), // limit to keep API costs low
        context: buildContext(),
        domainMode: state.settings.domainMode,
        sensitivity: state.settings.sensitivity
      });

      spinner.remove();

      if (result.error) {
        if (result.error === 'NO_API_KEY') showApiKeyWarning(msgEl);
        return;
      }

      // Inject trust badge
      if (state.settings.showBadge) injectTrustBadge(msgEl, result);

      // Highlight claims
      const contentEl = msgEl.querySelector(sel.msgContent) || msgEl;
      (result.claims || []).forEach(claim => highlightClaimInElement(contentEl, claim));

      // Track hallucinations
      const newHallucinations = (result.claims || []).filter(c => c.verdict === 'hallucination').length;
      state.hallucinationTotal += newHallucinations;

      // Fresh Start suggestion
      if (result.shouldSuggestFreshStart || state.hallucinationTotal >= 3) {
        showFreshStartButton(msgEl, result.topIssue);
      }

      // Notify popup of update
      chrome.runtime.sendMessage({ action: 'analysisComplete', result }).catch(() => {});

    } catch (err) {
      spinner.remove();
      console.warn('[HallucinationAuditor] Analysis error:', err);
    } finally {
      state.isAnalyzing = false;
    }
  }

  function showApiKeyWarning(msgEl) {
    if (document.querySelector('.ha-apikey-warn')) return;
    const warn = document.createElement('div');
    warn.className = 'ha-apikey-warn';
    warn.innerHTML = `
      🔑 <strong>Hallucination Auditor:</strong> No Groq API key set.
      <a href="${chrome.runtime.getURL('src/options/options.html')}" target="_blank">Add your free key at console.groq.com →</a>
    `;
    msgEl.after(warn);
  }

  // ── Detect when AI finishes streaming ──────────────────
  function isStreamingComplete(el) {
    // ChatGPT adds data-is-focused when done, cursor disappears
    if (state.platform === 'chatgpt') {
      return !el.querySelector('.result-streaming, [data-is-streaming="true"]');
    }
    // Claude uses data-is-streaming attribute
    if (state.platform === 'claude') {
      const streamEl = el.closest('[data-is-streaming]');
      return !streamEl || streamEl.dataset.isStreaming === 'false';
    }
    return true;
  }

  // ── Observe DOM for new AI messages ───────────────────
  function startObserving() {
    const root = document.querySelector(sel.root) || document.body;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Check added nodes
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          const aiMsgs = node.matches?.(sel.aiMsg)
            ? [node]
            : [...node.querySelectorAll(sel.aiMsg)];

          aiMsgs.forEach(msgEl => {
            if (isStreamingComplete(msgEl)) {
              // Delay slightly to ensure DOM is fully painted
              setTimeout(() => analyzeMessage(msgEl), 800);
            }
          });
        });

        // Also watch for streaming=false attribute changes (Claude)
        if (mutation.type === 'attributes' &&
          mutation.attributeName === 'data-is-streaming' &&
          mutation.target.dataset.isStreaming === 'false') {
          const aiMsg = mutation.target.querySelector(sel.aiMsg) || mutation.target;
          if (aiMsg) setTimeout(() => analyzeMessage(aiMsg), 800);
        }
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-is-streaming', 'data-message-author-role']
    });

    // Also track user messages for conversation history
    const userObserver = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          const userMsgs = node.matches?.(sel.userMsg)
            ? [node]
            : [...node.querySelectorAll(sel.userMsg)];
          userMsgs.forEach(el => {
            const text = extractText(el);
            if (text) state.conversationLog.push({ role: 'user', text: text.slice(0, 500) });
          });
        });
      });
    });
    userObserver.observe(root, { childList: true, subtree: true });
  }

  // ── Handle messages from popup ─────────────────────────
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getConversationStats') {
      sendResponse({
        platform: state.platform,
        hallucinationTotal: state.hallucinationTotal,
        messagesAnalyzed: state.analyzedIds.size,
        conversationLength: state.conversationLog.length
      });
      return true;
    }
    if (request.action === 'settingsUpdated') {
      loadSettings();
    }
    if (request.action === 'triggerFreshStart') {
      const history = buildFullHistory();
      chrome.runtime.sendMessage({ action: 'generateFreshStart', history })
        .then(result => showFreshStartPanel(result.summary || 'Summary unavailable.'));
    }
  });

  // ── Manual audit button in context menu ────────────────
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'auditSelection') {
      const selected = window.getSelection()?.toString();
      if (selected && selected.length > 20) {
        // Create a temporary element to show results
        const tempDiv = document.createElement('div');
        tempDiv.className = 'ha-manual-result';
        tempDiv.textContent = 'Auditing selection…';
        document.body.appendChild(tempDiv);
        // TODO: wire up full analysis for selection
      }
    }
  });

  // ── Boot ───────────────────────────────────────────────
  (async function init() {
    await loadSettings();
    if (state.platform === 'unknown') return;
    startObserving();
    console.log(`[HallucinationAuditor] Active on ${state.platform}`);
  })();

})();
