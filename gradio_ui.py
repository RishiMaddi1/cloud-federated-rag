# Gradio UI for Distributed RAG System
# Run: python gradio_ui.py

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

import gradio as gr
import requests
import time
import PyPDF2

# Configuration (see .env.example)
WORKER_URL = (os.environ.get("WORKER_URL") or "").strip().rstrip("/")
LOCAL_ORCHESTRATOR_URL = (
    (os.environ.get("LOCAL_ORCHESTRATOR_URL") or "").strip()
    or "http://127.0.0.1:8788"
).rstrip("/")
# Cloud is always the default. Local is used ONLY if BACKEND_MODE=local is set explicitly
# (never inferred from missing Supabase or WORKER_URL).
_raw_backend = (os.environ.get("BACKEND_MODE") or "").strip().lower()
DEFAULT_BACKEND_MODE = "local" if _raw_backend == "local" else "cloud"
OPENROUTER_API_KEY = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
OPENROUTER_URL = (
    os.environ.get("OPENROUTER_URL") or "https://openrouter.ai/api/v1/chat/completions"
).strip()
DEFAULT_MODEL = (os.environ.get("DEFAULT_MODEL") or "google/gemini-2.5-flash").strip()
OPENROUTER_HTTP_REFERER = (
    os.environ.get("OPENROUTER_HTTP_REFERER") or "https://github.com/your-repo"
).strip()
OPENROUTER_X_TITLE = (os.environ.get("OPENROUTER_X_TITLE") or "cloud-federated-rag").strip()

GEMINI_API_KEY = (os.environ.get("GEMINI_API_KEY") or "").strip()
GEMINI_API_BASE = (
    os.environ.get("GEMINI_API_BASE") or "https://generativelanguage.googleapis.com/v1beta"
).strip().rstrip("/")
DEFAULT_GEMINI_MODEL = (os.environ.get("DEFAULT_GEMINI_MODEL") or "gemini-2.0-flash").strip()

_default_prov = (os.environ.get("DEFAULT_LLM_PROVIDER") or "openrouter").strip().lower()
DEFAULT_LLM_PROVIDER = _default_prov if _default_prov in ("openrouter", "gemini") else "openrouter"

RAG_SYSTEM_PROMPT = (
    "You are a helpful assistant. Answer questions based on the provided context. "
    "If the answer is not in the context, say so."
)

OPENROUTER_MODEL_CHOICES = [
    "google/gemini-2.5-flash",
    "anthropic/claude-3-haiku",
    "deepseek/deepseek-chat-v3-0324",
    "mistralai/codestral-2501",
    "qwen/qwen-2.5-coder-32b-instruct",
]

GEMINI_MODEL_CHOICES = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
]


def orchestrator_base_url(backend_mode: str) -> str:
    m = (backend_mode or "cloud").strip().lower()
    if m == "local":
        return LOCAL_ORCHESTRATOR_URL
    return WORKER_URL


