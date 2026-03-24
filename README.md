# cloud-federated-rag

Distributed RAG with two orchestrator options:
- **Cloud mode (default):** Cloudflare Worker + Supabase + laptop workers
- **Local mode (optional):** local_orchestrator.py + SQLite + laptop workers (no Supabase)

---

## CLOUD SETUP (EXACT STEPS)

Use this when you want the hosted/public flow.

### 1) Install dependencies

```bash
pip install -r requirements.txt
```

### 2) Create `.env`

Copy `.env.example` to `.env`.

Set at least these values:

```env
WORKER_URL=https://your-worker.workers.dev
OPENROUTER_API_KEY=...
# or GEMINI_API_KEY=...

# laptop_worker cloud mode requires both:
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=...
SUPABASE_TABLE=document_chunks
```

### 3) Create Supabase table

Run in Supabase SQL editor:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunks (
  id SERIAL PRIMARY KEY,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  document_id TEXT,
  embedding VECTOR(384),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_document_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops);
```

### 4) Deploy Cloudflare Worker

- Open Cloudflare Workers dashboard
- Create/edit a Worker
- Paste `worker.js`
- In Worker **Settings -> Variables**, add:
  - `SUPABASE_URL`
  - `SUPABASE_KEY` (secret)
  - `SUPABASE_TABLE` (optional, defaults to `document_chunks`)
- Deploy
- Put the deployed URL into `WORKER_URL` in `.env`

### 5) Start laptop workers (each GPU laptop)

Terminal A:

```bash
python laptop_worker.py
```

Terminal B:

```bash
ngrok http 8000
```

Collect each laptop's ngrok URL.

### 6) Start Gradio UI

```bash
python gradio_ui.py
```

Open `http://localhost:7860` and keep backend as **Cloudflare + Supabase**.

### 7) Use the app

- Upload document
- Paste comma-separated laptop URLs (ngrok)
- Ask questions with OpenRouter or Gemini provider

---

## LOCAL SETUP (NO SUPABASE)

Use this for LAN labs or offline-ish demos where everything stays local.

### 1) Keep cloud as default unless intentional

Local is used only when you explicitly choose it:
- In UI: **Orchestrator backend -> Local LAN + SQLite**
- Optional env default: `BACKEND_MODE=local`

### 2) Start local orchestrator (one machine)

```bash
python local_orchestrator.py
```

Default URL: `http://127.0.0.1:8788` (UI uses this by default for local mode).

### 3) Configure each laptop worker for local mode

In each laptop `.env`, leave these unset/empty:

```env
SUPABASE_URL=
SUPABASE_KEY=
```

Then run:

```bash
python laptop_worker.py
```

No ngrok required on LAN mode.

### 4) In Gradio local mode

- Select **Local LAN + SQLite** backend
- Set laptop URLs as LAN endpoints, e.g.:
  - `http://192.168.1.10:8000`
  - `http://192.168.1.11:8000`
- For same machine test, use: `http://127.0.0.1:8000`

### 5) Local data behavior

- Chunk text is stored in `local_rag.db` on orchestrator machine
- Embeddings are cached in laptop worker memory
- Restarting laptop workers clears in-memory embedding cache

---

## Key Environment Variables

### Gradio (`gradio_ui.py`)

- `WORKER_URL` (cloud mode)
- `LOCAL_ORCHESTRATOR_URL` (local mode, default `http://127.0.0.1:8788`)
- `BACKEND_MODE` (`cloud` default; set `local` only if intentional)
- `OPENROUTER_API_KEY` and/or `GEMINI_API_KEY`
- Optional: `DEFAULT_LLM_PROVIDER`, `DEFAULT_MODEL`, `DEFAULT_GEMINI_MODEL`

### Laptop worker (`laptop_worker.py`)

- Cloud mode: set `SUPABASE_URL` + `SUPABASE_KEY`
- Local mode: leave both empty
- Optional: `SUPABASE_TABLE`, `EMBEDDING_MODEL`, `EMBEDDING_DIM`

### Cloudflare Worker (`worker.js`)

Set in Worker Variables:
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_TABLE` (optional)

---

## Troubleshooting

- **`connection refused 127.0.0.1:8788`**: local orchestrator is not running
- **`connection refused 127.0.0.1:8000`**: laptop worker is not running
- **Cloud mode 503 from worker**: missing Worker vars (`SUPABASE_URL`/`SUPABASE_KEY`)
- **No relevant chunks**: upload may have failed on laptop processing step
## Website (Cloudflare Pages)

A full React + Vite frontend lives in `web/` with:
- fixed neo-brutalist editorial theme system (paper/dark/blue)
- full sections (Home, Demo, How It Works, Setup, Config, Benchmarks, Security, FAQ)
- live demo forms wired to both backends:
  - cloud: `WORKER_URL` -> `/upload-document`, `/process-query`
  - local: `LOCAL_ORCHESTRATOR_URL` -> same routes
- OpenRouter + Gemini provider support in-browser

### Local frontend dev

```bash
cd web
npm install
npm run dev
```

### Production build

```bash
cd web
npm run build
```

### Cloudflare Pages deploy

- Project root: `web`
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: latest LTS
- Set optional Pages env vars from `web/.env.example` (`VITE_*`)

Important: this demo currently calls OpenRouter/Gemini directly from browser with user-provided keys. For public production traffic, move LLM calls to a trusted backend proxy and add abuse controls (Turnstile + rate limits + quotas).
