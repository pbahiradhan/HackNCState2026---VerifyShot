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
    console.log(`[/api/analyze] Has imageUrl: ${!!imageUrl}, Has base64 image: ${!!image}`);

    // If base64 image provided, upload to Vercel Blob
    if (!imageUrl && image) {
      const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
      if (!blobToken) {
        return res.status(500).json({
          error: "Server misconfigured: BLOB_READ_WRITE_TOKEN not set",
          hint: "Set BLOB_READ_WRITE_TOKEN in Vercel → Settings → Environment Variables",
        });
      }

      console.log(`[/api/analyze] Base64 length: ${(image as string).length} chars`);
      console.log(`[/api/analyze] Uploading base64 image to blob…`);
      
      let buffer: Buffer;
      try {
        buffer = Buffer.from(image, "base64");
        console.log(`[/api/analyze] Buffer size: ${buffer.length} bytes (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
      } catch (e: any) {
        return res.status(400).json({
          error: "Invalid base64 image data",
          hint: "Image may be corrupted or too large",
        });
      }

      const name = filename || `screenshot-${Date.now()}.jpg`;
      let blob;
      try {
        blob = await put(name, buffer, {
          access: "public",
          token: blobToken,
        });
        imageUrl = blob.url;
        console.log(`[/api/analyze] Uploaded to blob: ${imageUrl}`);
      } catch (e: any) {
        console.error(`[/api/analyze] Blob upload failed:`, e.message);
        return res.status(500).json({
          error: `Failed to upload image: ${e.message}`,
          hint: "Image may be too large or blob storage unavailable",
        });
      }
    }

    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl or image (base64) required" });
    }

    // Verify required env vars before starting
    const missingVars: string[] = [];
    if (!process.env.GEMINI_API_KEY) missingVars.push("GEMINI_API_KEY");
    if (!process.env.BACKBOARD_API_KEY) missingVars.push("BACKBOARD_API_KEY");
    if (!process.env.BLOB_READ_WRITE_TOKEN) missingVars.push("BLOB_READ_WRITE_TOKEN");

    if (missingVars.length > 0) {
      return res.status(500).json({
        error: `Missing required environment variables: ${missingVars.join(", ")}`,
        hint: `Set these in Vercel → Settings → Environment Variables:\n${missingVars.map(v => `- ${v}`).join("\n")}`,
      });
    }

    console.log(`[/api/analyze] Starting analysis for image: ${imageUrl}`);
    
    // Run full analysis with timeout protection
    const result = await Promise.race([
      analyzeImage(imageUrl, jobId),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Analysis timed out after 55 seconds")), 55000)
      ),
    ]);
    
    console.log(`[/api/analyze] Job ${jobId} — complete ✅`);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[/api/analyze] Error:", err.message);
    console.error("[/api/analyze] Stack:", err.stack);
    
    // Provide more specific error messages
    let errorMsg = err.message || "Analysis failed";
    let hint = "Check Vercel function logs for details";
    
    if (errorMsg.includes("GEMINI_API_KEY") || errorMsg.includes("Gemini")) {
      hint = "Set GEMINI_API_KEY in Vercel → Settings → Environment Variables";
    } else if (errorMsg.includes("BACKBOARD_API_KEY") || errorMsg.includes("Backboard")) {
      hint = "Set BACKBOARD_API_KEY in Vercel → Settings → Environment Variables. Also check your Backboard.io account has credits.";
    } else if (errorMsg.includes("timed out")) {
      hint = "Analysis took too long. Try a smaller image or check API response times.";
    } else if (errorMsg.includes("OCR failed")) {
      hint = "Could not extract text from image. Make sure the image contains readable text.";
    }
    
    return res.status(500).json({
      error: errorMsg,
      hint,
      jobId: req.body?.jobId || "unknown",
    });
  }
}
