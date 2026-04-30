import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import os from 'os'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/test/**/*.test.jsx', 'server/test/**/*.test.js'],
    exclude: ['server/test/setup.js', 'server/test/isolated.test.js', 'server/test/_mocks_/**'],
    env: {
      NODE_ENV: 'test',
      DB_TYPE: 'sqlite',
      DB_PATH: path.join(os.tmpdir(), `quizlet-test-${process.pid}.db`),
      ADMIN_USERNAME: '',
      ADMIN_PASSWORD: '',
    },
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,jsx}', 'server/**/*.js'],
      exclude: ['src/test/**', 'server/test/**', 'node_modules/**'],
    },
  },
})
