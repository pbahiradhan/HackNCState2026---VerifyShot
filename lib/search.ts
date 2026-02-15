// ──────────────────────────────────────────────
//  Web Search — Perplexity sonar-pro via Backboard.io
//  Built-in web search, no separate API keys needed.
//  Legacy Google Custom Search fallback kept for optional use.
// ──────────────────────────────────────────────

import { Source } from "./types";

// Domain reputation → credibility score
const DOMAIN_SCORES: Record<string, number> = {
  // Wire services (highest)
  "reuters.com": 0.95, "apnews.com": 0.95, "ap.org": 0.95,
  // International broadsheets
  "bbc.com": 0.92, "bbc.co.uk": 0.92,
  "nytimes.com": 0.90, "washingtonpost.com": 0.88,
  "theguardian.com": 0.88, "wsj.com": 0.88,
  "economist.com": 0.90, "ft.com": 0.90,
  // Business / finance
  "cnbc.com": 0.85, "bloomberg.com": 0.88, "forbes.com": 0.78,
  "businessinsider.com": 0.72, "marketwatch.com": 0.78,
  "finance.yahoo.com": 0.72, "barrons.com": 0.82,
  // Science / academic
  "nature.com": 0.95, "science.org": 0.95, "sciencedirect.com": 0.92,
  "pubmed.ncbi.nlm.nih.gov": 0.95, "arxiv.org": 0.85,
  "scholar.google.com": 0.85, "nih.gov": 0.92,
  // US TV networks
  "cnn.com": 0.75, "nbcnews.com": 0.75, "abcnews.go.com": 0.75,
  "cbsnews.com": 0.75, "foxnews.com": 0.70, "msnbc.com": 0.72,
  // US newspapers / news
  "usatoday.com": 0.75, "latimes.com": 0.80, "chicagotribune.com": 0.78,
  "nypost.com": 0.65, "politico.com": 0.78, "thehill.com": 0.76,
  "axios.com": 0.78, "theatlantic.com": 0.82, "vox.com": 0.72,
  "npr.org": 0.88, "pbs.org": 0.88,
  // International
  "aljazeera.com": 0.78, "dw.com": 0.80, "france24.com": 0.80,
  "scmp.com": 0.75, "japantimes.co.jp": 0.78,
  // Fact-checkers
  "snopes.com": 0.88, "factcheck.org": 0.90, "politifact.com": 0.88,
  // Tech
  "techcrunch.com": 0.75, "theverge.com": 0.72, "arstechnica.com": 0.78,
  "wired.com": 0.75,
  // Reference
  "wikipedia.org": 0.70,
};

function credibilityForDomain(hostname: string): number {
  const h = hostname.replace(/^www\./, "").toLowerCase();
  if (DOMAIN_SCORES[h]) return DOMAIN_SCORES[h];
  if (h.endsWith(".gov") || h.endsWith(".gov.uk")) return 0.92;
  if (h.endsWith(".edu")) return 0.85;
  if (h.endsWith(".org")) return 0.65;
  return 0.50;
}

// ──────────────────────────────────────────────
//  PRIMARY: AI-powered search via Perplexity
//  Uses Backboard.io → OpenRouter → Perplexity sonar-pro
//  Perplexity has built-in web search — returns grounded results with citations.
//  No separate Google API keys needed.
// ──────────────────────────────────────────────

const BB_URL = "https://app.backboard.io/api";
const searchAssistantCache: Record<string, string> = {};

function bbHeaders(contentType: string = "application/json"): Record<string, string> {
  const key = process.env.BACKBOARD_API_KEY;
  if (!key) throw new Error("BACKBOARD_API_KEY not set");
  return {
    "X-API-Key": key,
    "Content-Type": contentType,
  };
}

