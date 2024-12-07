import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    headers: {
      "*.wasm": {
        "Content-Type": "application/wasm"
      }
    }
  },
  optimizeDeps: {
    exclude: ['babylon-mmd']
  }
});