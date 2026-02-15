// ──────────────────────────────────────────────
//  Multi-Perspective Bias Detection
//  3 perspectives × 3 models = 9 independent assessments
//  Uses Backboard.io HTTP API (no SDK)
// ──────────────────────────────────────────────

import { BiasSignals, Source, ModelBiasUpdate, BiasAnalysisResult } from "./types";

const BASE_URL = "https://app.backboard.io/api";

function getHeaders(contentType: string = "application/json"): Record<string, string> {
  const key = process.env.BACKBOARD_API_KEY;
  if (!key) {
    throw new Error("BACKBOARD_API_KEY not set in environment variables");
  }
  return {
    "X-API-Key": key,
    "Content-Type": contentType,
  };
}

// Cache assistant IDs
const assistantCache: Record<string, string> = {};

async function getOrCreatePerspectiveAssistant(
  perspective: "us-left" | "us-right" | "international"
): Promise<string> {
  const name = `VerifyShot-Bias-${perspective}-v2`;
  if (assistantCache[name]) return assistantCache[name];

  // Perspective-specific prompts (NO curly braces!)
  const prompts: Record<string, string> = {
    "us-left": [
      "You are a media bias analyst specializing in progressive and left-leaning framing.",
      "Analyze claims for political bias and sensationalism.",
      "Consider how language, framing, and fact selection might appeal to left-leaning audiences.",
      "Return JSON with: politicalBias (number -1 to 1), sensationalism (number 0 to 1), reasoning (string).",
      "No markdown, no code blocks, just JSON.",
    ].join("\n"),
    
    "us-right": [
      "You are a media bias analyst specializing in conservative and right-leaning framing.",
      "Analyze claims for political bias and sensationalism.",
      "Consider how language, framing, and fact selection might appeal to right-leaning audiences.",
      "Return JSON with: politicalBias (number -1 to 1), sensationalism (number 0 to 1), reasoning (string).",
      "No markdown, no code blocks, just JSON.",
    ].join("\n"),
    
    "international": [
      "You are a neutral international media analyst from a non-US perspective.",
      "Analyze claims for political bias and sensationalism objectively.",
      "Consider how the framing might appear to audiences outside the US political context.",
      "Return JSON with: politicalBias (number -1 to 1), sensationalism (number 0 to 1), reasoning (string).",
      "No markdown, no code blocks, just JSON.",
    ].join("\n"),
  };

  try {
    // Check if assistant exists
    const listRes = await fetch(`${BASE_URL}/assistants`, {
      headers: getHeaders(),
    });

    if (listRes.ok) {
      const assistants = (await listRes.json()) as any;
      const existing = Array.isArray(assistants)
        ? assistants.find((a: any) => a.name === name)
        : null;
      
      if (existing?.assistant_id) {
        assistantCache[name] = existing.assistant_id;
        return existing.assistant_id;
      }
    }

    // Create new assistant
    const createRes = await fetch(`${BASE_URL}/assistants`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        name,
        system_prompt: prompts[perspective],
      }),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      throw new Error(`Backboard API error (${createRes.status}): ${errorText}`);
    }

    const assistant = (await createRes.json()) as any;
    if (assistant.assistant_id) {
      assistantCache[name] = assistant.assistant_id;
      return assistant.assistant_id;
    }

    throw new Error("Failed to create assistant: no assistant_id in response");
  } catch (err: any) {
    console.error(`[BiasDetection] Failed to create assistant "${name}":`, err.message);
    throw new Error(`Bias assistant creation failed: ${err.message}`);
  }
}

interface ModelBiasAssessment {
  politicalBias: number;
  sensationalism: number;
  reasoning: string;
}

