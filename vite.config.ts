import path from 'node:path'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: process.cwd(),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/frontend/routes',
      generatedRouteTree: './src/frontend/routeTree.gen.ts',
      routeFileIgnorePrefix: '-',
      quoteStyle: 'single',
    }),
    react(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react'
          }
          if (id.includes('node_modules/@mantine/')) {
            return 'mantine'
          }
          if (id.includes('node_modules/@tanstack/')) {
            return 'tanstack'
          }
          if (id.includes('node_modules/@xyflow/')) {
            return 'xyflow'
          }
          if (
            id.includes('node_modules/react-markdown') ||
            id.includes('node_modules/remark') ||
            id.includes('node_modules/rehype') ||
            id.includes('node_modules/unified') ||
            id.includes('node_modules/micromark') ||
            id.includes('node_modules/mdast') ||
            id.includes('node_modules/hast')
          ) {
            return 'markdown'
          }
          if (id.includes('node_modules/react-icons/')) {
            return 'icons'
          }
          if (
            id.includes('node_modules/monaco-editor/') ||
            id.includes('node_modules/@monaco-editor/')
          ) {
            return 'monaco'
          }
          if (id.includes('node_modules/')) {
            return 'vendor'
          }
        },
      },
    },
  },
})
