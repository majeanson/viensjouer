import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['{src,functions,worker}/**/*.test.ts'],
  },
})
