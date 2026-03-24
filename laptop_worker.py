# Laptop Worker - FastAPI server for distributed embedding generation and search
# Run: python laptop_worker.py
# Make sure ngrok is forwarding to http://localhost:8000

from pathlib import Path
import os

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

print("="*60)
print("Starting Laptop Worker...")
print("="*60)

print("\n[1/5] Importing libraries...")
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
print("   ✓ FastAPI imported")

import torch
print("   ✓ PyTorch imported")

from sentence_transformers import SentenceTransformer
print("   ✓ SentenceTransformers imported")

from supabase import create_client, Client
print("   ✓ Supabase imported")

import numpy as np
print("   ✓ NumPy imported")

print("\n[2/5] Initializing FastAPI app...")
app = FastAPI(title="Laptop Worker API")
print("   ✓ FastAPI app created")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration (see .env.example)
def _require_env(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        raise RuntimeError(f"Missing {name} in environment or .env (see .env.example)")
    return v


SUPABASE_URL = _require_env("SUPABASE_URL")
SUPABASE_KEY = _require_env("SUPABASE_KEY")
SUPABASE_TABLE = (os.environ.get("SUPABASE_TABLE") or "document_chunks").strip()

# Initialize embedding model (using GPU if available)
print("\n[3/5] Checking device...")
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"   ✓ Using device: {device}")
if device == "cuda":
    print(f"   ✓ GPU: {torch.cuda.get_device_name(0)}")

# Load embedding model (sentence-transformers/all-MiniLM-L6-v2 = 384 dimensions)
# You can change this to other models like:
# - "sentence-transformers/all-mpnet-base-v2" (768 dims)
# - "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2" (384 dims)
EMBEDDING_MODEL = (
    os.environ.get("EMBEDDING_MODEL") or "sentence-transformers/all-MiniLM-L6-v2"
).strip()
EMBEDDING_DIM = int(os.environ.get("EMBEDDING_DIM") or "384")

print(f"\n[4/5] Loading embedding model: {EMBEDDING_MODEL}...")
print("   (This may take a minute if downloading for the first time...)")
try:
    embedding_model = SentenceTransformer(EMBEDDING_MODEL, device=device)
    print(f"   ✓ Model loaded successfully!")
except Exception as e:
    print(f"   ✗ Error loading model: {e}")
    raise

# Initialize Supabase client
print("\n[5/5] Connecting to Supabase...")
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("   ✓ Connected to Supabase")
except Exception as e:
    print(f"   ✗ Error connecting to Supabase: {e}")
    raise

print("\n" + "="*60)
print("All components initialized successfully!")
print("="*60 + "\n")

# In-memory cache for embeddings
# CPU cache: chunk_id -> NumPy array (for Supabase storage)
embeddings_cache_cpu = {}
# GPU cache: chunk_id -> PyTorch tensor (for fast GPU search)
embeddings_cache_gpu = None  # Will be a single tensor on GPU
chunk_ids_list = []  # Keep track of chunk IDs in order

# Request models
class GenerateEmbeddingsRequest(BaseModel):
    chunk_ids: List[int]
    document_id: str
    supabase_url: str
    supabase_key: str

class SearchChunksRequest(BaseModel):
    query: str
    top_k: int = 5

class HealthResponse(BaseModel):
    status: str
    device: str
    model: str
    cache_size: int
    gpu_cache_ready: bool

@app.get("/")
async def root():
    return {
        "message": "Laptop Worker API",
        "endpoints": [
            "POST /generate-embeddings - Generate embeddings for chunks",
            "POST /search-chunks - Search for relevant chunks",
            "GET /health - Health check"
        ]
    }

@app.get("/health")
async def health():
    global embeddings_cache_gpu
    return HealthResponse(
        status="online",
        device=device,
        model=EMBEDDING_MODEL,
        cache_size=len(embeddings_cache_cpu),
        gpu_cache_ready=(embeddings_cache_gpu is not None)
    )

