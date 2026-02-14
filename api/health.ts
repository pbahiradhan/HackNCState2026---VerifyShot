// GET /api/health — diagnostic endpoint
// Shows which env vars are set (without revealing values)

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { BackboardClient } from "backboard-sdk";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const envCheck = {
    BACKBOARD_API_KEY: !!process.env.BACKBOARD_API_KEY,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
    GOOGLE_SEARCH_API_KEY: !!process.env.GOOGLE_SEARCH_API_KEY,
    GOOGLE_SEARCH_ENGINE_ID: !!process.env.GOOGLE_SEARCH_ENGINE_ID,
  };

  const allRequired = envCheck.BACKBOARD_API_KEY && envCheck.GEMINI_API_KEY && envCheck.BLOB_READ_WRITE_TOKEN;
  const missingRequired = [];
  if (!envCheck.BACKBOARD_API_KEY) missingRequired.push("BACKBOARD_API_KEY");
  if (!envCheck.GEMINI_API_KEY) missingRequired.push("GEMINI_API_KEY");
  if (!envCheck.BLOB_READ_WRITE_TOKEN) missingRequired.push("BLOB_READ_WRITE_TOKEN");

  const missingOptional = [];
  if (!envCheck.GOOGLE_SEARCH_API_KEY) missingOptional.push("GOOGLE_SEARCH_API_KEY");
  if (!envCheck.GOOGLE_SEARCH_ENGINE_ID) missingOptional.push("GOOGLE_SEARCH_ENGINE_ID");

  // Test Backboard client initialization if key is set
  let backboardTest: { status: string; error?: string } | null = null;
  if (envCheck.BACKBOARD_API_KEY) {
    try {
      const key = process.env.BACKBOARD_API_KEY!;
      if (key.length < 10) {
        backboardTest = { status: "invalid", error: "API key appears too short" };
      } else {
        // Just test client creation, don't make API calls
        new BackboardClient({ apiKey: key });
        backboardTest = { status: "client_initialized" };
      }
    } catch (err: any) {
      backboardTest = {
        status: "failed",
        error: err.message || "Unknown error",
      };
    }
  }

  return res.status(200).json({
    status: allRequired ? "ready" : "misconfigured",
    timestamp: new Date().toISOString(),
    envVars: envCheck,
    backboardTest,
    missingRequired: missingRequired.length > 0 ? missingRequired : undefined,
    missingOptional: missingOptional.length > 0 ? missingOptional : undefined,
    message: allRequired
      ? "All required environment variables are set. ✅" + (missingOptional.length > 0
        ? ` Optional missing: ${missingOptional.join(", ")} (web search won't work without these).`
        : " All optional vars also set.")
      : `Missing required env vars: ${missingRequired.join(", ")}. Set these in Vercel → Settings → Environment Variables.`,
  });
}
