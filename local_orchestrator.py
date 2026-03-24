# Local orchestrator — same HTTP API as Cloudflare worker.js but uses SQLite (no Supabase).
# For LAN labs: run on one machine, point laptop URLs at http://192.168.x.x:8000 etc.
#
#   python local_orchestrator.py
#
# Gradio: set BACKEND_MODE=local or choose "Local" in the UI; LOCAL_ORCHESTRATOR_URL defaults to http://127.0.0.1:8788

from __future__ import annotations

import sqlite3
import time
from pathlib import Path
from typing import Any, List

import os
import requests
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parent / ".env")

DB_PATH = Path(os.environ.get("LOCAL_RAG_DB") or Path(__file__).resolve().parent / "local_rag.db")
CHUNK_SIZE = int(os.environ.get("CHUNK_SIZE") or "500")
HOST = os.environ.get("LOCAL_ORCHESTRATOR_HOST") or "0.0.0.0"
PORT = int(os.environ.get("LOCAL_ORCHESTRATOR_PORT") or "8788")

# Same header as worker.js for laptops reached via ngrok-free tunnels
LAPTOP_HEADERS = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
}

app = FastAPI(title="Local RAG Orchestrator", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_conn()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS document_chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chunk_text TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                document_id TEXT NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


class UploadBody(BaseModel):
    document_text: str
    laptop_urls: List[str]
    document_id: str | None = None


class ProcessQueryBody(BaseModel):
    query: str
    laptop_urls: List[str]
    top_k: int = 5


@app.on_event("startup")
def _startup() -> None:
    init_db()
    print(f"Local orchestrator DB: {DB_PATH.resolve()}")


@app.get("/status")
def status() -> dict[str, Any]:
    return {
        "status": "online",
        "mode": "local_sqlite",
        "message": "Local orchestrator (no Supabase)",
        "endpoints": [
            "POST /upload-document",
            "POST /process-query",
            "GET /status",
        ],
    }


@app.post("/upload-document")
def upload_document(body: UploadBody) -> dict[str, Any]:
    if not body.document_text or not body.laptop_urls:
        raise HTTPException(
            status_code=400, detail="document_text and laptop_urls required"
        )

    doc_id = body.document_id or f"doc_{int(time.time() * 1000)}"
    text = body.document_text
    chunks_meta: list[dict[str, Any]] = []
    for i in range(0, len(text), CHUNK_SIZE):
        slice_ = text[i : i + CHUNK_SIZE]
        chunks_meta.append(
            {
                "chunk_text": slice_,
                "chunk_index": i // CHUNK_SIZE + 1,
                "document_id": doc_id,
            }
        )

    all_inserted: list[dict[str, Any]] = []
    conn = get_conn()
    try:
        cur = conn.cursor()
        for ch in chunks_meta:
            cur.execute(
                """
                INSERT INTO document_chunks (chunk_text, chunk_index, document_id)
                VALUES (?, ?, ?)
                """,
                (ch["chunk_text"], ch["chunk_index"], ch["document_id"]),
            )
            all_inserted.append(
                {
                    "id": cur.lastrowid,
                    "chunk_text": ch["chunk_text"],
                    "chunk_index": ch["chunk_index"],
                    "document_id": ch["document_id"],
                }
            )
        conn.commit()
    finally:
        conn.close()

    n_laptops = len(body.laptop_urls)
    chunks_per = max(1, (len(all_inserted) + n_laptops - 1) // n_laptops)
    laptop_results: list[dict[str, Any]] = []

    for i, base_url in enumerate(body.laptop_urls):
        base = base_url.rstrip("/")
        start = i * chunks_per
        end = min(start + chunks_per, len(all_inserted))
        assigned = all_inserted[start:end]
        if not assigned:
            laptop_results.append(
                {
                    "laptop_id": i + 1,
                    "url": base_url,
                    "success": True,
                    "chunks_processed": 0,
                    "processing_time": 0.0,
                    "chunks_per_second": 0.0,
                    "fetch_time": 0.0,
                    "embedding_time": 0.0,
                    "store_time": 0.0,
                }
            )
            continue

        payload = {
            "document_id": doc_id,
            "items": [{"id": r["id"], "chunk_text": r["chunk_text"]} for r in assigned],
        }
        try:
            r = requests.post(
                f"{base}/generate-embeddings-local",
                headers=LAPTOP_HEADERS,
                json=payload,
                timeout=600,
            )
            data = r.json() if r.text else {}
            laptop_results.append(
                {
                    "laptop_id": i + 1,
                    "url": base_url,
                    "status": r.status_code,
                    "success": r.ok,
                    "chunks_processed": data.get("chunks_processed", 0),
                    "processing_time": data.get("processing_time", 0),
                    "chunks_per_second": data.get("chunks_per_second", 0),
                    "fetch_time": data.get("fetch_time", 0),
                    "embedding_time": data.get("embedding_time", 0),
                    "store_time": data.get("store_time", 0),
                }
            )
        except Exception as e:
            laptop_results.append(
                {
                    "laptop_id": i + 1,
                    "url": base_url,
                    "success": False,
                    "error": str(e),
                }
            )

    return {
        "success": True,
        "document_id": doc_id,
        "total_chunks": len(chunks_meta),
        "chunks_stored": len(all_inserted),
        "laptop_results": laptop_results,
        "message": "Document stored locally and sent to laptops for embedding",
    }


@app.post("/process-query")
def process_query(body: ProcessQueryBody) -> dict[str, Any]:
    if not body.query or not body.laptop_urls:
        raise HTTPException(status_code=400, detail="query and laptop_urls required")

    t0 = time.time()
    laptop_out: list[dict[str, Any]] = []
    for idx, base_url in enumerate(body.laptop_urls):
        base = base_url.rstrip("/")
        try:
            r = requests.post(
                f"{base}/search-chunks",
                headers=LAPTOP_HEADERS,
                json={"query": body.query, "top_k": body.top_k},
                timeout=120,
            )
            data = r.json() if r.text else {}
            laptop_out.append(
                {
                    "laptop_id": idx + 1,
                    "success": r.ok,
                    "chunk_ids": data.get("chunk_ids", []),
                    "search_time": data.get("search_time", 0),
                    "embedding_time": data.get("embedding_time", 0),
                    "search_compute_time": data.get("search_compute_time", 0),
                }
            )
        except Exception as e:
            laptop_out.append(
                {
                    "laptop_id": idx + 1,
                    "success": False,
                    "chunk_ids": [],
                    "error": str(e),
                }
            )

    all_ids: list[int] = []
    for lo in laptop_out:
        all_ids.extend(lo.get("chunk_ids") or [])
    unique_ids = list(dict.fromkeys(all_ids))

    if not unique_ids:
        return {
            "success": True,
            "chunks": [],
            "laptop_results": laptop_out,
            "processing_time_ms": int((time.time() - t0) * 1000),
            "message": "No relevant chunks found",
        }

    chunks: list[dict[str, Any]] = []
    conn = get_conn()
    try:
        cur = conn.cursor()
        for chunk_id in unique_ids:
            cur.execute(
                "SELECT id, chunk_text, chunk_index, document_id FROM document_chunks WHERE id = ?",
                (chunk_id,),
            )
            row = cur.fetchone()
            if row:
                chunks.append(
                    {
                        "id": row["id"],
                        "chunk_text": row["chunk_text"],
                        "chunk_index": row["chunk_index"],
                        "document_id": row["document_id"],
                    }
                )
    finally:
        conn.close()

    return {
        "success": True,
        "query": body.query,
        "chunks": chunks,
        "total_chunks": len(chunks),
        "laptop_results": laptop_out,
        "processing_time_ms": int((time.time() - t0) * 1000),
    }


if __name__ == "__main__":
    print("=" * 60)
    print("Local orchestrator (SQLite, no Supabase)")
    print(f"Listening on http://{HOST}:{PORT}")
    print("Set Gradio BACKEND_MODE=local and LOCAL_ORCHESTRATOR_URL if not default.")
    print("Laptops must run with Supabase disabled (omit SUPABASE_*) and support /generate-embeddings-local")
    print("=" * 60)
    uvicorn.run(app, host=HOST, port=PORT)
