// ──────────────────────────────────────────────
//  Multi-Perspective Bias Detection (3 calls)
//  1 perspective × 1 model = 3 parallel assessments
//  Uses Backboard.io HTTP API (no SDK)
// ──────────────────────────────────────────────

import { BiasSignals, Source } from "./types";

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
  const name = `VerifyShot-Bias-${perspective}-v3`;
  if (assistantCache[name]) return assistantCache[name];

  // Perspective-specific prompts (NO curly braces — Backboard uses Python .format())
  const prompts: Record<string, string> = {
    "us-left": [
      "You are a media bias analyst specializing in progressive and left-leaning framing.",
      "Analyze claims for political bias and sensationalism.",
      "Consider how language, framing, and fact selection might appeal to left-leaning audiences.",
      "Return ONLY valid JSON with these fields: politicalBias (number -1 to 1), sensationalism (number 0 to 1), reasoning (string).",
      "No markdown, no code blocks, no extra text. Just the JSON object.",
    ].join("\n"),

    "us-right": [
      "You are a media bias analyst specializing in conservative and right-leaning framing.",
      "Analyze claims for political bias and sensationalism.",
      "Consider how language, framing, and fact selection might appeal to right-leaning audiences.",
      "Return ONLY valid JSON with these fields: politicalBias (number -1 to 1), sensationalism (number 0 to 1), reasoning (string).",
      "No markdown, no code blocks, no extra text. Just the JSON object.",
    ].join("\n"),

    "international": [
      "You are a neutral international media analyst from a non-US perspective.",
      "Analyze claims for political bias and sensationalism objectively.",
      "Consider how the framing might appear to audiences outside the US political context.",
      "Return ONLY valid JSON with these fields: politicalBias (number -1 to 1), sensationalism (number 0 to 1), reasoning (string).",
      "No markdown, no code blocks, no extra text. Just the JSON object.",
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

async function assessBias(
  assistantId: string,
  claims: string[],
  ocrText: string,
  sources: Source[],
  perspectiveLabel: string
): Promise<ModelBiasAssessment> {
  const srcBlock = sources.length > 0
    ? sources.slice(0, 5).map((s, i) => `[${i + 1}] ${s.title} (${s.domain})\n${s.snippet}`).join("\n\n")
    : "";

  const contextBlock = ocrText
    ? `ORIGINAL TEXT:\n${ocrText.slice(0, 800)}`
    : "";

  const userMessage = `CLAIMS TO ANALYZE:
${claims.map((c, i) => `${i + 1}. "${c}"`).join("\n")}

${contextBlock}

${srcBlock ? `SOURCES:\n${srcBlock}` : ""}

Analyze the language, framing, and tone of these claims for political bias and sensationalism. Return JSON with politicalBias (number -1 to 1), sensationalism (number 0 to 1), and reasoning (string).`;

  try {
    // Create thread
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

    // Send message
    const formData = new URLSearchParams();
    formData.append("content", userMessage);
    formData.append("stream", "false");
    formData.append("llm_provider", "openai");
    formData.append("model_name", "gpt-4o");

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

    // Parse JSON from response
    content = content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/```(?:json)?\n?/g, "").replace(/```\s*$/g, "").trim();
    }

    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error(`No JSON found in ${perspectiveLabel} response: ${content.slice(0, 200)}`);
    }

    const jsonStr = content.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonStr) as any;

    return {
      politicalBias: Math.max(-1, Math.min(1, parsed.politicalBias || 0)),
      sensationalism: Math.max(0, Math.min(1, parsed.sensationalism || 0.3)),
      reasoning: parsed.reasoning || "Bias assessment completed.",
    };
  } catch (err: any) {
    console.error(`[BiasDetection] ${perspectiveLabel} failed:`, err.message);
    return {
      politicalBias: 0,
      sensationalism: 0.3,
      reasoning: `Error: ${err.message}`,
    };
  }
}

// ──────────────────────────────────────────────
//  Main export: 3 parallel calls, returns BiasSignals
// ──────────────────────────────────────────────

