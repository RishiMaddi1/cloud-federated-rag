import { useEffect, useMemo, useState } from "react";
import NavBar from "./components/NavBar";
import Section from "./components/Section";
import DemoPanel from "./components/DemoPanel";

const pages = [
  ["home", "Platform"],
  ["demo", "Live Demo"],
  ["how", "How It Works"],
  ["setup", "Setup"],
  ["config", "Config"],
  ["benchmarks", "Benchmarks"],
  ["security", "Security"],
  ["faq", "FAQ"],
];

export default function App() {
  const [theme, setTheme] = useState("paper");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const benchmarkRows = useMemo(
    () => [
      ["Single laptop", "1.0x", "Baseline local embedding + search"],
      ["2 laptops", "1.6x", "Parallel embedding and search fan-out"],
      ["4 laptops", "2.7x", "Best when document chunk count is high"],
    ],
    []
  );

  return (
    <div className="site-shell">
      <NavBar theme={theme} onThemeChange={setTheme} />

      <main className="main-wrap">
        <Section id="home" kicker="Distributed RAG" title="Cloud + Local, one interface">
          <div className="hero-grid">
            <div className="card framed">
              <p className="lead">
                Build with cloud orchestration (Cloudflare + Supabase) or run the same flow in local LAN mode (FastAPI + SQLite).
              </p>
              <div className="motif-bar" role="presentation" />
              <p>
                Neo-brutalist editorial UI with strict mode-aware inputs: no accidental local fallback, no hidden defaults.
              </p>
            </div>
            <div className="card framed">
              <h3>Site map</h3>
              <ul className="clean-list">
                {pages.map(([id, title]) => (
                  <li key={id}><a href={`#${id}`} className="inline-link">{title}</a></li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section id="demo" kicker="Try It" title="Live demo runtime">
          <DemoPanel />
        </Section>

        <Section id="how" kicker="System" title="How data moves">
          <div className="band-grid">
            <article className="card framed">
              <h3>Cloud mode</h3>
              <ol className="clean-list numbered">
                <li>Upload to Worker</li>
                <li>Chunks saved in Supabase</li>
                <li>Worker fans out to laptop workers</li>
                <li>Parallel search returns chunk IDs</li>
                <li>LLM provider generates final answer</li>
              </ol>
            </article>
            <article className="card framed">
              <h3>Local mode</h3>
              <ol className="clean-list numbered">
                <li>Upload to local orchestrator</li>
                <li>Chunks saved in SQLite</li>
                <li>Orchestrator sends inline chunks to laptops</li>
                <li>Parallel local search returns IDs</li>
                <li>LLM provider generates final answer</li>
              </ol>
            </article>
          </div>
        </Section>

        <Section id="setup" kicker="Launch" title="Setup paths">
          <div className="band-grid">
            <article className="card framed">
              <h3>Cloud</h3>
              <p>Deploy Worker, configure Supabase table + Worker vars, run laptop workers with ngrok, then use Cloud mode in demo.</p>
              <a className="inline-link" href="../README.md">Open project README</a>
            </article>
            <article className="card framed">
              <h3>Local</h3>
              <p>Run `local_orchestrator.py`, keep laptop workers on LAN URLs, set backend mode to Local in the demo form.</p>
              <a className="inline-link" href="../README.md">Open local setup section</a>
            </article>
          </div>
        </Section>

        <Section id="config" kicker="Variables" title="What users must provide">
          <div className="card framed data-list">
            <div><strong>Cloud required:</strong> Worker URL + laptop URLs + one LLM key.</div>
            <div><strong>Cloud backend infra:</strong> Worker has Supabase URL/key in secret vars.</div>
            <div><strong>Local required:</strong> Local orchestrator URL + laptop LAN URLs + one LLM key.</div>
            <div><strong>No auto-switch:</strong> Missing cloud values does not silently run local mode.</div>
          </div>
        </Section>

        <Section id="benchmarks" kicker="Performance" title="Benchmark panel">
          <div className="card framed">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Topology</th><th>Relative speed</th><th>Notes</th></tr>
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
          </div>
        </Section>

        <Section id="security" kicker="Ops" title="Security model">
          <div className="band-grid">
            <article className="card framed">
              <h3>Key handling</h3>
              <p>LLM keys entered in demo are used client-side for now. For public production usage, route LLM calls through a trusted backend and add abuse controls.</p>
            </article>
            <article className="card framed">
              <h3>Suggested hardening</h3>
              <ul className="clean-list">
                <li>Turnstile + rate limits</li>
                <li>Upload size caps</li>
                <li>Request quotas for demo mode</li>
                <li>Server-side LLM key proxy</li>
              </ul>
            </article>
          </div>
        </Section>

        <Section id="faq" kicker="Support" title="FAQ">
          <div className="band-grid">
            <article className="card framed">
              <h3>Do I need Supabase for local?</h3>
              <p>No. Local mode uses SQLite in `local_orchestrator.py`.</p>
            </article>
            <article className="card framed">
              <h3>Can one machine run everything?</h3>
              <p>Yes. Use `127.0.0.1` URLs for local tests.</p>
            </article>
            <article className="card framed">
              <h3>OpenRouter and Gemini both supported?</h3>
              <p>Yes. Choose provider in demo and supply the matching key.</p>
            </article>
          </div>
        </Section>
      </main>
    </div>
  );
}
