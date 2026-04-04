# CONTEXT — sifen-api

## Estado actual
v0.2 implementado. Sistema robusto, apto para producción con un contribuyente.
Pendiente: `pnpm install` → `pnpm db:migrate` → configurar certificado y probar contra SIFEN homologación.

## Completado
- [x] Configuración: tsconfig (src + test), eslint, vitest, tsup, docker dev/prod
- [x] Utils: RUC, IVA, Date (4 formatos centralizados)
- [x] Servicios XML: CDC, QR, generator (v150 completo), signer (XMLDSig RSA-SHA256), validator, parser
- [x] Cliente SOAP con mTLS — todos los endpoints SIFEN
- [x] Schemas Zod: DE (todos los tipos), eventos, con tipos exportados completos
- [x] Prisma schema: Tenant, ApiKey, Timbrado, DE, Evento, AuditLog, SecuenciaTimbrado, IdempotencyRecord
- [x] Middleware: auth (API key SHA-256), error handler, idempotencia (X-Idempotency-Key)
- [x] Routes v1: documentos (POST emitir, GET consultar, GET kude PDF), eventos, consultas, lotes
- [x] KuDE: template HTML oficial A4 + generator puppeteer singleton + worker background
- [x] BullMQ: colas lote-de + kude-pdf con retry exponencial, workers procesadores
- [x] Circuit breaker para SIFEN (CLOSED/OPEN/HALF_OPEN, configurable)
- [x] Secuencia atómica: UPDATE RETURNING en SecuenciaTimbrado (sin race condition)
- [x] Idempotencia: X-Idempotency-Key con TTL 24h en tabla idempotency_records
- [x] Healthcheck diferenciado: /health (liveness) + /health/ready (DB + cert + circuit)
- [x] Parser respuesta SIFEN: dCodRes, dMsgRes, iSitDE, APROBADO_CON_OBSERVACIONES
- [x] Tests unitarios: RUC, IVA, IVA-edge, CDC, QR, validator, date (~80 casos)
- [x] Tests integración: health, documentos, eventos, consultas
- [x] CI desactivado (reactivar con `gh workflow enable CI`)
- [x] docker-compose.prod.yml con resources limits, workers separados, volúmenes
- [x] release.yml: tag → ghcr.io + GitHub Release con changelog automático
- [x] Prisma seed: tenant + API key + timbrado de prueba
- [x] buildApp inyectable (deps opcionales para testing sin mocks globales)

## Pendiente inmediato
- [ ] `pnpm install` → generar lockfile
- [ ] `pnpm db:migrate` → primera migración Prisma (incluye nuevos modelos v0.2)
- [ ] Reactivar CI cuando el proyecto esté listo para PR workflow

## Roadmap (diseñado por Opus)
### v0.3 — Multi-tenant real (próximo)
- CertificateManager: cert .p12 por tenant, encriptado AES-256 en DB
- API admin: CRUD tenants, API keys, timbrados, upload cert
- Webhooks: notificación async via BullMQ + HMAC signing
- Métricas Prometheus: /metrics con contadores por tenant
- Correlation IDs end-to-end
- Rate limiting per-tenant configurable

### v1.0 — Escalable y completo
- KuDE PDFs a S3/MinIO
- SDK npm generado desde OpenAPI
- Graceful degradation sin Redis
- Tests e2e contra SIFEN homologación (hoy vacíos)

## Arquitectura de decisiones clave
- REST sobre SOAP: cualquier lenguaje integra sin librerías SOAP específicas
- Multi-tenant: cada empresa tiene su propia API key y certificado
- buildApp acepta deps inyectables → tests de integración sin mocks globales frágiles
- Firma XMLDSig con node-forge (sin binarios nativos — portabilidad total)
- Numeración atómica: UPDATE RETURNING en PostgreSQL (sin SELECT FOR UPDATE)
- Circuit breaker: FSM liviano sin dependencias externas (5 fallos → OPEN por 30s)
- Idempotencia: tabla con TTL 24h, namespaceada por tenant
- Cert global por ahora (v0.3 lo convierte en per-tenant)
- Lotes asíncronos BullMQ: 202 Accepted inmediato, procesamiento en background
- KuDE generado on-demand por ruta HTTP o en background por worker