async function assessBiasFromModel(
  assistantId: string,
  claims: string[],
  sources: Source[],
  provider: string,
  modelName: string,
  displayName: string
): Promise<ModelBiasAssessment> {
  const srcBlock = sources.length > 0
    ? sources.map((s, i) => `[${i + 1}] ${s.title} (${s.domain})\n${s.snippet}`).join("\n\n")
    : "No sources available.";

  const userMessage = `CLAIMS TO ANALYZE:
${claims.map((c, i) => `${i + 1}. "${c}"`).join("\n")}

CONTEXT:
${srcBlock}

Analyze the language, framing, and tone of these claims for political bias and sensationalism. Return JSON with politicalBias (number -1 to 1), sensationalism (number 0 to 1), and reasoning (string).`;

  try {
    const threadRes = await fetch(`${BASE_URL}/assistants/${assistantId}/threads`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({}),
    });

    if (!threadRes.ok) {
      throw new Error(`Thread creation failed: ${threadRes.status}`);
    }

    const thread = (await threadRes.json()) as any;
    const threadId = thread.thread_id;

    const formData = new URLSearchParams();
    formData.append("content", userMessage);
    formData.append("stream", "false");
    formData.append("memory", "Auto");  // Use memory for learning
    formData.append("llm_provider", provider);
    formData.append("model_name", modelName);

    const messageRes = await fetch(`${BASE_URL}/threads/${threadId}/messages`, {
      method: "POST",
      headers: getHeaders("application/x-www-form-urlencoded"),
      body: formData.toString(),
    });

    if (!messageRes.ok) {
      const errorText = await messageRes.text();
      throw new Error(`Message failed: ${messageRes.status} - ${errorText}`);
    }

    const resp = (await messageRes.json()) as any;
    let content = resp.content || resp.message?.content || "";
    
    content = content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/```(?:json)?\n?/g, "").replace(/```\s*$/g, "").trim();
    }

    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error(`No JSON object found: ${content.slice(0, 200)}`);
    }

    const jsonStr = content.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonStr) as any;

    return {
      politicalBias: Math.max(-1, Math.min(1, parsed.politicalBias || 0)),
      sensationalism: Math.max(0, Math.min(1, parsed.sensationalism || 0.3)),
      reasoning: parsed.reasoning || "Bias assessment completed.",
    };
  } catch (err: any) {
    console.error(`[BiasDetection] Assessment failed for ${displayName}:`, err.message);
    return {
      politicalBias: 0,
      sensationalism: 0.3,
      reasoning: `Error: ${err.message}`,
    };
  }
}

