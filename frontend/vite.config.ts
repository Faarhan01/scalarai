import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        'frontend': path.resolve(__dirname, 'src'),
        '@tokens': path.resolve(__dirname, 'src/tokens'),
        '@styles': path.resolve(__dirname, 'src/styles'),
      },
    },
    server: {
      hmr: false,
      watch: null,
    },
    build: {
      outDir: path.resolve(__dirname, '../dist'),
      emptyOutDir: false,
    },
  };
});