def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from PDF file"""
    try:
        text = ""
        with open(file_path, 'rb') as f:
            pdf_reader = PyPDF2.PdfReader(f)
            for page_num in range(len(pdf_reader.pages)):
                page = pdf_reader.pages[page_num]
                text += page.extract_text() + "\n"
        return text.strip()
    except Exception as e:
        raise Exception(f"Error extracting PDF text: {str(e)}")


def _upload_file_item_path(file_item) -> str:
    if isinstance(file_item, str):
        return file_item
    return getattr(file_item, "name", str(file_item))


def _read_doc_text_from_path(file_path: str):
    """Returns (text, error). On success: (str, None). On failure: (None, str)."""
    try:
        lp = file_path.lower()
        if lp.endswith(".pdf"):
            doc_text = extract_text_from_pdf(file_path)
            if not doc_text.strip():
                return None, "PDF appears to be empty or couldn't extract text"
            return doc_text, None
        if lp.endswith(".txt"):
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                doc_text = f.read()
            if not doc_text.strip():
                return None, "File appears to be empty"
            return doc_text, None
        return None, "Unsupported file type. Please upload .txt or .pdf files"
    except Exception as e:
        return None, str(e)


def _format_single_upload_result(data: dict, upload_elapsed: float) -> str:
    result = ""
    result += f"Document ID: {data.get('document_id')}\n"
    result += f"Total chunks: {data.get('total_chunks')}\n"
    result += f"Chunks stored: {data.get('chunks_stored')}\n\n"
    laptop_results = data.get("laptop_results", [])
    result += "Laptop Processing Results:\n"
    all_success = True
    total_chunks_processed = 0
    for laptop in laptop_results:
        status = "✅" if laptop.get("success") else "❌"
        if not laptop.get("success"):
            all_success = False
        result += f"{status} Laptop {laptop.get('laptop_id')}: "
        if laptop.get("success"):
            chunks_processed = laptop.get("chunks_processed", 0)
            total_chunks_processed += chunks_processed
            result += f"Processed {chunks_processed} chunks"
            if "processing_time" in laptop:
                proc_time = laptop["processing_time"]
                result += f" in {proc_time:.2f}s"
                if "chunks_per_second" in laptop and laptop["chunks_per_second"] > 0:
                    result += f" ({laptop['chunks_per_second']:.2f} chunks/sec)"
            result += "\n"
        else:
            result += f"Error: {laptop.get('error', 'Unknown error')}\n"
    result += f"\n⏱️  Upload time: {upload_elapsed:.2f} seconds\n"
    result += f"📊 Chunks processed: {total_chunks_processed}\n"
    if total_chunks_processed > 0 and upload_elapsed > 0:
        result += f"⚡ Speed: {total_chunks_processed/upload_elapsed:.2f} chunks/second\n"
    if all_success:
        result += "\n✅ This document finished on all laptops.\n"
    else:
        result += "\n⚠️ Some laptops failed for this document.\n"
    return result


def upload_document(file, document_text: str, laptop_urls: str, backend_mode: str):
    """
    Upload one or more documents to the orchestrator. Each file (and optional pasted text)
    becomes a separate document_id; search spans all stored chunks.
    Returns: (status_message, show_chat_ui)
    """
    base = orchestrator_base_url(backend_mode)
    mode = (backend_mode or "cloud").strip().lower()
    if not base:
        if mode == "local":
            return "❌ LOCAL_ORCHESTRATOR_URL is not set. Add it to .env or start local_orchestrator.py on the default port.", False
        return "❌ WORKER_URL is not set. Copy .env.example to .env for cloud mode.", False

    raw_files = []
    if file is not None:
        if isinstance(file, (list, tuple)):
            raw_files = [f for f in file if f is not None]
        else:
            raw_files = [file]

    items: list[tuple[str, str]] = []
    pre_errors: list[str] = []

    for f in raw_files:
        path = _upload_file_item_path(f)
        label = Path(path).name or path
        doc_text, err = _read_doc_text_from_path(path)
        if err:
            pre_errors.append(f"❌ [{label}] {err}")
            continue
        items.append((label, doc_text.strip()))

    pasted = (document_text or "").strip()
    if pasted:
        items.append(("(pasted text)", pasted))

    if pre_errors and not items:
        return "\n".join(pre_errors) + "\n\n❌ No documents could be read.", False

    if not items:
        return "❌ Please provide at least one .txt/.pdf file or paste text.", False

    if not laptop_urls or not laptop_urls.strip():
        return "❌ Please provide at least one laptop worker URL (ngrok or LAN, e.g. http://192.168.1.10:8000)", False

    urls = [url.strip() for url in laptop_urls.split(",") if url.strip()]
    if not urls:
        return "❌ Invalid laptop URLs format. Use comma-separated URLs.", False

    overall_start = time.time()
    sections: list[str] = []
    if pre_errors:
        sections.append("File read issues:\n" + "\n".join(pre_errors))

    any_http_success = False

    for label, doc_text in items:
        doc_start = time.time()
        try:
            response = requests.post(
                f"{base}/upload-document",
                json={"document_text": doc_text, "laptop_urls": urls},
                timeout=300,
            )
            elapsed = time.time() - doc_start
            if response.status_code != 200:
                sections.append(
                    f"─── {label} ───\n❌ HTTP {response.status_code}\n{response.text[:1200]}"
                )
                continue
            any_http_success = True
            data = response.json()
            sections.append(f"─── {label} ───\n✅ Uploaded.\n\n{_format_single_upload_result(data, elapsed)}")
        except requests.exceptions.Timeout:
            sections.append(f"─── {label} ───\n❌ Request timed out.")
        except Exception as e:
            sections.append(f"─── {label} ───\n❌ Error: {str(e)}")

    total_time = time.time() - overall_start
    header = f"📚 Processed {len(items)} document source(s) in {total_time:.2f}s total.\n"
    header += "Search will use chunks from every successful upload.\n\n"
    result = header + "\n\n".join(sections)

    if any_http_success:
        result += "\n\nYou can now ask questions (context may include all uploaded documents)."
        return result, True
    return result, False


def _call_openrouter(model: str, context: str, query: str):
    """Returns (answer_text, input_tokens, output_tokens) or raises requests.HTTPError."""
    r = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": OPENROUTER_HTTP_REFERER,
            "X-OpenRouter-Title": OPENROUTER_X_TITLE,
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": RAG_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"Context:\n{context}\n\nQuestion: {query}\n\nAnswer:",
                },
            ],
            "temperature": 0.7,
        },
        timeout=120,
    )
    if r.status_code != 200:
        raise RuntimeError(f"OpenRouter {r.status_code}: {r.text[:2000]}")
    data = r.json()
    answer = data.get("choices", [{}])[0].get("message", {}).get("content") or "No response"
    usage = data.get("usage") or {}
    return (
        answer,
        int(usage.get("prompt_tokens") or 0),
        int(usage.get("completion_tokens") or 0),
    )


def _call_gemini(model: str, context: str, query: str):
    """Google AI Studio generateContent. Returns (answer_text, input_tokens, output_tokens)."""
    url = f"{GEMINI_API_BASE}/models/{model}:generateContent"
    payload = {
        "systemInstruction": {"parts": [{"text": RAG_SYSTEM_PROMPT}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": f"Context:\n{context}\n\nQuestion: {query}\n\nAnswer:",
                    }
                ],
            }
        ],
        "generationConfig": {"temperature": 0.7},
    }
    r = requests.post(
        url,
        params={"key": GEMINI_API_KEY},
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    data = r.json()
    if r.status_code != 200:
        err = data.get("error", {})
        msg = err.get("message", r.text)
        raise RuntimeError(f"Gemini API {r.status_code}: {msg}")

    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError("Gemini returned no candidates (empty or blocked).")

    parts = (candidates[0].get("content") or {}).get("parts") or []
    texts = [p.get("text", "") for p in parts if isinstance(p, dict)]
    answer = "\n".join(t for t in texts if t).strip() or "No response"

    meta = data.get("usageMetadata") or {}
    inp = int(meta.get("promptTokenCount") or 0)
    out = int(meta.get("candidatesTokenCount") or 0)
    return answer, inp, out


def process_query(
    query: str, laptop_urls: str, llm_provider: str, model: str, backend_mode: str
) -> str:
    """
    Process query and get answer from LLM (OpenRouter or Google Gemini).
    """
    total_start_time = time.time()

    base = orchestrator_base_url(backend_mode)
    mode = (backend_mode or "cloud").strip().lower()
    if not base:
        if mode == "local":
            return "❌ LOCAL_ORCHESTRATOR_URL is not set for local mode."
        return "❌ WORKER_URL is not set for cloud mode."

    if not query or not query.strip():
        return "❌ Please provide a query"

    if not laptop_urls or not laptop_urls.strip():
        return "❌ Please provide at least one laptop URL"

    provider = (llm_provider or "openrouter").strip().lower()
    if provider not in ("openrouter", "gemini"):
        provider = "openrouter"

    if provider == "openrouter" and not OPENROUTER_API_KEY:
        return "❌ OpenRouter is selected but OPENROUTER_API_KEY is not set in .env."
    if provider == "gemini" and not GEMINI_API_KEY:
        return "❌ Google Gemini is selected but GEMINI_API_KEY is not set in .env (get a key at https://aistudio.google.com/apikey)."

    urls = [url.strip() for url in laptop_urls.split(",") if url.strip()]

    try:
        search_start_time = time.time()
        print("Querying worker for relevant chunks...")
        response = requests.post(
            f"{base}/process-query",
            json={"query": query, "laptop_urls": urls, "top_k": 5},
            timeout=60,
        )

        if response.status_code != 200:
            return f"❌ Error getting chunks: {response.status_code}\n{response.text}"

        search_time = time.time() - search_start_time
        data = response.json()
        chunks = data.get("chunks", [])
        worker_processing_time = data.get("processing_time_ms", 0) / 1000

        if not chunks:
            return "❌ No relevant chunks found. Make sure the document has been uploaded and processed."

        context = "\n\n".join(
            [
                f"[Chunk {chunk.get('chunk_index', '?')}]: {chunk.get('chunk_text', '')}"
                for chunk in chunks
            ]
        )

        llm_start_time = time.time()
        if provider == "gemini":
            print(f"Calling Google Gemini API with model: {model}...")
            answer, input_tokens, output_tokens = _call_gemini(model, context, query)
        else:
            print(f"Calling OpenRouter with model: {model}...")
            answer, input_tokens, output_tokens = _call_openrouter(model, context, query)

        llm_time = time.time() - llm_start_time
        total_time = time.time() - total_start_time

        provider_label = "Google Gemini" if provider == "gemini" else "OpenRouter"
        result = f"**Answer:**\n{answer}\n\n"
        result += "---\n\n"
        result += "**Performance Metrics:**\n"
        result += f"- Context used: {len(chunks)} chunks\n"
        result += f"- Vector search time: {search_time:.2f}s (Worker: {worker_processing_time:.2f}s)\n"
        result += f"- LLM ({provider_label}) time: {llm_time:.2f}s\n"
        result += f"- **Total query time: {total_time:.2f}s**\n"
        result += f"- Model: {model}\n"
        if input_tokens > 0 or output_tokens > 0:
            result += f"- Tokens: {input_tokens} input + {output_tokens} output = {input_tokens + output_tokens} total\n"

        return result

    except requests.exceptions.Timeout:
        return "❌ Request timed out. Please try again."
    except Exception as e:
        return f"❌ Error: {str(e)}"

# Create Gradio interface
with gr.Blocks(title="Distributed RAG System", theme=gr.themes.Soft()) as demo:
    gr.Markdown("# 🚀 Adaptive Cloud-Federated Multi-GPU Architecture")
    gr.Markdown("### Distributed Knowledge Extraction and Context-Aware Question Response")

    backend_radio = gr.Radio(
        choices=[
            ("Cloudflare + Supabase (default)", "cloud"),
            ("Local LAN + SQLite (no Supabase)", "local"),
        ],
        value=DEFAULT_BACKEND_MODE,
        label="Orchestrator backend",
        info=(
            "Default is Cloud unless BACKEND_MODE=local is in .env. "
            "Missing Supabase never auto-switches to Local—fix cloud config or deliberately choose Local. "
            "Local: python local_orchestrator.py; laptops omit SUPABASE_*; use LAN URLs."
        ),
    )

    # State to track if document is uploaded
    document_uploaded = gr.State(value=False)

    with gr.Row():
        with gr.Column(scale=1):
            gr.Markdown("### 📤 Step 1: Upload documents")
            gr.Markdown(
                "Upload one or more .txt or .pdf files (each becomes its own document in the index). "
                "Optional pasted text is uploaded as an extra document after your files."
            )
            
            file_upload = gr.File(
                label="Upload documents (.txt or .pdf)",
                file_types=[".txt", ".pdf"],
                file_count="multiple",
                type="filepath",
            )
            
            gr.Markdown("**OR** paste text below:")
            
            document_input = gr.Textbox(
                label="Document Text",
                placeholder="Paste your document here... (e.g., Indian Constitution)",
                lines=15,
                max_lines=30
            )
            
            laptop_urls_input = gr.Textbox(
                label="Laptop worker URLs",
                placeholder="http://192.168.1.10:8000 or https://....ngrok-free.app",
                value="",
                info="Comma-separated: LAN IPs for local mode, or ngrok URLs for cloud",
            )
            
            upload_btn = gr.Button("Upload & process document(s)", variant="primary", size="lg")
            
            upload_output = gr.Textbox(
                label="Upload Status",
                lines=10,
                interactive=False
            )
        
        with gr.Column(scale=1, visible=False) as chat_column:
            gr.Markdown("### ❓ Step 2: Ask Questions")
            gr.Markdown("Ask questions about your uploaded document.")
            
            query_input = gr.Textbox(
                label="Your Question",
                placeholder="What is this document about?",
                lines=3
            )
            
            query_laptop_urls = gr.Textbox(
                label="Laptop worker URLs",
                placeholder="Same as Step 1 (LAN or ngrok)",
                value="",
                info="Must match the backend you used for upload",
            )

            llm_provider_radio = gr.Radio(
                choices=[
                    ("OpenRouter", "openrouter"),
                    ("Google Gemini (AI Studio API key)", "gemini"),
                ],
                value=DEFAULT_LLM_PROVIDER,
                label="LLM provider",
                info="Students: use Gemini with a key from https://aistudio.google.com/apikey — set GEMINI_API_KEY in .env",
            )

            _initial_models = (
                GEMINI_MODEL_CHOICES
                if DEFAULT_LLM_PROVIDER == "gemini"
                else OPENROUTER_MODEL_CHOICES
            )
            _initial_model_value = (
                DEFAULT_GEMINI_MODEL
                if DEFAULT_LLM_PROVIDER == "gemini"
                else DEFAULT_MODEL
            )
            model_dropdown = gr.Dropdown(
                label="Model",
                choices=_initial_models,
                value=_initial_model_value,
            )
            
            query_btn = gr.Button("Get Answer", variant="primary", size="lg")
            
            query_output = gr.Markdown(
                label="Answer"
            )
    
    # Upload button handler
    def handle_upload(file, text, urls, backend_mode):
        status_msg, show_chat = upload_document(file, text, urls, backend_mode)
        return status_msg, gr.update(visible=show_chat), urls

    upload_btn.click(
        fn=handle_upload,
        inputs=[file_upload, document_input, laptop_urls_input, backend_radio],
        outputs=[upload_output, chat_column, query_laptop_urls],
    )
    
    def _on_llm_provider_change(provider: str):
        if (provider or "").strip().lower() == "gemini":
            return gr.update(choices=GEMINI_MODEL_CHOICES, value=DEFAULT_GEMINI_MODEL)
        return gr.update(choices=OPENROUTER_MODEL_CHOICES, value=DEFAULT_MODEL)

    llm_provider_radio.change(
        fn=_on_llm_provider_change,
        inputs=[llm_provider_radio],
        outputs=[model_dropdown],
    )

    # Query button handler
    query_btn.click(
        fn=process_query,
        inputs=[
            query_input,
            query_laptop_urls,
            llm_provider_radio,
            model_dropdown,
            backend_radio,
        ],
        outputs=query_output,
    )
    
    # About section at bottom
    with gr.Accordion("ℹ️ About This System", open=False):
        gr.Markdown("""
        This is a **distributed RAG (Retrieval-Augmented Generation)** system that:
        
        1. **Splits documents** into chunks and stores them in Supabase
        2. **Distributes embedding generation** across multiple laptop GPUs
        3. **Performs parallel vector search** on all laptops
        4. **Retrieves relevant chunks** and sends them to an LLM for answering
        
        ### Architecture:
        - **Cloudflare Worker**: Orchestrates the system
        - **Supabase**: Stores document chunks and embeddings
        - **Laptop Workers**: Generate embeddings and perform vector search (via ngrok)
        - **OpenRouter** or **Google Gemini (AI Studio)**: LLM for answers (pick in Step 2)
        - **Orchestrator**: Cloud (Worker + Supabase) or **Local** (`local_orchestrator.py` + SQLite, no Supabase)
        
        ### Setup:
        1. **Cloud:** Deploy Worker, set Supabase env vars; **Local:** `python local_orchestrator.py`, laptops without `SUPABASE_*`
        2. Run laptop workers: `python laptop_worker.py`
        3. If cloud: ngrok to expose laptops; if local: use LAN URLs only
        4. Use this UI to upload documents and ask questions!
        """)

if __name__ == "__main__":
    _missing = []
    if DEFAULT_BACKEND_MODE == "cloud" and not WORKER_URL:
        _missing.append("WORKER_URL (required for cloud default — or set BACKEND_MODE=local intentionally)")
    if not OPENROUTER_API_KEY and not GEMINI_API_KEY:
        _missing.append("OPENROUTER_API_KEY and/or GEMINI_API_KEY")
    if _missing:
        print("\nMissing environment variables:", ", ".join(_missing))
        print("Copy .env.example to .env in this folder and set the values.\n")
        raise SystemExit(1)

    print("\n" + "="*60)
    print("🚀 Starting Gradio UI...")
    print("="*60)
    print(f"📡 Cloud worker: {WORKER_URL or '(not set — use Local backend)'}")
    print(f"🏠 Local orchestrator URL: {LOCAL_ORCHESTRATOR_URL}")
    print(f"📋 Default orchestrator in UI: {DEFAULT_BACKEND_MODE} (set only via BACKEND_MODE=local; else cloud)")
    if DEFAULT_BACKEND_MODE == "local":
        print("   → Intentional LAN/SQLite mode. Cloud users: remove BACKEND_MODE or set BACKEND_MODE=cloud.")
    print(
        f"🔑 LLM keys: OpenRouter={'yes' if OPENROUTER_API_KEY else 'no'}, "
        f"Gemini={'yes' if GEMINI_API_KEY else 'no'}"
    )
    print(f"🌐 UI will be available at: http://localhost:7860")
    print("="*60)
    print("\n⚠️  Make sure:")
    print("   1. Laptop worker is running (python laptop_worker.py)")
    print("   2. ngrok is forwarding to http://localhost:8000")
    print("   3. Copy your ngrok URL and paste it in the UI")
    print("="*60 + "\n")
    
    try:
        demo.launch(share=False, server_name="0.0.0.0", server_port=7860)
    except KeyboardInterrupt:
        print("\n\nShutting down Gradio UI...")
    except Exception as e:
        print(f"\n\nError starting Gradio: {e}")
        raise

