# Guía de Pruebas e-kuatia — sifen-api

Basada en la Guía Oficial DNIT (Febrero/2026). Adaptada para usar los endpoints REST de sifen-api en lugar de SOAP directo.

---

## Pre-requisitos

1. **Habilitación como Facturador Electrónico** via SGTM (Sistema de Gestión Tributaria Marangatu)
2. **Timbrado activo** creado en SGTM para el ambiente de pruebas
3. **Certificado PKCS#12** (.p12) con el RUC del contribuyente, emitido por un PSC habilitado (Extended Key Usage: `clientAuth`)
4. **sifen-api corriendo** con `SIFEN_AMBIENTE=test`

```bash
# Levantar ambiente de pruebas
docker compose up -d
```

---

## Set de Datos de Prueba (provistos por DNIT)

### Timbrado

| Campo | Valor |
|-------|-------|
| Número de timbrado | RUC del contribuyente (sin DV, agregar "0" al inicio si corresponde) |
| Inicio de vigencia | Fecha de habilitación como facturador electrónico via SGTM |
| Establecimiento | Generado via SGTM (1 establecimiento) |
| Punto de expedición | Generado via SGTM (hasta 3 puntos) |

### Emisor

- RUC, DV y razón social: **datos reales** del contribuyente registrado ante la DNIT en Sistema Marangatu
- La razón social en descripción de prueba debe ser: `DOCUMENTO ELECTRÓNICO SIN VALOR COMERCIAL NI FISCAL - GENERADO EN AMBIENTE DE PRUEBA`

### Receptor e ítems

- Usar datos reales de cliente (RUC, dirección, etc.)
- **El primer ítem de mercadería DEBE tener la descripción:** `DOCUMENTO ELECTRÓNICO SIN VALOR COMERCIAL NI FISCAL - GENERADO EN AMBIENTE DE PRUEBA`

### CSC Genérico (Ambiente de Pruebas)

```
IdCSC: 0001  →  CSC: ABCD0000000000000000000000000000
IdCSC: 0002  →  CSC: EFGH0000000000000000000000000000
```

> **Nota**: asegurarse de configurar `csc` e `idCsc` al crear el tenant (ver sección Crear Tenant). En pruebas usar `idCsc: "0001"` y `csc: "ABCD0000000000000000000000000000"`.

---

## Configurar Tenant y Timbrado en sifen-api

```bash
# 1. Crear tenant
curl -X POST http://localhost:3000/v1/admin/tenants \
  -H "X-API-Key: admin-api-key-32-chars-minimum-here" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Mi Empresa SA",
    "ruc": "80069563",
    "dvRuc": "1",
    "rateLimitMax": 1000
  }'
# Guarda el "id" del tenant en la respuesta

# 2. Crear API key para el tenant (tenantId en la URL)
curl -X POST http://localhost:3000/v1/admin/tenants/{tenantId}/api-keys \
  -H "X-API-Key: admin-api-key-32-chars-minimum-here" \
  -H "Content-Type: application/json" \
  -d '{"nombre": "pruebas", "isAdmin": false}'
# La respuesta incluye "apiKey" — guardarlo, no se puede recuperar después

# 3. Crear timbrado
# Según guía DNIT: número de timbrado = RUC del contribuyente (sin DV)
curl -X POST http://localhost:3000/v1/admin/tenants/{tenantId}/timbrados \
  -H "X-API-Key: admin-api-key-32-chars-minimum-here" \
  -H "Content-Type: application/json" \
  -d '{
    "numero": "80069563",
    "establecimiento": "001",
    "puntoExpedicion": "001",
    "tipoDocumento": 1,
    "fechaInicio": "2024-01-01"
  }'

# 4. Subir certificado P12
curl -X POST http://localhost:3000/v1/admin/tenants/{tenantId}/cert \
  -H "X-API-Key: admin-api-key-32-chars-minimum-here" \
  -H "Content-Type: application/json" \
  -d '{
    "p12Base64": "<base64 del archivo .p12>",
    "passphrase": "<passphrase del certificado>"
  }'
```

---

## Secuencia de Pruebas

### Fase 1 — Autenticación Mutua (mTLS)

El certificado se carga en sifen-api y se usa automáticamente en cada llamada SOAP. La autenticación ocurre en la capa TLS.

