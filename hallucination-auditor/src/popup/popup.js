// ═══════════════════════════════════════════════════════
//  HALLUCINATION AUDITOR — Popup Script
// ═══════════════════════════════════════════════════════
'use strict';

// ── Tab Switching ──────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab, .tab-content').forEach(el => el.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ── State ──────────────────────────────────────────────
let lastResult = null;

// ── Helpers ────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function setScore(score) {
  const num = $('scoreNum');
  const ring = $('ringFill');
  const circumference = 213.6;

  num.textContent = score === null ? '—' : `${score}%`;

  if (score === null) {
    ring.style.strokeDashoffset = circumference;
    ring.style.stroke = '#333350';
    return;
  }

  const offset = circumference * (1 - score / 100);
  ring.style.strokeDashoffset = offset;

  if (score >= 80) ring.style.stroke = '#00c47d';
  else if (score >= 55) ring.style.stroke = '#ffc107';
  else ring.style.stroke = '#ff3d5a';
}

function renderClaims(claims) {
  const list = $('claimsList');
  if (!claims || claims.length === 0) return;

  list.innerHTML = '';

  // Show non-verified first
  const sorted = [...claims].sort((a, b) => {
    const order = { hallucination: 0, uncertain: 1, verified: 2 };
    return (order[a.verdict] ?? 3) - (order[b.verdict] ?? 3);
  });

  sorted.forEach(claim => {
    if (claim.verdict === 'verified') return; // skip verified to save space

    const item = document.createElement('div');
    item.className = `claim-item ${claim.verdict}`;

    const icons = { hallucination: '🔴', uncertain: '🟡', verified: '🟢' };
    const labels = { hallucination: 'Hallucination', uncertain: 'Uncertain', verified: 'Verified' };

    item.innerHTML = `
      <div class="claim-text">${claim.text}</div>
      <div class="claim-meta">
        <span class="claim-verdict">${icons[claim.verdict]} ${labels[claim.verdict]}</span>
        <span class="claim-reason">${claim.reason || ''}</span>
      </div>
      ${claim.correction ? `<div class="claim-correction">✅ ${claim.correction}</div>` : ''}
    `;

    list.appendChild(item);
  });

  if (list.children.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <div class="empty-text">All claims verified! No hallucinations detected.</div>
      </div>`;
  }
}

function updateChips(claims) {
  const counts = { v: 0, u: 0, h: 0 };
  (claims || []).forEach(c => {
    if (c.verdict === 'verified') counts.v++;
    else if (c.verdict === 'uncertain') counts.u++;
    else if (c.verdict === 'hallucination') counts.h++;
  });
  $('chipV').textContent = `✓ ${counts.v}`;
  $('chipU').textContent = `? ${counts.u}`;
  $('chipH').textContent = `✗ ${counts.h}`;
}

// ── Load Latest Analysis from Active Tab ───────────────
async function loadCurrentTabData() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const host = new URL(tab.url).hostname;
    const platformMap = {
      'chatgpt.com': '🤖 ChatGPT',
      'chat.openai.com': '🤖 ChatGPT',
      'claude.ai': '✳️ Claude.ai',
      'gemini.google.com': '♊ Gemini'
    };

    const platformName = Object.entries(platformMap).find(([k]) => host.includes(k))?.[1];
    $('platformTag').textContent = platformName || '⚠ Not an AI platform';

    if (!platformName) {
      $('statusDot').style.background = '#666680';
      $('statusDot').style.boxShadow = 'none';
      $('statusDot').style.animation = 'none';
    }

    // Ask content script for conversation stats
    try {
      const stats = await chrome.tabs.sendMessage(tab.id, { action: 'getConversationStats' });
      if (stats) {
        $('scoreTitle').textContent = `${stats.messagesAnalyzed} response(s) audited`;
        if (stats.hallucinationTotal > 0) {
          $('freshStartBtn').style.display = 'block';
        }
      }
    } catch {
      // Content script not yet injected (e.g. page loading)
    }

  } catch (err) {
    console.warn('Tab query error:', err);
  }
}

// ── Load Session Stats ─────────────────────────────────
async function loadSessionStats() {
  const stats = await chrome.runtime.sendMessage({ action: 'getSessionStats' });
  $('statAnalyzed').textContent = stats.totalAnalyzed || 0;
  $('statHallucinations').textContent = stats.hallucinations || 0;
  $('statUncertain').textContent = stats.uncertain || 0;
  $('statVerified').textContent = stats.verified || 0;

  const total = (stats.verified || 0) + (stats.uncertain || 0) + (stats.hallucinations || 0);
  if (total > 0) {
    $('accV').style.width = `${(stats.verified / total) * 100}%`;
    $('accU').style.width = `${(stats.uncertain / total) * 100}%`;
    $('accH').style.width = `${(stats.hallucinations / total) * 100}%`;
  }
}

// ── Load Settings into Form ────────────────────────────
async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(
      ['groqApiKey', 'domainMode', 'sensitivity', 'isEnabled', 'autoAnalyze', 'showBadge'],
      r => {
        if (r.groqApiKey) {
          $('apiKeyInput').value = r.groqApiKey;
          $('apiStatus').textContent = '✅ Groq API key saved';
        }
        $('domainMode').value = r.domainMode || 'general';
        $('sensitivity').value = r.sensitivity || 'medium';
        $('isEnabled').checked = r.isEnabled !== false;
        $('autoAnalyze').checked = r.autoAnalyze !== false;
        $('showBadge').checked = r.showBadge !== false;
        resolve();
      }
    );
  });
}

// ── Save API Key ───────────────────────────────────────
$('saveKeyBtn').addEventListener('click', () => {
  const key = $('apiKeyInput').value.trim();
  if (!key) {
    $('apiStatus').textContent = '⚠ Enter your Groq API key first';
    $('apiStatus').className = 'api-status error';
    return;
  }
  if (!key.startsWith('gsk_')) {
    $('apiStatus').textContent = '⚠ Groq keys start with gsk_';
    $('apiStatus').className = 'api-status error';
    return;
  }
  chrome.storage.sync.set({ groqApiKey: key }, () => {
    $('apiStatus').textContent = '✅ Groq API key saved!';
    $('apiStatus').className = 'api-status';
    notifyContentScripts({ action: 'settingsUpdated' });
  });
});

// ── Save All Settings ──────────────────────────────────
$('saveAllBtn').addEventListener('click', () => {
  chrome.storage.sync.set({
    domainMode: $('domainMode').value,
    sensitivity: $('sensitivity').value,
    isEnabled: $('isEnabled').checked,
    autoAnalyze: $('autoAnalyze').checked,
    showBadge: $('showBadge').checked
  }, () => {
    $('saveStatus').textContent = '✅ Settings saved!';
    setTimeout(() => { $('saveStatus').textContent = ''; }, 2000);
    notifyContentScripts({ action: 'settingsUpdated' });
  });
});

// ── Reset Stats ────────────────────────────────────────
$('resetBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'resetStats' });
  $('statAnalyzed').textContent = '0';
  $('statHallucinations').textContent = '0';
  $('statUncertain').textContent = '0';
  $('statVerified').textContent = '0';
  ['accV', 'accU', 'accH'].forEach(id => $(id).style.width = '0%');
});

// ── Fresh Start Button ─────────────────────────────────
$('freshStartBtn').addEventListener('click', async () => {
  const btn = $('freshStartBtn');
  btn.textContent = '⏳ Generating summary…';
  btn.disabled = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.sendMessage(tab.id, { action: 'triggerFreshStart' });

  btn.textContent = '⚡ Generate Fresh Start Prompt';
  btn.disabled = false;
});

// ── Listen for analysis updates from content script ───
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'analysisComplete' && request.result) {
    lastResult = request.result;
    const { trustScore, claims, overallVerdict, shouldSuggestFreshStart } = request.result;
    setScore(trustScore ?? 100);
    $('scoreVerdict').textContent = overallVerdict || '';
    $('scoreTitle').textContent = `${(claims || []).length} claims analyzed`;
    updateChips(claims);
    renderClaims(claims);
    if (shouldSuggestFreshStart) $('freshStartBtn').style.display = 'block';
    loadSessionStats();
  }
});

// ── Notify content scripts of setting changes ──────────
async function notifyContentScripts(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
}

// ── Init ───────────────────────────────────────────────
(async () => {
  await loadSettings();
  await loadCurrentTabData();
  await loadSessionStats();
})();
