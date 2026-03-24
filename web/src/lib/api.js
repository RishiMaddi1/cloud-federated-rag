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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_text: text, laptop_urls }),
  });

  const body = await res.text();
  const data = body ? JSON.parse(body) : {};
  if (!res.ok) {
    throw new Error(data?.error || data?.detail || body || `Upload failed (${res.status})`);
  }
  return data;
}

async function callOpenRouter({ apiKey, model, context, query, referer, title }) {
  if (!apiKey?.trim()) throw new Error("OpenRouter API key is required.");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer || "https://cloud-federated-rag.pages.dev",
      "X-Title": title || "cloud-federated-rag",
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
  const data = raw ? JSON.parse(raw) : {};
  if (!res.ok) throw new Error(data?.error?.message || raw || `OpenRouter error (${res.status})`);

  const answer = data?.choices?.[0]?.message?.content || "No response";
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
  const data = raw ? JSON.parse(raw) : {};
  if (!res.ok) {
    const msg = data?.error?.message || raw || `Gemini error (${res.status})`;
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: query.trim(), laptop_urls, top_k: 5 }),
  });

  const raw = await res.text();
  const data = raw ? JSON.parse(raw) : {};
  if (!res.ok) {
    throw new Error(data?.error || data?.detail || raw || `Query failed (${res.status})`);
  }

  const chunks = data?.chunks || [];
  if (!chunks.length) {
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
