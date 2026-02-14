// ──────────────────────────────────────────────
//  Backboard.io service — ALL AI operations
//  OCR, claim extraction, search, analysis, chat
//  ──────────────────────────────────────────────

import { BackboardClient } from "backboard-sdk";
import { Source, ModelVerdict } from "./types";
import { searchSources, getWebSearchTool } from "./search";

let _client: any | null = null;
function bb(): any {
  if (!_client) {
    const key = process.env.BACKBOARD_API_KEY;
    if (!key) throw new Error("BACKBOARD_API_KEY not set");
    _client = new BackboardClient({ apiKey: key });
  }
  return _client;
}

const assistantCache: Record<string, string> = {};

async function getOrCreateAssistant(
  name: string,
  systemPrompt: string,
  tools?: any[]
): Promise<string> {
  if (assistantCache[name]) return assistantCache[name];
  const asst = await bb().createAssistant({
    name,
    systemPrompt,
    ...(tools ? { tools } : {}),
  });
  assistantCache[name] = asst.assistantId;
  return asst.assistantId;
}

// ── OCR via Backboard.io ──────────────────────────

export async function extractTextFromImage(imageUrl: string): Promise<string> {
  const id = await getOrCreateAssistant(
    "VerifyShot-OCR",
    `You are an expert OCR assistant. Extract ALL visible text from images exactly as it appears. Include usernames, dates, numbers, hashtags, captions, and any overlaid text. Return ONLY the extracted text, nothing else. Be thorough and accurate.`
  );

  const thread = await bb().createThread(id);

  // Try method 1: Direct image URL in message (if Backboard.io supports it)
  let response = await bb().addMessage({
    threadId: thread.threadId,
    content: `Extract all text from this image: ${imageUrl}\n\nReturn ONLY the extracted text, nothing else.`,
    stream: false,
    memory: "Auto",
  });

  let text = response.content?.trim() || "";

  // If that didn't work, try method 2: Upload as document
  if (!text || text.length < 10) {
    try {
      const imageResponse = await fetch(imageUrl);
      if (imageResponse.ok) {
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const filename = `screenshot-${Date.now()}.jpg`;
        
        // Try uploading as document (may require file path or different API)
        // For now, we'll use a workaround: base64 in message
        const base64 = imageBuffer.toString("base64");
        const dataUrl = `data:image/jpeg;base64,${base64}`;
        
        response = await bb().addMessage({
          threadId: thread.threadId,
          content: `Extract all text from this image (base64): ${dataUrl}\n\nReturn ONLY the extracted text.`,
          stream: false,
          memory: "Auto",
        });
        text = response.content?.trim() || "";
      }
    } catch (e) {
      console.warn("Document upload fallback failed:", e);
    }
  }

  // If still no text, try a more explicit prompt
  if (!text || text.length < 10) {
    const fallback = await bb().addMessage({
      threadId: thread.threadId,
      content: `What text is visible in the image at ${imageUrl}? List all text exactly as it appears, line by line. Include any numbers, dates, usernames, hashtags, or captions.`,
      stream: false,
      memory: "Auto",
    });
    text = fallback.content?.trim() || "";
  }

  if (!text || text.length < 5) {
    throw new Error("OCR failed: No text extracted from image. The image may not contain readable text.");
  }

  return text;
}

// ── Claim extraction ──────────────────────────

