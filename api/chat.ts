// POST /api/chat
// Accepts: { message, jobId?, context?, mode? }
// Returns: { reply: string }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { chatAboutJob } from "../lib/backboard";

export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { jobId, message, context, mode } = req.body ?? {};

    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    if (!process.env.BACKBOARD_API_KEY) {
      return res.status(500).json({
        error: "Server misconfigured: BACKBOARD_API_KEY not set",
      });
    }

    console.log(`[/api/chat] mode=${mode || "standard"}, message="${(message as string).slice(0, 80)}…"`);

    const reply = await chatAboutJob(
      jobId || "text-query",
      context ?? "",
      message,
      mode ?? "standard"
    );

    console.log(`[/api/chat] Reply length: ${reply.length}`);
    return res.status(200).json({ reply });
  } catch (err: any) {
    console.error("[/api/chat] Error:", err.message);
    console.error(err.stack);
    return res.status(500).json({
      error: err.message || "Chat failed",
      hint: "Check Vercel function logs for details",
    });
  }
}
