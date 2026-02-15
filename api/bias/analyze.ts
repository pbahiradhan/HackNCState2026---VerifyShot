// POST /api/bias/analyze
// Body: { jobId, ocrText, claims: string[] }
// Returns: BiasAnalysisResult with model updates

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { detectBiasWithTransparency } from "../../lib/biasDetection";

export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { jobId, ocrText, claims } = req.body ?? {};

    if (!jobId || !ocrText || !Array.isArray(claims)) {
      return res.status(400).json({
        error: "jobId, ocrText, and claims (array) are required",
      });
    }

    if (!process.env.BACKBOARD_API_KEY) {
      return res.status(500).json({
        error: "BACKBOARD_API_KEY not set in environment variables",
      });
    }

    console.log(`[/api/bias/analyze] Job ${jobId} — starting bias analysis for ${claims.length} claim(s)`);

    // Run bias detection with transparency
    const result = await detectBiasWithTransparency(
      claims,
      ocrText,
      jobId,
      (update) => {
        console.log(`[/api/bias/analyze] Model update: ${update.perspective} - ${update.modelName} - ${update.status}`);
      }
    );

    // result.modelAssessments already contains only "complete" updates from detectBiasWithTransparency
    console.log(`[/api/bias/analyze] Job ${jobId} — bias analysis complete ✅ (${result.modelAssessments.length} assessments)`);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[/api/bias/analyze] Error:", err.message);
    console.error("[/api/bias/analyze] Stack:", err.stack);
    
    let errorMsg = err.message || "Bias analysis failed";
    let hint = "Check Vercel function logs for details";
    
    if (errorMsg.includes("BACKBOARD_API_KEY")) {
      hint = "Set BACKBOARD_API_KEY in Vercel → Settings → Environment Variables";
    } else if (errorMsg.includes("credits") || errorMsg.includes("quota")) {
      hint = "Check your Backboard.io account has credits available";
    }
    
    return res.status(500).json({
      error: errorMsg,
      hint,
    });
  }
}
