import { defineConfig } from 'vitest/config';
export default defineConfig({
  // tsconfig keeps jsx: "preserve" for Next; the email templates (.tsx) need a real transform here.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    globals: false,
  },
});