async function getOrCreateSearchAssistant(name: string, systemPrompt: string): Promise<string> {
  if (searchAssistantCache[name]) return searchAssistantCache[name];

  // Check if assistant already exists
  const listRes = await fetch(`${BB_URL}/assistants`, {
    headers: bbHeaders(),
  });

  if (listRes.ok) {
    const assistants = (await listRes.json()) as any[];
    const existing = Array.isArray(assistants)
      ? assistants.find((a: any) => a.name === name)
      : null;
    if (existing?.assistant_id) {
      searchAssistantCache[name] = existing.assistant_id;
      return existing.assistant_id;
    }
  }

  const createRes = await fetch(`${BB_URL}/assistants`, {
    method: "POST",
    headers: bbHeaders(),
    body: JSON.stringify({
      name,
      system_prompt: systemPrompt,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create search assistant: ${createRes.status} - ${err}`);
  }

  const assistant = (await createRes.json()) as any;
  searchAssistantCache[name] = assistant.assistant_id;
  return assistant.assistant_id;
}

/**
 * Search the web using Perplexity sonar-pro via Backboard.
 * Perplexity has built-in web search — no Google API keys needed.
 *
 * Strategy: Let Perplexity respond naturally (it returns prose with inline
 * citations and source URLs), then parse the response for structured sources.
 */
export async function searchWithAI(query: string, limit = 5): Promise<Source[]> {
  const key = process.env.BACKBOARD_API_KEY;
  if (!key) {
    console.warn("[Search-AI] No BACKBOARD_API_KEY — cannot search");
    return [];
  }

  console.log(`[Search-AI] Searching: "${query.slice(0, 80)}…" (limit: ${limit})`);

  try {
    // ── Step 1: Get Perplexity response with web-grounded sources ──
    // NO curly braces in system prompt (Backboard uses Python .format())
    const perplexityPrompt = [
      "You are a fact-checking research assistant.",
      "When given a topic or claim, search the web for the most relevant and recent sources.",
      "For EACH source you find, write one line in this EXACT format:",
      "",
      "SOURCE: title of the article | https://full-url-here | a brief 1-2 sentence summary of what the article says | YYYY-MM-DD",
      "",
      "List between 3 and 8 sources, one per line, each starting with SOURCE:",
      "Prefer reputable outlets: Reuters, AP, BBC, NYT, WashPost, Snopes, PolitiFact, CNN, NPR, PBS, etc.",
      "ONLY output SOURCE: lines. No other commentary, no introductions, no conclusions.",
    ].join("\n");

    const assistantId = await getOrCreateSearchAssistant("VerifyShot-WebSearch-v3", perplexityPrompt);

    // Create thread
    const threadRes = await fetch(`${BB_URL}/assistants/${assistantId}/threads`, {
      method: "POST",
      headers: bbHeaders(),
      body: JSON.stringify({}),
    });

    if (!threadRes.ok) {
      throw new Error(`Thread creation failed: ${threadRes.status}`);
    }

    const thread = (await threadRes.json()) as any;
    const threadId = thread.thread_id;

    // Send search request
    const userMessage = `Find ${limit} reliable, recent news sources about this topic:\n\n"${query}"`;

    const formData = new URLSearchParams();
    formData.append("content", userMessage);
    formData.append("stream", "false");
    formData.append("memory", "Off");
    formData.append("llm_provider", "openrouter");
    formData.append("model_name", "perplexity/sonar-pro");

    const msgRes = await fetch(`${BB_URL}/threads/${threadId}/messages`, {
      method: "POST",
      headers: bbHeaders("application/x-www-form-urlencoded"),
      body: formData.toString(),
    });

    if (!msgRes.ok) {
      const errText = await msgRes.text();
      console.error(`[Search-AI] Perplexity failed: ${msgRes.status} - ${errText}`);

      // Fallback: try GPT-4o-mini (no web search but can use knowledge)
      console.log(`[Search-AI] Falling back to GPT-4o-mini…`);
      return await searchWithGPTFallback(threadId, query, limit);
    }

    const resp = (await msgRes.json()) as any;
    const content = resp.content || resp.message?.content || "";

    console.log(`[Search-AI] Perplexity response (${content.length} chars): ${content.slice(0, 300)}…`);

    // ── Step 2: Parse the Perplexity response ──
    const sources = parsePerplexityResponse(content);

    if (sources.length > 0) {
      console.log(`[Search-AI] ✅ Parsed ${sources.length} source(s) from Perplexity`);
      return sources;
    }

    // If structured parsing found nothing, try JSON parsing
    console.log(`[Search-AI] Structured parsing found 0 sources, trying JSON…`);
    const jsonSources = tryParseJSON(content);
    if (jsonSources.length > 0) {
      console.log(`[Search-AI] ✅ Parsed ${jsonSources.length} source(s) from JSON`);
      return jsonSources;
    }

    // Last resort: extract URLs with surrounding context
    const urlSources = extractURLsWithContext(content);
    console.log(`[Search-AI] Extracted ${urlSources.length} source(s) from URL extraction`);
    return urlSources;

  } catch (err: any) {
    console.error(`[Search-AI] Error:`, err.message);
    return [];
  }
}

/**
 * Fallback search using GPT-4o-mini when Perplexity is unavailable.
 */
async function searchWithGPTFallback(threadId: string, query: string, limit: number): Promise<Source[]> {
  const userMessage = `Find ${limit} reliable, recent news sources about this topic:\n\n"${query}"`;
  const fallbackData = new URLSearchParams();
  fallbackData.append("content", userMessage);
  fallbackData.append("stream", "false");
  fallbackData.append("memory", "Off");
  fallbackData.append("llm_provider", "openai");
  fallbackData.append("model_name", "gpt-4o-mini");

  const fallbackRes = await fetch(`${BB_URL}/threads/${threadId}/messages`, {
    method: "POST",
    headers: bbHeaders("application/x-www-form-urlencoded"),
    body: fallbackData.toString(),
  });

  if (!fallbackRes.ok) {
    const err = await fallbackRes.text();
    throw new Error(`GPT fallback search also failed: ${fallbackRes.status} - ${err}`);
  }

  const fallbackResp = (await fallbackRes.json()) as any;
  const content = fallbackResp.content || "";
  const sources = tryParseJSON(content);
  if (sources.length > 0) return sources;
  return extractURLsWithContext(content);
}

/**
 * Parse Perplexity's structured SOURCE: lines.
 * Format: SOURCE: title | url | snippet | date
 */
function parsePerplexityResponse(content: string): Source[] {
  if (!content || content.length < 10) return [];

  const sources: Source[] = [];
  const seenUrls = new Set<string>();

  // Method 1: Parse "SOURCE:" lines
  const sourceLineRegex = /SOURCE:\s*(.+)/gi;
  let match;
  while ((match = sourceLineRegex.exec(content)) !== null) {
    const line = match[1].trim();
    const parts = line.split("|").map(p => p.trim());

    if (parts.length >= 2) {
      const title = parts[0];
      const url = (parts[1] || "").replace(/[<>]/g, "");
      const snippet = parts[2] || "";
      const date = parts[3] || new Date().toISOString().split("T")[0];

      if (url && url.startsWith("http") && !seenUrls.has(url)) {
        seenUrls.add(url);
        let hostname = "";
        try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch { hostname = "unknown"; }
        sources.push({
          title: title || `Source from ${hostname}`,
          url,
          domain: hostname,
          date,
          credibilityScore: credibilityForDomain(hostname),
          snippet,
        });
      }
    }
  }

  if (sources.length > 0) return sources;

  // Method 2: Parse numbered list with URLs (e.g., "1. **Title** - snippet [URL]")
  const numberedRegex = /\d+\.\s*\*?\*?(.+?)\*?\*?\s*[-–—]\s*(.*?)(?:\[([^\]]+)\]|\((https?:\/\/[^\s\)]+)\))/g;
  while ((match = numberedRegex.exec(content)) !== null) {
    const title = match[1].trim().replace(/\*+/g, "");
    const snippet = match[2].trim();
    const url = (match[3] || match[4] || "").trim();

    if (url && url.startsWith("http") && !seenUrls.has(url)) {
      seenUrls.add(url);
      let hostname = "";
      try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch { hostname = "unknown"; }
      sources.push({
        title: title || `Source from ${hostname}`,
        url,
        domain: hostname,
        date: new Date().toISOString().split("T")[0],
        credibilityScore: credibilityForDomain(hostname),
        snippet,
      });
    }
  }

  if (sources.length > 0) return sources;

  // Method 3: Parse markdown links with context
  // Matches: [Title](URL) or [text](url) patterns with surrounding text as snippet
  const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
  const lines = content.split("\n");

  for (const line of lines) {
    mdLinkRegex.lastIndex = 0;
    while ((match = mdLinkRegex.exec(line)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();

      if (!seenUrls.has(url) && !url.includes("favicon")) {
        seenUrls.add(url);
        let hostname = "";
        try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch { hostname = "unknown"; }

        // Use the full line (minus the link) as snippet
        const snippet = line.replace(match[0], "").replace(/^\s*[-*\d.]+\s*/, "").trim();

        sources.push({
          title: title.length > 5 ? title : `Article from ${hostname}`,
          url,
          domain: hostname,
          date: new Date().toISOString().split("T")[0],
          credibilityScore: credibilityForDomain(hostname),
          snippet: snippet.length > 10 ? snippet : "",
        });
      }
    }
  }

  return sources;
}

/**
 * Try to parse a JSON array of source objects from the response.
 */
function tryParseJSON(content: string): Source[] {
  if (!content) return [];

  let text = content.trim();

  // Remove markdown code blocks
  if (text.startsWith("```")) {
    text = text.replace(/```(?:json)?\n?/g, "").replace(/```\s*$/g, "").trim();
  }

  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");

  if (firstBracket === -1 || lastBracket <= firstBracket) return [];

  try {
    let jsonStr = text.substring(firstBracket, lastBracket + 1);
    jsonStr = jsonStr
      .replace(/\\'/g, "'")
      .replace(/,\s*]/g, "]")
      .replace(/,\s*}/g, "}");

    const parsed = JSON.parse(jsonStr) as any[];
    return parsed
      .filter((s: any) => s.url && s.title)
      .map((s: any): Source => {
        let hostname = "";
        try { hostname = new URL(s.url).hostname.replace(/^www\./, ""); } catch { hostname = s.domain || "unknown"; }
        return {
          title: s.title,
          url: s.url,
          domain: hostname,
          date: s.date || new Date().toISOString().split("T")[0],
          credibilityScore: credibilityForDomain(hostname),
          snippet: s.snippet || s.description || "",
        };
      });
  } catch {
    return [];
  }
}

/**
 * Last-resort: extract URLs from plain text with surrounding context for titles/snippets.
 * Much smarter than the old "Source from domain.com" fallback.
 */
function extractURLsWithContext(content: string): Source[] {
  if (!content) return [];

  const urlRegex = /https?:\/\/[^\s\)\"'<>\]]+/g;
  const urls = content.match(urlRegex) || [];
  const sources: Source[] = [];
  const seenDomains = new Set<string>();

  for (const url of urls) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      if (seenDomains.has(hostname)) continue;
      seenDomains.add(hostname);

      // Try to find a title near the URL in the content
      const urlIdx = content.indexOf(url);
      const contextBefore = content.substring(Math.max(0, urlIdx - 200), urlIdx);
      const contextAfter = content.substring(urlIdx + url.length, Math.min(content.length, urlIdx + url.length + 200));

      // Look for a title: text in quotes, bold, or the preceding sentence
      let title = "";
      const titleFromBold = contextBefore.match(/\*\*([^*]+)\*\*\s*$/);
      const titleFromQuotes = contextBefore.match(/"([^"]+)"\s*$/);
      const titleFromLine = contextBefore.split("\n").pop()?.replace(/^\s*[-*\d.]+\s*/, "").trim();

      if (titleFromBold) title = titleFromBold[1];
      else if (titleFromQuotes) title = titleFromQuotes[1];
      else if (titleFromLine && titleFromLine.length > 10 && titleFromLine.length < 200) title = titleFromLine;
      else title = `Article from ${hostname}`;

      // Clean title from url and brackets
      title = title.replace(/\[|\]/g, "").replace(url, "").trim();
      if (title.length < 5) title = `Article from ${hostname}`;

      // Extract snippet from context after URL
      const snippet = contextAfter
        .split("\n")[0]
        ?.replace(/^\s*[-–|:]\s*/, "")
        .trim()
        .slice(0, 200) || "";

      sources.push({
        title,
        url,
        domain: hostname,
        date: new Date().toISOString().split("T")[0],
        credibilityScore: credibilityForDomain(hostname),
        snippet,
      });
    } catch {
      // Invalid URL, skip
    }
  }

  return sources;
}

