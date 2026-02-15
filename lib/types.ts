// ──────────────────────────────────────────────
//  Core data types shared by backend + iOS
// ──────────────────────────────────────────────

export interface Source {
  title: string;
  url: string;
  domain: string;
  date: string;
  credibilityScore: number;   // 0-1
  snippet: string;
}

export interface BiasSignals {
  politicalBias: number;       // -1 (far left) to 1 (far right)
  sensationalism: number;      // 0-1
  overallBias: "left" | "slight_left" | "center" | "slight_right" | "right";
  explanation: string;
  // New fields for multi-perspective bias detection
  confidence?: number;         // 0-1 (inverse of std dev across all assessments)
  agreement?: "high" | "medium" | "low";  // How much the assessments agree
  perspectives?: {
    usLeft: {
      bias: number;
      sensationalism: number;
      consensus: number;  // average of 3 models
    };
    usRight: {
      bias: number;
      sensationalism: number;
      consensus: number;
    };
    international: {
      bias: number;
      sensationalism: number;
      consensus: number;
    };
  };
  keySignals?: string[];      // Common themes detected
}

export interface ModelVerdict {
  modelName: string;           // e.g. "GPT-4o", "Claude 3.5 Sonnet", "Gemini 1.5 Pro"
  agrees: boolean;
  confidence: number;          // 0-1
  verdict?: "likely_true" | "mixed" | "likely_misleading";  // Real verdict from this model
  reasoning?: string;           // Model's explanation
}

export interface Claim {
  id: string;
  text: string;
  verdict: "likely_true" | "mixed" | "likely_misleading" | "unable_to_verify";
  trustScore: number;          // 0-100
  explanation: string;
  sources: Source[];
  biasSignals: BiasSignals;
  modelVerdicts: ModelVerdict[];  // Real multi-model consensus (not fake)
}

export interface AnalysisResult {
  jobId: string;
  imageUrl: string;
  ocrText: string;
  claims: Claim[];
  aggregateTrustScore: number; // 0-100
  trustLabel: string;          // "Likely True" | "Unverified / Mixed" | "Likely Misleading"
  summary: string;             // one-paragraph quick summary
  generatedAt: string;
}

export interface JobStatus {
  status: "pending" | "processing" | "completed" | "error";
  progress?: string;           // human-readable progress text
  result?: AnalysisResult;
  error?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