```bash
# Verificar que el servidor puede conectarse a SIFEN (circuit breaker CLOSED = OK)
curl http://localhost:3000/health/ready
# Esperado: {"status":"ready","checks":{"sifen_circuit":"CLOSED",...}}
```

**Prueba con certificado inválido** (recomendada): subir un cert autogenerado via openssl, verificar que las llamadas a SIFEN devuelven error de autenticación.

---

### Fase 2 — Transmisión de DEs

#### 2a. WS Sincrónico — DEs que deben ser APROBADOS (5 por tipo)

Repetir para: Factura (1), NCE (5), NDE (6), AutoFactura (4), Nota Remisión (7)

```bash
# Factura Electrónica — mínimo 2 ítems
curl -X POST http://localhost:3000/v1/documentos \
  -H "X-API-Key: <tu-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "tipoDocumento": 1,
    "tipoEmision": 1,
    "moneda": "PYG",
    "timbrado": {
      "numero": "80069563",
      "establecimiento": "001",
      "puntoExpedicion": "001"
    },
    "emisor": {
      "ruc": "80069563",
      "dv": 1,
      "razonSocial": "MI EMPRESA SA",
      "direccion": "Asuncion"
    },
    "receptor": {
      "tipoDocumento": 1,
      "documento": "12345678",
      "dv": 1,
      "razonSocial": "CLIENTE DE PRUEBA SA"
    },
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
        "descripcion": "Item 2 de prueba",
        "cantidad": 2,
        "precioUnitario": 50000,
        "afecIva": 1,
        "tasaIva": 10
      }
    ]
  }'
# Esperado: 201 con CDC + estado "APROBADO"
```

> Enviar **1 DE por conexión** con el WS Sincrónico para cada tipo.

#### 2b. WS Sincrónico — DEs que deben ser RECHAZADOS (5 por tipo)

Usar datos incorrectos deliberadamente:
- RUC de receptor inválido (DV incorrecto)
- Timbrado expirado o inexistente
- Items con cantidades negativas
- CDC duplicado

```bash
# Ejemplo con timbrado inexistente (provocará 422 o rechazo SIFEN)
curl -X POST http://localhost:3000/v1/documentos \
  -H "X-API-Key: <tu-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "tipoDocumento": 1,
    "timbrado": { "numero": "00000001", "establecimiento": "001", "puntoExpedicion": "001" },
    ...
  }'
# Esperado: 422 con codigoSifen y mensajeSifen del rechazo
```

#### 2c. WS Asincrónico — Lotes (5 DEs por tipo en 1 lote, APROBADOS)

> Requiere Redis (`REDIS_URL` configurado). Se recomienda 30–50 DEs por lote.

```bash
# Lote de Facturas Electrónicas (5 en 1 lote)
curl -X POST http://localhost:3000/v1/lotes \
  -H "X-API-Key: <tu-api-key>" \
  -H "X-Idempotency-Key: lote-fe-prueba-001" \
  -H "Content-Type: application/json" \
  -d '{
    "documentos": [
      { "tipoDocumento": 1, ... },
      { "tipoDocumento": 1, ... },
      { "tipoDocumento": 1, ... },
      { "tipoDocumento": 1, ... },
      { "tipoDocumento": 1, ... }
    ]
  }'
# Esperado: 202 con jobId

# Consultar estado del lote
curl http://localhost:3000/v1/lotes/{jobId} \
  -H "X-API-Key: <tu-api-key>"
# Esperado: estado "completed" con resultado de SIFEN
```

#### 2d. WS Asincrónico — Lotes RECHAZADOS (3–5 DEs por lote)

Misma estructura, usar datos incorrectos en los DEs del lote.

---

### Fase 3 — Eventos

#### 3a. Rol EMISOR

**Cancelación** (5 cancelaciones sobre cualquier DE aprobado):

```bash
curl -X POST http://localhost:3000/v1/eventos \
  -H "X-API-Key: <tu-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "tipo": 1,
    "cdc": "<CDC-del-DE-aprobado>",
    "motivo": "Cancelación de prueba por datos incorrectos"
  }'
# Esperado: 200 con resultado SIFEN aprobando el evento
```

**Inutilización** (2 FE, 1 NCE, 1 NDE, 1 AFE):

