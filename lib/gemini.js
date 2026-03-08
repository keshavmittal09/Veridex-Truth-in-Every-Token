import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI = null;
let model = null;

function getModel() {
  if (!model) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }
  return model;
}

async function callWithRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.message?.includes('429') && i < retries - 1) {
        const delay = Math.pow(2, i) * 2000;
        console.log(`Rate limited, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

export async function decomposeClaims(text) {
  const m = getModel();

  const prompt = `You are an expert fact-checking analyst. Given the following text, decompose it into individual atomic claims. For each claim, provide:

1. "claim": The exact claim text extracted from the source
2. "type": One of: STATISTICAL_FACT, VERIFIABLE_FACT, HISTORICAL_FACT, REASONING, PREDICTION, OPINION, DEFINITION
3. "checkable": true if this claim can be verified against external data sources, false otherwise
4. "searchQueries": An array of 2-3 specific search queries that would help verify this claim against encyclopedias and databases
5. "sentenceIndex": Which sentence (0-indexed) in the original text this claim appears in

Rules:
- Extract EVERY factual claim, no matter how small
- Even implied claims should be extracted
- Separate compound claims into individual atomic claims
- Be exhaustive and precise
- Return ONLY a valid JSON array, no other text

Text to analyze:
"""
${text}
"""`;

  return callWithRetry(async () => {
    const result = await m.generateContent(prompt);
    const response = result.response.text();

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse claims from LLM response');
    }

    const claims = JSON.parse(jsonMatch[0]);
    return claims.map((claim, index) => ({
      id: index,
      ...claim,
    }));
  });
}

export async function analyzeClaimAgainstSource(claim, sourceText, sourceName) {
  const m = getModel();

  const prompt = `You are a fact-checking analyst. Compare this claim against the provided source text and determine if the source SUPPORTS, CONTRADICTS, or is IRRELEVANT to the claim.

Claim: "${claim}"

Source (${sourceName}):
"""
${sourceText.slice(0, 3000)}
"""

Respond with ONLY a JSON object (no other text):
{
  "verdict": "SUPPORTS" | "CONTRADICTS" | "INSUFFICIENT",
  "confidence": 0.0 to 1.0,
  "evidence": "Brief quote or explanation from the source that supports your verdict",
  "explanation": "One sentence explaining your reasoning"
}`;

  return callWithRetry(async () => {
    const result = await m.generateContent(prompt);
    const response = result.response.text();

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { verdict: 'INSUFFICIENT', confidence: 0, evidence: '', explanation: 'Could not analyze' };
    }

    return JSON.parse(jsonMatch[0]);
  });
}
