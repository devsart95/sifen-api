# CONTEXT — sifen-api

## Estado actual
Base funcional completa. Todos los módulos core implementados y con tests.
Listo para instalar dependencias, correr migraciones y probar contra SIFEN homologación.

## Completado
- [x] Configuración base: tsconfig, eslint, prettier, vitest, tsup, docker
- [x] Constantes SIFEN v150, validación de env con Zod
- [x] Utils: RUC (módulo 11), IVA (10%/5%/exento/exonerado), Date (4 formatos)
- [x] Servicios XML: CDC (44 chars, módulo 11), QR URL, generator, signer (XMLDSig RSA-SHA256), validator
- [x] Cliente SOAP con mTLS — todos los endpoints SIFEN (test/prod)
- [x] Schemas Zod: DE completo (todos los tipos), eventos (cancelación, inutilización, conformidad)
- [x] Prisma schema: Tenant, ApiKey, Timbrado, DocumentoElectronico, EventoElectronico, AuditLog
- [x] Middleware: auth (API key + SHA-256), error handler global
- [x] Routes v1: /documentos (emitir + consultar), /eventos, /consultas/ruc, /lotes (BullMQ)
- [x] BullMQ: colas lote-de + kude-pdf, worker procesador de lotes
- [x] Tests unitarios: RUC, IVA, IVA-edge, CDC, QR, validator, date (7 archivos, ~80 casos)
- [x] CI GitHub Actions corregido (migraciones condicionales, typecheck src+tests)
- [x] Prisma seed con tenant + API key + timbrado de prueba

## Pendiente
- [ ] `pnpm install` (lockfile aún no generado)
- [ ] Primera migración Prisma: `pnpm db:migrate`
- [ ] Tests de integración: rutas con DB real (tests/integration/)
- [ ] Tests E2E: contra SIFEN homologación con cert real (tests/e2e/)
- [ ] Servicio KuDE: generación PDF (puppeteer + plantilla HTML)
- [ ] Worker kude.worker.ts
- [ ] docker-compose.prod.yml
- [ ] workflow release.yml (tag → Docker Hub)
- [ ] Elevar coverage thresholds a 80% cuando integración y KuDE tengan tests

## Arquitectura de decisiones clave
- REST sobre SOAP: cualquier lenguaje puede integrar sin librerías SOAP
- Multi-tenant por API key (SHA-256 hash en DB, no texto plano)
- Lotes asíncronos con BullMQ para no bloquear el hilo principal
- Firma XMLDSig con node-forge (sin binarios nativos)
- Prisma para audit trail completo con enum TipoAccion tipado
- Validación estructural propia (sin XSD nativo) + validación real vía SIFEN homologación
