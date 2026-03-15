import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // This base path must match your GitHub repository name
  base: '/GigMaster-synced/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
});