```bash
curl -X POST http://localhost:3000/v1/eventos \
  -H "X-API-Key: <tu-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "tipo": 2,
    "timbrado": "80069563",
    "establecimiento": "001",
    "puntoExpedicion": "001",
    "tipoDocumento": 1,
    "numeroInicio": 10,
    "numeroFin": 12,
    "motivo": "Inutilización de números no utilizados en prueba"
  }'
```

#### 3b. Rol RECEPTOR

**Conformidad, Disconformidad, Desconocimiento, Acuse de Recibo** (3 por tipo):

```bash
# Conformidad
curl -X POST http://localhost:3000/v1/eventos \
  -H "X-API-Key: <tu-api-key>" \
  -H "Content-Type: application/json" \
  -d '{ "tipo": 11, "cdc": "<CDC>", "motivo": "Mercadería recibida conforme" }'

# Disconformidad
curl -X POST http://localhost:3000/v1/eventos \
  -H "X-API-Key: <tu-api-key>" \
  -H "Content-Type: application/json" \
  -d '{ "tipo": 12, "cdc": "<CDC>", "motivo": "Mercadería no conforme con el pedido" }'

# Desconocimiento
curl -X POST http://localhost:3000/v1/eventos \
  -H "X-API-Key: <tu-api-key>" \
  -H "Content-Type: application/json" \
  -d '{ "tipo": 13, "cdc": "<CDC>", "motivo": "No reconozco la operación indicada" }'

# Acuse de Recibo (Notificación de Recepción en terminología DNIT)
curl -X POST http://localhost:3000/v1/eventos \
  -H "X-API-Key: <tu-api-key>" \
  -H "Content-Type: application/json" \
  -d '{ "tipo": 10, "cdc": "<CDC>" }'
```

> **Nota**: El PDF llama "Notificación de Recepción" a lo que sifen-api implementa como `ACUSE_RECIBO` (tipo 10). Es el mismo evento.

> **Nota**: "Ajuste del Evento" corresponde al tipo 14. Usar `"tipo": 14` al enviarlo via API.

---

### Fase 4 — Consulta de DTEs

**3 consultas por tipo** (FE, NCE, NDE, AFE, NRE):

```bash
# Consulta por CDC (consulta local + SIFEN en tiempo real)
curl http://localhost:3000/v1/documentos/{CDC} \
  -H "X-API-Key: <tu-api-key>"
# Esperado: estado del DTE + respuesta SIFEN en tiempo real

# Consulta por RUC
curl http://localhost:3000/v1/consultas/ruc/{ruc} \
  -H "X-API-Key: <tu-api-key>"
```

---

### Fase 5 — KuDE y validación QR

**1 KuDE por tipo** (FE, NCE, NDE, AFE, NRE):

```bash
# Descargar PDF KuDE
curl http://localhost:3000/v1/documentos/{CDC}/kude \
  -H "X-API-Key: <tu-api-key>" \
  --output kude-{CDC}.pdf
```

**2 validaciones QR por tipo**: escanear el código QR del KuDE con el portal de la DNIT:
`https://ekuatia.set.gov.py/consultas/qr`

---

## Inconsistencias entre el PDF y sifen-api

### ~~ALTA — QR sin hash CSC~~ ✅ RESUELTO

**PDF / MT v150**: El QR debe incluir un hash SHA256 generado con el valor del CSC del contribuyente.

**Solución aplicada**: `dHashQR = SHA256(urlQR + valorCSC).toUpperCase()` implementado en `src/services/xml/qr.ts`. El CSC se almacena en `Tenant.csc` / `Tenant.idCsc` y se pasa al generador XML. En pruebas usar `csc: "ABCD0000000000000000000000000000"` al crear el tenant.

---

### ~~ALTA — "Ajuste del Evento" no implementado~~ ✅ RESUELTO

**PDF**: requiere 3 pruebas de "Ajuste del Evento" como receptor.

**Solución aplicada**: `TIPO_EVENTO.AJUSTE_EVENTO = 14` agregado en `constants.ts`, `AjusteEventoSchema` en `evento.schema.ts`, y caso `AJUSTE_EVENTO` en el generador XML de eventos (`eventos/index.ts`).

---

### MEDIA — Descripción de prueba no validada

**PDF**: el primer ítem DEBE tener la descripción `"DOCUMENTO ELECTRÓNICO SIN VALOR COMERCIAL NI FISCAL - GENERADO EN AMBIENTE DE PRUEBA"` en ambiente de prueba.