export async function detectBias(
  claims: string[],
  ocrText: string,
  sources: Source[]
): Promise<BiasSignals> {
  console.log(`[BiasDetection] Starting 3-perspective analysis for ${claims.length} claim(s)…`);

  // Step 1: Get/create 3 perspective assistants (parallel)
  const [leftId, rightId, intlId] = await Promise.all([
    getOrCreatePerspectiveAssistant("us-left"),
    getOrCreatePerspectiveAssistant("us-right"),
    getOrCreatePerspectiveAssistant("international"),
  ]);

  // Step 2: Run 3 assessments in parallel (one per perspective)
  const [leftResult, rightResult, intlResult] = await Promise.all([
    assessBias(leftId, claims, ocrText, sources, "US Left"),
    assessBias(rightId, claims, ocrText, sources, "US Right"),
    assessBias(intlId, claims, ocrText, sources, "International"),
  ]);

  console.log(`[BiasDetection] Results:`, {
    left: { bias: leftResult.politicalBias, sens: leftResult.sensationalism },
    right: { bias: rightResult.politicalBias, sens: rightResult.sensationalism },
    intl: { bias: intlResult.politicalBias, sens: intlResult.sensationalism },
  });

  // Step 3: Aggregate
  const allBiases = [leftResult.politicalBias, rightResult.politicalBias, intlResult.politicalBias];
  const allSens = [leftResult.sensationalism, rightResult.sensationalism, intlResult.sensationalism];

  const avgBias = allBiases.reduce((s, b) => s + b, 0) / 3;
  const avgSens = allSens.reduce((s, b) => s + b, 0) / 3;

  const stdDev = calculateStdDev(allBiases);
  const confidence = Math.max(0, Math.min(1, 1 - stdDev));

  let agreement: "high" | "medium" | "low";
  if (stdDev < 0.15) agreement = "high";
  else if (stdDev < 0.35) agreement = "medium";
  else agreement = "low";

  // Determine overall bias label
  let overallBias: BiasSignals["overallBias"];
  if (avgBias < -0.5) overallBias = "left";
  else if (avgBias < -0.15) overallBias = "slight_left";
  else if (avgBias > 0.5) overallBias = "right";
  else if (avgBias > 0.15) overallBias = "slight_right";
  else overallBias = "center";

  // Key signals from all reasoning
  const allReasoning = [leftResult.reasoning, rightResult.reasoning, intlResult.reasoning].join(" ");
  const keySignals = extractKeySignals(allReasoning);

  // Explanation
  const biasDesc = avgBias < -0.3 ? "left-leaning" : avgBias > 0.3 ? "right-leaning" : "relatively neutral";
  const sensDesc = avgSens > 0.7 ? "highly sensational" : avgSens > 0.4 ? "moderately sensational" : "low sensationalism";
  const agreeDesc = agreement === "high" ? "strong" : agreement === "medium" ? "moderate" : "low";
  const explanation = `3-perspective analysis (US Left, US Right, International) shows ${biasDesc} framing with ${sensDesc}. ${agreeDesc} agreement among perspectives. Key signals: ${keySignals.slice(0, 3).join(", ")}.`;

  console.log(`[BiasDetection] ✅ Done — bias: ${avgBias.toFixed(2)}, sens: ${avgSens.toFixed(2)}, agreement: ${agreement}`);

  return {
    politicalBias: Math.round(avgBias * 100) / 100,
    sensationalism: Math.round(avgSens * 100) / 100,
    overallBias,
    explanation,
    confidence,
    agreement,
    perspectives: {
      usLeft: {
        bias: Math.round(leftResult.politicalBias * 100) / 100,
        sensationalism: Math.round(leftResult.sensationalism * 100) / 100,
        consensus: 1, // single model, consensus is 1
      },
      usRight: {
        bias: Math.round(rightResult.politicalBias * 100) / 100,
        sensationalism: Math.round(rightResult.sensationalism * 100) / 100,
        consensus: 1,
      },
      international: {
        bias: Math.round(intlResult.politicalBias * 100) / 100,
        sensationalism: Math.round(intlResult.sensationalism * 100) / 100,
        consensus: 1,
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
  if (lower.includes("neutral") || lower.includes("balanced")) signals.push("Balanced reporting");
  if (lower.includes("factual") || lower.includes("objective")) signals.push("Factual tone");

  return signals.length > 0 ? signals : ["Standard reporting"];
}