@app.post("/generate-embeddings")
async def generate_embeddings(request: GenerateEmbeddingsRequest):
    """
    Generate embeddings for given chunk IDs and store them in Supabase.
    Also caches embeddings locally for faster search.
    """
    import time
    start_time = time.time()
    
    try:
        print(f"Received request to generate embeddings for {len(request.chunk_ids)} chunks")
        
        # Fetch chunks from Supabase
        fetch_start = time.time()
        chunk_ids_str = ','.join(map(str, request.chunk_ids))
        response = supabase.table(SUPABASE_TABLE).select('*').in_('id', request.chunk_ids).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Chunks not found in Supabase")
        
        chunks = response.data
        fetch_time = time.time() - fetch_start
        print(f"Fetched {len(chunks)} chunks from Supabase in {fetch_time:.2f}s")
        
        # Extract chunk texts
        chunk_texts = [chunk['chunk_text'] for chunk in chunks]
        
        # Generate embeddings (batch processing for efficiency)
        embedding_start = time.time()
        print(f"Generating embeddings on {device}...")
        embeddings = embedding_model.encode(
            chunk_texts,
            batch_size=32,
            show_progress_bar=True,
            convert_to_numpy=True
        )
        embedding_time = time.time() - embedding_start
        print(f"Generated embeddings in {embedding_time:.2f}s ({len(chunks)/embedding_time:.2f} chunks/sec)")
        
        # Store embeddings in Supabase and cache locally (PARALLEL)
        store_start = time.time()
        from concurrent.futures import ThreadPoolExecutor, as_completed
        
        def update_single_embedding(chunk_data, retry_count=0):
            """Update a single chunk's embedding in Supabase with retry logic"""
            chunk_id, embedding_list = chunk_data
            max_retries = 2
            
            try:
                supabase.table(SUPABASE_TABLE).update({
                    'embedding': embedding_list
                }).eq('id', chunk_id).execute()
                return chunk_id, embedding_list, True
            except Exception as e:
                # Retry on connection errors
                if retry_count < max_retries and ("disconnected" in str(e).lower() or "connection" in str(e).lower()):
                    time.sleep(0.1 * (retry_count + 1))  # Exponential backoff
                    return update_single_embedding(chunk_data, retry_count + 1)
                # Don't print every error to avoid spam
                if retry_count == max_retries:
                    return chunk_id, embedding_list, False
                return chunk_id, embedding_list, False
        
        # Prepare data for parallel processing
        update_tasks = []
        for i, chunk in enumerate(chunks):
            chunk_id = chunk['id']
            embedding = embeddings[i].tolist()
            update_tasks.append((chunk_id, embedding))
        
        # Parallel Supabase updates using ThreadPoolExecutor
        # Reduced to 10 workers to avoid rate limiting (Supabase connection limits)
        max_workers = min(10, len(update_tasks))
        processed_count = 0
        successful_count = 0
        failed_chunks = []
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all update tasks in parallel
            future_to_chunk = {
                executor.submit(update_single_embedding, task): task[0] 
                for task in update_tasks
            }
            
            # Process completed tasks and cache locally
            for future in as_completed(future_to_chunk):
                chunk_id, embedding_list, success = future.result()
                if success:
                    successful_count += 1
                    # Cache locally (CPU for Supabase compatibility)
                    embeddings_cache_cpu[chunk_id] = np.array(embedding_list)
                else:
                    failed_chunks.append(chunk_id)
                processed_count += 1
        
        # Retry failed chunks sequentially (slower but more reliable)
        if failed_chunks:
            print(f"Retrying {len(failed_chunks)} failed chunks sequentially...")
            retry_success = 0
            for chunk_id in failed_chunks:
                # Find the embedding for this chunk
                for i, chunk in enumerate(chunks):
                    if chunk['id'] == chunk_id:
                        embedding = embeddings[i].tolist()
                        try:
                            supabase.table(SUPABASE_TABLE).update({
                                'embedding': embedding
                            }).eq('id', chunk_id).execute()
                            embeddings_cache_cpu[chunk_id] = np.array(embedding)
                            retry_success += 1
                            break
                        except Exception as e:
                            print(f"Final retry failed for chunk {chunk_id}: {e}")
                            break
            successful_count += retry_success
        
        print(f"Parallel Supabase updates: {successful_count}/{processed_count} successful using {max_workers} threads")
        
        store_time = time.time() - store_start
        
        # Rebuild GPU cache tensor for fast search
        gpu_cache_start = time.time()
        global embeddings_cache_gpu, chunk_ids_list
        if device == "cuda" and len(embeddings_cache_cpu) > 0:
            # Convert all embeddings to GPU tensor
            all_embeddings = []
            chunk_ids_list = []
            for chunk_id in sorted(embeddings_cache_cpu.keys()):
                chunk_ids_list.append(chunk_id)
                all_embeddings.append(embeddings_cache_cpu[chunk_id])
            
            # Stack into single tensor and move to GPU (ensure float32 dtype)
            embeddings_cache_gpu = torch.tensor(np.array(all_embeddings), device=device, dtype=torch.float32)
            gpu_cache_time = time.time() - gpu_cache_start
            print(f"Built GPU cache tensor in {gpu_cache_time:.2f}s ({len(chunk_ids_list)} embeddings)")
        else:
            gpu_cache_time = 0
        
        total_time = time.time() - start_time
        
        print(f"Successfully processed {processed_count} chunks in {total_time:.2f}s total")
        print(f"  - Fetch: {fetch_time:.2f}s, Embedding: {embedding_time:.2f}s, Store: {store_time:.2f}s, GPU Cache: {gpu_cache_time:.2f}s")
        
        return {
            "success": True,
            "chunks_processed": processed_count,
            "processing_time": total_time,
            "fetch_time": fetch_time,
            "embedding_time": embedding_time,
            "store_time": store_time,
            "gpu_cache_time": gpu_cache_time,
            "chunks_per_second": processed_count / total_time if total_time > 0 else 0,
            "message": f"Generated and stored embeddings for {processed_count} chunks in {total_time:.2f}s"
        }
        
    except Exception as e:
        print(f"Error generating embeddings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search-chunks")
