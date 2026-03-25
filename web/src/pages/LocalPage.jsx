import DemoForm from "../components/DemoForm";
import HowToBlock from "../components/HowToBlock";

export default function LocalPage() {
  return (
    <div className="page-surface">
      <header className="page-header">
        <p className="page-kicker">Local</p>
        <h1 className="page-title">LAN orchestrator + SQLite</h1>
        <p className="page-one-liner">
          Below are the steps to setup this and use it.
          <br />
          <code className="inline-code">local_orchestrator.py</code>
          <br />
          <code className="inline-code">local_rag.db</code>
          <br />
          Laptops run <code className="inline-code">laptop_worker.py</code> with Supabase unset.
          <br />
          Open a row for commands.
        </p>
      </header>

      <section className="howto-stack" aria-label="Local setup how-to">
        <HowToBlock title="1 · local_orchestrator.py">
          <ul className="howto-list">
            <li>
              File: <code className="inline-code">local_orchestrator.py</code> — stores chunk text in SQLite next to the process.
            </li>
            <li>
              From the <strong>repository root</strong>:
            </li>
          </ul>
          <pre className="howto-pre">
            <code>python local_orchestrator.py</code>
          </pre>
          <ul className="howto-list">
            <li>
              Default base URL: <code className="inline-code">http://127.0.0.1:8788</code> — paste into the form unless you changed host/port in the script.
            </li>
          </ul>
        </HowToBlock>

        <HowToBlock title="2 · laptop_worker (LAN)">
          <ul className="howto-list">
            <li>
              In each laptop&apos;s <code className="inline-code">.env</code>: leave <code className="inline-code">SUPABASE_URL</code> and{" "}
              <code className="inline-code">SUPABASE_KEY</code> empty (local mode).
            </li>
            <li>
              One-time: <code className="inline-code">pip install -r requirements.txt</code>.
            </li>
            <li>
              Start worker (default port <strong>8000</strong>):
            </li>
          </ul>
          <pre className="howto-pre">
            <code>python laptop_worker.py</code>
          </pre>
          <ul className="howto-list">
            <li>
              In the form, use LAN URLs, e.g. <code className="inline-code">http://192.168.1.10:8000</code>, comma-separated. Same PC smoke test:{" "}
              <code className="inline-code">http://127.0.0.1:8000</code>.
            </li>
          </ul>
        </HowToBlock>

        <HowToBlock title="3 · Form: orchestrator + laptops">
          <ul className="howto-list">
            <li>
              <strong>Local orchestrator URL:</strong> must match your running <code className="inline-code">local_orchestrator.py</code> (often{" "}
              <code className="inline-code">http://127.0.0.1:8788</code>).
            </li>
            <li>
              <strong>Laptop URLs:</strong> reachable from the machine running the browser (not through the Cloudflare Worker).
            </li>
            <li>
              <strong>LLM:</strong> same OpenRouter/Gemini choice as cloud; keys are only used for the model API call.
            </li>
            <li>Upload or paste, then query — flow mirrors cloud, storage stays in SQLite on the orchestrator host.</li>
          </ul>
        </HowToBlock>
      </section>

      <DemoForm mode="local" />
    </div>
  );
}
