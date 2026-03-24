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

### 2. Deploy Cloudflare Worker

1. Go to [Cloudflare Workers Dashboard](https://workers.cloudflare.com/)
2. Create a new Worker
3. Copy contents of `worker.js` and paste into the editor
4. Deploy and copy your Worker URL

### 3. Setup Supabase

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

### 4. Run Laptop Worker

On each laptop with GPU:

```bash
# Terminal 1: Start laptop worker
python laptop_worker.py

# Terminal 2: Start ngrok
ngrok http 8000
```

Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)

### 5. Run Gradio UI

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

### Update Worker URL in `gradio_ui.py`:
```python
WORKER_URL = "https://your-worker.workers.dev"
```

### Update Supabase credentials in `laptop_worker.py` and `worker.js`:
```python
SUPABASE_URL = "https://your-project.supabase.co"
SUPABASE_KEY = "your-service-role-key"
```

### Change Embedding Model in `laptop_worker.py`:
```python
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"  # 384 dims
# Or use: "sentence-transformers/all-mpnet-base-v2"  # 768 dims
```

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

