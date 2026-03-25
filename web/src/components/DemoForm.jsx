import { useMemo, useState } from "react";
import { GEMINI_MODELS, OPENROUTER_MODELS, queryRag, uploadDocument } from "../lib/api";
import { extractTextFromFile } from "../lib/extractText";

const defaults = {
  workerUrl: import.meta.env.VITE_WORKER_URL || "",
  localOrchestratorUrl: import.meta.env.VITE_LOCAL_ORCHESTRATOR_URL || "http://127.0.0.1:8788",
  laptopUrls: "",
  openRouterApiKey: "",
  geminiApiKey: "",
  geminiApiBase: import.meta.env.VITE_GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta",
  // Empty → api.js uses window.location.origin (fixes OpenRouter 401 when dev URL ≠ hardcoded referer)
  openRouterReferer: import.meta.env.VITE_OPENROUTER_REFERER || "",
  openRouterTitle: import.meta.env.VITE_OPENROUTER_TITLE || "cloud-federated-rag",
};

/**
 * @param {{ mode: "cloud" | "local" }} props
 */
export default function DemoForm({ mode }) {
  const [config, setConfig] = useState(defaults);
  const [provider, setProvider] = useState(
    import.meta.env.VITE_DEFAULT_LLM_PROVIDER === "gemini" ? "gemini" : "openrouter"
  );
  const [model, setModel] = useState(import.meta.env.VITE_DEFAULT_MODEL || OPENROUTER_MODELS[0]);
  const [docText, setDocText] = useState("");
  const [docFiles, setDocFiles] = useState([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [query, setQuery] = useState("");
  const [uploadState, setUploadState] = useState({ loading: false, message: "" });
  const [answerState, setAnswerState] = useState({ loading: false, error: "", data: null });

  const providerModels = useMemo(() => (provider === "gemini" ? GEMINI_MODELS : OPENROUTER_MODELS), [provider]);

  const updateField = (key, value) => setConfig((prev) => ({ ...prev, [key]: value }));

  const handleProviderChange = (next) => {
    setProvider(next);
    setModel(next === "gemini" ? GEMINI_MODELS[0] : OPENROUTER_MODELS[0]);
  };

  const formatUploadLine = (data) => {
    const laps = data.laptop_results || [];
    const summary = laps
      .map((lap) => {
        if (lap.success) {
          return `Laptop ${lap.laptop_id}: ${lap.chunks_processed || 0} chunks`;
        }
        return `Laptop ${lap.laptop_id}: ${lap.error || "failed"}`;
      })
      .join(" | ");
    return `doc ${data.document_id} · ${data.chunks_stored}/${data.total_chunks} chunks · ${summary}`;
  };

  const onUpload = async (e) => {
    e.preventDefault();

    const labels = [];
    const texts = [];

    try {
      for (const f of docFiles) {
        const t = await extractTextFromFile(f);
        if (!t?.trim()) {
          throw new Error(`No extractable text in "${f.name || "file"}".`);
        }
        labels.push(f.name || `file ${labels.length + 1}`);
        texts.push(t.trim());
      }
      if (docText.trim()) {
        labels.push("Pasted text");
        texts.push(docText.trim());
      }
    } catch (err) {
      setUploadState({ loading: false, message: `Upload error: ${err.message}` });
      return;
    }

    if (!texts.length) {
      setUploadState({
        loading: false,
        message: "Add at least one file or paste some text.",
      });
      return;
    }

    setUploadState({ loading: true, message: `Preparing ${texts.length} document(s)...` });

    const lines = [];
    for (let i = 0; i < texts.length; i += 1) {
      setUploadState({
        loading: true,
        message: `Uploading ${i + 1} of ${texts.length}: ${labels[i]}…`,
      });
      try {
        const data = await uploadDocument({
          mode,
          config,
          documentText: texts[i],
          fileText: "",
        });
        lines.push(`✓ ${labels[i]} — ${formatUploadLine(data)}`);
      } catch (err) {
        lines.push(`✗ ${labels[i]} — ${err.message}`);
      }
    }

    const failed = lines.filter((l) => l.startsWith("✗")).length;
    setUploadState({
      loading: false,
      message:
        lines.join("\n") +
        (failed ? `\n\n${failed} of ${texts.length} failed.` : `\n\nAll ${texts.length} document(s) sent. Search uses every chunk stored.`),
    });
    if (!failed) {
      setDocText("");
      setDocFiles([]);
      setFileInputKey((k) => k + 1);
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
        <h3>Runtime config</h3>
        <div className="field-grid">
          {mode === "cloud" ? (
            <label className="field field-span">
              <span>Worker URL (required)</span>
              <input
                value={config.workerUrl}
                onChange={(e) => updateField("workerUrl", e.target.value)}
                placeholder="https://your-worker.workers.dev"
              />
            </label>
          ) : (
            <label className="field field-span">
              <span>Local orchestrator URL (required)</span>
              <input
                value={config.localOrchestratorUrl}
                onChange={(e) => updateField("localOrchestratorUrl", e.target.value)}
                placeholder="http://127.0.0.1:8788"
              />
            </label>
          )}
          <label className="field field-span">
            <span>Laptop worker URLs (required)</span>
            <input
              value={config.laptopUrls}
              onChange={(e) => updateField("laptopUrls", e.target.value)}
              placeholder="http://192.168.1.10:8000, http://192.168.1.11:8000"
            />
          </label>
          <label className="field">
            <span>LLM provider</span>
            <select value={provider} onChange={(e) => handleProviderChange(e.target.value)} className="select-input">
              <option value="openrouter">OpenRouter</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </label>
          <label className="field">
            <span>Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="select-input">
              {providerModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          {provider === "openrouter" ? (
            <label className="field field-span">
              <span>OpenRouter API key (required)</span>
              <input
                type="password"
                value={config.openRouterApiKey}
                onChange={(e) => updateField("openRouterApiKey", e.target.value)}
                placeholder="sk-or-..."
              />
            </label>
          ) : (
            <label className="field field-span">
              <span>Gemini API key (required)</span>
              <input
                type="password"
                value={config.geminiApiKey}
                onChange={(e) => updateField("geminiApiKey", e.target.value)}
                placeholder="AIza..."
              />
            </label>
          )}
        </div>
        <p className="micro-note">
          This page is fixed to {mode === "cloud" ? "cloud (Worker + Supabase)" : "local (orchestrator + SQLite)"}.
          There is no silent fallback between modes.
        </p>
      </article>

      <article className="card framed">
        <h3>Step 1 · Upload and process</h3>
        <form onSubmit={onUpload} className="stack">
          <label className="field">
            <span>
              Upload files (hold Ctrl or Shift to choose many). PDF, DOCX, and common text types work in the browser.
            </span>
            <input
              key={fileInputKey}
              type="file"
              multiple
              onChange={(e) => setDocFiles(Array.from(e.target.files || []))}
            />
            {docFiles.length > 0 ? (
              <span className="micro-note">{docFiles.length} file(s) selected</span>
            ) : null}
          </label>
          <label className="field">
            <span>Optional: paste text (uploaded as an extra document after your files)</span>
            <textarea value={docText} onChange={(e) => setDocText(e.target.value)} rows={7} placeholder="Paste text here..." />
          </label>
          <button type="submit" className="button-link" disabled={uploadState.loading}>
            {uploadState.loading ? "Uploading..." : "Upload and process document(s)"}
          </button>
          <div className="status-block">{uploadState.message || "No upload yet."}</div>
        </form>
      </article>

      <article className="card framed">
        <h3>Step 2 · Ask</h3>
        <form onSubmit={onAsk} className="stack">
          <label className="field">
            <span>Question</span>
            <textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={4} placeholder="What is this document about?" />
          </label>
          <button type="submit" className="button-link" disabled={answerState.loading}>
            {answerState.loading ? "Thinking..." : "Get answer"}
          </button>
        </form>

        {answerState.error ? <div className="status-block error">{answerState.error}</div> : null}
        {answerState.data ? (
          <div className="answer-wrap">
            <h4>Answer</h4>
            <p className="answer-text">{answerState.data.answer}</p>
            <div className="data-list">
              <div>
                <strong>Provider:</strong> {answerState.data.provider}
              </div>
              <div>
                <strong>Model:</strong> {answerState.data.model}
              </div>
              <div>
                <strong>Context chunks:</strong> {answerState.data.contextChunks}
              </div>
              <div>
                <strong>Search:</strong> {answerState.data.searchMs.toFixed(0)} ms
              </div>
              <div>
                <strong>LLM:</strong> {answerState.data.llmMs.toFixed(0)} ms
              </div>
              <div>
                <strong>Total:</strong> {answerState.data.totalMs.toFixed(0)} ms
              </div>
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}
