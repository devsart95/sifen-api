# CONTEXT — sifen-api

## Estado actual
Proyecto recién creado. Estructura base y documentación definida. Sin código aún.

## Objetivo
REST API open source que abstrae SIFEN Paraguay: emitir, cancelar y consultar documentos
electrónicos (facturas, NC, ND, notas de remisión) via HTTP REST en lugar de SOAP directo.

## Completado
- [x] Definición de arquitectura y stack
- [x] CLAUDE.md con toda la referencia técnica SIFEN
- [x] CONTEXT.md y project.yaml

## En progreso
- [ ] Inicialización del proyecto (pnpm init, tsconfig, eslint, prettier)
- [ ] Repo GitHub público con descripción, topics y CI

## Pendiente
- [ ] Modelos Prisma (DocumentoElectronico, Tenant, ApiKey, Evento, AuditLog)
- [ ] Servicio XML: generación CDC + construcción XML DE tipo 1 (Factura)
- [ ] Servicio firma XMLDSig RSA-SHA256 con node-forge
- [ ] Cliente SOAP con mTLS para endpoints SIFEN
- [ ] Servicio QR URL generator
- [ ] Routes v1/documentos (POST emitir, GET consultar)
- [ ] Routes v1/eventos (cancelación, inutilización)
- [ ] Routes v1/lotes (batch hasta 50 DEs con BullMQ)
- [ ] Routes v1/consultas/ruc
- [ ] Generador KuDE (PDF)
- [ ] Auth middleware (API key)
- [ ] Rate limiting por tenant
- [ ] OpenAPI/Swagger auto-generado
- [ ] Tests unitarios: CDC, XML gen, firma, IVA utils
- [ ] Tests integración: todas las rutas
- [ ] Tests E2E: SIFEN homologación (con cert de prueba)
- [ ] GitHub Actions: CI + release
- [ ] Docker multi-stage + docker-compose

## Decisiones de diseño
- REST API (no SDK) para máxima compatibilidad: cualquier lenguaje puede integrar
- Multi-tenant: cada empresa tiene su certificado y timbrado propios
- Lotes asíncronos con BullMQ para no bloquear el thread principal
- Prisma para audit trail completo de cada DE y respuesta SIFEN
- Zod como fuente de verdad de tipos (schemas generan tipos TS y validación runtime)
