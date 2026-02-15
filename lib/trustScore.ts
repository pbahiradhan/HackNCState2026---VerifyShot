// ──────────────────────────────────────────────
//  Trust-score calculation (0-100)
// ──────────────────────────────────────────────

import { Source, BiasSignals } from "./types";

export function calculateTrustScore(
  sources: Source[],
  modelConsensus: number,     // 0-1 (LLM confidence)
  biasPenalty: number          // 0-1
): number {
  // 1. Source quality (0-1) — weighted avg credibility
  const sourceQuality = sources.length > 0
    ? sources.reduce((s, src) => s + (src.credibilityScore || 0.5), 0) / sources.length
    : 0.3; // Default to 0.3 if no sources (neutral baseline)

  // 2. Recency (0-1) — how recent corroborating sources are
  const recency = calculateRecencyScore(sources);

  // 3. Independent agreement (0-1) — fraction of high-quality sources
  const highQ = sources.filter((s) => (s.credibilityScore || 0) >= 0.7).length;
  const agreement = sources.length > 0 ? highQ / sources.length : 0.3; // Default if no sources

  // Weighted formula
  // If no sources, rely more heavily on model consensus
  const sourceWeight = sources.length > 0 ? 0.45 : 0.20;
  const modelWeight = sources.length > 0 ? 0.30 : 0.50; // Higher weight when no sources
  const recencyWeight = sources.length > 0 ? 0.10 : 0.05;
  const agreementWeight = sources.length > 0 ? 0.10 : 0.05;
  
  const raw =
    sourceWeight * sourceQuality +
    modelWeight * modelConsensus +
    recencyWeight * recency +
    agreementWeight * agreement -
    0.05 * biasPenalty;

  const finalScore = Math.max(0, Math.min(100, Math.round(raw * 100)));
  
  // Log calculation for debugging
  console.log(`[TrustScore] Calculation:`, {
    sourceQuality: sourceQuality.toFixed(2),
    modelConsensus: modelConsensus.toFixed(2),
    recency: recency.toFixed(2),
    agreement: agreement.toFixed(2),
    biasPenalty: biasPenalty.toFixed(2),
    raw: raw.toFixed(2),
    finalScore,
    sourceCount: sources.length,
  });
  
  if (sources.length === 0) {
    console.log(`[TrustScore] ⚠️ No sources - relying heavily on model consensus: ${modelConsensus.toFixed(2)}`);
  }
  
  if (modelConsensus === 0.5) {
    console.warn(`[TrustScore] ⚠️ Model consensus is default 0.5 - Backboard may not have returned proper confidence`);
  }
  
  return finalScore;
}

export function calculateRecencyScore(sources: Source[]): number {
  if (sources.length === 0) return 0;
  const now = Date.now();
  const scores = sources.map((s) => {
    const age = now - new Date(s.date).getTime();
    if (age < 7 * 86400_000) return 1;          // < 1 week
    if (age < 30 * 86400_000) return 0.9;       // < 1 month
    if (age < 365 * 86400_000) return 0.7;      // < 1 year
    return 0.4;
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function biasPenalty(bias: BiasSignals): number {
  return (Math.abs(bias.politicalBias) * 0.5) + (bias.sensationalism * 0.5);
}

export function trustLabel(score: number): string {
  if (score >= 75) return "Likely True";
  if (score >= 40) return "Unverified / Mixed";
  return "Likely Misleading";
}
