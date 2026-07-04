import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    health: 'src/health.ts',
    'enqueue-test-job': 'scripts/enqueue-test-job.ts',
  },
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  splitting: true,
})