**sifen-api actual**: no valida ni fuerza esta descripción cuando `SIFEN_AMBIENTE=test`.

**Impacto**: SIFEN puede rechazar los DEs si la descripción no está presente.

**Workaround**: incluirla manualmente en el primer ítem de cada DE de prueba (ver ejemplos de esta guía).

---

### BAJA — `consultaDte` sin endpoint HTTP

**PDF / MT v150**: existe "WS Consulta DE" como servicio separado.

**sifen-api actual**: `consultaDte: '/de/ws/consultas/consulta-dte.wsdl'` está definido en `constants.ts` pero no hay método en `SifenSoapClient` que lo use, ni ruta HTTP expuesta.

**Workaround**: usar `GET /v1/documentos/:cdc` que usa `consultarPorCdc`.

---

### ~~INFO — `ENDOSO` deprecado~~ ✅ RESUELTO

`TIPO_EVENTO.ENDOSO = 3` fue eliminado de `constants.ts`. Reemplazado por comentario `// ENDOSO = 3 fue removido del MT v150 — no usar`.

---

### INFO — Nombre "Notificación de Recepción" vs `ACUSE_RECIBO`

La DNIT llama "Notificación de Recepción de DE/DTE" al evento tipo 10. sifen-api lo implementa como `ACUSE_RECIBO`. Funcionalmente son el mismo evento — solo es diferencia de nomenclatura, no afecta la integración.

---

## Checklist mínimo de pruebas (según DNIT)

### Autenticación
- [ ] mTLS con certificado válido — 1 por cada WS (7 en total)
- [ ] mTLS con certificado inválido (recomendado)

### Transmisión Sincrónica (WS Sincrónico)
- [ ] Factura Electrónica APROBADA × 5
- [ ] Nota Crédito APROBADA × 5
- [ ] Nota Débito APROBADA × 5
- [ ] AutoFactura APROBADA × 5
- [ ] Nota Remisión APROBADA × 5
- [ ] Factura RECHAZADA × 5
- [ ] Nota Crédito RECHAZADA × 5
- [ ] Nota Débito RECHAZADA × 5
- [ ] AutoFactura RECHAZADA × 5
- [ ] Nota Remisión RECHAZADA × 5

### Transmisión Asincrónica (Lotes)
- [ ] Lote FE APROBADAS × 5 (en 1 lote)
- [ ] Lote NCE APROBADAS × 5
- [ ] Lote NDE APROBADAS × 5
- [ ] Lote AFE APROBADAS × 5
- [ ] Lote NRE APROBADAS × 5
- [ ] Lote FE RECHAZADAS × 5
- [ ] Lote NCE RECHAZADAS × 5
- [ ] Lote NDE RECHAZADAS × 5
- [ ] Lote AFE RECHAZADAS × 5
- [ ] Lote NRE RECHAZADAS × 5

### Eventos — Rol EMISOR
- [ ] Cancelación × 5 (cualquier DE)
- [ ] Inutilización FE × 2 (rangos de numeración)
- [ ] Inutilización NCE × 1
- [ ] Inutilización NDE × 1
- [ ] Inutilización AFE × 1

### Eventos — Rol RECEPTOR
- [ ] Conformidad × 3
- [ ] Disconformidad × 3
- [ ] Desconocimiento × 3
- [ ] Acuse de Recibo (Notificación Recepción) × 3
- [ ] Ajuste del Evento × 3 ⚠️ *No implementado en sifen-api*

### Consultas
- [ ] Consulta por CDC × 3 por tipo (15 total)

### KuDE y QR
- [ ] KuDE PDF × 1 por tipo (5 total)
- [ ] Validación QR portal DNIT × 2 por tipo (10 total) ⚠️ *Hash CSC puede fallar*

---

## Canales de Soporte DNIT

- **Contáctenos**: https://www.dnit.gov.py/web/e-kuatia/contactenos
- **Email**: facturacionelectronica@dnit.gov.py
- **Teléfono**: (021) 729 7000 Opción 2 — 07:30 a 12:00 y 13:00 a 16:00
- **Mesa de ayuda SIFEN**: https://servicios.set.gov.py/eset-publico/EnvioMailSetIService.do
- **Documentación técnica**: https://www.dnit.gov.py/web/e-kuatia/documentacion-tecnica
