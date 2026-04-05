# sifen-api

REST API gateway que abstrae SIFEN (Sistema Integrado de Facturación Electrónica Nacional) de la SET Paraguay. Cualquier sistema puede emitir Documentos Electrónicos mediante HTTP/JSON en lugar de implementar SOAP 1.2 + XMLDSig + mTLS directamente.

## Tabla de contenidos

- [¿Qué hace?](#qué-hace)
- [Requisitos](#requisitos)
- [Inicio rápido](#inicio-rápido)
- [Variables de entorno](#variables-de-entorno)
- [Autenticación](#autenticación)
- [Endpoints](#endpoints)
- [Subir certificado digital](#subir-certificado-digital)
- [Webhooks](#webhooks)
- [Idempotencia](#idempotencia)
- [Producción](#producción)
- [Tests](#tests)
- [Arquitectura](#arquitectura)
- [Conceptos SIFEN](#conceptos-sifen)

---

## ¿Qué hace?

```
Tu sistema  →  POST /v1/documentos (JSON)  →  sifen-api  →  SIFEN (SOAP/mTLS)
                                          ←  { cdc, estado, urlQr }
```

- Genera el XML del DE según estructura v150 de la SET
- Firma con XMLDSig RSA-SHA256 usando el certificado PKCS#12 del contribuyente
- Establece conexión mTLS con SIFEN homologación o producción
- Retorna el CDC, estado y URL QR
- Multi-tenant: múltiples empresas en una instancia, cada una con su propio certificado en DB

---

## Requisitos

| Herramienta | Versión mínima |
|-------------|----------------|
| Docker Desktop | 4.x |
| Docker Compose | v2 (incluido con Docker Desktop) |
| Certificado PKCS#12 (.p12) | Emitido por la SET Paraguay |

> **No se requiere Node.js en la máquina host.** Todo corre dentro de Docker.

Para obtener el certificado digital, el contribuyente debe solicitarlo en el portal de la SET: [ekuatia.set.gov.py](https://ekuatia.set.gov.py/portal/ekuatia/)

---

## Inicio rápido

### 1. Clonar el repositorio

```bash
git clone https://github.com/devsart95/sifen-api
cd sifen-api
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con al menos:

```env
API_KEY_SECRET=un-secreto-de-minimo-32-caracteres-aqui
```

El resto de las variables tiene valores por defecto para desarrollo local.

### 3. Levantar con Docker

```bash
docker compose -f docker/docker-compose.yml up --build -d
```

El primer arranque:
- Instala dependencias de Node.js dentro del contenedor
- Crea todas las tablas en PostgreSQL (`prisma db push`)
- Ejecuta el seed con datos de prueba
- Inicia el servidor en modo desarrollo con hot-reload

### 4. Verificar que está corriendo

```bash
curl http://localhost:3000/health
# { "status": "ok", "ambiente": "test", ... }

curl http://localhost:3000/health/ready
# { "status": "ready", "checks": { "db": "ok", "sifen_circuit": "CLOSED" } }
```

### 5. Abrir la documentación interactiva

Abrir en el navegador: **[http://localhost:3000/docs](http://localhost:3000/docs)**

Desde ahí se pueden explorar y ejecutar todos los endpoints directamente.

---

## Variables de entorno

Todas las variables van en `.env` en la raíz del proyecto. Ver `.env.example` para la referencia completa.

### Obligatorias en producción

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | URL de conexión a PostgreSQL. |
| `API_KEY_SECRET` | Secreto para derivar los hashes de API keys. Mínimo 32 caracteres. **Nunca cambiarlo en producción** — invalida todas las keys existentes. |

### Opcionales — SIFEN

| Variable | Default | Descripción |
|----------|---------|-------------|
| `SIFEN_AMBIENTE` | `test` | `test` para homologación, `produccion` para el ambiente real. |
| `SIFEN_CERT_PATH` | — | Ruta al `.p12` global (backward compat). Preferir subir el cert por tenant via Admin API. |
| `SIFEN_CERT_PASS` | — | Passphrase del certificado global. |

### Opcionales — Storage (PDFs KuDE)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `STORAGE_PROVIDER` | `local` | `local` para desarrollo, `s3` en producción con múltiples instancias. |
| `STORAGE_LOCAL_DIR` | `./storage/kude` | Directorio local para PDFs KuDE. |
| `S3_BUCKET` | — | Bucket de S3/MinIO/Cloudflare R2. |
| `S3_REGION` | `us-east-1` | Región de S3. |
| `S3_ENDPOINT` | — | Endpoint custom para MinIO o R2. |
| `S3_ACCESS_KEY_ID` | — | Access key de S3. |
| `S3_SECRET_ACCESS_KEY` | — | Secret key de S3. |

### Opcionales — Otros

| Variable | Default | Descripción |
|----------|---------|-------------|
| `REDIS_URL` | — | URL de Redis para colas BullMQ. **Opcional**: sin esta variable el servidor arranca normalmente. Solo requerido para `POST /v1/lotes` y webhooks encolados. |
| `RATE_LIMIT_MAX` | `100` | Requests por minuto por API key (global). Cada tenant puede tener su propio límite via `rateLimitMax`. |
| `METRICS_ENABLED` | `false` | Habilitar endpoint `/metrics` con métricas Prometheus. |

---

## Autenticación

Todos los endpoints requieren el header:

```
X-API-Key: <tu-api-key>
```

Las API keys se crean via el Admin API. El seed de desarrollo crea dos keys listas para usar:

| Key | Tipo | Uso |
|-----|------|-----|
| `test-api-key-32-chars-minimum-here` | Normal | Emitir documentos, consultas, eventos |
| `admin-api-key-32-chars-minimum-here` | Admin | Gestionar tenants, certificados, timbrados |

---

## Endpoints

### Documentos Electrónicos

#### Emitir un Documento Electrónico

```http
POST /v1/documentos
X-API-Key: test-api-key-32-chars-minimum-here
Content-Type: application/json
```

```json
{
  "tipoDocumento": 1,
  "tipoEmision": 1,
  "timbrado": {
    "numero": "80069563",
    "establecimiento": "001",
    "puntoExpedicion": "001"
  },
  "emisor": {
    "ruc": "80069563",
    "dvRuc": "1",
    "razonSocial": "Empresa Test SRL",
    "tipoContribuyente": 2,
    "direccion": "Av. Mariscal López 1234",
    "numeroCasa": "1234"
  },
  "receptor": {
    "tipoDocumento": 1,
    "documento": "5000000-1",
    "razonSocial": "Cliente de Prueba"
  },
  "moneda": "PYG",
  "condicionPago": 1,
  "items": [
    {
      "descripcion": "DOCUMENTO ELECTRÓNICO SIN VALOR COMERCIAL NI FISCAL - GENERADO EN AMBIENTE DE PRUEBA",
      "cantidad": 1,
      "precioUnitario": 100000,
      "afecIva": 1,
      "tasaIva": 10
    },
    {
      "descripcion": "Producto de prueba 2",
      "cantidad": 2,
      "precioUnitario": 50000,
      "afecIva": 1,
      "tasaIva": 10
    }
  ],
  "fechaEmision": "2024-11-29T12:00:00"
}
```

**Respuesta exitosa (201):**

```json
{
  "cdc": "01800695631001001010000001202411290100000000019",
  "estado": "APROBADO",
  "urlQr": "https://ekuatia.set.gov.py/consultas/qr?...",
  "codigoSifen": "0260",
  "mensajeSifen": "Aprobado"
}
```

**Errores comunes:**

| HTTP | Causa |
|------|-------|
| `401` | API key inválida o inactiva |
| `422` | Timbrado no encontrado, RUC inválido, o SIFEN rechazó el documento |
| `429` | Rate limit superado |
| `502` | SIFEN no respondió o error de comunicación |
| `503` | Circuit breaker abierto — SIFEN con problemas, reintente en 30 segundos |

#### Consultar estado de un DE

```http
GET /v1/documentos/{cdc}
X-API-Key: test-api-key-32-chars-minimum-here
```

Retorna el estado local y realiza una consulta en tiempo real a SIFEN.

#### Descargar PDF KuDE

```http
GET /v1/documentos/{cdc}/kude
X-API-Key: test-api-key-32-chars-minimum-here
```

Retorna el PDF del KuDE (Kuatia Digital Electrónico) listo para imprimir o enviar al receptor. Si ya fue generado, se sirve desde storage sin regenerar.

---

### Eventos

```http
POST /v1/eventos
X-API-Key: test-api-key-32-chars-minimum-here
Content-Type: application/json
```

#### Cancelar un documento

```json
{
  "tipo": 1,
  "cdc": "01800695631001001010000001202411290100000000019",
  "motivo": "Error en el monto del documento emitido"
}
```

#### Inutilizar rango de números

```json
{
  "tipo": 2,
  "timbrado": "12345678",
  "establecimiento": "001",
  "puntoExpedicion": "001",
  "tipoDocumento": 1,
  "numeroInicio": 100,
  "numeroFin": 105,
  "motivo": "Números generados por error en sistema"
}
```

#### Conformidad / Disconformidad / Desconocimiento / Acuse de recibo

```json
{ "tipo": 11, "cdc": "01800695631001001010000001202411290100000000019", "motivo": "Mercadería recibida conforme" }
```

Tipos de evento del receptor:

| `tipo` | Descripción |
|--------|-------------|
| `10` | Acuse de Recibo (Notificación de Recepción) |
| `11` | Conformidad |
| `12` | Disconformidad |
| `13` | Desconocimiento |

---

### Lotes asíncronos

Para enviar hasta 50 documentos en un solo request:

```http
POST /v1/lotes
X-API-Key: test-api-key-32-chars-minimum-here
Content-Type: application/json
```

```json
{
  "documentos": [
    { "...": "primer documento completo" },
    { "...": "segundo documento completo" }
  ]
}
```

**Respuesta (202 Accepted):**

```json
{
  "loteId": "cmnkl8pzf00022ieqgrfka76i",
  "mensaje": "Lote encolado para procesamiento asíncrono"
}
```

El lote se procesa en background por el worker. Cuando SIFEN lo aprueba, se dispara el webhook `lote.completado`.

---

### Consultas

#### Consultar datos de un contribuyente por RUC

```http
GET /v1/consultas/ruc/80069563-1
X-API-Key: test-api-key-32-chars-minimum-here
```

#### Consultar estado de un lote por protocolo

```http
GET /v1/consultas/lote/{nroProtocolo}
X-API-Key: test-api-key-32-chars-minimum-here
```

---

### Admin API

Requiere una API key con permisos de admin (`isAdmin: true`).

#### Crear un tenant

```http
POST /v1/admin/tenants
X-API-Key: admin-api-key-32-chars-minimum-here
Content-Type: application/json
```

```json
{
  "nombre": "Mi Empresa SRL",
  "ruc": "80123456",
  "dvRuc": "7"
}
```

#### Crear API key para un tenant

```http
POST /v1/admin/tenants/{tenantId}/api-keys
X-API-Key: admin-api-key-32-chars-minimum-here
Content-Type: application/json
```

```json
{
  "nombre": "Key de producción sistema ERP",
  "isAdmin": false
}
```

**Respuesta:**

```json
{
  "id": "...",
  "rawKey": "sifen_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "mensaje": "Guardar esta key — no se puede recuperar después"
}
```

#### Crear timbrado

```http
POST /v1/admin/timbrados
X-API-Key: admin-api-key-32-chars-minimum-here
Content-Type: application/json
```

```json
{
  "numero": "80069563",
  "establecimiento": "001",
  "puntoExpedicion": "001",
  "tipoDocumento": 1,
  "fechaInicio": "2024-01-01"
}
```

---

## Subir certificado digital

Cada tenant puede tener su propio certificado PKCS#12. Se guarda encriptado en la base de datos con AES-256-GCM + clave derivada por tenant vía HKDF-SHA256.

```http
POST /v1/admin/tenants/{tenantId}/cert
X-API-Key: admin-api-key-32-chars-minimum-here
Content-Type: application/json
```

```json
{
  "p12Base64": "MIIKXAIBAzCCChQGCSqGSIb3DQEHAa...",
  "passphrase": "contraseña-del-certificado"
}
```

Para convertir el archivo `.p12` a base64:

```bash
# macOS / Linux
base64 -i mi-certificado.p12 | tr -d '\n'
```

Una vez subido, el tenant puede emitir documentos sin configuración adicional. El certificado se usa automáticamente para la firma XMLDSig y la conexión mTLS con SIFEN.

---

## Webhooks

Configurar el webhook en el tenant para recibir notificaciones en tiempo real:

```http
PATCH /v1/admin/tenants/{tenantId}
X-API-Key: admin-api-key-32-chars-minimum-here
Content-Type: application/json
```

```json
{
  "webhookUrl": "https://mi-sistema.com/webhooks/sifen",
  "webhookSecret": "mi-secreto-hmac-minimo-32-chars",
  "webhookActivo": true
}
```

### Eventos disponibles

| Evento | Cuándo se dispara |
|--------|-------------------|
| `de.aprobado` | SIFEN aprueba el documento |
| `de.rechazado` | SIFEN rechaza el documento |
| `de.cancelado` | Cancelación aceptada por SIFEN |
| `lote.encolado` | Lote recibido y encolado |
| `lote.completado` | Lote procesado por SIFEN |
| `evento.aceptado` | Evento de cancelación/inutilización aceptado |

### Formato del payload

```json
{
  "evento": "de.aprobado",
  "tenantId": "cmnkl8pzf00022ieqgrfka76i",
  "timestamp": "2024-11-29T17:59:57.000Z",
  "datos": {
    "cdc": "01800695631001001010000001202411290100000000019",
    "estado": "APROBADO",
    "codigoSifen": "0260"
  }
}
```

### Verificar la firma del webhook

Cada entrega incluye el header `X-Sifen-Signature: sha256=<hmac>`:

```javascript
const crypto = require('crypto')

function verificarWebhook(rawBody, secret, signature) {
  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(rawBody)    // rawBody como string, antes de JSON.parse
    .digest('hex')}`
  const a = Buffer.from(expected)
  const b = Buffer.alloc(a.length)
  Buffer.from(signature).copy(b)
  return crypto.timingSafeEqual(a, b) && signature.length === expected.length
}
```

Los webhooks tienen **5 reintentos** con backoff exponencial: 10s, 20s, 40s, 80s, 160s.

---

## Idempotencia

Para evitar documentos duplicados en caso de reintentos de red, incluir el header:

```
X-Idempotency-Key: <uuid-unico-por-operacion>
```

Si el mismo key se usa dentro de las 24 horas, se retorna la respuesta original cacheada sin reprocesar. El namespace es por tenant, por lo que el mismo key usado desde tenants distintos no genera conflicto.

```bash
curl -X POST http://localhost:3000/v1/documentos \
  -H "X-API-Key: test-api-key-32-chars-minimum-here" \
  -H "X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

---

## Producción

### Compose de producción

```bash
# Copiar y editar variables de entorno
cp .env.example .env.prod
# Editar .env.prod con los valores reales

docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d
```

### Variables de entorno recomendadas para producción

```env
NODE_ENV=production
SIFEN_AMBIENTE=produccion
API_KEY_SECRET=<secreto-aleatorio-64-chars-minimo>
DATABASE_URL=postgresql://user:pass@host:5432/sifen_api
REDIS_URL=redis://user:pass@host:6379
STORAGE_PROVIDER=s3
S3_BUCKET=mi-bucket-kude-pdfs
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=<access-key>
S3_SECRET_ACCESS_KEY=<secret-key>
METRICS_ENABLED=true
```

### Infraestructura recomendada

Para la mayoría de los casos (hasta ~1000 DEs/día):

```
VPS (Hetzner CX21 ~$6/mes) con Docker Compose
├── api          (512MB RAM, 1 CPU)
├── worker       (768MB RAM — Puppeteer para KuDE PDFs)
├── PostgreSQL 16 Alpine
├── Redis 7 Alpine
└── Caddy (HTTPS automático vía Let's Encrypt)
```

Para escala mayor:
- PostgreSQL managed (Railway, Neon, Supabase)
- Redis managed (Upstash, Railway)
- S3 o MinIO para PDFs KuDE (múltiples instancias de API)
- Múltiples instancias de API detrás de load balancer

### Healthchecks para monitoreo

```
GET /health        → liveness probe  (el proceso vive)
GET /health/ready  → readiness probe (DB + Redis conectados)
```

Configurar estos endpoints en el load balancer o en UptimeRobot (gratis para monitores básicos).

### Métricas Prometheus

Con `METRICS_ENABLED=true`, el endpoint `/metrics` expone:

| Métrica | Tipo | Descripción |
|---------|------|-------------|
| `sifen_de_emitidos_total` | Counter | DEs por tenant, tipo y estado |
| `sifen_soap_requests_total` | Counter | Requests a SIFEN por operación y resultado |
| `sifen_soap_request_duration_seconds` | Histogram | Latencia hacia SIFEN |
| `sifen_http_request_duration_seconds` | Histogram | Latencia de la API |
| `sifen_circuit_breaker_state` | Gauge | 0=CLOSED, 1=OPEN, 2=HALF_OPEN |
| `sifen_circuit_breaker_trips_total` | Counter | Veces que el circuit breaker se abrió |
| `sifen_webhooks_enviados_total` | Counter | Webhooks por estado |
| `sifen_cert_days_until_expiry` | Gauge | Días hasta vencimiento del cert por tenant |

---

## Tests

```bash
# Correr todos los tests (unitarios + integración)
docker compose -f docker/docker-compose.yml exec api pnpm test

# Con reporte de cobertura
docker compose -f docker/docker-compose.yml exec api pnpm test:coverage

# Modo watch (desarrollo)
docker compose -f docker/docker-compose.yml exec api pnpm test:watch

# Un archivo específico
docker compose -f docker/docker-compose.yml exec api \
  pnpm test -- tests/unit/services/sifen/circuit-breaker.test.ts
```

Para los tests E2E contra SIFEN homologación (requiere certificado real):

```bash
SIFEN_E2E_CERT_PATH=/ruta/al/cert.p12 \
SIFEN_E2E_CERT_PASS=passphrase \
SIFEN_E2E_RUC=80069563 \
pnpm test:e2e
```

---

## Arquitectura

### Flujo de una emisión síncrona

```
1. POST /v1/documentos (JSON)
2. Auth hook → valida API key SHA-256, adjunta tenantId
3. Idempotency hook → verifica X-Idempotency-Key
4. Obtener timbrado activo del tenant (DB)
5. Calcular IVA por ítem
6. Reservar número correlativo atómico (PostgreSQL INSERT ON CONFLICT RETURNING)
7. Generar XML v150 (xmlbuilder2)
8. Validar estructura del XML
9. Obtener cert PKCS#12 del tenant (CertificateManager → cache → DB → env vars)
10. Firmar XML con XMLDSig RSA-SHA256 (node-forge)
11. Guardar DE con estado PENDIENTE (DB)
12. Enviar a SIFEN vía SOAP/mTLS (con circuit breaker)
13. Parsear respuesta SIFEN (dCodRes, dMsgRes, iSitDE)
14. Actualizar estado en DB (APROBADO / RECHAZADO / APROBADO_CON_OBSERVACIONES)
15. Registrar audit log
16. Disparar webhook (fire-and-forget → BullMQ)
17. Retornar CDC + estado + URL QR
```

### Estructura de archivos

```
src/
├── server.ts          # Entry point, cleanup idempotencia cada hora
├── app.ts             # Fastify + plugins + rutas
├── worker.ts          # Proceso BullMQ separado (lotes + KuDE + webhooks)
├── config/
│   ├── env.ts         # Variables de entorno validadas con Zod
│   └── constants.ts   # URLs SIFEN, namespaces XML
├── routes/v1/
│   ├── documentos/    # Emitir, consultar, descargar KuDE
│   ├── eventos/       # Cancelación, inutilización, conformidades
│   ├── lotes/         # Envío batch asíncrono
│   ├── consultas/     # Consulta RUC y estado de lote
│   └── admin/         # CRUD tenants, api-keys, timbrados, certs
├── services/
│   ├── sifen/
│   │   ├── soap.client.ts      # Cliente SOAP con mTLS (axios + https.Agent)
│   │   └── circuit-breaker.ts  # FSM CLOSED→OPEN→HALF_OPEN
│   ├── xml/
│   │   ├── generator.ts        # Construcción XML v150 (xmlbuilder2)
│   │   ├── signer.ts           # Firma XMLDSig RSA-SHA256 (node-forge)
│   │   ├── cdc.ts              # CDC 44 dígitos
│   │   └── parser.ts           # Parseo respuesta SIFEN
│   ├── certificate/
│   │   ├── crypto.ts           # AES-256-GCM + HKDF-SHA256
│   │   └── manager.ts          # Cache LRU 5min, fallback env vars
│   ├── queue/
│   │   ├── bull.ts             # Instancias BullMQ
│   │   └── workers/            # lote, kude, webhook workers
│   ├── webhook/
│   │   ├── signature.ts        # HMAC-SHA256 + timingSafeEqual
│   │   └── dispatcher.ts       # Fire-and-forget
│   ├── storage/
│   │   ├── local.provider.ts   # Disco local
│   │   └── s3.provider.ts      # S3/MinIO/R2 (lazy AWS SDK)
│   └── secuencia.ts            # Numeración atómica sin race condition
├── middleware/
│   ├── auth.ts         # API key SHA-256
│   ├── admin.ts        # isAdmin check
│   └── idempotency.ts  # X-Idempotency-Key TTL 24h
└── schemas/            # Zod schemas (DE, eventos, admin)
```

### Decisiones de diseño

| Decisión | Motivo |
|----------|--------|
| REST sobre SOAP | Cualquier lenguaje integra sin librerías SOAP específicas |
| `node-forge` para firma | Sin binarios nativos — imagen Docker portable |
| `INSERT ON CONFLICT DO UPDATE RETURNING` | Numeración atómica sin SELECT FOR UPDATE ni locks |
| Promise-based pool de SoapClient | Dos requests simultáneos del mismo tenant comparten la misma Promise, no crean dos instancias |
| Cert encriptado en DB (AES-256-GCM + HKDF) | Multi-tenant real — cada tenant con clave derivada distinta |
| Circuit breaker FSM liviano | Sin dependencias, configurable por umbral/ventana/cooldown |
| StorageProvider interface | Swap local ↔ S3 sin cambiar lógica de negocio |
| Idempotencia en PostgreSQL | TTL explícito, namespaceada por tenant, no requiere Redis extra |

---

## Conceptos SIFEN

### Tipos de Documento (iTiDE)

| Código | Tipo |
|--------|------|
| 1 | Factura Electrónica (FE) |
| 2 | Factura Electrónica de Exportación |
| 4 | Autofactura Electrónica |
| 5 | Nota de Crédito Electrónica |
| 6 | Nota de Débito Electrónica |
| 7 | Nota de Remisión Electrónica |

### Tipos de Evento

| Código | Tipo | Rol |
|--------|------|-----|
| 1 | Cancelación | Emisor |
| 2 | Inutilización | Emisor |
| 10 | Acuse de Recibo (Notificación de Recepción) | Receptor |
| 11 | Conformidad | Receptor |
| 12 | Disconformidad | Receptor |
| 13 | Desconocimiento | Receptor |

### CDC — Código de Control (44 dígitos)

```
01 + RUC(8) + EST(3) + PTO(3) + TipoDoc(2) + Número(7) + YYYYMMDD(8) + TipoEmision(2) + CodigoSeg(9) + DV(1)
```

### Estados de un DE

| Estado | Descripción |
|--------|-------------|
| `PENDIENTE` | Generado localmente, no enviado aún |
| `APROBADO` | Aprobado por SIFEN |
| `APROBADO_CON_OBSERVACIONES` | Aprobado con advertencias — válido pero revisar observaciones |
| `RECHAZADO` | Rechazado — ver campo `mensajeRespuestaSifen` para la causa |
| `CANCELADO` | Cancelado mediante evento de cancelación aprobado por SIFEN |
| `INUTILIZADO` | Número inutilizado |
| `ERROR` | Error interno al procesar — revisar logs |

### Ambientes SIFEN

| `SIFEN_AMBIENTE` | URL base |
|------------------|----------|
| `test` | `https://sifen-test.set.gov.py` (homologación) |
| `produccion` | `https://sifen.set.gov.py` |

### IVA en Paraguay

Son dos campos independientes en cada ítem:

**`afecIva`** — tipo de afectación al IVA:

| Código | Significado |
|--------|-------------|
| 1 | Gravado |
| 2 | Exonerado (exento por ley) |
| 3 | Exento |
| 4 | Gravado parcial |

**`tasaIva`** — tasa aplicable (solo si `afecIva = 1` o `4`):

| Valor | Tasa |
|-------|------|
| 10 | 10% |
| 5 | 5% |

---

## Licencia

MIT — [DevSar](https://github.com/devsart95)
