import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  ...tseslint.configs.strictTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Prohibir any explícito
      '@typescript-eslint/no-explicit-any': 'error',
      // Forzar manejo de promesas
      '@typescript-eslint/no-floating-promises': 'error',
      // Prohibir console.log en src (usar el logger de Fastify)
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      // Consistencia en imports
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
  {
    // Tests: reglas más relajadas
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'prisma/migrations/'],
  },
)
