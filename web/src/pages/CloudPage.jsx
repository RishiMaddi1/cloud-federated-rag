import { Link } from "react-router-dom";
import DemoForm from "../components/DemoForm";
import HowToBlock from "../components/HowToBlock";
export default function CloudPage() {
  return (
    <div className="page-surface">
      <header className="page-header">
        <p className="page-kicker">Cloud</p>
        <h1 className="page-title">Worker + Supabase + laptops</h1>
        <p className="page-one-liner">
          <code className="inline-code">How-To </code>
          Below are the steps to setup this and use it.<br />
          <code className="inline-code">worker.js</code> orchestrates; Supabase stores chunks; each laptop runs <code className="inline-code">laptop_worker.py</code>. Open a row for the exact commands.
        </p>
      </header>

      <section className="howto-stack" aria-label="Cloud setup how-to">
        <HowToBlock title="1 · Supabase + wrangler">
          <ul className="howto-list">
            <li>
              In Supabase: run the DDL under <strong>README.md → “Create Supabase table”</strong> (table{" "}
              <code className="inline-code">document_chunks</code>, <code className="inline-code">vector(384)</code>).
            </li>
            <li>
              Files involved: <code className="inline-code">worker.js</code> (Worker code), optional{" "}
              <code className="inline-code">wrangler.toml.example</code> for CLI deploy (
              <code className="inline-code">main = &quot;worker.js&quot;</code>).
            </li>
            <li>
              From the <strong>repository root</strong> (use <code className="inline-code">--config wrangler.toml.example</code> or copy it to{" "}
              <code className="inline-code">wrangler.toml</code> locally):
            </li>
          </ul>
          <pre className="howto-pre">
            <code>
              wrangler secret put SUPABASE_URL --config wrangler.toml.example{"\n"}
              wrangler secret put SUPABASE_KEY --config wrangler.toml.example{"\n"}
              wrangler deploy --config wrangler.toml.example
            </code>
          </pre>
          <ul className="howto-list">
            <li>
              Optional Worker var: <code className="inline-code">SUPABASE_TABLE</code> (defaults to{" "}
              <code className="inline-code">document_chunks</code>).
            </li>
            <li>Copy the deployed Worker URL — you paste it into the form below.</li>
          </ul>
        </HowToBlock>

        <HowToBlock title="2 · laptop_worker + ngrok">
          <ul className="howto-list">
            <li>
              One-time: <code className="inline-code">pip install -r requirements.txt</code> (repo root).
            </li>
            <li>
              On <strong>each</strong> laptop, set cloud vars in <code className="inline-code">.env</code>:{" "}
              <code className="inline-code">SUPABASE_URL</code>, <code className="inline-code">SUPABASE_KEY</code> (same project as the Worker).
            </li>
            <li>
              Start the API (default port <strong>8000</strong>, defined in <code className="inline-code">laptop_worker.py</code>):
            </li>
          </ul>
          <pre className="howto-pre">
            <code>python laptop_worker.py</code>
          </pre>
          <ul className="howto-list">
            <li>
              The browser/Worker must reach the laptop over HTTPS/public URL. From the laptop (or tunnel host):{" "}
              <code className="inline-code">ngrok http 8000</code> — use the ngrok <strong>https</strong> URL(s) in the form, comma-separated.
            </li>
          </ul>
        </HowToBlock>

        <HowToBlock title="3 · Form: URLs + LLM">
          <ul className="howto-list">
            <li>
              <strong>Worker URL:</strong> your <code className="inline-code">*.workers.dev</code> (or custom domain) endpoint.
            </li>
            <li>
              <strong>Laptop URLs:</strong> comma-separated public URLs that hit each running <code className="inline-code">laptop_worker.py</code>.
            </li>
            <li>
              <strong>LLM:</strong> OpenRouter or Gemini + matching API key (sent from the browser for this demo only).
            </li>
            <li>Upload a file or paste text, then ask a question.</li>
            <li>Optional: same backends work from <code className="inline-code">gradio_ui.py</code> with <code className="inline-code">WORKER_URL</code> in <code className="inline-code">.env</code>.</li>
          </ul>
        </HowToBlock>
      </section>

      <article className="card framed api-reference cloud-search-api">
        <h2>Search API (your Worker)</h2>
        <p className="api-desc">
          From any app, call semantic search on the same Worker URL you use in the form. The Worker fans out to laptops, then loads{" "}
          <code className="inline-code">chunk_text</code> from Supabase. You send the returned chunks to your own LLM.
        </p>
        <h3 className="api-method">
          <span className="api-verb">POST</span> <code>/process-query</code>
        </h3>
        <pre className="howto-pre">
          <code>{`POST https://YOUR_WORKER.workers.dev/process-query
Content-Type: application/json

{
  "query": "What is this document about?",
  "laptop_urls": ["https://your-laptop.ngrok-free.app"],
  "top_k": 5
}

// 200 — use data.chunks[].chunk_text in your prompt
{
  "success": true,
  "query": "…",
  "chunks": [
    { "id": 1, "chunk_text": "…", "chunk_index": 1, "document_id": "doc_…" }
  ],
  "total_chunks": 5,
  "laptop_results": [ … ],
  "processing_time_ms": 120
}`}</code>
        </pre>
        <p className="micro-note" style={{ marginBottom: "0.65rem" }}>
          If the Worker URL is behind <strong>ngrok</strong>, add header <code className="inline-code">ngrok-skip-browser-warning: true</code>. Upload
          documents with <code className="inline-code">POST /upload-document</code> first.
        </p>
        <p className="micro-note" style={{ marginTop: 0 }}>
          <Link className="inline-link" to="/about#api">
            Full HTTP API on About →
          </Link>
        </p>
      </article>

      <DemoForm mode="cloud" />    </div>
  );
}
