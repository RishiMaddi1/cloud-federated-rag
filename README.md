# cloud-federated-rag

**Adaptive Cloud-Federated Multi-GPU Architecture for Distributed Knowledge Extraction and Context-Aware Question Response**

A distributed RAG (Retrieval-Augmented Generation) system that leverages multiple laptop GPUs to accelerate embedding generation and vector search.

## 🏗️ Architecture

```
User (Gradio UI)
    ↓
Cloudflare Worker (Orchestrator)
    ↓
    ├──→ Supabase (Storage)
    └──→ Laptop Workers (via ngrok)
            ├──→ Laptop 1 (GPU)
            ├──→ Laptop 2 (GPU)
            └──→ Laptop N (GPU)
    ↓
OpenRouter API (LLM)
```

## 📋 Components

1. **Cloudflare Worker** (`worker.js`) - Orchestrates document upload, chunk distribution, and query processing
2. **Laptop Worker** (`laptop_worker.py`) - FastAPI server that generates embeddings and performs vector search
3. **Gradio UI** (`gradio_ui.py`) - User interface for uploading documents and asking questions
4. **Supabase** - Stores document chunks and embeddings

## 🚀 Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Environment file

```bash
cp .env.example .env
```

Edit `.env` with your Worker URL, OpenRouter key, and Supabase values. The file is **gitignored** and must not be committed.

### 3. Deploy Cloudflare Worker

1. Go to [Cloudflare Workers Dashboard](https://workers.cloudflare.com/)
2. Create a new Worker
3. Copy contents of `worker.js` and paste into the editor
4. Under **Settings → Variables**, add `SUPABASE_URL`, `SUPABASE_KEY`, and optionally `SUPABASE_TABLE`
5. Deploy and copy your Worker URL (use it as `WORKER_URL` in `.env`)

### 4. Setup Supabase

1. Create a table in Supabase SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunks (
    id SERIAL PRIMARY KEY,
    chunk_text TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    document_id TEXT,
    embedding VECTOR(384),  -- Adjust based on your embedding model
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_document_chunks_embedding ON document_chunks 
USING hnsw (embedding vector_cosine_ops);
```

### 5. Run Laptop Worker

On each laptop with GPU:

```bash
# Terminal 1: Start laptop worker
python laptop_worker.py

# Terminal 2: Start ngrok
ngrok http 8000
```

Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)

### 6. Run Gradio UI

```bash
python gradio_ui.py
```

Open browser to `http://localhost:7860`

## 📖 Usage

1. **Upload Document**:
   - Paste your document text
   - Enter comma-separated ngrok URLs of your laptops
   - Click "Upload & Process Document"

2. **Ask Questions**:
   - Enter your question
   - Enter the same laptop URLs
   - Select an LLM model
   - Click "Get Answer"

## 🔧 Configuration

Secrets are **not** in source code. Copy `.env.example` to `.env` in the project folder (`.env` is gitignored).

### Gradio (`gradio_ui.py`)

| Variable | Required | Description |
|----------|----------|-------------|
| `WORKER_URL` | Yes | Cloudflare Worker base URL (no trailing slash) |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key |
| `OPENROUTER_URL` | No | Default: OpenRouter chat completions URL |
| `DEFAULT_MODEL` | No | Default LLM id |
| `OPENROUTER_HTTP_REFERER` | No | Optional header for OpenRouter |
| `OPENROUTER_X_TITLE` | No | Optional header for OpenRouter |

### Laptop worker (`laptop_worker.py`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Project URL |
| `SUPABASE_KEY` | Yes | anon or service role (match RLS policies) |
| `SUPABASE_TABLE` | No | Default `document_chunks` |
| `EMBEDDING_MODEL` | No | Default `sentence-transformers/all-MiniLM-L6-v2` |
| `EMBEDDING_DIM` | No | Default `384` (must match model / DB column) |

### Cloudflare Worker (`worker.js`)

In **Workers → your worker → Settings → Variables**, add:

| Name | Type | Description |
|------|------|-------------|
| `SUPABASE_URL` | Secret or plain | Same as above |
| `SUPABASE_KEY` | **Secret** | Same key the Worker uses for REST |
| `SUPABASE_TABLE` | Plain (optional) | Default `document_chunks` if unset |

Or use Wrangler: `wrangler secret put SUPABASE_URL` and `wrangler secret put SUPABASE_KEY` (see `wrangler.toml`).

## 🎯 Features

- ✅ Automatic chunk splitting
- ✅ Distributed embedding generation across multiple GPUs
- ✅ Parallel vector search
- ✅ Caching for fast repeated queries
- ✅ Support for multiple LLM models via OpenRouter
- ✅ Beautiful Gradio UI

## 📝 Notes

- Make sure all laptops have the same embedding model
- ngrok URLs change on restart - update them in the UI
- First query may be slower as embeddings are loaded from Supabase
- GPU acceleration is automatic if CUDA is available

## 🐛 Troubleshooting

**Laptop worker not responding:**
- Check if ngrok is running
- Verify laptop worker is running on port 8000
- Check firewall settings

**No embeddings found:**
- Make sure document was uploaded successfully
- Check if laptop workers processed the chunks
- Verify Supabase has embeddings stored

**Slow performance:**
- Ensure GPUs are being used (check laptop worker logs)
- Reduce chunk size in `worker.js` if needed
- Use fewer chunks per query (reduce `top_k`)

