export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  // Les clients @mairie360/*-openapi sont publiés en TypeScript ESM (orval) : ts-jest doit les compiler pour que
  // les tests passent par les vrais clients HTTP. Leurs déclarations ne sont pas vérifiées, ni celles de
  // src/clients/ : sous ts-jest, axios y est typé à la fois via index.d.ts et index.d.cts alors que
  // `npm run build` (tsc) le vérifie sans erreur.
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { diagnostics: { exclude: ['**/node_modules/**', '**/src/clients/*.ts'] } },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!@mairie360/)'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageReporters: ['text-summary', 'lcov'],
  coverageThreshold: {
    global: { branches: 60, functions: 60, lines: 60, statements: 60 },
  },
};
