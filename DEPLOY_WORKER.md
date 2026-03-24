# Deploy Main Cloudflare Worker

## Step 1: Go to Cloudflare Workers Dashboard

1. Go to: https://workers.cloudflare.com/
2. Sign in to your account
3. Click **"Create a Worker"** (or edit existing worker)

## Step 2: Copy the Code

Copy the **ENTIRE** contents of `worker.js` file and paste it into the Cloudflare Workers editor.

## Step 3: Deploy

1. Click **"Deploy"** button (or **"Save and Deploy"**)
2. Wait for deployment to complete
3. Copy your Worker URL (e.g., `https://your-worker-name.workers.dev`)

## Step 4: Test

Test the status endpoint:
```bash
curl https://your-worker-name.workers.dev/status
```

Or visit in browser: `https://your-worker-name.workers.dev/status`

---

## Available Endpoints

After deployment, your worker will have:

- **POST /upload-document** - Upload document and distribute to laptops
- **POST /process-query** - Process query and get relevant chunks  
- **GET /status** - Check worker status

---

## Worker configuration (environment variables)

After pasting `worker.js`, open **Settings → Variables** for the Worker and add:

| Name | Notes |
|------|--------|
| `SUPABASE_URL` | e.g. `https://xxxxx.supabase.co` |
| `SUPABASE_KEY` | Use **Encrypt** (secret); anon or service role depending on your RLS |
| `SUPABASE_TABLE` | Optional; defaults to `document_chunks` |

Without `SUPABASE_URL` and `SUPABASE_KEY`, `/upload-document` and `/process-query` return **503** with a configuration error.

**Wrangler (optional):** see `wrangler.toml` and run `wrangler secret put SUPABASE_URL`, `wrangler secret put SUPABASE_KEY`, then `wrangler deploy`.

