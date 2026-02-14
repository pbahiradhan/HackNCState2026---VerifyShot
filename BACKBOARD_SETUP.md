# Backboard.io Agentic Setup Guide

## ✅ What's Already Configured

All Backboard.io assistants are **automatically created** when first used. No manual dashboard setup needed!

### Agents Created Automatically:

1. **VerifyShot-OCR** — Extracts text from screenshots/images
   - Uses vision capabilities to read text from images
   - Returns clean extracted text

2. **VerifyShot-ClaimExtractor** — Identifies factual claims
   - Extracts 1-3 verifiable claims from OCR text
   - Returns JSON array of claim strings

3. **VerifyShot-Searcher** — Finds reliable sources
   - Uses `web_search` tool to find recent, reputable sources
   - Returns sources with credibility scores

4. **VerifyShot-Analyzer** — Fact-checking verdict
   - Analyzes claims against sources
   - Returns: `verdict` (likely_true/mixed/likely_misleading), `confidence`, `explanation`

5. **VerifyShot-Consensus-GPT-4** — Multi-model consensus (simulated)
   - Analyzes from GPT-4 perspective
   - Returns agreement + confidence

6. **VerifyShot-Consensus-Claude 3** — Multi-model consensus
   - Analyzes from Claude 3 perspective
   - Returns agreement + confidence

7. **VerifyShot-Consensus-Gemini** — Multi-model consensus
   - Analyzes from Gemini perspective
   - Returns agreement + confidence

8. **VerifyShot-Summarizer** — Generates summaries
   - Creates 2-3 sentence summaries of fact-check results
   - Includes trust scores and verdicts

9. **VerifyShot-Chat** — Standard chat mode
   - Regular fact-checking Q&A
   - Uses `web_search` tool when needed
   - Persistent memory enabled

10. **VerifyShot-DeepResearch** — Deep research mode
    - Thorough multi-perspective analysis
    - Structured output (Key Findings, Source Analysis, Perspectives, Bias, Confidence, Recommendations)
    - Uses `web_search` tool extensively

11. **VerifyShot-Bias-Progressive** — Bias detection (left perspective)
12. **VerifyShot-Bias-Conservative** — Bias detection (right perspective)
13. **VerifyShot-Bias-International** — Bias detection (neutral perspective)

## 🔑 Required Environment Variables

Set these in **Vercel Dashboard → Settings → Environment Variables**:

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKBOARD_API_KEY` | ✅ **Required** | Get from [backboard.io dashboard](https://app.backboard.io) → API Keys |
| `BLOB_READ_WRITE_TOKEN` | ✅ **Required** | Vercel Dashboard → Storage → Blob → Create Token |
| `GOOGLE_SEARCH_API_KEY` | ⚠️ Optional | For web search sources. Get from [Google Cloud Console](https://console.cloud.google.com) → Custom Search JSON API |
| `GOOGLE_SEARCH_ENGINE_ID` | ⚠️ Optional | Get from [Programmable Search Engine](https://programmablesearchengine.google.com) |

> **Note:** Without Google Search keys, the app still works but won't include real web source links. Backboard.io agents will still provide analysis based on their training data.

## 🚀 How It Works

### 1. Screenshot Analysis Flow

```
User uploads screenshot
  ↓
Backend uploads to Vercel Blob → gets imageUrl
  ↓
VerifyShot-OCR agent extracts text
  ↓
VerifyShot-ClaimExtractor identifies claims
  ↓
For each claim:
  ├─ VerifyShot-Searcher finds sources (via web_search tool)
  ├─ VerifyShot-Analyzer determines verdict
  ├─ VerifyShot-Consensus-* (3 agents) check agreement
  └─ Bias detection (3 perspective agents)
  ↓
Calculate trust score (local algorithm)
  ↓
VerifyShot-Summarizer generates summary
  ↓
Return AnalysisResult JSON
```

### 2. Chat Flow

**Standard Mode:**
```
User sends message
  ↓
VerifyShot-Chat agent (with web_search tool)
  ↓
If needs sources → calls web_search tool
  ↓
Returns answer with source references
```

**Deep Research Mode:**
```
User sends message
  ↓
VerifyShot-DeepResearch agent (with web_search tool)
  ↓
Calls web_search tool multiple times for thorough research
  ↓
Returns structured analysis:
  - Key Findings
  - Source Analysis
  - Multiple Perspectives
  - Bias Assessment
  - Confidence Level
  - Recommendations
```

## 🛠️ Agent Features

All agents use:
- ✅ **Persistent Memory** (`memory: "Auto"`) — Remembers context across messages
- ✅ **Tool Calls** — Web search tool for finding sources
- ✅ **Structured Prompts** — Clear instructions for each task
- ✅ **Error Handling** — Fallbacks if JSON parsing fails

## 📊 Trust Score Calculation

Trust scores are calculated **locally** (not by Backboard.io) using:

```
Trust Score = 
  45% × Source Quality (avg credibility of sources)
+ 30% × Model Consensus (LLM confidence)
+ 10% × Recency (how recent are sources)
+ 10% × Agreement (fraction of high-quality sources)
- 5% × Bias Penalty
```

## 🔍 Testing

1. **Test OCR:** Upload a screenshot with text → should extract all visible text
2. **Test Claims:** Should identify 1-3 factual claims
3. **Test Sources:** Should find 5 sources (if Google Search keys are set)
4. **Test Chat:** Type a question → should get answer with sources
5. **Test Deep Research:** Enable Deep Research mode → should get structured analysis

## ⚠️ Troubleshooting

**"BACKBOARD_API_KEY not set"**
- Set the environment variable in Vercel Dashboard

**"OCR failed: No text extracted"**
- Image may not contain readable text
- Try a screenshot with clear text

**"No sources found"**
- Check if `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID` are set
- Without these, agents still work but won't include web sources

**"Chat error: Server error 500"**
- Check Vercel function logs
- Ensure `BACKBOARD_API_KEY` is valid
- Check Backboard.io dashboard for API usage/limits

## 📝 Next Steps

1. ✅ Set `BACKBOARD_API_KEY` in Vercel
2. ✅ Set `BLOB_READ_WRITE_TOKEN` in Vercel
3. ⚠️ (Optional) Set Google Search API keys for web sources
4. ✅ Test the full flow end-to-end
5. ✅ Monitor Backboard.io dashboard for usage/errors

All agents are **ready to use** — they'll be created automatically on first API call!