export async function detectBiasMultiPerspective(
  claims: string[],
  sources: Source[]
): Promise<BiasSignals> {
  console.log(`[BiasDetection] Starting multi-perspective analysis for ${claims.length} claim(s)...`);

  // Step 1: Get/create 3 perspective assistants (parallel)
  const [leftId, rightId, intlId] = await Promise.all([
    getOrCreatePerspectiveAssistant("us-left"),
    getOrCreatePerspectiveAssistant("us-right"),
    getOrCreatePerspectiveAssistant("international"),
  ]);

  // Step 2: Run 9 model assessments (ALL parallel)
  const models = [
    { provider: "openai", name: "gpt-4o", displayName: "GPT-4o" },
    { provider: "anthropic", name: "claude-3-5-sonnet-20241022", displayName: "Claude 3.5 Sonnet" },
    { provider: "google", name: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro" },
  ];

  const assessments = await Promise.all([
    // US Left × 3 models
    assessBiasFromModel(leftId, claims, sources, models[0].provider, models[0].name, `US Left (${models[0].displayName})`),
    assessBiasFromModel(leftId, claims, sources, models[1].provider, models[1].name, `US Left (${models[1].displayName})`),
    assessBiasFromModel(leftId, claims, sources, models[2].provider, models[2].name, `US Left (${models[2].displayName})`),
    
    // US Right × 3 models
    assessBiasFromModel(rightId, claims, sources, models[0].provider, models[0].name, `US Right (${models[0].displayName})`),
    assessBiasFromModel(rightId, claims, sources, models[1].provider, models[1].name, `US Right (${models[1].displayName})`),
    assessBiasFromModel(rightId, claims, sources, models[2].provider, models[2].name, `US Right (${models[2].displayName})`),
    
    // International × 3 models
    assessBiasFromModel(intlId, claims, sources, models[0].provider, models[0].name, `International (${models[0].displayName})`),
    assessBiasFromModel(intlId, claims, sources, models[1].provider, models[1].name, `International (${models[1].displayName})`),
    assessBiasFromModel(intlId, claims, sources, models[2].provider, models[2].name, `International (${models[2].displayName})`),
  ]);

  // Step 3: Aggregate by perspective
  const leftAssessments = assessments.slice(0, 3);
  const rightAssessments = assessments.slice(3, 6);
  const intlAssessments = assessments.slice(6, 9);

  const leftBias = leftAssessments.reduce((s, a) => s + a.politicalBias, 0) / 3;
  const leftSens = leftAssessments.reduce((s, a) => s + a.sensationalism, 0) / 3;
  const leftConsensus = 1 - (calculateStdDev(leftAssessments.map(a => a.politicalBias)) / 2); // Normalize to 0-1

  const rightBias = rightAssessments.reduce((s, a) => s + a.politicalBias, 0) / 3;
  const rightSens = rightAssessments.reduce((s, a) => s + a.sensationalism, 0) / 3;
  const rightConsensus = 1 - (calculateStdDev(rightAssessments.map(a => a.politicalBias)) / 2);

  const intlBias = intlAssessments.reduce((s, a) => s + a.politicalBias, 0) / 3;
  const intlSens = intlAssessments.reduce((s, a) => s + a.sensationalism, 0) / 3;
  const intlConsensus = 1 - (calculateStdDev(intlAssessments.map(a => a.politicalBias)) / 2);

  // Step 4: Overall aggregation
  const allBiases = assessments.map(a => a.politicalBias);
  const allSens = assessments.map(a => a.sensationalism);
  
  const avgBias = allBiases.reduce((s, b) => s + b, 0) / allBiases.length;
  const avgSens = allSens.reduce((s, s2) => s + s2, 0) / allSens.length;
  
  const stdDev = calculateStdDev(allBiases);
  const confidence = Math.max(0, Math.min(1, 1 - (stdDev / 2))); // Inverse of std dev, normalized
  
  let agreement: "high" | "medium" | "low";
  if (stdDev < 0.2) agreement = "high";
  else if (stdDev < 0.4) agreement = "medium";
  else agreement = "low";

  // Determine overall bias label
  let overallBias: BiasSignals["overallBias"];
  if (avgBias < -0.5) overallBias = "left";
  else if (avgBias < -0.15) overallBias = "slight_left";
  else if (avgBias > 0.5) overallBias = "right";
  else if (avgBias > 0.15) overallBias = "slight_right";
  else overallBias = "center";

  // Extract key signals from reasoning
  const allReasoning = assessments.map(a => a.reasoning).join(" ");
  const keySignals = extractKeySignals(allReasoning);

  // Main explanation (use most common themes)
  const mainExplanation = generateMainExplanation(avgBias, avgSens, agreement, keySignals);

  console.log(`[BiasDetection] ✅ Analysis complete:`, {
    bias: avgBias.toFixed(2),
    sensationalism: avgSens.toFixed(2),
    confidence: confidence.toFixed(2),
    agreement,
  });

  return {
    politicalBias: Math.round(avgBias * 100) / 100,
    sensationalism: Math.round(avgSens * 100) / 100,
    overallBias,
    explanation: mainExplanation,
    confidence,
    agreement,
    perspectives: {
      usLeft: {
        bias: Math.round(leftBias * 100) / 100,
        sensationalism: Math.round(leftSens * 100) / 100,
        consensus: Math.round(leftConsensus * 100) / 100,
      },
      usRight: {
        bias: Math.round(rightBias * 100) / 100,
        sensationalism: Math.round(rightSens * 100) / 100,
        consensus: Math.round(rightConsensus * 100) / 100,
      },
      international: {
        bias: Math.round(intlBias * 100) / 100,
        sensationalism: Math.round(intlSens * 100) / 100,
        consensus: Math.round(intlConsensus * 100) / 100,
      },
    },
    keySignals,
  };
}

function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function extractKeySignals(reasoning: string): string[] {
  const signals: string[] = [];
  const lower = reasoning.toLowerCase();
  
  if (lower.includes("emotional") || lower.includes("emotion")) signals.push("Emotional language");
  if (lower.includes("selective") || lower.includes("cherry")) signals.push("Selective fact presentation");
  if (lower.includes("loaded") || lower.includes("charged")) signals.push("Loaded terminology");
  if (lower.includes("exaggerat") || lower.includes("hyperbol")) signals.push("Exaggeration");
  if (lower.includes("framing") || lower.includes("frame")) signals.push("Framing bias");
  if (lower.includes("omission") || lower.includes("omit")) signals.push("Factual omissions");
  
  return signals.length > 0 ? signals : ["Standard political messaging"];
}

function generateMainExplanation(
  bias: number,
  sensationalism: number,
  agreement: "high" | "medium" | "low",
  keySignals: string[]
): string {
  const biasDesc = bias < -0.3 ? "left-leaning" : bias > 0.3 ? "right-leaning" : "relatively neutral";
  const sensDesc = sensationalism > 0.7 ? "highly sensational" : sensationalism > 0.4 ? "moderately sensational" : "low sensationalism";
  const agreeDesc = agreement === "high" ? "strong agreement" : agreement === "medium" ? "moderate agreement" : "low agreement";
  
  return `Analysis across 9 independent assessments (3 perspectives × 3 AI models) shows ${biasDesc} framing with ${sensDesc}. ${agreeDesc} among assessors. Key signals: ${keySignals.slice(0, 3).join(", ")}.`;
}

// ──────────────────────────────────────────────
//  Bias Detection with Transparency (for separate API)
// ──────────────────────────────────────────────

export async function detectBiasWithTransparency(
  claims: string[],
  ocrText: string,
  jobId: string,
  onUpdate?: (update: ModelBiasUpdate) => void
): Promise<BiasAnalysisResult> {
  console.log(`[BiasDetection][${jobId}] Starting transparent bias analysis for ${claims.length} claim(s)...`);

  // Step 1: Get/create 3 perspective assistants (parallel)
  const [leftId, rightId, intlId] = await Promise.all([
    getOrCreatePerspectiveAssistant("us-left"),
    getOrCreatePerspectiveAssistant("us-right"),
    getOrCreatePerspectiveAssistant("international"),
  ]);

  const models = [
    { provider: "openai", name: "gpt-4o", displayName: "GPT-4o" },
    { provider: "anthropic", name: "claude-3-5-sonnet-20241022", displayName: "Claude 3.5 Sonnet" },
    { provider: "google", name: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro" },
  ];

  // Step 2: Run 9 assessments with progress updates
  const assessmentPromises = [
    // US Left × 3 models
    assessBiasWithUpdate(leftId, claims, ocrText, models[0], "us-left", onUpdate),
    assessBiasWithUpdate(leftId, claims, ocrText, models[1], "us-left", onUpdate),
    assessBiasWithUpdate(leftId, claims, ocrText, models[2], "us-left", onUpdate),
    
    // US Right × 3 models
    assessBiasWithUpdate(rightId, claims, ocrText, models[0], "us-right", onUpdate),
    assessBiasWithUpdate(rightId, claims, ocrText, models[1], "us-right", onUpdate),
    assessBiasWithUpdate(rightId, claims, ocrText, models[2], "us-right", onUpdate),
    
    // International × 3 models
    assessBiasWithUpdate(intlId, claims, ocrText, models[0], "international", onUpdate),
    assessBiasWithUpdate(intlId, claims, ocrText, models[1], "international", onUpdate),
    assessBiasWithUpdate(intlId, claims, ocrText, models[2], "international", onUpdate),
  ];

  const assessmentResults = await Promise.allSettled(assessmentPromises);
  
  // Extract successful assessments and model updates
  const assessments: ModelBiasAssessment[] = [];
  const modelUpdates: ModelBiasUpdate[] = [];

  assessmentResults.forEach((result, index) => {
    const perspective = index < 3 ? "us-left" : index < 6 ? "us-right" : "international";
    const modelIndex = index % 3;
    const model = models[modelIndex];

    if (result.status === "fulfilled") {
      const assessment = result.value.assessment;
      assessments.push(assessment);
      modelUpdates.push({
        perspective,
        modelName: model.displayName,
        status: "complete",
        reasoning: assessment.reasoning,
        bias: assessment.politicalBias,
        sensationalism: assessment.sensationalism,
      });
    } else {
      // Failed assessment
      assessments.push({
        politicalBias: 0,
        sensationalism: 0.3,
        reasoning: `Error: ${result.reason}`,
      });
      modelUpdates.push({
        perspective,
        modelName: model.displayName,
        status: "complete",
        reasoning: `Error: ${result.reason}`,
        bias: 0,
        sensationalism: 0.3,
      });
    }
  });

  // Step 3: Aggregate (same logic as detectBiasMultiPerspective)
  const leftAssessments = assessments.slice(0, 3);
  const rightAssessments = assessments.slice(3, 6);
  const intlAssessments = assessments.slice(6, 9);

  const leftBias = leftAssessments.reduce((s, a) => s + a.politicalBias, 0) / 3;
  const leftSens = leftAssessments.reduce((s, a) => s + a.sensationalism, 0) / 3;
  const leftConsensus = 1 - (calculateStdDev(leftAssessments.map(a => a.politicalBias)) / 2);

  const rightBias = rightAssessments.reduce((s, a) => s + a.politicalBias, 0) / 3;
  const rightSens = rightAssessments.reduce((s, a) => s + a.sensationalism, 0) / 3;
  const rightConsensus = 1 - (calculateStdDev(rightAssessments.map(a => a.politicalBias)) / 2);

  const intlBias = intlAssessments.reduce((s, a) => s + a.politicalBias, 0) / 3;
  const intlSens = intlAssessments.reduce((s, a) => s + a.sensationalism, 0) / 3;
  const intlConsensus = 1 - (calculateStdDev(intlAssessments.map(a => a.politicalBias)) / 2);

  const allBiases = assessments.map(a => a.politicalBias);
  const allSens = assessments.map(a => a.sensationalism);
  
  const avgBias = allBiases.reduce((s, b) => s + b, 0) / allBiases.length;
  const avgSens = allSens.reduce((s, s2) => s + s2, 0) / allSens.length;
  
  const stdDev = calculateStdDev(allBiases);
  const confidence = Math.max(0, Math.min(1, 1 - (stdDev / 2)));
  
  let agreement: "high" | "medium" | "low";
  if (stdDev < 0.2) agreement = "high";
  else if (stdDev < 0.4) agreement = "medium";
  else agreement = "low";

  let overallBias: BiasSignals["overallBias"];
  if (avgBias < -0.5) overallBias = "left";
  else if (avgBias < -0.15) overallBias = "slight_left";
  else if (avgBias > 0.5) overallBias = "right";
  else if (avgBias > 0.15) overallBias = "slight_right";
  else overallBias = "center";

  const allReasoning = assessments.map(a => a.reasoning).join(" ");
  const keySignals = extractKeySignals(allReasoning);
  const mainExplanation = generateMainExplanation(avgBias, avgSens, agreement, keySignals);

  const biasSignals: BiasSignals = {
    politicalBias: Math.round(avgBias * 100) / 100,
    sensationalism: Math.round(avgSens * 100) / 100,
    overallBias,
    explanation: mainExplanation,
    confidence,
    agreement,
    perspectives: {
      usLeft: {
        bias: Math.round(leftBias * 100) / 100,
        sensationalism: Math.round(leftSens * 100) / 100,
        consensus: Math.round(leftConsensus * 100) / 100,
      },
      usRight: {
        bias: Math.round(rightBias * 100) / 100,
        sensationalism: Math.round(rightSens * 100) / 100,
        consensus: Math.round(rightConsensus * 100) / 100,
      },
      international: {
        bias: Math.round(intlBias * 100) / 100,
        sensationalism: Math.round(intlSens * 100) / 100,
        consensus: Math.round(intlConsensus * 100) / 100,
      },
    },
    keySignals,
  };

  return {
    biasSignals,
    modelAssessments: modelUpdates,
    perspectives: biasSignals.perspectives,
  };
}

async function assessBiasWithUpdate(
  assistantId: string,
  claims: string[],
  ocrText: string,
  model: { provider: string; name: string; displayName: string },
  perspective: "us-left" | "us-right" | "international",
  onUpdate?: (update: ModelBiasUpdate) => void
): Promise<{ assessment: ModelBiasAssessment; update: ModelBiasUpdate }> {
  
  // Emit "thinking" status
  onUpdate?.({
    perspective,
    modelName: model.displayName,
    status: "thinking",
  });

  // Emit "analyzing" status
  onUpdate?.({
    perspective,
    modelName: model.displayName,
    status: "analyzing",
  });

  // Create a synthetic source from ocrText so the model has context
  const contextSources: Source[] = ocrText ? [{
    title: "Original Screenshot Text",
    url: "screenshot://original",
    domain: "screenshot",
    date: new Date().toISOString(),
    credibilityScore: 0.5,
    snippet: ocrText.slice(0, 500),
  }] : [];

  const assessment = await assessBiasFromModel(
    assistantId,
    claims,
    contextSources,
    model.provider,
    model.name,
    model.displayName
  );

  const update: ModelBiasUpdate = {
    perspective,
    modelName: model.displayName,
    status: "complete",
    reasoning: assessment.reasoning,
    bias: assessment.politicalBias,
    sensationalism: assessment.sensationalism,
  };

  // Emit "complete" with results
  onUpdate?.(update);

  return { assessment, update };
}
