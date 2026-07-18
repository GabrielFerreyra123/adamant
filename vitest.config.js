import { defineConfig } from "vitest/config";

// pool 'forks' (default en Vitest 4) evita el flake de arranque ("failed to find the current suite")
// que aparecía con el pool de threads al registrar tests en bucles top-level. NO usar singleFork:
// en Vitest 4 esa opción reintroduce el mismo flake de forma determinista.
export default defineConfig({
  test: { pool: "forks", include: ["test/**/*.test.mjs"] }
});
