// POST /api/chat
// Accepts: { message, jobId?, context?, mode? }
// Returns: { reply: string }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { chatAboutJob } from "../lib/backboard";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { jobId, message, context, mode } = req.body ?? {};
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const reply = await chatAboutJob(
      jobId || "text-query",
      context ?? "",
      message,
      mode ?? "standard"
    );
    return res.status(200).json({ reply });
  } catch (err: any) {
    console.error("Chat error:", err);
    return res.status(500).json({ error: err.message });
  }
}
