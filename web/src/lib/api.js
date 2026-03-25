export const OPENROUTER_MODELS = [
  "google/gemini-2.5-flash",
  "anthropic/claude-3-haiku",
  "deepseek/deepseek-chat-v3-0324",
  "mistralai/codestral-2501",
  "qwen/qwen-2.5-coder-32b-instruct",
];

export const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

const RAG_PROMPT =
  "You are a helpful assistant. Answer questions based on the provided context. If the answer is not in the context, say so.";

function parseUrls(value) {
  return (value || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

function baseUrl(mode, config) {
  return mode === "local"
    ? (config.localOrchestratorUrl || "").trim().replace(/\/$/, "")
    : (config.workerUrl || "").trim().replace(/\/$/, "");
}

/** ngrok free tier may return HTML without this header. */
function orchestratorHeaders(base) {
  const headers = { "Content-Type": "application/json" };
  if (/ngrok/i.test(base || "")) {
    headers["ngrok-skip-browser-warning"] = "true";
  }
  return headers;
}

/** If `VITE_OPENROUTER_REFERER` / config is unset, use this tab’s origin. */
function effectiveOpenRouterReferer(configReferer) {
  const fromConfig = (configReferer || "").trim();
  if (fromConfig) return fromConfig;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://cloud-federated-rag.pages.dev";
}

function normalizeAssistantContent(message) {
  const c = message?.content;
  if (c == null) return "";
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.type === "text" && part?.text) return part.text;
        return part?.text ?? "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(c);
}

function openRouterErrorMessage(data, raw, status) {
  const e = data?.error;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") return e.message || e.code || JSON.stringify(e);
  return data?.message || raw?.slice(0, 500) || `OpenRouter error (${status})`;
}

export function validateConfig(mode, config) {
  const missing = [];
  const base = baseUrl(mode, config);
  if (!base) {
    missing.push(mode === "local" ? "Local orchestrator URL" : "Worker URL");
  }
  if (!config.laptopUrls?.trim()) {
    missing.push("Laptop worker URL(s)");
  }
  return { missing, base };
}

export async function uploadDocument({ mode, config, documentText, fileText }) {
  const { missing, base } = validateConfig(mode, config);
  if (missing.length) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }

  const text = (fileText || documentText || "").trim();
  if (!text) throw new Error("Please provide document text or upload a text/PDF file.");

  const laptop_urls = parseUrls(config.laptopUrls);
  if (!laptop_urls.length) {
    throw new Error("Please provide valid laptop URLs (comma-separated).");
  }

  const res = await fetch(`${base}/upload-document`, {
    method: "POST",
    headers: orchestratorHeaders(base),
    body: JSON.stringify({ document_text: text, laptop_urls }),
  });

  const body = await res.text();
  let data = {};
  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    throw new Error(body?.slice(0, 500) || `Upload failed (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.detail || body || `Upload failed (${res.status})`);
  }
  return data;
}

async function callOpenRouter({ apiKey, model, context, query, referer, title }) {
  if (!apiKey?.trim()) throw new Error("OpenRouter API key is required.");

  const refererHeader = effectiveOpenRouterReferer(referer);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: RAG_PROMPT },
        { role: "user", content: `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer:` },
      ],
      temperature: 0.7,
    }),
  });

  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(raw?.slice(0, 600) || `OpenRouter error (${res.status})`);
  }

  if (!res.ok) {
    throw new Error(openRouterErrorMessage(data, raw, res.status));
  }

  const answer = normalizeAssistantContent(data?.choices?.[0]?.message) || "No response";
  const usage = data?.usage || {};
  return {
    answer,
    provider: "OpenRouter",
    inputTokens: Number(usage.prompt_tokens || 0),
    outputTokens: Number(usage.completion_tokens || 0),
  };
}

async function callGemini({ apiKey, model, context, query, apiBase }) {
  if (!apiKey?.trim()) throw new Error("Gemini API key is required.");

  const base = (apiBase || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const url = `${base}/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: RAG_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [{ text: `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer:` }],
        },
      ],
      generationConfig: { temperature: 0.7 },
    }),
  });

  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(raw?.slice(0, 600) || `Gemini error (${res.status})`);
  }

  if (!res.ok) {
    const err = data?.error;
    const msg =
      (typeof err === "string" && err) || err?.message || raw?.slice(0, 600) || `Gemini error (${res.status})`;
    throw new Error(msg);
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const answer = parts.map((p) => p?.text || "").join("\n").trim() || "No response";
  const usage = data?.usageMetadata || {};
  return {
    answer,
    provider: "Gemini",
    inputTokens: Number(usage.promptTokenCount || 0),
    outputTokens: Number(usage.candidatesTokenCount || 0),
  };
}

export async function queryRag({ mode, config, query, llmProvider, model }) {
  const t0 = performance.now();
  const { missing, base } = validateConfig(mode, config);
  if (missing.length) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }
  if (!query?.trim()) throw new Error("Question is required.");

  const laptop_urls = parseUrls(config.laptopUrls);
  const searchStart = performance.now();
  const res = await fetch(`${base}/process-query`, {
    method: "POST",
    headers: orchestratorHeaders(base),
    body: JSON.stringify({ query: query.trim(), laptop_urls, top_k: 5 }),
  });

  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(raw?.slice(0, 500) || `Query failed (${res.status})`);
  }
  if (!res.ok) {
    const parts = [data?.error, data?.detail, data?.hint].filter(Boolean);
    throw new Error(parts.join(" — ") || raw || `Query failed (${res.status})`);
  }

  const chunks = data?.chunks || [];
  if (!chunks.length) {
    const laptopIds = (data?.laptop_results || []).flatMap((r) => r.chunk_ids || []);
    if (laptopIds.length) {
      throw new Error(
        "Laptops found chunks, but the orchestrator returned no chunk text. For cloud: check Worker Supabase key/RLS; for local: check SQLite IDs match laptop search."
      );
    }
    throw new Error("No relevant chunks found. Upload and process a document first.");
  }

  const context = chunks
    .map((chunk) => `[Chunk ${chunk?.chunk_index ?? "?"}]: ${chunk?.chunk_text ?? ""}`)
    .join("\n\n");

  const llmStart = performance.now();
  const llmResult =
    llmProvider === "gemini"
      ? await callGemini({
          apiKey: config.geminiApiKey,
          model,
          context,
          query,
          apiBase: config.geminiApiBase,
        })
      : await callOpenRouter({
          apiKey: config.openRouterApiKey,
          model,
          context,
          query,
          referer: config.openRouterReferer,
          title: config.openRouterTitle,
        });

  const totalMs = performance.now() - t0;
  return {
    ...llmResult,
    contextChunks: chunks.length,
    searchMs: performance.now() - searchStart,
    workerMs: Number(data?.processing_time_ms || 0),
    llmMs: performance.now() - llmStart,
    totalMs,
    model,
  };
}