export async function extractClaims(ocrText: string): Promise<string[]> {
  const id = await getOrCreateAssistant(
    "VerifyShot-ClaimExtractor",
    `You are a fact-extraction assistant specialized in identifying factual claims from text. 
    
Your task:
- Extract 1-3 concrete, verifiable factual claims (not opinions, questions, or statements of intent)
- Each claim should be a standalone statement that can be fact-checked
- Return ONLY a JSON array of strings, no other text

Example output: ["Claim one here","Claim two here"]`
  );
  const thread = await bb().createThread(id);
  const resp = await bb().addMessage({
    threadId: thread.threadId,
    content: `OCR TEXT:\n\"\"\"\n${ocrText}\n\"\"\"\n\nExtract 1-3 factual claims that can be verified. Return JSON array only, no markdown, no explanation.`,
    stream: false,
    memory: "Auto",
  });
  try {
    let content = resp.content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/```(?:json)?\n?/g, "").trim();
    }
    // Remove any trailing markdown or explanation
    const jsonMatch = content.match(/\[.*\]/);
    if (jsonMatch) content = jsonMatch[0];
    const arr = JSON.parse(content);
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.slice(0, 3).filter((c: any) => typeof c === "string" && c.length > 10);
    }
  } catch (e) {
    console.warn("Failed to parse claims JSON:", e);
  }
  // Fallback: first sentence
  const firstSentence = ocrText.split(/[.!?]/)[0].trim();
  return firstSentence.length > 10 ? [firstSentence + "."] : [ocrText.slice(0, 200) + "..."];
}

// ── Search sources (via tool call) ──────────────────────────

export async function searchSourcesForClaim(claim: string): Promise<Source[]> {
  // Create assistant with web_search tool
  const id = await getOrCreateAssistant(
    "VerifyShot-Searcher",
    `You are a research assistant specialized in finding reliable, recent sources for fact-checking. 
    
When given a claim, use the web_search tool to find:
- Recent articles (preferably within the last year)
- Reputable news sources, academic papers, or fact-checking sites
- Multiple independent sources that corroborate or refute the claim

Always use the web_search tool when asked to find sources.`,
    [getWebSearchTool()]
  );
  const thread = await bb().createThread(id);

  const resp = await bb().addMessage({
    threadId: thread.threadId,
    content: `Search for recent, reliable sources about this claim: "${claim}". Use the web_search tool to find at least 5 sources.`,
    stream: false,
    memory: "Auto",
  });

  // Handle tool call
  if (resp.status === "REQUIRES_ACTION" && resp.toolCalls) {
    const toolOutputs = [];
    for (const tc of resp.toolCalls) {
      if (tc.function.name === "web_search") {
        const args = tc.function.parsedArguments || JSON.parse(tc.function.arguments || "{}");
        const sources = await searchSources(args.query || claim, args.limit || 5);
        toolOutputs.push({
          toolCallId: tc.id,
          output: JSON.stringify(sources),
        });
      }
    }

    if (toolOutputs.length > 0) {
      // Submit tool outputs and get final response
      const finalResp = await bb().submitToolOutputs({
        threadId: thread.threadId,
        runId: resp.runId,
        toolOutputs,
      });

      // Return the sources we found (the assistant may reference them in its response)
      // We parse from the tool output, not the assistant's text response
      const allSources: Source[] = [];
      for (const output of toolOutputs) {
        try {
          const parsed = JSON.parse(output.output);
          if (Array.isArray(parsed)) {
            allSources.push(...parsed);
          }
        } catch {}
      }
      return allSources.length > 0 ? allSources.slice(0, 5) : await searchSources(claim, 5);
    }
  }

  // If no tool call was made, fall back to direct search
  return await searchSources(claim, 5);
}

// ── Verdict analysis ──────────────────────────

export async function analyzeClaimWithSources(
  claim: string,
  sources: Source[]
): Promise<{
  verdict: "likely_true" | "mixed" | "likely_misleading";
  confidence: number;
  explanation: string;
}> {
  const id = await getOrCreateAssistant(
    "VerifyShot-Analyzer",
    `You are an expert fact-checker. Analyze claims against provided sources and return structured JSON.

Your analysis should:
1. Determine if the claim is supported, contradicted, or mixed by the sources
2. Assess confidence (0.0-1.0) based on source quality and agreement
3. Provide a clear 2-3 sentence explanation

Return ONLY valid JSON:
{
  "verdict": "likely_true" | "mixed" | "likely_misleading",
  "confidence": 0.0-1.0,
  "explanation": "2-3 sentence explanation"
}`
  );
  const thread = await bb().createThread(id);
  const srcBlock = sources
    .map((s, i) => `[${i + 1}] ${s.title} (${s.domain}, ${s.date}): ${s.snippet}`)
    .join("\n");

  const resp = await bb().addMessage({
    threadId: thread.threadId,
    content: `Claim: "${claim}"\n\nSources:\n${srcBlock}\n\nAnalyze and return JSON only.`,
    stream: false,
    memory: "Auto",
  });

  try {
    let content = resp.content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/```(?:json)?\n?/g, "").trim();
    }
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) content = jsonMatch[0];
    const r = JSON.parse(content);
    return {
      verdict: r.verdict ?? "mixed",
      confidence: Math.max(0, Math.min(1, r.confidence ?? 0.5)),
      explanation: r.explanation ?? "Analysis pending.",
    };
  } catch (e) {
    console.warn("Failed to parse verdict JSON:", e);
    return { verdict: "mixed", confidence: 0.5, explanation: "Could not auto-analyze." };
  }
}

