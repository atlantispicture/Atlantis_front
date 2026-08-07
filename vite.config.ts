import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 5173 이 다른 프로젝트에 점유되는 일이 잦아 비어 있으면 다음 포트로 넘어간다
    port: 5174,
    strictPort: false,
    open: true,
  },
  build: {
    // three.js 가 번들의 대부분이라 앱 코드와 분리한다.
    // 앱을 고쳐도 three 청크는 캐시가 유지돼 재방문이 빨라진다.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          geo: ['d3-geo', 'earcut'],
        },
      },
    },
    // 위에서 쪼갠 뒤의 현실적인 상한
    chunkSizeWarningLimit: 700,
  },
})
