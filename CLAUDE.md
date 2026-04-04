# sifen-api — Gateway REST para SIFEN Paraguay

REST API open source que abstrae SIFEN (Sistema Integrado de Facturación Electrónica Nacional)
de la SET Paraguay. Cualquier sistema puede integrar facturación electrónica mediante llamadas
HTTP REST en lugar de lidiar directamente con SOAP 1.2 + XMLDSig + mTLS.

## Stack

- **Runtime:** Node.js 20 LTS
- **Framework:** Fastify v5
- **Lenguaje:** TypeScript 5 (strict mode, sin `any`)
- **XML:** `xmlbuilder2` (generación) + `fast-xml-parser` (parsing)
- **Firma XML:** `node-forge` + `@xmldom/xmldom` (XMLDSig RSA-SHA256)
- **SOAP/HTTP:** `axios` + custom SOAP client (no `node-soap` — demasiado pesado)
- **Validación:** Zod v3 (schemas en `/src/schemas/`)
- **Queue/Jobs:** BullMQ + Redis (lotes asíncronos, reintentos)
- **DB:** PostgreSQL 16 + Prisma ORM (auditoría de DEs, eventos, logs)
- **Testing:** Vitest + `supertest` + `@vitest/coverage-v8`
- **Linting:** ESLint flat config + Prettier
- **Contenedor:** Docker Compose (Alpine), multi-stage build
- **CI/CD:** GitHub Actions

## Comandos

```bash
# Desarrollo
pnpm dev              # Fastify con hot reload (tsx watch)
pnpm build            # tsc + tsup
pnpm start            # Producción (node dist/server.js)

# Base de datos
pnpm db:migrate       # prisma migrate dev
pnpm db:push          # prisma db push (dev rápido)
pnpm db:studio        # Prisma Studio
pnpm db:seed          # Seed de datos de prueba

# Tests
pnpm test             # Vitest run
pnpm test:watch       # Vitest watch
pnpm test:coverage    # Coverage report
pnpm test:e2e         # Tests de integración contra SIFEN homologación

# Calidad
pnpm lint             # ESLint
pnpm lint:fix         # ESLint --fix
pnpm typecheck        # tsc --noEmit
pnpm format           # Prettier

# Docker
docker compose up -d       # Levantar todos los servicios
docker compose logs -f     # Logs en vivo
docker compose down -v     # Bajar + borrar volúmenes
```

## Estructura

```
src/
  server.ts              # Entry point, Fastify instance
  app.ts                 # Plugin registrations, config
  config/
    env.ts               # Variables de entorno validadas con Zod
    constants.ts         # URLs SIFEN, namespaces XML, enums
  routes/
    v1/
      documentos/        # POST /v1/documentos (emitir DE)
      eventos/           # POST /v1/eventos (cancelar, inutilizar)
      consultas/         # GET /v1/documentos/:cdc, GET /v1/ruc/:ruc
      lotes/             # POST /v1/lotes (envío batch hasta 50 DEs)
  services/
    sifen/
      soap.client.ts     # Cliente SOAP con mTLS (axios + certificado)
      endpoints.ts       # URLs de producción y homologación
    xml/
      generator.ts       # Construcción del XML del DE (xmlbuilder2)
      signer.ts          # Firma XMLDSig RSA-SHA256
      validator.ts       # Validación contra XSD v150
      cdc.ts             # Generación y cálculo del CDC (44 dígitos)
      qr.ts              # Construcción de URL QR
    kude/
      generator.ts       # Generación PDF KUDE (puppeteer + plantilla)
    queue/
      bull.ts            # Instancia BullMQ, definición de colas
      workers/
        lote.worker.ts   # Procesa envíos asíncronos por lote
        kude.worker.ts   # Genera KuDE en background
  schemas/
    de.schema.ts         # Zod: Documento Electrónico (todos los tipos)
    evento.schema.ts     # Zod: Cancelación, inutilización, etc.
    timbrado.schema.ts   # Zod: Datos del timbrado
  db/
    prisma/
      schema.prisma      # Modelos: DocumentoElectronico, Evento, Log
  middleware/
    auth.ts              # API key validation
    rate-limit.ts        # Rate limiting por tenant
    error-handler.ts     # Formato estándar de errores
  utils/
    ruc.ts               # Validación dígito verificador RUC
    iva.ts               # Cálculo de totales e IVA (10%, 5%, exento)
    date.ts              # Formateo fechas para XML
tests/
  unit/
    xml/                 # Tests generación XML, firma, CDC
    utils/               # Tests RUC, IVA
  integration/
    routes/              # Tests de rutas con DB real
  e2e/
    sifen-homologacion/  # Tests contra SIFEN test (requiere cert)
prisma/
  schema.prisma
  migrations/
  seed.ts
docker/
  Dockerfile
  docker-compose.yml
  docker-compose.prod.yml
.github/
  workflows/
    ci.yml               # typecheck + lint + test + build
    release.yml          # Tag → Docker Hub + GitHub Release
```

