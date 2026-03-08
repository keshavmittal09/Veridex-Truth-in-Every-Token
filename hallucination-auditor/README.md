# ⚡ Hallucination Auditor — Chrome Extension

Real-time AI hallucination & lie detector for ChatGPT, Claude.ai, and Gemini.

---

## 🚀 Installation (Load Unpacked)

1. Open Chrome → go to `chrome://extensions/`
2. Enable **Developer Mode** (top-right toggle)
3. Click **"Load unpacked"**
4. Select this `hallucination-auditor/` folder
5. The extension icon (⚡) appears in your toolbar

---

## 🔑 Setup (Required)

1. Click the ⚡ extension icon → go to **Settings** tab
2. Get a free API key at [console.anthropic.com/keys](https://console.anthropic.com/keys)
3. Paste your `sk-ant-…` key and click **Save**
4. Open ChatGPT, Claude.ai, or Gemini — auditing starts automatically!

---

## 🎯 What It Does

| Feature | Description |
|---|---|
| 🔴 Red highlight | **Hallucination** — claim is demonstrably false |
| 🟡 Yellow highlight | **Uncertain** — claim is suspicious or unverifiable |
| 🟢 Trust badge | Overall trust score for each AI response |
| 📖 Correction tooltip | Hover any highlight → see correction + Wikipedia evidence |
| ⚡ Fresh Start | When AI goes off the rails → generates a clean re-prompt |
| 📊 Stats | Session-level accuracy tracking per domain |

---

## 🧠 How It Works

```
AI Response
    ↓
MutationObserver detects new message
    ↓
Text sent to Claude API (claim extraction + verdict)
    ↓
Wikipedia API cross-verification for flagged claims
    ↓
Highlights injected into ChatGPT/Claude.ai DOM
    ↓
Trust badge + tooltip + Fresh Start (if needed)
```

---

## 🔧 Supported Platforms

- ✅ ChatGPT (chatgpt.com)
- ✅ Claude.ai
- ✅ Gemini (gemini.google.com)

---

## 📁 File Structure

```
hallucination-auditor/
├── manifest.json                    # Chrome Extension Manifest V3
├── src/
│   ├── background/
│   │   └── service-worker.js        # API calls, analysis engine
│   ├── content/
│   │   ├── content-script.js        # DOM injection, highlights
│   │   └── injected.css             # All in-page styles
│   ├── popup/
│   │   ├── popup.html               # Extension popup UI
│   │   ├── popup.js                 # Popup logic
│   │   └── popup.css                # Popup styles
│   └── options/
│       └── options.html             # First-run setup page
└── assets/
    └── icon*.png                    # Extension icons
```

---

## ⚙️ Configuration

| Setting | Options | Default |
|---|---|---|
| Domain Mode | General / Medical / Legal / Financial / Historical / Scientific | General |
| Sensitivity | Low / Medium / High | Medium |
| Auto-Analyze | On/Off | On |
| Trust Badge | Show/Hide | Show |

---

## 🏆 Hackathon Demo Script

1. Open ChatGPT, ask about a complex topic (history, medicine, etc.)
2. Watch the **⚡ analyzing...** spinner appear
3. See claims light up **red/yellow** with underlines
4. Hover a red claim → tooltip shows correction + Wikipedia source
5. Click **Fresh Start** → get a clean re-prompt with hallucinations removed
6. Open popup → show the **trust score ring** and claim breakdown
7. Switch to **Stats tab** → show session-level hallucination tracking

---

*Built for the Hallucination Auditor Hackathon Track*