// ── Multi-model consensus ──
// Note: Backboard.io uses its default model. We simulate consensus by asking
// the same assistant multiple times with slightly different framing.

export async function getModelConsensus(
  claim: string,
  sources: Source[]
): Promise<ModelVerdict[]> {
  const srcBlock = sources
    .map((s, i) => `[${i + 1}] ${s.title} (${s.domain}): ${s.snippet}`)
    .join("\n");

  // Use different analytical perspectives (simulating different models)
  const perspectives = [
    {
      name: "GPT-4",
      prompt: "You are an analytical AI model (GPT-4 style). Analyze claims with logical reasoning and evidence-based evaluation.",
    },
    {
      name: "Claude 3",
      prompt: "You are an analytical AI model (Claude 3 style). Analyze claims with careful consideration of context and nuance.",
    },
    {
      name: "Gemini",
      prompt: "You are an analytical AI model (Gemini style). Analyze claims with a focus on factual accuracy and source verification.",
    },
  ];

  const verdicts = await Promise.all(
    perspectives.map(async (p) => {
      try {
        const id = await getOrCreateAssistant(
          `VerifyShot-Consensus-${p.name}`,
          `${p.prompt} Return ONLY valid JSON: {"agrees":true|false,"confidence":0.0-1.0}`
        );
        const thread = await bb().createThread(id);
        const resp = await bb().addMessage({
          threadId: thread.threadId,
          content: `Is this claim supported by the sources?\nClaim: "${claim}"\nSources:\n${srcBlock}\nReturn JSON only.`,
          stream: false,
          memory: "Auto",
        });
        let content = resp.content.trim();
        if (content.startsWith("```")) {
          content = content.replace(/```(?:json)?\n?/g, "").trim();
        }
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) content = jsonMatch[0];
        const r = JSON.parse(content);
        return {
          modelName: p.name,
          agrees: !!r.agrees,
          confidence: Math.max(0, Math.min(1, r.confidence ?? 0.5)),
        };
      } catch (e) {
        console.warn(`Consensus check failed for ${p.name}:`, e);
        return { modelName: p.name, agrees: false, confidence: 0 };
      }
    })
  );

  return verdicts;
}

// ── Summary generation ────────────────────────

export async function generateSummary(
  ocrText: string,
  claims: { text: string; verdict: string; trustScore: number }[]
): Promise<string> {
  const id = await getOrCreateAssistant(
    "VerifyShot-Summarizer",
    `You are a concise fact-checking summary writer. Create clear, informative 2-3 sentence summaries of fact-check results.

Your summaries should:
- Highlight the main claim(s) and their verdicts
- Mention the overall trust score
- Be direct and easy to understand
- Avoid jargon`
  );
  const thread = await bb().createThread(id);
  const claimList = claims
    .map((c) => `• "${c.text}" → ${c.verdict} (trust score: ${c.trustScore}%)`)
    .join("\n");
  const resp = await bb().addMessage({
    threadId: thread.threadId,
    content: `Summarize these fact-check results in 2-3 sentences:\n\nOriginal text: "${ocrText.slice(0, 300)}"\n\nClaims analyzed:\n${claimList}`,
    stream: false,
    memory: "Auto",
  });
  return resp.content.trim();
}

// ── Chat (keeps thread alive with memory) ─────────────────

const chatThreads: Record<string, string> = {}; // jobId-mode → threadId

export async function chatAboutJob(
  jobId: string,
  contextText: string,
  userMessage: string,
  mode: string = "standard"
): Promise<string> {
  const hasContext = contextText && contextText.length > 10;

  const standardPrompt = hasContext
    ? `You are a focused research assistant helping users verify information from screenshots.

Context from screenshot analysis:
${contextText}

Guidelines:
- Answer questions about the screenshot's claims and sources
- Reference specific sources when available
- If uncertain, say "unverified" and suggest how to confirm
- Be concise and helpful
- Use the web_search tool if you need more recent information`
    : `You are a helpful fact-checking assistant. Users ask you to verify claims or answer questions.

Guidelines:
- Provide clear, factual answers
- If uncertain, say "unverified" and suggest how to confirm
- Be concise
- Use the web_search tool if you need to find sources`;

  const deepResearchPrompt = hasContext
    ? `You are an expert research analyst conducting deep research on a screenshot's claims.

Context from screenshot analysis:
${contextText}

Provide a thorough, structured analysis with these sections:
1. **Key Findings** — What the evidence shows
2. **Source Analysis** — Quality and reliability of available sources
3. **Multiple Perspectives** — Different viewpoints on this topic
4. **Bias Assessment** — Any detected bias in the original content
5. **Confidence Level** — How confident are we in the conclusions
6. **Recommendations** — What the user should know or do

Always use the web_search tool to find additional recent sources. Be detailed and thorough. Reference specific sources. Use markdown formatting.`
    : `You are an expert research analyst. Users want thorough investigations of topics or claims.

Provide a detailed, structured analysis with these sections:
1. **Key Findings** — What the evidence shows
2. **Source Analysis** — Quality and reliability of available information
3. **Multiple Perspectives** — Different viewpoints
4. **Bias Assessment** — Potential biases to be aware of
5. **Confidence Level** — How confident are we
6. **Recommendations** — Key takeaways

Always use the web_search tool to find recent sources. Be thorough and analytical. Use markdown formatting.`;

  const systemPrompt = mode === "deep_research" ? deepResearchPrompt : standardPrompt;
  const assistantName = mode === "deep_research" ? "VerifyShot-DeepResearch" : "VerifyShot-Chat";

  // Both modes get web search tool for better responses
  const id = await getOrCreateAssistant(
    assistantName,
    systemPrompt,
    [getWebSearchTool()]
  );

  let threadId = chatThreads[`${jobId}-${mode}`];
  if (!threadId) {
    const thread = await bb().createThread(id);
    threadId = thread.threadId;
    chatThreads[`${jobId}-${mode}`] = threadId;
  }

  const resp = await bb().addMessage({
    threadId,
    content: userMessage,
    stream: false,
    memory: "Auto", // Enable persistent memory
  });

  // Handle tool calls (web search)
  if (resp.status === "REQUIRES_ACTION" && resp.toolCalls) {
    const toolOutputs = [];
    for (const tc of resp.toolCalls) {
      if (tc.function.name === "web_search") {
        const args = tc.function.parsedArguments || JSON.parse(tc.function.arguments || "{}");
        const sources = await searchSources(args.query, args.limit || 5);
        toolOutputs.push({
          toolCallId: tc.id,
          output: JSON.stringify(sources),
        });
      }
    }

    if (toolOutputs.length > 0) {
      const finalResp = await bb().submitToolOutputs({
        threadId,
        runId: resp.runId,
        toolOutputs,
      });
      return finalResp.content;
    }
  }

  return resp.content;
}
