import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// GitHub Actions sets VITE_BASE to "/<repo>/" for project Pages; omit for root deploys.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
})
