# Cloudflare Pages Deploy (web/)

## 1) Create Pages project
- Connect your GitHub repo in Cloudflare Pages
- Set **Root directory** to `web`
- Framework preset: Vite (or None with manual settings)
- There is **no** `wrangler.toml` at the repo root on purpose: Worker deploy uses `wrangler.toml.example` so Pages does not try to parse Worker config as a Pages build file.

## 2) Build settings
- Build command: `npm run build`
- Build output directory: `dist`

## 3) Optional environment variables
Use values from `web/.env.example` if you want defaults:
- `VITE_BACKEND_MODE`
- `VITE_WORKER_URL`
- `VITE_LOCAL_ORCHESTRATOR_URL`
- `VITE_DEFAULT_LLM_PROVIDER`
- `VITE_DEFAULT_MODEL`
- `VITE_GEMINI_API_BASE`
- `VITE_OPENROUTER_REFERER`
- `VITE_OPENROUTER_TITLE`

## 4) Deploy
- Push to main branch
- Cloudflare Pages auto-builds and publishes

## 5) Security recommendation
This frontend accepts user API keys in-browser for OpenRouter/Gemini. For high-traffic public use, proxy LLM calls through a backend and enforce anti-abuse controls.
