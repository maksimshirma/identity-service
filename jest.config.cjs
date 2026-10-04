/** @type {import('jest').Config} */
module.exports = {
  maxWorkers: 1,
  testEnvironment: "node",
  transform: {
    "^.+\\.(js|mjs|cjs|ts|mts|cts)$": [
      "@swc/jest",
      { jsc: { target: "es2022", parser: { syntax: "typescript" } }, module: { type: "commonjs" } },
    ],
  },
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  setupFiles: ["<rootDir>/src/test/jest-setup-env.cjs"],
  // Several deps (kysely, jose, hono, better-auth, ...) ship ESM-only or ESM-first
  // builds that Jest's CJS require() can't load as-is. pnpm nests real packages
  // under node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg> — any ignore regex
  // scoped to a single inner segment re-matches that path's OTHER "node_modules/"
  // occurrence, so just transform everything rather than fight pnpm's layout.
  transformIgnorePatterns: [],
  // db:migrate's entry script (src/db/migrations/run.ts) isn't imported by any test —
  // global-setup.ts duplicates its logic standalone — but Jest's haste/dependency crawl
  // still statically resolves every .ts file under roots and chokes on its relative
  // imports outside the normal jest-resolve pipeline.
  modulePathIgnorePatterns: ["<rootDir>/src/db/migrations/run\\.ts$"],
  testMatch: ["<rootDir>/src/**/__jest__/**/*.test.ts"],
};
