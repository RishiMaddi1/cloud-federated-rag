import { useMemo } from "react";
import ApiReference from "../components/ApiReference";

export default function AboutPage() {
  const benchmarkRows = useMemo(
    () => [
      ["Single laptop", "1.0x", "Baseline local embedding + search"],
      ["2 laptops", "1.6x", "Parallel embedding and search fan-out"],
      ["4 laptops", "2.7x", "Best when chunk count is high"],
    ],
    []
  );

  return (
    <div className="page-surface about-page">
      <header className="page-header">
        <p className="page-kicker">About</p>
        <h1 className="page-title">cloud-federated-rag</h1>
        <p className="page-lead">
          One project: cloud orchestration (Cloudflare + Supabase) or the same RAG flow on your LAN (FastAPI + SQLite), with laptop workers
          doing parallel chunk work.
        </p>
      </header>

      <section className="about-block card framed">
        <h2>How data moves</h2>
        <ul className="page-bullets">
          <li>
            <strong>Cloud:</strong> browser → Worker → Supabase; Worker fans out to laptops; answers use your chosen LLM API.
          </li>
          <li>
            <strong>Local:</strong> browser → orchestrator → SQLite; orchestrator talks to laptops; same LLM choice.
          </li>
        </ul>
      </section>

      <section className="about-block card framed">
        <h2>Uploads in this website</h2>
        <ul className="page-bullets">
          <li>You can pick any file; parsing happens in the browser.</li>
          <li>
            <strong>Supported here:</strong> PDF (text layers), DOCX, and common text formats (.txt, .md, .csv, .json, code, etc.).
          </li>
          <li>
            <strong>Not supported in-browser:</strong> scanned PDFs without OCR, legacy .doc, images, .xlsx, zip, and other binaries — export
            to PDF/text or use the Python/Gradio app for richer parsing.
          </li>
          <li>Large files may be slow or hit provider limits; the README documents caps and hardening.</li>
        </ul>
      </section>

      <section className="about-block card framed">
        <h2>Security (short)</h2>
        <ul className="page-bullets">
          <li>Demo keys are used from the browser; for production, proxy LLM calls and add rate limits and auth.</li>
          <li>Worker holds Supabase secrets; laptops should not expose admin interfaces publicly.</li>
        </ul>
      </section>

      <section className="about-block card framed">
        <h2>Benchmarks (illustrative)</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Topology</th>
                <th>Relative speed</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {benchmarkRows.map(([top, speed, note]) => (
                <tr key={top}>
                  <td>{top}</td>
                  <td>{speed}</td>
                  <td>{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="about-block band-grid">
        <article className="card framed">
          <h3>FAQ</h3>
          <ul className="page-bullets tight">
            <li>
              <strong>Need Supabase for local?</strong> No — local uses SQLite in the orchestrator.
            </li>
            <li>
              <strong>One machine?</strong> Yes — use 127.0.0.1 URLs for a smoke test.
            </li>
            <li>
              <strong>OpenRouter and Gemini?</strong> Yes — pick one in the demo and supply its key.
            </li>
          </ul>
        </article>
        <article className="card framed">
          <h3>Docs</h3>
          <p className="micro-note" style={{ marginTop: 0 }}>
            Full setup, env vars, and deployment steps are in the repository README (project root).{" "}
            <a className="inline-link" href="#api">
              HTTP API reference
            </a>{" "}
            is below.
          </p>
        </article>
      </section>

      <ApiReference />
    </div>
  );
}
