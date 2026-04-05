import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts', 'src/worker.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // Mantener los imports con extensión .js (NodeNext requiere ESM explícito)
  bundle: false,
  // Excluir dependencias del bundle (se instalan en node_modules)
  external: [
    '@prisma/client',
    'bullmq',
    'fastify',
    '@fastify/cors',
    '@fastify/helmet',
    '@fastify/rate-limit',
    '@fastify/swagger',
    '@fastify/swagger-ui',
    'axios',
    'node-forge',
    'xmlbuilder2',
    'fast-xml-parser',
    '@xmldom/xmldom',
    'puppeteer',
    'zod',
    'prom-client',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
  ],
})
