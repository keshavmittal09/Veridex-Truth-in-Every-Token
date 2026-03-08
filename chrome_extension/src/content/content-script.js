// ═══════════════════════════════════════════════════════
//  VERIDEX — Content Script
//  Injects into: ChatGPT, Claude, Gemini, DeepSeek, Perplexity
//  Handles: DOM observation, highlight injection,
//           trust badge, fresh start, tooltips
// ═══════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  const state = {
    platform: detectPlatform(),
    analyzedIds: new Set(),
    conversationLog: [],
    hallucinationTotal: 0,
    settings: { domainMode: 'general', sensitivity: 'medium', isEnabled: true, autoAnalyze: true, showBadge: true },
    activeTooltip: null,
    freshStartPanel: null,
    analysisQueue: [],
    isProcessingQueue: false,
  };

  // ── Platform Detection ─────────────────────────────────
  function detectPlatform() {
    const h = window.location.hostname;
    if (h.includes('chatgpt.com') || h.includes('chat.openai.com')) return 'chatgpt';
    if (h.includes('claude.ai')) return 'claude';
    if (h.includes('gemini.google.com')) return 'gemini';
    if (h.includes('chat.deepseek.com')) return 'deepseek';
    if (h.includes('perplexity.ai')) return 'perplexity';
    return 'unknown';
  }

  // Platform-specific selectors
  const PLATFORMS = {
    chatgpt: {
      aiMsg: '[data-message-author-role="assistant"]',
      userMsg: '[data-message-author-role="user"]',
      msgContent: '.markdown, .prose',
      root: '#__next',
    },
    claude: {
      aiMsg: '[data-testid="assistant-message"], .font-claude-message',
      userMsg: '[data-testid="human-message"]',
      msgContent: '.prose, .font-claude-message p',
      root: 'body',
    },
    gemini: {
      aiMsg: 'model-response, .response-container, .model-response-text',
      userMsg: 'user-query, .query-text, .user-query-text',
      msgContent: '.markdown, .model-response-text, message-content',
      root: 'body',
    },
    deepseek: {
      aiMsg: '.ds-markdown--block, [class*="assistant"], .chat-message-assistant',
      userMsg: '[class*="user"], .chat-message-user',
      msgContent: '.ds-markdown--block, .markdown-body, p',
      root: '#root',
    },
    perplexity: {
      aiMsg: '[class*="prose"], .answer-text, [data-testid="answer"]',
      userMsg: '[data-testid="query"], .query-text',
      msgContent: '.prose, .markdown, p',
      root: '#__next',
    },
  };

  const sel = PLATFORMS[state.platform] || PLATFORMS.chatgpt;

  // ── Sanitize HTML ──────────────────────────────────────
  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

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
            showBadge: r.showBadge !== false,
          };
          resolve();
        }
      );
    });
  }

  // ══════════════════════════════════════════════════════
  //  HIGHLIGHT ENGINE (XSS-safe)
  // ══════════════════════════════════════════════════════
  function highlightClaimInElement(rootEl, claim) {
    const verdict = claim.verdict;
    if (verdict === 'verified' || verdict === 'opinion') return;

    // Decode HTML entities from sanitized text for matching
    const tmp = document.createElement('textarea');
    tmp.innerHTML = claim.text || '';
    const claimText = tmp.value;
    if (!claimText || claimText.length < 8) return;

    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
    let node;

    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(claimText);
      if (idx === -1) continue;

      const before = document.createTextNode(node.textContent.slice(0, idx));
      const after = document.createTextNode(node.textContent.slice(idx + claimText.length));

      const span = document.createElement('span');
      span.className = `vx-claim vx-${verdict}`;
      span.textContent = claimText;
      span.dataset.verdict = verdict;
      span.dataset.confidence = claim.confidence || '';
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
      break;
    }
  }

  // ══════════════════════════════════════════════════════
  //  TOOLTIP (XSS-safe — uses textContent, not innerHTML)
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
    tip.className = `vx-tooltip vx-tip-${verdict}`;

    const icons = { hallucination: '🔴', uncertain: '🟡', verified: '🟢' };
    const labels = { hallucination: 'HALLUCINATION DETECTED', uncertain: 'UNCERTAIN CLAIM', verified: 'VERIFIED' };

    // Build tooltip with safe DOM APIs
    const header = document.createElement('div');
    header.className = 'vx-tip-header';

    const iconEl = document.createElement('span');
    iconEl.className = 'vx-tip-icon';
    iconEl.textContent = icons[verdict] || '❓';
    header.appendChild(iconEl);

    const labelEl = document.createElement('span');
    labelEl.className = 'vx-tip-label';
    labelEl.textContent = labels[verdict] || verdict.toUpperCase();
    header.appendChild(labelEl);

    if (confidence) {
      const confEl = document.createElement('span');
      confEl.className = 'vx-tip-conf';
      confEl.textContent = `${confidence}% confidence`;
      header.appendChild(confEl);
    }

    tip.appendChild(header);

    if (reason) {
      const reasonEl = document.createElement('div');
      reasonEl.className = 'vx-tip-reason';
      reasonEl.textContent = reason;
      tip.appendChild(reasonEl);
    }

    if (correction) {
      const corrEl = document.createElement('div');
      corrEl.className = 'vx-tip-correction';
      const corrStrong = document.createElement('strong');
      corrStrong.textContent = '✅ Correction: ';
      corrEl.appendChild(corrStrong);
      corrEl.appendChild(document.createTextNode(correction));
      tip.appendChild(corrEl);
    }

    if (wiki) {
      const wikiEl = document.createElement('div');
      wikiEl.className = 'vx-tip-wiki';
      const wikiStrong = document.createElement('strong');
      wikiStrong.textContent = '📖 Source: ';
      wikiEl.appendChild(wikiStrong);
      wikiEl.appendChild(document.createTextNode(wiki.slice(0, 200) + (wiki.length > 200 ? '…' : '')));
      tip.appendChild(wikiEl);
    }

    const footer = document.createElement('div');
    footer.className = 'vx-tip-footer';
    footer.textContent = 'Verified by Veridex';
    tip.appendChild(footer);

    document.body.appendChild(tip);
    state.activeTooltip = tip;

    // Position
    const rect = span.getBoundingClientRect();
    let top = window.scrollY + rect.bottom + 8;
    let left = window.scrollX + rect.left;
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';

    requestAnimationFrame(() => {
      const tipRect = tip.getBoundingClientRect();
      if (left + tipRect.width > window.innerWidth - 20) {
        left = window.innerWidth - tipRect.width - 20;
        tip.style.left = left + 'px';
      }
      if (top + tipRect.height > window.scrollY + window.innerHeight - 20) {
        top = window.scrollY + rect.top - tipRect.height - 8;
        tip.style.top = top + 'px';
      }
      tip.style.opacity = '1';
    });
  }

  function hideTooltip() {
    if (state.activeTooltip) {
      state.activeTooltip.remove();
      state.activeTooltip = null;
    }
  }

  document.addEventListener('click', hideTooltip);

  // ══════════════════════════════════════════════════════
  //  TRUST SCORE BADGE (XSS-safe)
  // ══════════════════════════════════════════════════════
  function injectTrustBadge(msgEl, result) {
    msgEl.querySelector('.vx-badge')?.remove();

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
    badge.className = 'vx-badge';

    const inner = document.createElement('div');
    inner.className = 'vx-badge-inner';
    inner.style.borderColor = color + '40';
    inner.style.background = color + '12';

    const emojiEl = document.createElement('span');
    emojiEl.className = 'vx-badge-emoji';
    emojiEl.textContent = emoji;
    inner.appendChild(emojiEl);

    const scoreWrap = document.createElement('div');
    scoreWrap.className = 'vx-badge-score-wrap';
    const scoreEl = document.createElement('span');
    scoreEl.className = 'vx-badge-score';
    scoreEl.style.color = color;
    const scoreNum = document.createElement('span');
    scoreNum.className = 'vx-score-num';
    scoreNum.dataset.target = score;
    scoreNum.textContent = '0';
    scoreEl.appendChild(scoreNum);
    scoreEl.appendChild(document.createTextNode('%'));
    scoreWrap.appendChild(scoreEl);
    const labelEl = document.createElement('span');
    labelEl.className = 'vx-badge-label';
    labelEl.textContent = 'Trust Score';
    scoreWrap.appendChild(labelEl);
    inner.appendChild(scoreWrap);

    // Source indicator
    const srcUsed = result.sourcesUsed || [];
    if (srcUsed.length > 0) {
      const srcEl = document.createElement('span');
      srcEl.className = 'vx-badge-sources';
      srcEl.textContent = `${srcUsed.length} source${srcUsed.length > 1 ? 's' : ''}`;
      srcEl.title = srcUsed.join(', ');
      inner.appendChild(srcEl);
    }

    const pills = document.createElement('div');
    pills.className = 'vx-badge-pills';
    if (counts.v > 0) { const p = document.createElement('span'); p.className = 'vx-pill vx-pill-v'; p.textContent = `✓${counts.v}`; pills.appendChild(p); }
    if (counts.u > 0) { const p = document.createElement('span'); p.className = 'vx-pill vx-pill-u'; p.textContent = `?${counts.u}`; pills.appendChild(p); }
    if (counts.h > 0) { const p = document.createElement('span'); p.className = 'vx-pill vx-pill-h'; p.textContent = `✗${counts.h}`; pills.appendChild(p); }
    inner.appendChild(pills);

    badge.appendChild(inner);

    const insertAfter = msgEl.querySelector(sel.msgContent)?.parentElement || msgEl;
    insertAfter.after(badge);

    animateCounter(scoreNum, score);
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
  //  ANALYZING SPINNER
  // ══════════════════════════════════════════════════════
  function showAnalyzingSpinner(msgEl) {
    const spinner = document.createElement('div');
    spinner.className = 'vx-analyzing';
    const dot = document.createElement('span');
    dot.className = 'vx-spinner';
    spinner.appendChild(dot);
    spinner.appendChild(document.createTextNode(' Veridex verifying against trusted sources...'));
    msgEl.after(spinner);
    return spinner;
  }

  // ══════════════════════════════════════════════════════
  //  FRESH START
  // ══════════════════════════════════════════════════════
  function showFreshStartButton(msgEl, topIssue) {
    if (msgEl.querySelector('.vx-fresh-btn')) return;

    const btn = document.createElement('div');
    btn.className = 'vx-fresh-btn';

    const inner = document.createElement('div');
    inner.className = 'vx-fresh-inner';

    const left = document.createElement('div');
    left.className = 'vx-fresh-left';
    const icon = document.createElement('span');
    icon.className = 'vx-fresh-icon';
    icon.textContent = '⚡';
    left.appendChild(icon);
    const textWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'vx-fresh-title';
    title.textContent = 'Too many inaccuracies detected!';
    textWrap.appendChild(title);
    const sub = document.createElement('div');
    sub.className = 'vx-fresh-sub';
    sub.textContent = topIssue || 'This conversation may have drifted into inaccurate territory.';
    textWrap.appendChild(sub);
    left.appendChild(textWrap);
    inner.appendChild(left);

    const cta = document.createElement('button');
    cta.className = 'vx-fresh-cta';
    cta.textContent = 'Fresh Start →';
    cta.addEventListener('click', () => triggerFreshStart(btn));
    inner.appendChild(cta);

    btn.appendChild(inner);
    msgEl.after(btn);
  }

  async function triggerFreshStart(triggerEl) {
    const btn = triggerEl.querySelector('.vx-fresh-cta');
    if (btn) { btn.textContent = 'Summarizing…'; btn.disabled = true; }

    const history = buildFullHistory();
    const result = await chrome.runtime.sendMessage({ action: 'generateFreshStart', history });

    showFreshStartPanel(result.summary || 'Could not generate summary. Please try again.');
  }

  function showFreshStartPanel(summary) {
    state.freshStartPanel?.remove();

    const panel = document.createElement('div');
    panel.className = 'vx-fs-panel';

    const header = document.createElement('div');
    header.className = 'vx-fs-header';
    const headerText = document.createElement('span');
    headerText.textContent = '⚡ Fresh Start Prompt';
    header.appendChild(headerText);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'vx-fs-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => panel.remove());
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const desc = document.createElement('p');
    desc.className = 'vx-fs-desc';
    desc.textContent = 'We have summarized your conversation, removing inaccurate content. Copy and paste into a new chat:';
    panel.appendChild(desc);

    const textarea = document.createElement('textarea');
    textarea.className = 'vx-fs-text';
    textarea.readOnly = true;
    textarea.value = summary; // .value is safe from XSS
    panel.appendChild(textarea);

    const actions = document.createElement('div');
    actions.className = 'vx-fs-actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'vx-fs-copy';
    copyBtn.textContent = '📋 Copy to Clipboard';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(summary);
      copyBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyBtn.textContent = '📋 Copy to Clipboard'; }, 2000);
    });
    actions.appendChild(copyBtn);

    const newBtn = document.createElement('button');
    newBtn.className = 'vx-fs-new';
    newBtn.textContent = '🔗 Open New Chat';
    const urls = {
      chatgpt: 'https://chatgpt.com/',
      claude: 'https://claude.ai/new',
      gemini: 'https://gemini.google.com/',
      deepseek: 'https://chat.deepseek.com/',
      perplexity: 'https://www.perplexity.ai/',
    };
    newBtn.addEventListener('click', () => {
      window.open(urls[state.platform] || 'https://chatgpt.com/', '_blank');
    });
    actions.appendChild(newBtn);
    panel.appendChild(actions);

    document.body.appendChild(panel);
    state.freshStartPanel = panel;
  }

  // ══════════════════════════════════════════════════════
  //  ANALYSIS QUEUE (replaces blocking isAnalyzing flag)
  // ══════════════════════════════════════════════════════
  function enqueueAnalysis(msgEl) {
    if (!state.settings.isEnabled || !state.settings.autoAnalyze) return;

    const msgId = getMessageId(msgEl);
    if (state.analyzedIds.has(msgId)) return;
    state.analyzedIds.add(msgId);

    const text = extractText(msgEl);
    if (!text || text.length < 40) return;

    state.analysisQueue.push({ msgEl, text, msgId });
    processQueue();
  }

  async function processQueue() {
    if (state.isProcessingQueue) return;
    if (state.analysisQueue.length === 0) return;

    state.isProcessingQueue = true;
    const { msgEl, text } = state.analysisQueue.shift();

    const spinner = showAnalyzingSpinner(msgEl);

    state.conversationLog.push({ role: 'assistant', text: text.slice(0, 1000) });

    try {
      const result = await chrome.runtime.sendMessage({
        action: 'analyzeText',
        text: text.slice(0, 5000),
        context: buildContext(),
        domainMode: state.settings.domainMode,
        sensitivity: state.settings.sensitivity,
      });

      spinner.remove();

      if (result.error) {
        if (result.error === 'NO_API_KEY') showApiKeyWarning(msgEl);
        else if (result.error === 'DISABLED') { /* extension disabled */ }
        else console.warn('[Veridex] Analysis error:', result.error, result.message);
      } else {
        if (state.settings.showBadge) injectTrustBadge(msgEl, result);

        const contentEl = msgEl.querySelector(sel.msgContent) || msgEl;
        (result.claims || []).forEach(claim => highlightClaimInElement(contentEl, claim));

        const newH = (result.claims || []).filter(c => c.verdict === 'hallucination').length;
        state.hallucinationTotal += newH;

        if (result.shouldSuggestFreshStart || state.hallucinationTotal >= 3) {
          showFreshStartButton(msgEl, result.topIssue);
        }

        chrome.runtime.sendMessage({ action: 'analysisComplete', result }).catch(() => {});
      }
    } catch (err) {
      spinner.remove();
      console.warn('[Veridex] Analysis error:', err);
    } finally {
      state.isProcessingQueue = false;
      if (state.analysisQueue.length > 0) {
        setTimeout(processQueue, 500);
      }
    }
  }

  function showApiKeyWarning(msgEl) {
    if (document.querySelector('.vx-apikey-warn')) return;
    const warn = document.createElement('div');
    warn.className = 'vx-apikey-warn';

    const strong = document.createElement('strong');
    strong.textContent = 'Veridex: ';
    warn.appendChild(document.createTextNode('🔑 '));
    warn.appendChild(strong);
    warn.appendChild(document.createTextNode('Backend unavailable & no Groq API key set. '));
    const link = document.createElement('a');
    link.href = chrome.runtime.getURL('src/options/options.html');
    link.target = '_blank';
    link.textContent = 'Configure connection →';
    warn.appendChild(link);
    msgEl.after(warn);
  }

  // ── Streaming Detection ────────────────────────────────
  function isStreamingComplete(el) {
    if (state.platform === 'chatgpt') {
      return !el.querySelector('.result-streaming, [data-is-streaming="true"]');
    }
    if (state.platform === 'claude') {
      const streamEl = el.closest('[data-is-streaming]');
      return !streamEl || streamEl.dataset.isStreaming === 'false';
    }
    if (state.platform === 'deepseek') {
      return !el.querySelector('.loading, .typing-indicator');
    }
    return true;
  }

  // ── DOM Observer ───────────────────────────────────────
  function startObserving() {
    const root = document.querySelector(sel.root) || document.body;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          const aiMsgs = node.matches?.(sel.aiMsg)
            ? [node]
            : [...node.querySelectorAll(sel.aiMsg)];

          aiMsgs.forEach(msgEl => {
            if (isStreamingComplete(msgEl)) {
              setTimeout(() => enqueueAnalysis(msgEl), 1200);
            }
          });
        });

        if (mutation.type === 'attributes' &&
          mutation.attributeName === 'data-is-streaming' &&
          mutation.target.dataset.isStreaming === 'false') {
          const aiMsg = mutation.target.querySelector(sel.aiMsg) || mutation.target;
          if (aiMsg) setTimeout(() => enqueueAnalysis(aiMsg), 1200);
        }
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-is-streaming', 'data-message-author-role'],
    });

    // Track user messages
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
        conversationLength: state.conversationLog.length,
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
    if (request.action === 'manualAudit') {
      // Re-scan all visible AI messages
      const aiMsgs = document.querySelectorAll(sel.aiMsg);
      aiMsgs.forEach(msgEl => {
        const msgId = getMessageId(msgEl);
        if (!state.analyzedIds.has(msgId)) {
          enqueueAnalysis(msgEl);
        }
      });
    }
  });

  // ── Boot ───────────────────────────────────────────────
  (async function init() {
    await loadSettings();
    if (state.platform === 'unknown') return;
    startObserving();
    console.log(`[Veridex] Active on ${state.platform}`);
  })();

})();
