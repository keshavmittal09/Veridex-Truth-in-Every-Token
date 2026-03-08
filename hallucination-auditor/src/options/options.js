// options.js — external script for CSP compliance
chrome.storage.sync.get(['groqApiKey', 'domainMode', 'sensitivity'], r => {
  if (r.groqApiKey) {
    document.getElementById('apiKey').value = r.groqApiKey;
    const s = document.getElementById('keyStatus');
    s.textContent = '✅ Groq API key already saved';
    s.className = 'status ok';
  }
  if (r.domainMode) document.getElementById('domainMode').value = r.domainMode;
  if (r.sensitivity) document.getElementById('sensitivity').value = r.sensitivity;
});

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

document.getElementById('saveAllBtn').addEventListener('click', () => {
  const key = document.getElementById('apiKey').value.trim();
  const status = document.getElementById('allStatus');
  const settings = {
    domainMode: document.getElementById('domainMode').value,
    sensitivity: document.getElementById('sensitivity').value,
    isEnabled: true,
    autoAnalyze: true,
    showBadge: true
  };
  if (key) settings.groqApiKey = key;
  chrome.storage.sync.set(settings, () => {
    status.textContent = '🎉 All set! Go to ChatGPT or Claude.ai to start auditing.';
    status.className = 'status ok';
  });
});
