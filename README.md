<div align="center">

# sifen-api

**REST gateway para facturación electrónica en Paraguay**

Tu sistema habla `JSON`. sifen-api habla `SOAP 1.2 + XMLDSig + mTLS` con la SET.

[![version](https://img.shields.io/badge/version-0.2.0-6366f1?style=flat-square)](https://github.com/devsart95/sifen-api/releases)
[![license](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-3b82f6?style=flat-square)](https://nodejs.org)
[![typescript](https://img.shields.io/badge/TypeScript-strict-3b82f6?style=flat-square)](https://www.typescriptlang.org)
[![fastify](https://img.shields.io/badge/Fastify-v5-f97316?style=flat-square)](https://fastify.dev)
[![CI](https://img.shields.io/badge/CI-GitHub_Actions-6b7280?style=flat-square)](https://github.com/devsart95/sifen-api/actions)

</div>

---

## El problema

Integrar SIFEN directamente implica resolver siete capas de complejidad al mismo tiempo:

```
1. XML v150         → estructura con ~200 campos anidados, versiones de formato
2. CDC (44 dígitos) → RUC+EST+PUN+TIPO+NUM+FECHA+TIPOEMI+SEG+DV con módulo 11
3. XMLDSig          → firma enveloped RSA-SHA256 con C14N + PKCS#12
4. mTLS             → autenticación mutual TLS con certificado del contribuyente
5. SOAP 1.2         → envelope, namespaces, endpoints que devuelven XML
6. QR SET           → URL con formato específico + DigestValue post-firma
7. IVA              → cálculo por tasa (10%/5%/exento) con reglas de redondeo
```

sifen-api resuelve las siete. Tú envías `POST /v1/documentos` con JSON, recibes el CDC aprobado.

---

## Arquitectura

```
                              sifen-api
┌─────────────┐        ┌──────────────────────────┐        ┌─────────────┐
│             │        │  Fastify v5  │  Zod       │        │             │
│  Tu sistema │ ──────▶│  validation  │  schemas   │──────▶ │  SIFEN SET  │
│  (JSON/REST)│ ◀───── │  XML gen     │  XMLDSig   │◀────── │  (gov.py)   │
│             │        │  CDC + QR    │  mTLS      │        │             │
└─────────────┘        │──────────────────────────│        └─────────────┘
                        │  PostgreSQL 16            │
                        │  Redis + BullMQ (lotes)   │
                        │  Circuit Breaker          │
                        │  Idempotency layer        │
                        └──────────────────────────┘
```

**Flujo de una factura:**

```
POST /v1/documentos
  │
  ├─ Zod validation
  ├─ Buscar timbrado activo del tenant
  ├─ Reservar número correlativo (UPDATE atómico — sin race condition)
  ├─ Generar XML DE v150
  ├─ Validar estructura
  ├─ Firmar XMLDSig RSA-SHA256 (PKCS#12)
  ├─ Guardar en DB con estado PENDIENTE
  ├─ Circuit breaker → SOAP recibirDE → SIFEN
  ├─ Actualizar estado (APROBADO / APROBADO_CON_OBSERVACIONES / RECHAZADO / ERROR)
  └─ Responder JSON: { cdc, estado, urlQr, codigoSifen, mensajeSifen }
```

---

## Quick start

### 1. Clonar y configurar

```bash
git clone https://github.com/devsart95/sifen-api.git
cd sifen-api
cp .env.example .env
```

Editar `.env` con al menos:

```env
SIFEN_CERT_PATH=/etc/sifen/certs/cert.p12   # certificado PKCS#12 del contribuyente
SIFEN_CERT_PASS=tu_passphrase               # passphrase del .p12
API_KEY_SECRET=<openssl rand -hex 32>       # mínimo 32 chars
DATABASE_URL=postgresql://sifen:CHANGE_ME@localhost:5433/sifen_api
```

### 2. Levantar servicios

```bash
cd docker && docker compose up -d
docker compose exec api pnpm db:push
docker compose exec api pnpm db:seed
```

La API estará en `http://localhost:3000`. Swagger UI en `http://localhost:3000/docs`.

El seed crea un tenant de prueba con API key: `test-api-key-32-chars-minimum-here`

### 3. Primer request

```bash
# Healthcheck
curl http://localhost:3000/health

# Readiness (verifica DB + cert + circuit breaker)
curl http://localhost:3000/health/ready

# Emitir una factura
curl -X POST http://localhost:3000/v1/documentos \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-api-key-32-chars-minimum-here" \
  -d @examples/factura.json
```

**Respuesta exitosa:**

```json
{
  "cdc": "01800695630010010011000000120240101010123456784",
  "estado": "APROBADO",
  "urlQr": "https://ekuatia.set.gov.py/consultas/qr?...",
  "codigoSifen": "0260",
  "mensajeSifen": "Aceptado"
}
```

---

## Endpoints

Todos los endpoints (excepto `/health*` y `/docs`) requieren el header `X-API-Key`.

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `GET`  | `/health` | Liveness probe | No |
| `GET`  | `/health/ready` | Readiness probe (DB + cert + SIFEN) | No |
| `GET`  | `/docs` | Swagger UI (OpenAPI) | No |
| `POST` | `/v1/documentos` | Emitir DE (factura, NC, ND, NR...) | Sí |
| `GET`  | `/v1/documentos/:cdc` | Consultar estado de un DE por CDC | Sí |
| `GET`  | `/v1/documentos/:cdc/kude` | Descargar PDF KuDE (A4) | Sí |
| `POST` | `/v1/eventos` | Enviar evento (cancelación, inutilización, conformidad) | Sí |
| `POST` | `/v1/lotes` | Enviar lote asíncrono (hasta 50 DEs) | Sí |
| `GET`  | `/v1/lotes/:jobId` | Consultar estado de un lote | Sí |
| `GET`  | `/v1/consultas/ruc/:ruc` | Consultar contribuyente por RUC en SIFEN | Sí |
| `GET`  | `/v1/consultas/lote/:protocolo` | Consultar lote por protocolo SIFEN | Sí |

### Tipos de documento

| Código | Tipo |
|--------|------|
| `1` | Factura Electrónica |
| `2` | Factura Electrónica de Exportación |
| `3` | Factura Electrónica de Importación |
| `4` | Autofactura Electrónica |
| `5` | Nota de Crédito Electrónica |
| `6` | Nota de Débito Electrónica |
| `7` | Nota de Remisión Electrónica |
| `8` | Comprobante de Retención Electrónico |

### Tipos de evento

| Código | Evento |
|--------|--------|
| `1`  | Cancelación |
| `2`  | Inutilización de numeración |
| `10` | Acuse de recibo |
| `11` | Conformidad |
| `12` | Disconformidad |
| `13` | Desconocimiento |

### Idempotencia

Los endpoints de mutación soportan el header `X-Idempotency-Key`. Si el mismo request se envía dos veces con la misma key (retry de red, timeout, etc.), la segunda llamada retorna la respuesta original sin re-procesar:

```bash
curl -X POST http://localhost:3000/v1/documentos \
  -H "X-Idempotency-Key: uuid-unico-por-operacion" \
  -H "X-API-Key: ..." \
  -d @examples/factura.json

# Segunda llamada con la misma key:
# HTTP 201 + X-Idempotency-Replayed: true
# (sin emitir un nuevo DE)
```

---

## Variables de entorno

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `NODE_ENV` | No | `development` | `development` \| `test` \| `production` |
| `PORT` | No | `3000` | Puerto del servidor |
| `HOST` | No | `0.0.0.0` | Host de binding |
| `SIFEN_AMBIENTE` | No | `test` | `test` (homologación) \| `produccion` |
| `SIFEN_CERT_PATH` | **Sí** | — | Path al certificado PKCS#12 (.p12) |
| `SIFEN_CERT_PASS` | **Sí** | — | Passphrase del certificado |
| `DATABASE_URL` | **Sí** | — | Connection string PostgreSQL |
| `REDIS_URL` | No | `redis://localhost:6379` | Connection string Redis |
| `API_KEY_SECRET` | **Sí** | — | Secret para hashing de API keys (mín. 32 chars) |
| `RATE_LIMIT_MAX` | No | `100` | Max requests por ventana por tenant |
| `RATE_LIMIT_WINDOW` | No | `1 minute` | Ventana de rate limiting |
| `KUDE_OUTPUT_DIR` | No | `/tmp/kude` | Directorio para PDFs KuDE generados por worker |

---

## Cómo generar una API key

```bash
# 1. Generar key aleatoria
KEY=$(openssl rand -hex 32)
echo "Tu API key: $KEY"

# 2. Calcular hash SHA-256 (lo que se guarda en DB)
HASH=$(echo -n "$KEY" | sha256sum | cut -d' ' -f1)

# 3. Insertar en DB
docker compose exec db psql -U sifen -d sifen_api -c \
  "INSERT INTO api_keys (id, tenant_id, hash, nombre, activa, creada_en)
   VALUES (gen_random_uuid(), '<TENANT_ID>', '$HASH', 'Mi API key', true, now());"

# 4. Usar en requests
curl -H "X-API-Key: $KEY" http://localhost:3000/v1/consultas/ruc/80069563-1
```

Para desarrollo local, `pnpm db:seed` ya crea una key funcional.

---

## Certificado PKCS#12

SIFEN requiere un certificado digital emitido por una CA autorizada por la SET.

### Homologación (pruebas)

1. Registrarse en [ekuatia.set.gov.py](https://ekuatia.set.gov.py/portal/ekuatia/)
2. Solicitar acceso al ambiente de test
3. La SET entrega un `.p12` de prueba con su passphrase

### Producción

Obtener el certificado de una CA autorizada por la SET:

- **Documenta S.A.** — documenta.com.py
- **ICONTEC** — icontec.org
- **CDS** — cds.com.py

El certificado debe estar vinculado al RUC del contribuyente y en formato PKCS#12 (`.p12` / `.pfx`).

**Proceso de habilitación en ekuatia:**

1. Subir el certificado público al portal
2. Aprobar los casos de prueba de homologación (la SET valida una serie de DEs de prueba)
3. Una vez aprobados, la SET habilita el acceso al ambiente de producción

### Configuración

```bash
# Fuera del repo — nunca commitear certificados
mkdir -p /etc/sifen/certs
cp mi-certificado.p12 /etc/sifen/certs/cert.p12
chmod 400 /etc/sifen/certs/cert.p12
```

En `.env`:
```env
SIFEN_CERT_PATH=/etc/sifen/certs/cert.p12
SIFEN_CERT_PASS=tu_passphrase_real
```

En Docker Compose (producción):
```yaml
volumes:
  - /etc/sifen/certs:/certs:ro
```

> El `.gitignore` excluye `*.p12`, `*.pfx`, `*.pem`, `*.key` y `certs/`. **Nunca commitear el certificado.**

---

## Homologación vs Producción

| Aspecto | Homologación (`test`) | Producción |
|---------|-----------------------|------------|
| Base URL SIFEN | `https://sifen-test.set.gov.py` | `https://sifen.set.gov.py` |
| Certificado | Cert de prueba SET | Cert de CA autorizada |
| TLS verification | Relajada | Estricta |
| Documentos | Sin validez fiscal | Validez fiscal real |
| KuDE | Banner amarillo de prueba | Sin banner |
| Variable | `SIFEN_AMBIENTE=test` | `SIFEN_AMBIENTE=produccion` |

---

## Resiliencia

### Circuit Breaker

El cliente SOAP incluye un circuit breaker que protege ante caídas de SIFEN:

```
Normal (CLOSED)  →  5 fallos consecutivos  →  OPEN (30s)
                                                    ↓
                 ←  request de prueba OK   ←  HALF_OPEN
```

En estado **OPEN**, los requests fallan inmediatamente con `503` en lugar de esperar el timeout de 30 segundos. El estado está expuesto en `/health/ready`.

### Numeración atómica

La asignación de números correlativos usa `UPDATE ... RETURNING` en PostgreSQL, garantizando que dos requests simultáneos nunca obtengan el mismo número — sin locks ni transacciones explícitas.

### Idempotencia

Los endpoints `POST /v1/documentos` y `POST /v1/eventos` soportan `X-Idempotency-Key` para proteger ante retries de red. Las respuestas se cachean 24 horas.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Runtime | Node.js 20 LTS |
| Framework | Fastify v5 |
| Lenguaje | TypeScript 5 (strict + noUncheckedIndexedAccess) |
| Validación | Zod v3 |
| XML | xmlbuilder2 (generación) + fast-xml-parser (parsing) |
| Firma XML | node-forge + @xmldom/xmldom (XMLDSig RSA-SHA256, sin binarios nativos) |
| SOAP/HTTP | Axios con mTLS custom (sin node-soap) |
| Queue | BullMQ + Redis 7 |
| Base de datos | PostgreSQL 16 + Prisma ORM |
| PDF KuDE | Puppeteer + Chromium headless (singleton) |
| Testing | Vitest + supertest |
| CI/CD | GitHub Actions + ghcr.io |

---

## Desarrollo

```bash
# Levantar servicios
cd docker && docker compose up -d

# Logs en vivo
docker compose logs -f api

# Correr tests
docker compose exec api pnpm test

# Coverage
docker compose exec api pnpm test:coverage

# Prisma Studio
docker compose exec api pnpm db:studio

# Typecheck
pnpm typecheck
```

### Estructura del proyecto

```
src/
├── server.ts                    # Entry point HTTP
├── worker.ts                    # Entry point workers BullMQ (Docker prod)
├── app.ts                       # Fastify config + plugins + routes
├── config/
│   ├── env.ts                   # Variables de entorno validadas con Zod
│   └── constants.ts             # URLs SIFEN, namespaces, enums v150
├── routes/v1/
│   ├── documentos/              # POST emitir, GET consultar, GET kude
│   ├── eventos/                 # POST cancelar, inutilizar, conformidades
│   ├── lotes/                   # POST envío batch, GET estado
│   └── consultas/               # GET RUC, GET lote por protocolo
├── services/
│   ├── secuencia.ts             # Numeración atómica (UPDATE RETURNING)
│   ├── sifen/
│   │   ├── soap.client.ts       # Cliente SOAP con mTLS
│   │   └── circuit-breaker.ts   # FSM CLOSED/OPEN/HALF_OPEN
│   ├── xml/
│   │   ├── generator.ts         # Construcción XML DE v150 (xmlbuilder2)
│   │   ├── signer.ts            # Firma XMLDSig RSA-SHA256
│   │   ├── validator.ts         # Validación estructural
│   │   ├── cdc.ts               # CDC 44 dígitos con módulo 11
│   │   ├── qr.ts                # URL QR formato SET
│   │   └── parser.ts            # Parser respuesta SIFEN (dCodRes, iSitDE)
│   ├── kude/
│   │   ├── generator.ts         # PDF KuDE con Puppeteer singleton
│   │   └── template.ts          # HTML template A4 oficial SET
│   └── queue/
│       ├── bull.ts              # Colas BullMQ con retry exponencial
│       └── workers/
│           ├── lote.worker.ts   # Envío asíncrono de lotes
│           └── kude.worker.ts   # Generación PDF en background
├── schemas/
│   ├── de.schema.ts             # Zod: Documento Electrónico (8 tipos)
│   └── evento.schema.ts         # Zod: eventos (discriminatedUnion por tipo)
├── middleware/
│   ├── auth.ts                  # API key SHA-256, timing-safe comparison
│   ├── idempotency.ts           # X-Idempotency-Key con TTL 24h
│   └── error-handler.ts         # Formato estándar de errores (Zod, HTTP, 500)
└── utils/
    ├── ruc.ts                   # Validación dígito verificador RUC
    ├── iva.ts                   # Cálculo IVA 10%/5%/exento/exonerado
    └── date.ts                  # 4 formatos de fecha para XML/QR/DB
prisma/
├── schema.prisma                # Modelos + SecuenciaTimbrado + IdempotencyRecord
└── seed.ts                      # Tenant + API key + timbrado de prueba
docker/
├── Dockerfile                   # Multi-stage: deps → build → production
├── docker-compose.yml           # Desarrollo local (hot reload)
└── docker-compose.prod.yml      # Producción con resource limits + worker separado
.github/
└── workflows/
    ├── ci.yml                   # typecheck + lint + test + build (desactivado)
    └── release.yml              # tag v*.*.* → ghcr.io + GitHub Release
```

---

## Deploy

### Docker Compose (recomendado para VPS)

```bash
# Producción
docker compose -f docker/docker-compose.prod.yml up -d

# Verificar estado
curl https://tu-dominio.com/health/ready
```

El stack de producción levanta:

- `api` — servidor HTTP (512MB RAM máx)
- `worker` — procesa lotes y KuDEs en background (768MB RAM máx, Puppeteer)
- `db` — PostgreSQL 16-alpine
- `redis` — Redis 7-alpine con AOF + LRU eviction

### Variables requeridas en producción

```bash
SIFEN_CERT_PATH=/certs/cert.p12
SIFEN_CERT_PASS=<passphrase>
DATABASE_URL=postgresql://sifen:<pass>@db:5432/sifen_api
API_KEY_SECRET=<openssl rand -hex 32>
SIFEN_CERT_DIR=/etc/sifen/certs       # directorio montado como volumen
DB_PASSWORD=<contraseña postgres>
```

### Imagen Docker pública

```bash
docker pull ghcr.io/devsart95/sifen-api:latest
docker pull ghcr.io/devsart95/sifen-api:0.2.0
```

---

## Contribución

1. Fork del repositorio
2. Crear branch desde `develop`: `git checkout -b feat/mi-feature develop`
3. Commits con [Conventional Commits](https://www.conventionalcommits.org/): `feat(scope): descripción`
4. Tests para todo lo nuevo: `pnpm test`
5. PR contra `develop` con descripción clara del cambio y del por qué

### Requisitos para PRs

```bash
pnpm typecheck   # sin errores TS
pnpm lint        # sin warnings ESLint
pnpm test        # todos los tests pasan
# cobertura no decrece
```

---

## Licencia

[MIT](LICENSE) — DevSar

---

## Referencias

| Recurso | URL |
|---------|-----|
| Manual Técnico SIFEN v150 | [ekuatia.set.gov.py](https://ekuatia.set.gov.py/portal/ekuatia/) |
| Portal ekuatia (homologación) | [ekuatia.set.gov.py/portal](https://ekuatia.set.gov.py/portal/ekuatia/) |
| XSD oficiales v150 | [Estructura XML DE (.rar)](https://ekuatia.set.gov.py/documents/371863/0/Estructura+xml_DE.rar/) |
| Verificación QR SET | [ekuatia.set.gov.py/consultas/qr](https://ekuatia.set.gov.py/consultas/qr) |
| Referencia implementación | [TIPS-SA/facturacionelectronicapy-xmlgen](https://github.com/TIPS-SA/facturacionelectronicapy-xmlgen) |
