import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Ensures assets work even when the app is served from a sub-path.
  // Fixes "blank page" symptoms caused by 404s on absolute /assets/* URLs.
  base: "./",
  server: {
    port: 5173,
  },
})
