import { defineConfig } from "vitest/config";

// TEST_DATABASE_URL из .env (если есть); переменные окружения процесса приоритетнее
try {
  process.loadEnvFile();
} catch {
  // нет .env — используется дефолт из test/helpers.ts
}

export default defineConfig({
  test: {
    fileParallelism: false,
    hookTimeout: 20_000,
  },
});
