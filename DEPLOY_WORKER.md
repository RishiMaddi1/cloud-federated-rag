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

## Worker Configuration

The worker is already configured with:
- ✅ Supabase URL: `https://xafjwlnacwbghwjeibwc.supabase.co`
- ✅ Supabase Key: (service role key)
- ✅ Table name: `document_chunks`
- ✅ CORS enabled for all origins

No environment variables needed - everything is hardcoded!