async def search_chunks(request: SearchChunksRequest):
    """
    Search for relevant chunks using vector similarity.
    Uses cached embeddings for fast search.
    """
    import time
    start_time = time.time()
    
    try:
        print(f"Searching for chunks matching query: '{request.query[:50]}...'")
        
        # Generate query embedding
        embedding_start = time.time()
        query_embedding = embedding_model.encode(
            request.query,
            convert_to_numpy=True
        )
        embedding_time = time.time() - embedding_start
        
        # If cache is empty, load embeddings from Supabase
        load_start = time.time()
        global embeddings_cache_gpu, chunk_ids_list
        
        if len(embeddings_cache_cpu) == 0:
            print("Cache empty, loading embeddings from Supabase...")
            response = supabase.table(SUPABASE_TABLE).select('id,embedding').not_.is_('embedding', 'null').execute()
            
            for row in response.data:
                if row['embedding']:
                    embeddings_cache_cpu[row['id']] = np.array(row['embedding'])
            
            # Build GPU cache if GPU available
            if device == "cuda" and len(embeddings_cache_cpu) > 0:
                all_embeddings = []
                chunk_ids_list = []
                for chunk_id in sorted(embeddings_cache_cpu.keys()):
                    chunk_ids_list.append(chunk_id)
                    all_embeddings.append(embeddings_cache_cpu[chunk_id])
                embeddings_cache_gpu = torch.tensor(np.array(all_embeddings), device=device, dtype=torch.float32)
                print(f"Built GPU cache tensor ({len(chunk_ids_list)} embeddings)")
            
            load_time = time.time() - load_start
            print(f"Loaded {len(embeddings_cache_cpu)} embeddings from Supabase in {load_time:.2f}s")
        else:
            load_time = 0
        
        if len(embeddings_cache_cpu) == 0:
            return {
                "success": True,
                "chunk_ids": [],
                "message": "No embeddings found. Please generate embeddings first."
            }
        
        # GPU-accelerated batch similarity calculation
        search_start = time.time()
        
        if device == "cuda" and embeddings_cache_gpu is not None:
            # GPU-accelerated batch search using PyTorch (parallelized on GPU)
            # Ensure same dtype (float32) for both tensors
            query_tensor = torch.tensor(query_embedding, device=device, dtype=torch.float32).unsqueeze(0)  # Shape: [1, dim]
            
            # Ensure embeddings are also float32
            if embeddings_cache_gpu.dtype != torch.float32:
                embeddings_cache_gpu = embeddings_cache_gpu.float()
            
            # Batch cosine similarity on GPU (all parallelized by CUDA)
            # Normalize query
            query_norm = torch.nn.functional.normalize(query_tensor, p=2, dim=1)
            # Normalize all embeddings
            embeddings_norm = torch.nn.functional.normalize(embeddings_cache_gpu, p=2, dim=1)
            # Batch matrix multiplication (GPU-accelerated, parallel)
            similarities_tensor = torch.mm(query_norm, embeddings_norm.t()).squeeze(0)  # Shape: [num_chunks]
            
            # Get top_k (GPU-accelerated)
            top_k_values, top_k_indices = torch.topk(similarities_tensor, min(request.top_k, len(chunk_ids_list)))
            
            # Convert to CPU and get chunk IDs
            top_k_indices_cpu = top_k_indices.cpu().numpy()
            similarities_cpu = top_k_values.cpu().numpy()
            
            top_results = [(chunk_ids_list[idx], float(sim)) for idx, sim in zip(top_k_indices_cpu, similarities_cpu)]
            search_time = time.time() - search_start
            
            print(f"GPU-accelerated search: {len(top_results)} results in {search_time:.3f}s")
            
        else:
            # Fallback to CPU search (sequential)
            similarities = []
            for chunk_id, chunk_embedding in embeddings_cache_cpu.items():
                # Cosine similarity
                similarity = np.dot(query_embedding, chunk_embedding) / (
                    np.linalg.norm(query_embedding) * np.linalg.norm(chunk_embedding)
                )
                similarities.append((chunk_id, float(similarity)))
            
            # Sort by similarity (descending) and get top_k
            similarities.sort(key=lambda x: x[1], reverse=True)
            top_results = similarities[:request.top_k]
            search_time = time.time() - search_start
            
            print(f"CPU search: {len(top_results)} results in {search_time:.3f}s")
        
        chunk_ids = [chunk_id for chunk_id, _ in top_results]
        total_time = time.time() - start_time
        
        print(f"Found {len(chunk_ids)} relevant chunks in {total_time:.2f}s")
        print(f"  - Query embedding: {embedding_time:.3f}s, Search: {search_time:.3f}s")
        
        return {
            "success": True,
            "chunk_ids": chunk_ids,
            "similarities": [sim for _, sim in top_results],
            "search_time": total_time,
            "embedding_time": embedding_time,
            "search_compute_time": search_time,
            "gpu_accelerated": device == "cuda" and embeddings_cache_gpu is not None,
            "message": f"Found {len(chunk_ids)} relevant chunks in {total_time:.2f}s (GPU: {device == 'cuda'})"
        }
        
    except Exception as e:
        print(f"Error searching chunks: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*60)
    print("🚀 Starting Laptop Worker API Server...")
    print("="*60)
    print(f"📱 Device: {device}")
    print(f"🤖 Model: {EMBEDDING_MODEL}")
    print(f"📊 Embedding Dimension: {EMBEDDING_DIM}")
    print(f"🌐 Server: http://0.0.0.0:8000")
    print("="*60)
    print("\n⚠️  Make sure ngrok is running and forwarding to http://localhost:8000")
    print("📝 API will be available at: https://your-ngrok-url.ngrok.io")
    print("="*60 + "\n")
    
    try:
        uvicorn.run(app, host="0.0.0.0", port=8000)
    except KeyboardInterrupt:
        print("\n\nShutting down server...")
    except Exception as e:
        print(f"\n\nError starting server: {e}")
        raise

