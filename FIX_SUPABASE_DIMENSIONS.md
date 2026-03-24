# Fix Supabase Dimension Mismatch

## Problem
Your Supabase table expects 1536 dimensions, but the laptop worker is generating 384 dimensions.

## Solution: Update Supabase Table

Go to Supabase SQL Editor and run this:

```sql
-- Drop the existing embedding column
ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding;

-- Recreate with correct dimension (384)
ALTER TABLE document_chunks ADD COLUMN embedding VECTOR(384);

-- Recreate the index
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks 
USING hnsw (embedding vector_cosine_ops);
```

## Alternative: Change Model to Match Table

If you want to keep 1536 dimensions, you'll need to use a different embedding service (not sentence-transformers). But it's easier to just update the table to 384.

