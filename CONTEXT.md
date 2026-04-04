# CONTEXT — sifen-api

## Estado actual
Implementación completa. Todos los módulos del CLAUDE.md están implementados.
Pendiente: instalar dependencias (`pnpm install`), primera migración y probar contra SIFEN homologación.

## Completado
- [x] Configuración: tsconfig (src + test), eslint, vitest, tsup, docker dev/prod
- [x] Utils: RUC, IVA, Date (4 formatos centralizados)
- [x] Servicios XML: CDC, QR, generator (v150 completo), signer (XMLDSig RSA-SHA256), validator
- [x] Cliente SOAP con mTLS — todos los endpoints SIFEN
- [x] Schemas Zod: DE (todos los tipos), eventos, con tipos exportados completos
- [x] Prisma schema: Tenant, ApiKey, Timbrado, DocumentoElectronico, EventoElectronico, AuditLog
- [x] Middleware: auth (API key SHA-256, tenantId), error handler global
- [x] Routes v1: documentos (POST emitir, GET consultar, GET kude PDF), eventos, consultas, lotes
- [x] KuDE: template HTML oficial A4 + generator puppeteer + worker background
- [x] BullMQ: colas lote-de + kude-pdf con retry exponencial, workers procesadores
- [x] Tests unitarios: RUC, IVA, IVA-edge, CDC, QR, validator, date (~80 casos)
- [x] Tests integración: health, documentos (emitir/consultar/auth/aislamiento), eventos, consultas
- [x] CI desactivado (reactivar con `gh workflow enable CI`)
- [x] docker-compose.prod.yml con resources limits, workers separados, volúmenes
- [x] release.yml: tag → ghcr.io + GitHub Release con changelog automático
- [x] Prisma seed: tenant + API key + timbrado de prueba
- [x] buildApp inyectable (deps opcionales para testing sin mocks globales)

## Pendiente inmediato
- [ ] `pnpm install` → generar lockfile
- [ ] `pnpm db:migrate` → primera migración Prisma
- [ ] Reactivar CI cuando el proyecto esté listo para PR workflow
- [ ] README oficial (auditoría de info pública + documentación de uso)
- [ ] Elevar coverage thresholds a 80% después de primera ejecución real de tests

## Arquitectura de decisiones clave
- REST sobre SOAP: cualquier lenguaje integra sin librerías SOAP específicas
- Multi-tenant: cada empresa tiene su propia API key y certificado
- buildApp acepta deps inyectables → tests de integración sin mocks globales frágiles
- Firma XMLDSig con node-forge (sin binarios nativos — portabilidad total)
- Validación estructural propia + validación real vía respuesta SIFEN
- Lotes asíncronos BullMQ: 202 Accepted inmediato, procesamiento en background
- KuDE generado on-demand por ruta HTTP o en background por worker
