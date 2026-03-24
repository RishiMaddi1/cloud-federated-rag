# Supabase Table Setup Instructions

## Step 1: Go to Supabase SQL Editor

1. Go to: https://supabase.com/dashboard
2. Select your project: `xafjwlnacwbghwjeibwc`
3. Click on **"SQL Editor"** in the left sidebar
4. Click **"New query"**

## Step 2: Copy and Paste This SQL

```sql
-- Enable vector extension (for embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document_chunks table
CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    chunk_text TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    document_id TEXT,
    embedding VECTOR(384),  -- 384 for sentence-transformers/all-MiniLM-L6-v2 (default)
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_chunk_index ON document_chunks(chunk_index);

-- Create vector similarity search index (HNSW for fast approximate search)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks 
USING hnsw (embedding vector_cosine_ops);
```

## Step 3: Run the SQL

1. Click the **"Run"** button (or press `Ctrl+Enter`)
2. You should see: "Success. No rows returned"

## Step 4: Verify Table Created

1. Go to **"Table Editor"** in the left sidebar
2. You should see `document_chunks` table
3. Check the columns: `id`, `chunk_text`, `chunk_index`, `document_id`, `embedding`, `created_at`

## Done! ✅

Now you can run: `python test_supabase.py` to test it!

---

## Optional: Create Vector Search Function (for later)

If you want to do vector similarity search directly in Supabase, create this function:

```sql
CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding vector(384),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id int,
    chunk_text text,
    chunk_index int,
    document_id text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        document_chunks.id,
        document_chunks.chunk_text,
        document_chunks.chunk_index,
        document_chunks.document_id,
        1 - (document_chunks.embedding <=> query_embedding) as similarity
    FROM document_chunks
    WHERE document_chunks.embedding IS NOT NULL
        AND 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
    ORDER BY document_chunks.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
```