// ──────────────────────────────────────────────
//  LEGACY: Google Custom Search (fallback)
// ──────────────────────────────────────────────

/**
 * Search using Google Custom Search API (requires GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID).
 * Returns empty array if keys not configured or API fails.
 */
export async function searchSources(query: string, limit = 5): Promise<Source[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !cx) {
    // Silently return empty — caller should use searchWithAI() instead
    return [];
  }
  
  console.log(`[Search-Google] Querying: "${query.slice(0, 80)}…" (limit: ${limit})`);

  const url =
    `https://www.googleapis.com/customsearch/v1` +
    `?key=${apiKey}&cx=${cx}` +
    `&q=${encodeURIComponent(query)}` +
    `&num=${Math.min(limit, 10)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Search-Google] API error ${res.status}: ${errText}`);
      return [];
    }

    const data = (await res.json()) as { items?: any[] };
    const items = data.items ?? [];
    console.log(`[Search-Google] Got ${items.length} result(s)`);
    return items.map((item: any): Source => {
      const hostname = new URL(item.link).hostname;
      return {
        title: item.title,
        url: item.link,
        domain: hostname.replace(/^www\./, ""),
        date:
          item.pagemap?.metatags?.[0]?.["article:published_time"] ??
          item.pagemap?.metatags?.[0]?.["og:updated_time"] ??
          new Date().toISOString().split("T")[0],
        credibilityScore: credibilityForDomain(hostname),
        snippet: item.snippet ?? "",
      };
    });
  } catch (error) {
    console.error("[Search-Google] Error:", error);
    return [];
  }
}

/**
 * Combined search: tries AI search first (Perplexity via Backboard),
 * falls back to Google if needed.
 */
export async function searchCombined(query: string, limit = 5): Promise<Source[]> {
  // Try AI search first (no Google API needed)
  let sources = await searchWithAI(query, limit);

  if (sources.length >= 2) {
    console.log(`[Search] ✅ Perplexity returned ${sources.length} source(s) — using them`);
    return sources;
  }

  // Fallback to Google (if configured)
  console.log(`[Search] Perplexity returned ${sources.length} result(s), trying Google fallback…`);
  const googleSources = await searchSources(query, limit);

  // Merge and deduplicate
  const seenUrls = new Set(sources.map(s => s.url));
  for (const gs of googleSources) {
    if (!seenUrls.has(gs.url)) {
      seenUrls.add(gs.url);
      sources.push(gs);
    }
  }

  console.log(`[Search] Combined total: ${sources.length} source(s)`);
  return sources;
}

/**
 * Tool definition for Backboard.io deep research assistants.
 */
export function getWebSearchTool() {
  return {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for recent, reliable sources about a factual claim. Returns articles with title, URL, domain, date, and snippet.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query about the claim",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 5)",
            default: 5,
          },
        },
        required: ["query"],
      },
    },
  };
}
