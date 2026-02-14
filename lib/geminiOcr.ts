// ──────────────────────────────────────────────
//  OCR via Google Gemini Vision API (direct REST call)
//  Backboard.io is text-only; it can't see images.
//  We use Gemini's multimodal capabilities for OCR.
// ──────────────────────────────────────────────

export async function extractTextFromImage(imageUrl: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set — required for screenshot OCR");

  // 1. Download the image
  console.log("[OCR] Downloading image…");
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.statusText}`);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const base64 = buffer.toString("base64");

  // Detect MIME type from first bytes
  let mimeType = "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50) mimeType = "image/png";
  else if (buffer[0] === 0x47 && buffer[1] === 0x49) mimeType = "image/gif";

  // 2. Call Gemini Vision API
  console.log("[OCR] Calling Gemini Vision…");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [
          {
            text: `Extract ALL visible text from this screenshot image exactly as it appears.
Include: usernames, handles, dates, numbers, hashtags, captions, replies, quotes, headlines, body text, watermarks, and any overlaid text.
Preserve the original structure and line breaks.
Return ONLY the extracted text, nothing else. No commentary, no formatting instructions.`,
          },
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[OCR] Gemini error:", errText);
    throw new Error(`Gemini Vision API error: ${res.status} — ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as any;
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  if (!text || text.length < 3) {
    throw new Error("OCR returned no text. The image may not contain readable text.");
  }

  console.log(`[OCR] Extracted ${text.length} chars`);
  return text;
}
