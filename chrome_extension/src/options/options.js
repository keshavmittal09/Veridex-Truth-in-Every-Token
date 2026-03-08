// options.js — Veridex setup page
chrome.storage.sync.get(['groqApiKey', 'domainMode', 'sensitivity', 'backendUrl', 'useBackend'], r => {
  if (r.groqApiKey) {
    document.getElementById('apiKey').value = r.groqApiKey;
    const s = document.getElementById('keyStatus');
    s.textContent = '✅ Groq API key already saved';
    s.className = 'status ok';
  }
  if (r.backendUrl) document.getElementById('backendUrl').value = r.backendUrl;
  if (r.domainMode) document.getElementById('domainMode').value = r.domainMode;
  if (r.sensitivity) document.getElementById('sensitivity').value = r.sensitivity;
});

// Test backend
document.getElementById('testBtn').addEventListener('click', async () => {
  const url = document.getElementById('backendUrl').value.trim();
  const status = document.getElementById('backendStatus');
  if (!url) { status.textContent = '⚠ Enter a URL'; status.className = 'status err'; return; }
  status.textContent = '⏳ Testing connection…';
  status.className = 'status';
  try {
    const resp = await fetch(url.replace(/\/+$/, '') + '/api/health', { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      status.textContent = '✅ Backend is running!';
      status.className = 'status ok';
    } else {
      status.textContent = '⚠ Backend responded with an error';
      status.className = 'status err';
    }
  } catch {
    status.textContent = '⚠ Could not reach backend. Make sure it is running.';
    status.className = 'status err';
  }
});

// Save API key
document.getElementById('saveBtn').addEventListener('click', () => {
  const key = document.getElementById('apiKey').value.trim();
  const status = document.getElementById('keyStatus');
  if (!key.startsWith('gsk_')) {
    status.textContent = '⚠ Invalid key. Groq API keys start with gsk_';
    status.className = 'status err';
    return;
  }
  chrome.storage.sync.set({ groqApiKey: key }, () => {
    status.textContent = '✅ Groq API key saved!';
    status.className = 'status ok';
  });
});

// Save all
document.getElementById('saveAllBtn').addEventListener('click', () => {
  const key = document.getElementById('apiKey').value.trim();
  const status = document.getElementById('allStatus');
  const settings = {
    backendUrl: document.getElementById('backendUrl').value.trim() || 'https://veridex-backend-4dxt.onrender.com',
    useBackend: true,
    domainMode: document.getElementById('domainMode').value,
    sensitivity: document.getElementById('sensitivity').value,
    isEnabled: true,
    autoAnalyze: true,
    showBadge: true,
  };
  if (key) settings.groqApiKey = key;
  chrome.storage.sync.set(settings, () => {
    status.textContent = '🎉 All set! Open an AI chat to start verifying.';
    status.className = 'status ok';
  });
});
