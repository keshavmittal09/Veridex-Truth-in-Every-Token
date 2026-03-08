# Veridex — Truth in Every Token. 🛡️

**Veridex** is a real-time AI hallucination verification engine. It acts as a trust layer between Large Language Models (LLMs) and end-users, automatically validating AI-generated claims against multiple trusted sources to ensure accuracy, safety, and compliance.

## ✨ Features

- **Real-Time Fact-Checking Extension**: A Chrome extension that transparently monitors LLM outputs (like ChatGPT) and instantly cross-references claims.
- **Multi-Source Triangulation**: Verifies facts against established APIs including Wikipedia, Wikidata, DuckDuckGo Web Search, and Google Fact Check API.
- **Smart Claim Decomposition**: Breaks down AI-generated paragraphs into atomic claims, distinguishing between objective facts, historical data, and subjective opinions.
- **Provider Agnostic**: Flexibility to run the underlying verification engine using either **Google Gemini** or **Groq** APIs—tunable right from the extension popup.
- **Hallucination Heatmap Visuals**: Intuitive UI highlighting verified truths in green and flagged hallucinations in red.

## 🏗️ Architecture

Veridex is built on a modern, high-performance stack:

- **Frontend / Dashboard**: Next.js 14+ (App Router)
- **Backend Verification Engine**: Python FastAPI
- **Real-Time Extension**: Vanilla JS injecting directly into ChatGPT's DOM to intercept and parse text streams.
- **Verification LLMs**: Google Gemini / Groq API

## 🚀 Getting Started

### Prerequisites

- Python 3.9+
- Node.js & npm
- Chrome or Chromium-based browser
- API Keys for Gemini, Groq (and optionally Serper)

### 1. Setup the Backend Engine

Navigate to the `backend/` directory and set up your Python environment:

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory:
```env
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
# Optional:
SERPER_API_KEY=your_serper_key
```

Run the FastAPI server:
```bash
python main.py
```
*The API will be available at `http://localhost:8000`.*

### 2. Install the Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** on (top right corner).
3. Click **Load unpacked** and select the `chrome extention` directory from this repository.
4. Pin the **Veridex** extension to your toolbar.
5. Click the Veridex icon to select your preferred Verification API (Groq or Gemini).

### 3. Setup the Web Dashboard (Optional)

In the root directory, install and run the Next.js application:

```bash
npm install
npm run dev
```

## 🧠 How it Works

1. **Intercept**: The Chrome extension monitors incoming Server-Sent Events (SSE) from platforms like ChatGPT.
2. **Decompose**: Text is sent to the FastAPI backend where an LLM decomposes the response into separate, testable claims.
3. **Triangulate**: Each claim is concurrently checked against external Knowledge Bases.
4. **Score & Correct**: Claims are scored based on source consensus and a Trust Score is generated.
5. **Display**: The extension injects an unobtrusive UI overlay showing the Trust Score and itemized factual breakdowns.

## 🛡️ Why Veridex?

As AI becomes deeply integrated into enterprise operations, legal filings, and medical advice, LLM hallucinations are no longer just an annoyance—they are a liability. Veridex provides the essential validation layer required for safe AI deployment.
