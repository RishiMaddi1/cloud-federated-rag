// Main Cloudflare Worker - Deploy this on Cloudflare Workers dashboard
// Handles document upload, query processing, and coordination with laptops

export default {
  async fetch(req, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const SUPABASE_URL = env.SUPABASE_URL;
    const SUPABASE_KEY = env.SUPABASE_KEY;
    const SUPABASE_TABLE = env.SUPABASE_TABLE || "document_chunks";

    function missingSupabaseResponse() {
      return new Response(
        JSON.stringify({
          error: "Server misconfiguration: set SUPABASE_URL and SUPABASE_KEY on the Worker (Dashboard → Settings → Variables, or wrangler secrets).",
        }),
        { status: 503, headers: corsHeaders }
      );
    }

    // ngrok free: HTML interstitial breaks res.json() on laptop calls — keep this on both fetches.
    const laptopFetchHeaders = {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    };

    // 📍 Route 1: Upload Document
    if (req.method === 'POST' && new URL(req.url).pathname === '/upload-document') {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        return missingSupabaseResponse();
      }
      try {
        const body = await req.json();
        const { document_text, document_id, laptop_urls } = body;

        if (!document_text || !laptop_urls || !Array.isArray(laptop_urls) || laptop_urls.length === 0) {
          return new Response(JSON.stringify({ 
            error: "document_text and laptop_urls array required" 
          }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        const docId = document_id || `doc_${Date.now()}`;
        
        // Step 1: Split document into chunks
        const chunkSize = 500; // characters per chunk
        const chunks = [];
        for (let i = 0; i < document_text.length; i += chunkSize) {
          chunks.push({
            chunk_text: document_text.slice(i, i + chunkSize),
            chunk_index: Math.floor(i / chunkSize) + 1,
            document_id: docId,
          });
        }

        console.log(`Split document into ${chunks.length} chunks`);

        // Step 2: Store chunks in Supabase (sequential to avoid connection limits)
        const allInserted = [];
        const batchSize = 50; // Reduced batch size to avoid connection limits
        
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);
          
          try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`, {
              method: 'POST',
              headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
              },
              body: JSON.stringify(batch),
            });
            
            if (response.ok) {
              const data = await response.json();
              allInserted.push(...data);
            } else {
              const errorText = await response.text();
              console.error(`Error inserting batch ${i / batchSize + 1}: ${response.status} - ${errorText}`);
              // Continue with next batch instead of failing completely
            }
          } catch (error) {
            console.error(`Exception inserting batch ${i / batchSize + 1}: ${error.message}`);
            // Continue with next batch
          }
        }

        console.log(`Stored ${allInserted.length} chunks in Supabase`);

        // Step 3: Distribute chunks to laptops for embedding generation
        // Automatically splits chunks evenly across all laptops in the array
        // Example: 100 chunks, 1 laptop = all 100 to laptop 1
        //          100 chunks, 2 laptops = 50 each, 3 laptops = 34/33/33, etc.
        const chunksPerLaptop = Math.ceil(chunks.length / laptop_urls.length);
        const laptopTasks = [];

        for (let i = 0; i < laptop_urls.length; i++) {
          const startIdx = i * chunksPerLaptop;
          const endIdx = Math.min(startIdx + chunksPerLaptop, chunks.length);
          const assignedChunks = allInserted.slice(startIdx, endIdx);
          const chunkIds = assignedChunks.map(c => c.id);

          laptopTasks.push(
            fetch(`${laptop_urls[i]}/generate-embeddings`, {
              method: 'POST',
              headers: laptopFetchHeaders,
              body: JSON.stringify({
                chunk_ids: chunkIds,
                document_id: docId,
                supabase_url: SUPABASE_URL,
                supabase_key: SUPABASE_KEY,
              }),
            }).then(async (res) => {
              const data = await res.json();
              return {
                laptop_id: i + 1,
                url: laptop_urls[i],
                status: res.status,
                success: res.ok,
                chunks_processed: data.chunks_processed || 0,
                processing_time: data.processing_time || 0,
                chunks_per_second: data.chunks_per_second || 0,
                fetch_time: data.fetch_time || 0,
                embedding_time: data.embedding_time || 0,
                store_time: data.store_time || 0,
              };
            }).catch((err) => {
              return {
                laptop_id: i + 1,
                url: laptop_urls[i],
                error: err.message,
                success: false,
              };
            })
          );
        }

        const laptopResults = await Promise.all(laptopTasks);

        return new Response(JSON.stringify({
          success: true,
          document_id: docId,
          total_chunks: chunks.length,
          chunks_stored: allInserted.length,
          laptop_results: laptopResults,
          message: "Document uploaded and distributed to laptops for processing",
        }), {
          status: 200,
          headers: corsHeaders,
        });

      } catch (e) {
        return new Response(JSON.stringify({ 
          error: e.message,
          stack: e.stack 
        }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // 📍 Route 2: Process Query
    if (req.method === 'POST' && new URL(req.url).pathname === '/process-query') {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        return missingSupabaseResponse();
      }
      try {
        const body = await req.json();
        const { query, laptop_urls, top_k = 5 } = body;

        if (!query || !laptop_urls || !Array.isArray(laptop_urls) || laptop_urls.length === 0) {
          return new Response(JSON.stringify({ 
            error: "query and laptop_urls array required" 
          }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        console.log(`Processing query with ${laptop_urls.length} laptops`);

        // Step 1: Send query to all laptops in parallel
        const startTime = Date.now();
        const laptopPromises = laptop_urls.map((url, index) =>
          fetch(`${url}/search-chunks`, {
            method: 'POST',
            headers: laptopFetchHeaders,
            body: JSON.stringify({
              query: query,
              top_k: top_k,
            }),
          }).then(async (res) => {
            const data = await res.json();
            return {
              laptop_id: index + 1,
              success: res.ok,
              chunk_ids: data.chunk_ids || [],
              search_time: data.search_time || 0,
              embedding_time: data.embedding_time || 0,
              search_compute_time: data.search_compute_time || 0,
            };
          }).catch((err) => {
            return {
              laptop_id: index + 1,
              success: false,
              chunk_ids: [],
              error: err.message,
            };
          })
        );

        const laptopResults = await Promise.all(laptopPromises);
        const allChunkIds = laptopResults.flatMap(r => r.chunk_ids || []);
        
        // Remove duplicates
        const uniqueChunkIds = [...new Set(allChunkIds)];

        console.log(`Collected ${uniqueChunkIds.length} unique chunk IDs from laptops`);

        // Step 2: Fetch chunk text from Supabase
        if (uniqueChunkIds.length === 0) {
          return new Response(JSON.stringify({
            success: true,
            chunks: [],
            message: "No relevant chunks found",
          }), {
            status: 200,
            headers: corsHeaders,
          });
        }

        // Fetch chunks in batches (Supabase has limits)
        const chunks = [];
        for (let i = 0; i < uniqueChunkIds.length; i += 100) {
          const batchIds = uniqueChunkIds.slice(i, i + 100);
          const idsString = batchIds.join(',');
          
          const supabaseResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=in.(${idsString})&select=id,chunk_text,chunk_index,document_id`,
            {
              method: 'GET',
              headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (supabaseResponse.ok) {
            const data = await supabaseResponse.json();
            chunks.push(...data);
          }
        }

        const endTime = Date.now();
        const duration = endTime - startTime;

        return new Response(JSON.stringify({
          success: true,
          query: query,
          chunks: chunks,
          total_chunks: chunks.length,
          laptop_results: laptopResults,
          processing_time_ms: duration,
        }), {
          status: 200,
          headers: corsHeaders,
        });

      } catch (e) {
        return new Response(JSON.stringify({ 
          error: e.message,
          stack: e.stack 
        }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // 📍 Route 3: Check Status
    if (req.method === 'GET' && new URL(req.url).pathname === '/status') {
      return new Response(JSON.stringify({
        status: "online",
        message: "Cloudflare Worker is running",
        endpoints: [
          "POST /upload-document - Upload and process document",
          "POST /process-query - Process query and get relevant chunks",
          "GET /status - Check worker status"
        ]
      }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // 📍 Fallback
    return new Response(JSON.stringify({ 
      error: "Not Found",
      available_endpoints: [
        "POST /upload-document",
        "POST /process-query",
        "GET /status"
      ]
    }), {
      status: 404,
      headers: corsHeaders,
    });
  }
};

