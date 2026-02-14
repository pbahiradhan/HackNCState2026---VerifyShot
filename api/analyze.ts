// POST /api/analyze
// Accepts: { imageUrl: string } OR { image: "<base64>" }
// Returns: full AnalysisResult JSON

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { analyzeImage } from "../lib/analyzer";

export const maxDuration = 60; // Vercel function timeout

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    let { imageUrl, image, filename } = req.body ?? {};
    const jobId = uuidv4();

    console.log(`[/api/analyze] Job ${jobId} — received request`);

    // If base64 image provided, upload to Vercel Blob
    if (!imageUrl && image) {
      const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
      if (!blobToken) {
        return res.status(500).json({
          error: "Server misconfigured: BLOB_READ_WRITE_TOKEN not set",
        });
      }

      console.log(`[/api/analyze] Uploading base64 image to blob…`);
      const buffer = Buffer.from(image, "base64");
      const name = filename || `screenshot-${Date.now()}.jpg`;
      const blob = await put(name, buffer, {
        access: "public",
        token: blobToken,
      });
      imageUrl = blob.url;
      console.log(`[/api/analyze] Uploaded: ${imageUrl}`);
    }

    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl or image (base64) required" });
    }

    // Verify required env vars before starting
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Server misconfigured: GEMINI_API_KEY not set (required for OCR)",
      });
    }
    if (!process.env.BACKBOARD_API_KEY) {
      return res.status(500).json({
        error: "Server misconfigured: BACKBOARD_API_KEY not set (required for analysis)",
      });
    }

    // Run full analysis
    const result = await analyzeImage(imageUrl, jobId);
    console.log(`[/api/analyze] Job ${jobId} — complete ✅`);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[/api/analyze] Error:", err.message);
    console.error(err.stack);
    return res.status(500).json({
      error: err.message || "Analysis failed",
      hint: "Check Vercel function logs for details",
    });
  }
}
