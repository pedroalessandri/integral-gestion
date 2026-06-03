import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import swc from 'unplugin-swc';

export default defineConfig(({ mode }) => {
  // Load .env from apps/api so required vars (DATABASE_URL, etc.) are available
  // in the test process without having to set them manually in CI.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      // SWC plugin is required to support emitDecoratorMetadata (needed by NestJS DI).
      // Vite's default esbuild transpiler does not emit decorator metadata.
      swc.vite({
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { decoratorMetadata: true },
        },
      }),
    ],
    test: {
      globals: true,
      environment: 'node',
      include: ['test/**/*.e2e-spec.ts'],
      setupFiles: ['test/setup.ts'],
      testTimeout: 60_000,
      hookTimeout: 60_000,
      env,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary'],
      },
    },
  };
});
