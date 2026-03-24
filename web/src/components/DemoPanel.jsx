import { useMemo, useState } from "react";
import { GEMINI_MODELS, OPENROUTER_MODELS, queryRag, uploadDocument } from "../lib/api";

function parseFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (file.type && !file.type.includes("text")) {
      return reject(new Error("Only .txt files are supported in web demo for now."));
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}

const defaults = {
  workerUrl: import.meta.env.VITE_WORKER_URL || "",
  localOrchestratorUrl: import.meta.env.VITE_LOCAL_ORCHESTRATOR_URL || "http://127.0.0.1:8788",
  laptopUrls: "",
  openRouterApiKey: "",
  geminiApiKey: "",
  geminiApiBase: import.meta.env.VITE_GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta",
  openRouterReferer: import.meta.env.VITE_OPENROUTER_REFERER || "https://cloud-federated-rag.pages.dev",
  openRouterTitle: import.meta.env.VITE_OPENROUTER_TITLE || "cloud-federated-rag",
};

export default function DemoPanel() {
  const [mode, setMode] = useState(import.meta.env.VITE_BACKEND_MODE === "local" ? "local" : "cloud");
  const [config, setConfig] = useState(defaults);
  const [provider, setProvider] = useState(import.meta.env.VITE_DEFAULT_LLM_PROVIDER === "gemini" ? "gemini" : "openrouter");
  const [model, setModel] = useState(import.meta.env.VITE_DEFAULT_MODEL || OPENROUTER_MODELS[0]);
  const [docText, setDocText] = useState("");
  const [docFile, setDocFile] = useState(null);
  const [query, setQuery] = useState("");
  const [uploadState, setUploadState] = useState({ loading: false, message: "" });
  const [answerState, setAnswerState] = useState({ loading: false, error: "", data: null });

  const providerModels = useMemo(() => (provider === "gemini" ? GEMINI_MODELS : OPENROUTER_MODELS), [provider]);

  const updateField = (key, value) => setConfig((prev) => ({ ...prev, [key]: value }));

  const handleProviderChange = (next) => {
    setProvider(next);
    setModel(next === "gemini" ? GEMINI_MODELS[0] : OPENROUTER_MODELS[0]);
  };

  const onUpload = async (e) => {
    e.preventDefault();
    setUploadState({ loading: true, message: "Uploading and distributing chunks..." });
    try {
      const fileText = await parseFile(docFile);
      const data = await uploadDocument({
        mode,
        config,
        documentText: docText,
        fileText,
      });

      const laps = data.laptop_results || [];
      const summary = laps
        .map((lap) => {
          if (lap.success) {
            return `Laptop ${lap.laptop_id}: ${lap.chunks_processed || 0} chunks`;
          }
          return `Laptop ${lap.laptop_id}: ${lap.error || "failed"}`;
        })
        .join(" | ");

      setUploadState({
        loading: false,
        message: `Uploaded doc ${data.document_id}. Chunks: ${data.chunks_stored}/${data.total_chunks}. ${summary}`,
      });
    } catch (err) {
      setUploadState({ loading: false, message: `Upload error: ${err.message}` });
    }
  };

  const onAsk = async (e) => {
    e.preventDefault();
    setAnswerState({ loading: true, error: "", data: null });
    try {
      const data = await queryRag({
        mode,
        config,
        query,
        llmProvider: provider,
        model,
      });
      setAnswerState({ loading: false, error: "", data });
    } catch (err) {
      setAnswerState({ loading: false, error: err.message, data: null });
    }
  };

  return (
    <div className="demo-grid">
      <article className="card framed">
        <h3>Runtime Config</h3>
        <div className="field-grid">
          <label className="field">
            <span>Backend mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="select-input">
              <option value="cloud">Cloudflare + Supabase</option>
              <option value="local">Local LAN + SQLite</option>
            </select>
          </label>
          {mode === "cloud" ? (
            <label className="field">
              <span>Worker URL (required)</span>
              <input value={config.workerUrl} onChange={(e) => updateField("workerUrl", e.target.value)} placeholder="https://your-worker.workers.dev" />
            </label>
          ) : (
            <label className="field">
              <span>Local orchestrator URL (required)</span>
              <input value={config.localOrchestratorUrl} onChange={(e) => updateField("localOrchestratorUrl", e.target.value)} placeholder="http://127.0.0.1:8788" />
            </label>
          )}
          <label className="field field-span">
            <span>Laptop worker URLs (required)</span>
            <input value={config.laptopUrls} onChange={(e) => updateField("laptopUrls", e.target.value)} placeholder="http://192.168.1.10:8000, http://192.168.1.11:8000" />
          </label>
          <label className="field">
            <span>LLM Provider</span>
            <select value={provider} onChange={(e) => handleProviderChange(e.target.value)} className="select-input">
              <option value="openrouter">OpenRouter</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </label>
          <label className="field">
            <span>Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="select-input">
              {providerModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          {provider === "openrouter" ? (
            <label className="field field-span">
              <span>OpenRouter API Key (required)</span>
              <input type="password" value={config.openRouterApiKey} onChange={(e) => updateField("openRouterApiKey", e.target.value)} placeholder="sk-or-..." />
            </label>
          ) : (
            <label className="field field-span">
              <span>Gemini API Key (required)</span>
              <input type="password" value={config.geminiApiKey} onChange={(e) => updateField("geminiApiKey", e.target.value)} placeholder="AIza..." />
            </label>
          )}
        </div>
        <p className="micro-note">
          Cloud stays default unless intentionally switched. Missing cloud values do not auto-fallback to local.
        </p>
      </article>

      <article className="card framed">
        <h3>Step 1 Â· Upload & Process</h3>
        <form onSubmit={onUpload} className="stack">
          <label className="field">
            <span>Upload .txt file (optional)</span>
            <input type="file" accept=".txt,text/plain" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
          </label>
          <label className="field">
            <span>Or paste document text</span>
            <textarea value={docText} onChange={(e) => setDocText(e.target.value)} rows={7} placeholder="Paste text here..." />
          </label>
          <button type="submit" className="button-link" disabled={uploadState.loading}>
            {uploadState.loading ? "Uploading..." : "Upload & Process Document"}
          </button>
          <div className="status-block">{uploadState.message || "No upload yet."}</div>
        </form>
      </article>

      <article className="card framed">
        <h3>Step 2 Â· Ask</h3>
        <form onSubmit={onAsk} className="stack">
          <label className="field">
            <span>Question</span>
            <textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={4} placeholder="What is this document about?" />
          </label>
          <button type="submit" className="button-link" disabled={answerState.loading}>
            {answerState.loading ? "Thinking..." : "Get Answer"}
          </button>
        </form>

        {answerState.error ? <div className="status-block error">{answerState.error}</div> : null}
        {answerState.data ? (
          <div className="answer-wrap">
            <h4>Answer</h4>
            <p className="answer-text">{answerState.data.answer}</p>
            <div className="data-list">
              <div><strong>Provider:</strong> {answerState.data.provider}</div>
              <div><strong>Model:</strong> {answerState.data.model}</div>
              <div><strong>Context chunks:</strong> {answerState.data.contextChunks}</div>
              <div><strong>Search:</strong> {answerState.data.searchMs.toFixed(0)} ms</div>
              <div><strong>LLM:</strong> {answerState.data.llmMs.toFixed(0)} ms</div>
              <div><strong>Total:</strong> {answerState.data.totalMs.toFixed(0)} ms</div>
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}
