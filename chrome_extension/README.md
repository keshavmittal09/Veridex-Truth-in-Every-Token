# ⚡ Veridex — Chrome Extension

Real-time AI fact verification for ChatGPT, Claude, Gemini, DeepSeek, and Perplexity.

Veridex verifies AI responses against **8+ trusted sources** using the same backend as the Veridex web app, delivering consistent trust scores and claim-level verdicts.

---

## 🚀 Installation (Load Unpacked)

1. Open Chrome → go to `chrome://extensions/`
2. Enable **Developer Mode** (top-right toggle)
3. Click **"Load unpacked"**
4. Select this `chrome_extension/` folder
5. The extension icon (⚡) appears in your toolbar

---

## 🔑 Setup

### Option A: Backend Mode (Recommended)

1. Start the Veridex backend: `cd backend && python main.py`
2. Open the extension popup → **Settings** → verify backend URL is `https://veridex-backend-4dxt.onrender.com`
3. The backend status indicator will show a green dot when connected

### Option B: Standalone / Fallback Mode

1. Get a free Groq API key at [console.groq.com/keys](https://console.groq.com/keys)
2. Click the ⚡ extension icon → **Settings** → paste your `gsk_…` key
3. This mode uses LLM-only analysis (less accurate than backend mode)

---

## 🎯 What It Does

| Feature | Description |
|---|---|
| 🔴 Red highlight | **Hallucination** — claim is factually incorrect |
| 🟡 Yellow highlight | **Uncertain** — claim is suspicious or unverifiable |
| 🟢 Trust badge | Overall trust score for each AI response |
| 📖 Correction tooltip | Hover any highlight → see correction + source evidence |
| 📚 Source indicator | Shows how many trusted sources were used for verification |
| ⚡ Fresh Start | When AI goes off the rails → generates a clean re-prompt |
| 📊 Stats | Session-level accuracy tracking per domain |
| 🔎 Manual Audit | Manually trigger analysis of the current page |

---

## 🧠 How It Works

### Backend Mode (Full Verification)
```
AI Response
    ↓
MutationObserver detects new message
    ↓
Text sent to Veridex backend (/msg/ endpoint)
    ↓
Backend verifies against 8+ trusted sources:
  Wikipedia, Wikidata, Google Fact Check, PubMed,
  CourtListener, SEC EDGAR, Academic DBs, GNews
    ↓
Triangulation scoring (same as web app)
    ↓
Highlights, trust badge, tooltips injected into page
```

### Fallback Mode (Groq LLM Only)
```
AI Response → Groq API → LLM-based analysis → Highlights
```

---

## 🔧 Supported Platforms

- ✅ ChatGPT (chatgpt.com)
- ✅ Claude (claude.ai)
- ✅ Gemini (gemini.google.com)
- ✅ DeepSeek (chat.deepseek.com)
- ✅ Perplexity (perplexity.ai)

---

## 📁 File Structure

```
chrome_extension/
├── manifest.json                    # Chrome Extension Manifest V3
├── README.md
├── src/
│   ├── background/
│   │   └── service-worker.js        # API routing (backend or Groq fallback)
│   ├── content/
│   │   ├── content-script.js        # DOM injection, highlights, tooltips
│   │   └── injected.css             # All in-page styles
│   ├── popup/
│   │   ├── popup.html               # Extension popup UI
│   │   ├── popup.js                 # Popup logic + backend health check
│   │   └── popup.css                # Popup styles
│   └── options/
│       ├── options.html             # First-run setup page
│       └── options.js               # Options save logic
└── assets/
    └── icon*.png                    # Extension icons
```

---

## ⚙️ Configuration

| Setting | Options | Default |
|---|---|---|
| Use Backend | On/Off | On |
| Backend URL | Any URL | https://veridex-backend-4dxt.onrender.com |
| Groq API Key | gsk_… | (none) |
| Domain Mode | General / Medical / Legal / Financial / Historical / Scientific | General |
| Sensitivity | Low / Medium / High | Medium |
| Auto-Analyze | On/Off | On |
| Trust Badge | Show/Hide | Show |

---

## 📚 Trusted Sources (Backend Mode)

| Source | Type | Covers |
|---|---|---|
| Wikipedia | Encyclopedia | General knowledge |
| Wikidata | Structured data | Facts, dates, numbers |
| Google Fact Check | Misinformation DB | Debunked claims |
| PubMed / NCBI | Medical literature | Health & medical |
| CourtListener | Legal database | Law & court cases |
| SEC EDGAR | Financial filings | Markets & companies |
| CrossRef + Semantic Scholar | Academic | Research papers |
| GNews | Verified news | Current events |

---

## 🏆 Demo

1. Start the backend: `cd backend && python main.py`
2. Open ChatGPT, ask about a complex topic (history, medicine, etc.)
3. Watch the **⚡ Veridex verifying...** spinner appear
4. See claims light up **red/yellow** with underlines
5. Hover a red claim → tooltip shows correction + source evidence
6. Check the trust badge for the overall score and source count
7. Click **Fresh Start** → get a clean re-prompt with inaccuracies removed
8. Open popup → show the **trust score ring** and claim breakdown
9. Switch to **Stats tab** → show session-level tracking