## Dominio SIFEN — conceptos clave

### Tipos de Documento (iTiDE)
| Código | Tipo |
|--------|------|
| 1 | Factura Electrónica |
| 2 | Factura Electrónica de Exportación |
| 3 | Factura Electrónica de Importación |
| 4 | Autofactura Electrónica |
| 5 | Nota de Crédito Electrónica |
| 6 | Nota de Débito Electrónica |
| 7 | Nota de Remisión Electrónica |
| 8 | Comprobante de Retención Electrónico |

### CDC — 44 dígitos
`01 + RUC(8) + Establecimiento(3) + PuntoExp(3) + TipoDoc(2) + Numero(7) + YYYYMMDD(8) + TipoEmision(2) + CodigoSeg(9) + DigitoVerif(1)`

### Endpoints SIFEN
- **Homologación:** `https://sifen-test.set.gov.py`
- **Producción:** `https://sifen.set.gov.py`
- Recepción síncrona: `/de/ws/sync/recibe.wsdl`
- Recepción lote: `/de/ws/async/recibe-lote.wsdl`
- Consulta CDC: `/de/ws/consultas/consulta.wsdl`
- Consulta RUC: `/consultas/ruc.wsdl`
- Eventos: `/de/ws/eventos/recibe-evento.wsdl`

### Firma XMLDSig
- Algoritmo: RSA-SHA256 (enveloped signature)
- Certificado: PKCS#12 (.p12) del contribuyente
- mTLS: el certificado también autentica la conexión TLS
- Namespace: `http://www.w3.org/2000/09/xmldsig#`

### IVA
- Tasas: 10%, 5%, Exonerado, Exento
- Los totales se calculan por tasa y se acumulan en `gTotSub`

## Variables de entorno

```env
# Servidor
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# SIFEN
SIFEN_AMBIENTE=test              # test | produccion
SIFEN_CERT_PATH=/certs/cert.p12  # Path al PKCS#12
SIFEN_CERT_PASS=password         # Passphrase del certificado

# Base de datos
DATABASE_URL=postgresql://sifen:pass@db:5432/sifen_api

# Redis (BullMQ)
REDIS_URL=redis://redis:6379

# Seguridad
API_KEY_SECRET=secret-256-bits   # Para hashing de API keys
JWT_SECRET=jwt-secret            # Si se usa JWT además de API key

# Rate limiting
RATE_LIMIT_MAX=100               # Requests por minuto por tenant
```

## Convenciones de código

- **Async/await** siempre, sin callbacks
- **Result pattern** para errores de dominio: `{ ok: true, data }` | `{ ok: false, error }`
- **Never throw** en servicios — solo en middlewares y Fastify hooks
- Constantes XML en `src/config/constants.ts`, nunca hardcodeadas en services
- Schemas Zod son la fuente de verdad de tipos (`z.infer<typeof Schema>`)
- Prisma models en PascalCase, campos en camelCase
- Tests nombrados: `describe('servicio/función')` → `it('hace X cuando Y')`
- Mock de SIFEN en tests unitarios con `vi.mock`, **no** en integration tests

## Seguridad (no negociable)

- API keys hasheadas con bcrypt antes de guardar en DB
- Rate limiting por tenant (BullMQ + Redis)
- Certificados P12 nunca en repo ni en imagen Docker
- `SIFEN_CERT_PATH` monta volumen con el cert
- CORS restrictivo: lista blanca de dominios
- Headers: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`
- Input validation en toda ruta con Zod schemas
- SQL injection imposible (Prisma parameterized queries)
- Audit log de cada DE emitido y evento procesado

## Calidad de API

Cada endpoint debe tener:
- Schema Zod para request (body, params, query)
- Schema Zod para response (success y error)
- OpenAPI spec auto-generada vía `fastify-swagger`
- Tests unitarios del servicio
- Tests de integración de la ruta
- Manejo explícito de errores SIFEN (código de rechazo → mensaje amigable)

## Notas de referencia técnica

- Manual Técnico SET v150: `https://ekuatia.set.gov.py/portal/ekuatia/`
- XSD oficiales: `https://ekuatia.set.gov.py/documents/371863/0/Estructura+xml_DE.rar/`
- Namespace XML: `http://ekuatia.set.gov.py/sifen/xsd`
- Portal consultas: `https://ekuatia.set.gov.py/consultas/qr`
- Referencia implementación Node.js: `TIPS-SA/facturacionelectronicapy-xmlgen` (npm)
- Referencia implementación Python: `kmee/sifen`
