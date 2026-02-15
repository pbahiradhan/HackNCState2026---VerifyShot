// POST /api/save-memory
// Saves analysis results to Backboard.io memory
// so the chat assistant can recall past analyses
//
// Accepts: { jobId: string, content: string }
// Returns: { ok: true }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { saveAnalysisToMemory } from "../lib/backboardHttp";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { content } = req.body ?? {};

    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "content (string) is required" });
    }

    if (!process.env.BACKBOARD_API_KEY) {
      return res.status(500).json({ error: "BACKBOARD_API_KEY not configured" });
    }

    await saveAnalysisToMemory(content);

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[/api/save-memory] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
