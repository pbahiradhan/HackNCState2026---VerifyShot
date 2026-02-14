// ──────────────────────────────────────────────
//  Main orchestrator — SIMPLIFIED
//  Gemini Vision OCR → Google Search → ONE Backboard analysis call
//  Total: ~3-5 API calls instead of ~25
// ──────────────────────────────────────────────

import { extractTextFromImage } from "./geminiOcr";
import { analyzeTextComprehensive } from "./backboard";
import { searchSources } from "./search";
import { calculateTrustScore, biasPenalty, trustLabel } from "./trustScore";
import { AnalysisResult, Claim, Source } from "./types";

export async function analyzeImage(
  imageUrl: string,
  jobId: string
): Promise<AnalysisResult> {
  console.log(`[Analyzer][${jobId}] Starting analysis…`);

  // ── Step 1: OCR via Gemini Vision (1 API call) ──
  console.log(`[Analyzer][${jobId}] Step 1: OCR…`);
  let ocrText: string;
  try {
    ocrText = await extractTextFromImage(imageUrl);
  } catch (err: any) {
    console.error(`[Analyzer][${jobId}] OCR failed:`, err.message);
    throw new Error(`OCR failed: ${err.message}`);
  }

  if (!ocrText.trim()) {
    throw new Error("No text found in screenshot");
  }
  console.log(`[Analyzer][${jobId}] OCR extracted ${ocrText.length} chars`);

  // ── Step 2: Search for sources (1 API call) ──
  console.log(`[Analyzer][${jobId}] Step 2: Searching sources…`);
  let sources: Source[] = [];
  try {
    // Use first ~200 chars as search query
    const searchQuery = ocrText.split(/[.!?\n]/)[0]?.trim() || ocrText.slice(0, 200);
    sources = await searchSources(searchQuery, 5);
    console.log(`[Analyzer][${jobId}] Found ${sources.length} sources`);
  } catch (err: any) {
    console.warn(`[Analyzer][${jobId}] Search failed (continuing without sources):`, err.message);
    // Continue without sources — analysis still works
  }

  // ── Step 3: Comprehensive analysis via Backboard (2-3 API calls) ──
  console.log(`[Analyzer][${jobId}] Step 3: Backboard analysis…`);
  let analysis;
  try {
    analysis = await analyzeTextComprehensive(ocrText, sources);
  } catch (err: any) {
    console.error(`[Analyzer][${jobId}] Backboard analysis failed:`, err.message);
    throw new Error(`Analysis failed: ${err.message}`);
  }

  // ── Step 4: Build result ──
  console.log(`[Analyzer][${jobId}] Step 4: Building result…`);
  const claims: Claim[] = analysis.claims.map((c, i) => {
    const bp = biasPenalty(analysis.biasAssessment);
    const score = calculateTrustScore(sources, c.confidence, bp);

    return {
      id: `c${i + 1}`,
      text: c.text,
      verdict: c.verdict,
      trustScore: score,
      explanation: c.explanation,
      sources: sources.slice(0, 5),
      biasSignals: analysis.biasAssessment,
      modelVerdicts: analysis.modelConsensus,
    };
  });

  // Aggregate trust score
  const aggScore = claims.length > 0
    ? Math.round(claims.reduce((s, c) => s + c.trustScore, 0) / claims.length)
    : 0;

  const result: AnalysisResult = {
    jobId,
    imageUrl,
    ocrText,
    claims,
    aggregateTrustScore: aggScore,
    trustLabel: trustLabel(aggScore),
    summary: analysis.summary,
    generatedAt: new Date().toISOString(),
  };

  console.log(`[Analyzer][${jobId}] ✅ Analysis complete — trust: ${aggScore}%, ${claims.length} claim(s)`);
  return result;
}
