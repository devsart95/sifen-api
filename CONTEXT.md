# CONTEXT — sifen-api

## Estado actual
v0.3 implementado + auditado + corregidos todos los gaps encontrados en segunda auditoría.
Redis es opcional: servidor arranca sin REDIS_URL, lotes retornan 503 si no hay Redis.
Pendiente: `pnpm install` → `pnpm db:migrate` → configurar y probar contra SIFEN homologación.

## Completado
- [x] Configuración: tsconfig (src + test), eslint, vitest, tsup, docker dev/prod
- [x] Utils: RUC, IVA, Date (4 formatos centralizados)
- [x] Servicios XML: CDC, QR, generator (v150 completo), signer (XMLDSig RSA-SHA256), validator, parser
- [x] Cliente SOAP con mTLS — todos los endpoints SIFEN, acepta certOpts por tenant
- [x] Schemas Zod: DE (todos los tipos), eventos, admin (tenant/apikey/timbrado/cert)
- [x] Prisma schema: Tenant+cert, ApiKey+isAdmin, Timbrado, DE, Evento, AuditLog, SecuenciaTimbrado, IdempotencyRecord, WebhookDelivery
- [x] Middleware: auth (API key SHA-256), error handler, idempotencia (X-Idempotency-Key), admin (isAdmin)
- [x] Routes v1: documentos, eventos, consultas, lotes, admin (CRUD completo)
- [x] KuDE: template HTML oficial A4 + generator puppeteer singleton + worker background
- [x] BullMQ: colas lote-de + kude-pdf + webhook-delivery con retry exponencial
- [x] Circuit breaker para SIFEN (CLOSED/OPEN/HALF_OPEN, configurable)
- [x] Secuencia atómica: UPDATE RETURNING en SecuenciaTimbrado (sin race condition)
- [x] Idempotencia: X-Idempotency-Key con TTL 24h en tabla idempotency_records
- [x] Healthcheck diferenciado: /health (liveness) + /health/ready (DB + cert + circuit)
- [x] Parser respuesta SIFEN: dCodRes, dMsgRes, iSitDE, APROBADO_CON_OBSERVACIONES
- [x] CertificateManager: AES-256-GCM + HKDF por tenant, LRU cache 5min, fallback env vars
- [x] Admin API: CRUD tenants/api-keys/timbrados + upload cert P12 base64
- [x] Pool de SifenSoapClient por tenant (lazy, un cliente mTLS por cert)
- [x] Webhooks: BullMQ + HMAC-SHA256 + WebhookDelivery en DB + 5 reintentos exp.
- [x] Métricas Prometheus: /metrics con prom-client (METRICS_ENABLED=true)
- [x] Storage provider: interfaz + LocalStorageProvider + S3StorageProvider (lazy AWS SDK, @aws-sdk/client-s3 + presigner agregados)
- [x] Redis opcional: REDIS_URL optional en env, queues lazy en bull.ts, lotes 503 si no hay Redis, webhooks skip silencioso
- [x] nroProtocolo guardado en update post-aprobación (dProtCons de SIFEN)
- [x] LocalStorageProvider.upload firma corregida (mimeType agregado)
- [x] dispatcher.ts usa WebhookEstado enum de Prisma (no string literal)
- [x] Swagger/SwaggerUI deshabilitados en NODE_ENV=production
- [x] Tests unitarios: RUC, IVA, IVA-edge, CDC, QR, validator, date (~80 casos)
- [x] Tests integración: health, documentos, eventos, consultas
- [x] Tests E2E: setup condicional + sifen-soap.e2e.test.ts (guard SIFEN_E2E_CERT_PATH)
- [x] CI desactivado (reactivar con `gh workflow enable CI`)
- [x] docker-compose.prod.yml con resources limits, workers separados, volúmenes
- [x] release.yml: tag → ghcr.io + GitHub Release con changelog automático
- [x] Prisma seed: tenant + API key + timbrado de prueba
- [x] buildApp inyectable (deps opcionales para testing sin mocks globales)

## Pendiente inmediato
- [ ] `pnpm install` → generar lockfile
- [ ] `pnpm db:migrate` → migración Prisma con todos los modelos v0.3
- [ ] Reactivar CI cuando el proyecto esté listo para PR workflow

## Tests escritos (QA --full completado)
- [x] `tests/unit/services/certificate/crypto.test.ts` (15 casos: HKDF, roundtrip, tampering, cross-tenant)
- [x] `tests/unit/services/certificate/manager.test.ts` (11 casos: cache TTL, fallback, guardarCert)
- [x] `tests/unit/services/secuencia.test.ts` (17 casos: BigInt, rango, atomicidad)
- [x] `tests/unit/services/webhook/signature.test.ts` (14 casos: HMAC, timingSafeEqual, longitud)
- [x] `tests/unit/services/sifen/circuit-breaker.test.ts` (18 casos: FSM completo, ventana, cooldown)
- [x] `tests/unit/middleware/auth.test.ts` (13 casos: hash, timing attack, tenant inactivo)
- [x] `tests/unit/middleware/idempotency.test.ts` (12 casos: replay, TTL, namespace)
- [x] `tests/integration/routes/admin.test.ts` (21 casos: CRUD, P2025/P2002, isAdmin)

## Pendiente
- [ ] `pnpm install` → `pnpm db:migrate` → probar contra SIFEN homologación
- [ ] Reactivar CI (`gh workflow enable CI`)
- [ ] Tests E2E con cert real de homologación

## Roadmap
### v1.0 — Escalable y completo
- KuDE PDFs a S3/MinIO via StorageProvider (interfaz ya implementada)
- SDK npm @sifen-api/client (pnpm workspaces monorepo)
- Graceful degradation sin Redis
- Tests e2e completos contra SIFEN homologación

## Arquitectura de decisiones clave
- REST sobre SOAP: cualquier lenguaje integra sin librerías SOAP específicas
- Multi-tenant real v0.3: cert .p12 encriptado AES-256-GCM + HKDF por tenant en DB
- buildApp acepta deps inyectables → tests de integración sin mocks globales frágiles
- Firma XMLDSig con node-forge (sin binarios nativos — portabilidad total)
- Numeración atómica: UPDATE RETURNING en PostgreSQL (sin SELECT FOR UPDATE)
- Circuit breaker: FSM liviano sin dependencias externas (5 fallos → OPEN por 30s)
- Idempotencia: tabla con TTL 24h, namespaceada por tenant
- Pool SoapClient: un cliente mTLS por tenant en Map, lazy-loaded desde certManager
- Lotes asíncronos BullMQ: 202 Accepted inmediato, procesamiento en background
- KuDE generado on-demand por ruta HTTP o en background por worker
- Webhooks: BullMQ queue + HMAC-SHA256, 5 reintentos exponenciales, WebhookDelivery en DB
- Métricas: prom-client opt-in (METRICS_ENABLED=false default — no overhead en prod sin Prometheus)
- Storage: interfaz + factory → swap local/S3 sin cambiar código de negocio
