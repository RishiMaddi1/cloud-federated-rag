export default function ApiReference() {
  return (
    <section className="about-block card framed api-reference" id="api">
      <h2>HTTP API (for your own app)</h2>
      <p className="api-intro">
        The <strong>orchestrator</strong> exposes the same JSON API in both modes. Use it to upload documents and run <strong>semantic search</strong>; your
        application calls your own LLM with the returned <code className="inline-code">chunks</code> (this website does the same after{" "}
        <code className="inline-code">/process-query</code>).
      </p>

      <ul className="page-bullets">
        <li>
          <strong>Cloud base URL:</strong> your deployed Worker, e.g. <code className="inline-code">https://your-worker.workers.dev</code>
        </li>
        <li>
          <strong>Local base URL:</strong> <code className="inline-code">local_orchestrator.py</code> default{" "}
          <code className="inline-code">http://127.0.0.1:8788</code>
        </li>
        <li>
          <strong>CORS:</strong> <code className="inline-code">Access-Control-Allow-Origin: *</code> — callable from a browser or server.
        </li>
        <li>
          If the base URL is <strong>ngrok</strong>, add header <code className="inline-code">ngrok-skip-browser-warning: true</code> on requests to the
          orchestrator.
        </li>
      </ul>

      <h3 className="api-method">
        <span className="api-verb">GET</span> <code>/status</code>
      </h3>
      <p className="api-desc">Health check. No body.</p>
      <pre className="howto-pre">
        <code>{`// 200 — example shape (cloud)
{
  "status": "online",
  "message": "Cloudflare Worker is running",
  "endpoints": ["POST /upload-document", "POST /process-query", "GET /status"]
}`}</code>
      </pre>

      <h3 className="api-method">
        <span className="api-verb">POST</span> <code>/upload-document</code>
      </h3>
      <p className="api-desc">
        Stores chunk text in Supabase (cloud) or SQLite (local), then asks each laptop URL to generate embeddings. Body must include full{" "}
        <code className="inline-code">document_text</code> (orchestrator does not read files).
      </p>
      <pre className="howto-pre">
        <code>{`Headers:
  Content-Type: application/json

Body:
{
  "document_text": "Plain text of the whole document…",
  "document_id": "optional-id-or-omit",
  "laptop_urls": [
    "https://abc123.ngrok-free.app",
    "http://192.168.1.10:8000"
  ]
}

// 200
{
  "success": true,
  "document_id": "doc_…",
  "total_chunks": 12,
  "chunks_stored": 12,
  "laptop_results": [
    {
      "laptop_id": 1,
      "url": "…",
      "success": true,
      "chunks_processed": 12,
      "processing_time": 1.2,
      "chunks_per_second": 10,
      "fetch_time": 0.1,
      "embedding_time": 0.9,
      "store_time": 0.2
    }
  ],
  "message": "Document uploaded and distributed to laptops for processing"
}`}</code>
      </pre>

      <h3 className="api-method">
        <span className="api-verb">POST</span> <code>/process-query</code>
      </h3>
      <p className="api-desc">
        <strong>Search + retrieve chunk text.</strong> Sends <code className="inline-code">query</code> to each laptop&apos;s{" "}
        <code className="inline-code">/search-chunks</code>, merges IDs, loads <code className="inline-code">chunk_text</code> from the database. Your app
        then prompts any LLM with those strings.
      </p>
      <pre className="howto-pre">
        <code>{`Headers:
  Content-Type: application/json

Body:
{
  "query": "What is this document about?",
  "laptop_urls": ["https://abc123.ngrok-free.app"],
  "top_k": 5
}

// 200 — success with hits
{
  "success": true,
  "query": "What is this document about?",
  "chunks": [
    {
      "id": 270,
      "chunk_text": "…",
      "chunk_index": 6,
      "document_id": "doc_…"
    }
  ],
  "total_chunks": 5,
  "laptop_results": [
    {
      "laptop_id": 1,
      "success": true,
      "chunk_ids": [272, 283, 281],
      "search_time": 0.02,
      "embedding_time": 0.015,
      "search_compute_time": 0
    }
  ],
  "processing_time_ms": 180
}

// 200 — no matches
{ "success": true, "chunks": [], "message": "No relevant chunks found" }

// 502 — laptops returned IDs but DB rows missing (cloud: Supabase key / RLS)
{ "success": false, "error": "…", "hint": "…", "chunk_ids_from_laptops": [], "laptop_results": [] }`}</code>
      </pre>

      <h3 className="api-sub">Copy-paste: browser <code>fetch</code></h3>
      <pre className="howto-pre">
        <code>{`const BASE = "https://your-worker.workers.dev"; // or http://127.0.0.1:8788

const headers = { "Content-Type": "application/json" };
if (/ngrok/i.test(BASE)) headers["ngrok-skip-browser-warning"] = "true";

const res = await fetch(\`\${BASE}/process-query\`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    query: "Your question here",
    laptop_urls: ["https://your-laptop.ngrok-free.app"],
    top_k: 5,
  }),
});
const data = await res.json();
if (!res.ok) throw new Error(data.error || res.statusText);

const context = data.chunks
  .map((c) => \`[Chunk \${c.chunk_index}]: \${c.chunk_text}\`)
  .join("\\n\\n");
// → send \`context\` + user question to OpenRouter, Gemini, etc.`}</code>
      </pre>

      <h3 className="api-sub">Copy-paste: <code>curl</code></h3>
      <pre className="howto-pre">
        <code>{`BASE="https://your-worker.workers.dev"

curl -sS -X POST "$BASE/process-query" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"What is this about?","laptop_urls":["http://127.0.0.1:8000"],"top_k":5}'`}</code>
      </pre>

      <p className="micro-note" style={{ marginBottom: 0 }}>
        Laptop workers must be running (<code className="inline-code">python laptop_worker.py</code>) and reachable at the URLs you pass. Cloud laptops need
        Supabase configured on the worker; local laptops use <code className="inline-code">/generate-embeddings-local</code> — see README.
      </p>
    </section>
  );
}
