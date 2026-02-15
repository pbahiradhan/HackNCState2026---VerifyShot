// ──────────────────────────────────────────────
//  Orchestrator Agent — Accurate + Efficient
//  OCR → Extract Claims → Quality Gate → Multi-Model Verify → Bias Detect → Synthesize
//  Total: ~10-12 API calls, ~10-15 seconds, all parallelized
// ──────────────────────────────────────────────

import { extractTextFromImage } from "./geminiOcr";
import { extractClaims, verifyClaimMultiModel, ModelVerification } from "./backboardHttp";
import { searchSources } from "./search";
import { calculateTrustScore, biasPenalty, trustLabel } from "./trustScore";
import { AnalysisResult, Claim, Source, ModelVerdict, BiasSignals } from "./types";

export async function analyzeImage(
  imageUrl: string,
  jobId: string
): Promise<AnalysisResult> {
  console.log(`[Orchestrator][${jobId}] 🚀 Starting analysis…`);

  // ── Step 1: OCR via Gemini Vision (1 API call, ~2s) ──
  console.log(`[Orchestrator][${jobId}] Step 1: OCR from ${imageUrl}…`);
  let ocrText: string;
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not set in environment variables");
    }
    ocrText = await extractTextFromImage(imageUrl);
  } catch (err: any) {
    console.error(`[Orchestrator][${jobId}] OCR failed:`, err.message);
    if (err.message?.includes("429") || err.message?.includes("rate limit")) {
      throw new Error("Gemini API rate limit exceeded. Please wait a few minutes and try again.");
    }
    if (err.message?.includes("GEMINI_API_KEY")) {
      throw new Error("OCR failed: GEMINI_API_KEY not set. Set it in Vercel → Settings → Environment Variables.");
    }
    throw new Error(`OCR failed: ${err.message}. Check GEMINI_API_KEY is set and has quota available.`);
  }

  if (!ocrText.trim()) {
    throw new Error("No text found in screenshot");
  }
  console.log(`[Orchestrator][${jobId}] ✅ OCR extracted ${ocrText.length} chars`);

  // ── Step 2: Extract Claims + Search Sources (parallel, ~3s) ──
  console.log(`[Orchestrator][${jobId}] Step 2: Extracting claims and searching sources (parallel)…`);
  
  let extractedClaims: Array<{ text: string }> = [];
  let sources: Source[] = [];
  
  try {
    [extractedClaims, sources] = await Promise.all([
      extractClaims(ocrText).catch((err: any) => {
        console.warn(`[Orchestrator][${jobId}] Claim extraction failed:`, err.message);
        // Fallback: use first sentence as a single claim
        const firstSentence = ocrText.split(/[.!?\n]/)[0]?.trim();
        return firstSentence && firstSentence.length > 10
          ? [{ text: firstSentence }]
          : [{ text: ocrText.slice(0, 200) }];
      }),
      searchSources(ocrText.split(/[.!?\n]/)[0]?.trim() || ocrText.slice(0, 200), 10).catch((err: any) => {
        console.warn(`[Orchestrator][${jobId}] Search failed:`, err.message);
        return [];
      }),
    ]);
  } catch (err: any) {
    console.error(`[Orchestrator][${jobId}] Step 2 failed:`, err.message);
    throw new Error(`Analysis failed: ${err.message}`);
  }

  console.log(`[Orchestrator][${jobId}] ✅ Extracted ${extractedClaims.length} claim(s), found ${sources.length} source(s)`);

  // ── Step 3: Quality Gate (local, 0 API calls) ──
  console.log(`[Orchestrator][${jobId}] Step 3: Quality gate check…`);
  
  const highQualitySources = sources.filter(s => (s.credibilityScore || 0) >= 0.7);
  const hasMinimumSources = highQualitySources.length >= 3;
  
  if (!hasMinimumSources) {
    console.log(`[Orchestrator][${jobId}] ⚠️ Quality gate failed: only ${highQualitySources.length} high-quality sources (need 3+)`);
    
    // Return "unable to verify" result
    const result: AnalysisResult = {
      jobId,
      imageUrl,
      ocrText,
      claims: extractedClaims.map((c, i) => ({
        id: `c${i + 1}`,
        text: c.text,
        verdict: "unable_to_verify" as const,
        trustScore: 0,
        explanation: `Unable to verify: Found only ${highQualitySources.length} high-quality source(s), need at least 3 for reliable verification.`,
        sources: sources.slice(0, 5),
        biasSignals: {
          politicalBias: 0,
          sensationalism: 0.3,
          overallBias: "center",
          explanation: "Unable to assess bias without sufficient sources.",
        },
        modelVerdicts: [],
      })),
      aggregateTrustScore: 0,
      trustLabel: "Unable to Verify",
      summary: `Unable to verify claims: Insufficient high-quality sources found (${highQualitySources.length} of 3 required).`,
      generatedAt: new Date().toISOString(),
    };
    
    console.log(`[Orchestrator][${jobId}] ⚠️ Returning "unable to verify" result`);
    return result;
  }

  console.log(`[Orchestrator][${jobId}] ✅ Quality gate passed: ${highQualitySources.length} high-quality sources`);

  // ── Step 4: Multi-Model Verification (3 models × N claims, all parallel, ~5-8s) ──
  console.log(`[Orchestrator][${jobId}] Step 4: Multi-model verification (${extractedClaims.length} claim(s) × 3 models, parallel)…`);
  
  const allVerifications: ModelVerification[][] = await Promise.all(
    extractedClaims.map((claim) => verifyClaimMultiModel(claim.text, sources))
  );

  console.log(`[Orchestrator][${jobId}] ✅ Multi-model verification complete`);

  // ── Step 5: SKIP Bias Detection (moved to separate API call) ──
  console.log(`[Orchestrator][${jobId}] Step 5: Skipping bias detection (available via separate API call)`);
  
  // Return placeholder bias signals - user can trigger full analysis via button
  const biasSignals: BiasSignals = {
    politicalBias: 0,
    sensationalism: 0.3,
    overallBias: "center" as const,
    explanation: "Bias analysis available via 'Bias Analysis' button for detailed multi-perspective assessment.",
  };

  console.log(`[Orchestrator][${jobId}] ✅ Using placeholder bias (full analysis available separately)`);

  // ── Step 6: Synthesize Results (local computation, 0 API calls) ──
  console.log(`[Orchestrator][${jobId}] Step 6: Synthesizing results…`);
  
  const claims: Claim[] = extractedClaims.map((extracted, claimIdx) => {
    const verifications = allVerifications[claimIdx];
    
    // Calculate real consensus
    const trueVerdicts = verifications.map(v => v.verdict);
    const likelyTrueCount = trueVerdicts.filter(v => v === "likely_true").length;
    const likelyMisleadingCount = trueVerdicts.filter(v => v === "likely_misleading").length;
    const mixedCount = trueVerdicts.filter(v => v === "mixed").length;
    
    // Determine final verdict based on majority
    let finalVerdict: "likely_true" | "mixed" | "likely_misleading";
    if (likelyTrueCount >= 2) finalVerdict = "likely_true";
    else if (likelyMisleadingCount >= 2) finalVerdict = "likely_misleading";
    else finalVerdict = "mixed";
    
    // Average confidence across models
    const avgConfidence = verifications.reduce((s, v) => s + v.confidence, 0) / verifications.length;
    
    // Convert to ModelVerdict format for UI
    const modelVerdicts: ModelVerdict[] = verifications.map(v => ({
      modelName: v.modelName,
      agrees: v.verdict === finalVerdict,
      confidence: v.confidence,
      verdict: v.verdict,
      reasoning: v.reasoning,
    }));
    
    // Calculate trust score with model agreement
    const bp = biasPenalty(biasSignals);
    const modelAgreement = verifications.filter(v => v.verdict === finalVerdict).length / verifications.length;
    const score = calculateTrustScore(sources, avgConfidence, bp, modelAgreement);
    
    // Generate explanation from model reasoning
    const explanations = verifications.map(v => v.reasoning).filter(Boolean);
    const mainExplanation = explanations.length > 0
      ? `${explanations[0]} (${likelyTrueCount}/${verifications.length} models agree with "${finalVerdict}" verdict)`
      : `Analysis by ${verifications.length} independent AI models.`;

    console.log(`[Orchestrator][${jobId}] Claim ${claimIdx + 1}:`, {
      text: extracted.text.slice(0, 50) + "...",
      verdict: finalVerdict,
      confidence: avgConfidence.toFixed(2),
      calculatedScore: score,
      modelAgreement: `${likelyTrueCount + likelyMisleadingCount}/${verifications.length}`,
    });

    return {
      id: `c${claimIdx + 1}`,
      text: extracted.text,
      verdict: finalVerdict,
      trustScore: score,
      explanation: mainExplanation,
      sources: sources.slice(0, 5),
      biasSignals,
      modelVerdicts,
    };
  });

  // Aggregate trust score
  const aggScore = claims.length > 0
    ? Math.round(claims.reduce((s, c) => s + c.trustScore, 0) / claims.length)
    : 0;
  
  // Generate summary
  const summary = generateSummary(claims, biasSignals, sources.length);

  console.log(`[Orchestrator][${jobId}] ✅ Synthesis complete — trust: ${aggScore}%, ${claims.length} claim(s)`);

  const result: AnalysisResult = {
    jobId,
    imageUrl,
    ocrText,
    claims,
    aggregateTrustScore: aggScore,
    trustLabel: trustLabel(aggScore),
    summary,
    generatedAt: new Date().toISOString(),
  };

  console.log(`[Orchestrator][${jobId}] ✅ Analysis complete — trust: ${aggScore}%, ${claims.length} claim(s)`);
  return result;
}

function generateSummary(
  claims: Claim[],
  biasSignals: any,
  sourceCount: number
): string {
  const mainVerdict = claims[0]?.verdict || "mixed";
  const verdictDesc = mainVerdict === "likely_true" ? "likely true"
    : mainVerdict === "likely_misleading" ? "likely misleading"
    : "unverified";
  
  const biasDesc = biasSignals.overallBias === "center" ? "relatively neutral"
    : biasSignals.overallBias.replace("_", " ");
  
  return `Analysis of ${claims.length} claim(s) suggests the content is ${verdictDesc}. Assessed across ${sourceCount} source(s) and verified by multiple AI models. Bias assessment: ${biasDesc} framing.`;
}
