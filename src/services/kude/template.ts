/**
 * Template HTML para el KuDE (Kuatia Digital Electrónico).
 * Layout oficial según especificación SET Paraguay.
 * Dimensiones: A4 (210mm × 297mm).
 */

export interface DatosKude {
  // Encabezado
  nombreEmisor: string
  rucEmisor: string
  direccionEmisor: string
  ciudadEmisor?: string
  telefonoEmisor?: string
  emailEmisor?: string
  actividadEconomica?: string

  // Timbrado
  tipoDocumento: string    // "Factura Electrónica", "Nota de Crédito", etc.
  timbrado: string
  establecimiento: string
  puntoExpedicion: string
  numero: string
  fechaInicio: string

  // Operación
  cdc: string
  fechaEmision: string
  moneda: string
  condicionPago: string    // "Contado" | "Crédito"

  // Receptor
  nombreReceptor: string
  rucReceptor?: string
  direccionReceptor?: string
  emailReceptor?: string

  // Ítems
  items: Array<{
    descripcion: string
    cantidad: number
    unidadMedida: string
    precioUnitario: number
    descuento: number
    total: number
    iva: string   // "IVA 10%" | "IVA 5%" | "Exento" | "Exonerado"
  }>

  // Totales
  subtotal10: number
  subtotal5: number
  subtotalExento: number
  totalIva10: number
  totalIva5: number
  totalIva: number
  totalGeneral: number

  // QR y protocolo
  urlQr: string
  nroProtocolo?: string
  ambiente: 'Test' | 'Producción'
}

function formatGs(n: number): string {
  return new Intl.NumberFormat('es-PY').format(n)
}

/** Escapa caracteres HTML para prevenir inyección en el template (A4) */
function esc(str: string | undefined | null): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function generarHtmlKude(datos: DatosKude): string {
  const filaItems = datos.items
    .map(
      (item) => `
      <tr>
        <td>${esc(item.descripcion)}</td>
        <td class="center">${item.cantidad}</td>
        <td class="center">${esc(item.unidadMedida)}</td>
        <td class="right">${formatGs(item.precioUnitario)}</td>
        <td class="right">${item.descuento > 0 ? formatGs(item.descuento) : '-'}</td>
        <td class="center">${esc(item.iva)}</td>
        <td class="right">${formatGs(item.total)}</td>
      </tr>`,
    )
    .join('')

  const badgeAmbiente =
    datos.ambiente === 'Test'
      ? '<div class="badge-test">DOCUMENTO DE PRUEBA — NO VÁLIDO FISCALMENTE</div>'
      : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KuDE — ${esc(datos.tipoDocumento)} ${esc(datos.establecimiento)}-${esc(datos.puntoExpedicion)}-${esc(datos.numero)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Arial', sans-serif;
      font-size: 9pt;
      color: #1a1a1a;
      background: #fff;
      padding: 8mm;
    }
    .badge-test {
      background: #fef3c7;
      border: 2px solid #f59e0b;
      color: #92400e;
      text-align: center;
      font-weight: bold;
      padding: 4px;
      margin-bottom: 6px;
      font-size: 8pt;
    }
    .header {
      display: flex;
      border: 1px solid #333;
      margin-bottom: 4px;
    }
    .header-emisor {
      flex: 1;
      padding: 6px 8px;
      border-right: 1px solid #333;
    }
    .header-doc {
      width: 200px;
      padding: 6px 8px;
      text-align: center;
    }
    .emisor-nombre {
      font-size: 12pt;
      font-weight: bold;
      margin-bottom: 2px;
    }
    .emisor-ruc {
      font-size: 10pt;
      margin-bottom: 4px;
    }
    .emisor-dato {
      font-size: 8pt;
      color: #444;
      line-height: 1.4;
    }
    .doc-tipo {
      font-size: 11pt;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .doc-timbrado {
      font-size: 8pt;
      color: #555;
      margin-bottom: 2px;
    }
    .doc-numero {
      font-size: 13pt;
      font-weight: bold;
      color: #1d4ed8;
      margin: 4px 0;
    }
    .seccion {
      border: 1px solid #ccc;
      margin-bottom: 4px;
      padding: 4px 6px;
    }
    .seccion-titulo {
      font-weight: bold;
      font-size: 8pt;
      color: #555;
      margin-bottom: 3px;
      text-transform: uppercase;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 4px;
    }
    .campo { margin-bottom: 2px; }
    .campo-label { color: #666; font-size: 7.5pt; }
    .campo-valor { font-weight: 500; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 4px;
    }
    thead tr {
      background: #1e3a5f;
      color: white;
    }
    thead th {
      padding: 3px 4px;
      font-size: 7.5pt;
      text-align: left;
      font-weight: 600;
    }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody td {
      padding: 3px 4px;
      font-size: 8pt;
      border-bottom: 1px solid #e5e7eb;
    }
    .right { text-align: right; }
    .center { text-align: center; }
    .totales {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 4px;
    }
    .totales-tabla {
      border: 1px solid #ccc;
      min-width: 220px;
    }
    .totales-fila {
      display: flex;
      justify-content: space-between;
      padding: 2px 8px;
      font-size: 8.5pt;
      border-bottom: 1px solid #eee;
    }
    .totales-fila.total-general {
      background: #1e3a5f;
      color: white;
      font-weight: bold;
      font-size: 10pt;
      padding: 4px 8px;
    }
    .footer {
      display: flex;
      gap: 8px;
      border: 1px solid #ccc;
      padding: 6px;
      margin-top: 4px;
    }
    .qr-container {
      width: 90px;
      height: 90px;
      border: 1px solid #ccc;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 7pt;
      color: #888;
      text-align: center;
      flex-shrink: 0;
    }
    .cdc-container {
      flex: 1;
    }
    .cdc-label {
      font-size: 7pt;
      color: #666;
      margin-bottom: 2px;
    }
    .cdc-valor {
      font-family: 'Courier New', monospace;
      font-size: 8pt;
      font-weight: bold;
      word-break: break-all;
      letter-spacing: 0.5px;
    }
    .protocolo {
      font-size: 7.5pt;
      margin-top: 4px;
    }
    .footer-ambiente {
      font-size: 7pt;
      color: #888;
      margin-top: 4px;
    }
    @media print {
      body { padding: 0; }
      @page { margin: 8mm; size: A4; }
    }
  </style>
</head>
<body>

  ${badgeAmbiente}

  <!-- ENCABEZADO -->
  <div class="header">
    <div class="header-emisor">
      <div class="emisor-nombre">${esc(datos.nombreEmisor)}</div>
      <div class="emisor-ruc">RUC: <strong>${esc(datos.rucEmisor)}</strong></div>
      <div class="emisor-dato">${esc(datos.direccionEmisor)}</div>
      ${datos.ciudadEmisor ? `<div class="emisor-dato">${esc(datos.ciudadEmisor)}</div>` : ''}
      ${datos.telefonoEmisor ? `<div class="emisor-dato">Tel: ${esc(datos.telefonoEmisor)}</div>` : ''}
      ${datos.emailEmisor ? `<div class="emisor-dato">${esc(datos.emailEmisor)}</div>` : ''}
      ${datos.actividadEconomica ? `<div class="emisor-dato">Actividad: ${esc(datos.actividadEconomica)}</div>` : ''}
    </div>
    <div class="header-doc">
      <div class="doc-tipo">${esc(datos.tipoDocumento)}</div>
      <div class="doc-timbrado">Timbrado N°: ${esc(datos.timbrado)}</div>
      <div class="doc-timbrado">Vigencia desde: ${esc(datos.fechaInicio)}</div>
      <div class="doc-numero">${esc(datos.establecimiento)}-${esc(datos.puntoExpedicion)}-${esc(datos.numero)}</div>
      <div class="doc-timbrado">Fecha: ${esc(datos.fechaEmision)}</div>
      <div class="doc-timbrado">Moneda: ${esc(datos.moneda)}</div>
    </div>
  </div>

  <!-- RECEPTOR -->
  <div class="seccion">
    <div class="seccion-titulo">Receptor</div>
    <div class="grid-3">
      <div class="campo">
        <div class="campo-label">Nombre / Razón Social</div>
        <div class="campo-valor">${esc(datos.nombreReceptor)}</div>
      </div>
      ${datos.rucReceptor ? `
      <div class="campo">
        <div class="campo-label">RUC / CI</div>
        <div class="campo-valor">${esc(datos.rucReceptor)}</div>
      </div>` : ''}
      <div class="campo">
        <div class="campo-label">Condición de Pago</div>
        <div class="campo-valor">${esc(datos.condicionPago)}</div>
      </div>
      ${datos.direccionReceptor ? `
      <div class="campo">
        <div class="campo-label">Dirección</div>
        <div class="campo-valor">${esc(datos.direccionReceptor)}</div>
      </div>` : ''}
      ${datos.emailReceptor ? `
      <div class="campo">
        <div class="campo-label">Email</div>
        <div class="campo-valor">${esc(datos.emailReceptor)}</div>
      </div>` : ''}
    </div>
  </div>

  <!-- ÍTEMS -->
  <table>
    <thead>
      <tr>
        <th>Descripción</th>
        <th class="center">Cantidad</th>
        <th class="center">Unidad</th>
        <th class="right">P. Unitario</th>
        <th class="right">Descuento</th>
        <th class="center">IVA</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${filaItems}
    </tbody>
  </table>

  <!-- TOTALES -->
  <div class="totales">
    <div class="totales-tabla">
      ${datos.subtotal10 > 0 ? `
      <div class="totales-fila">
        <span>Subtotal IVA 10%</span>
        <span>${formatGs(datos.subtotal10)}</span>
      </div>
      <div class="totales-fila">
        <span>IVA 10%</span>
        <span>${formatGs(datos.totalIva10)}</span>
      </div>` : ''}
      ${datos.subtotal5 > 0 ? `
      <div class="totales-fila">
        <span>Subtotal IVA 5%</span>
        <span>${formatGs(datos.subtotal5)}</span>
      </div>
      <div class="totales-fila">
        <span>IVA 5%</span>
        <span>${formatGs(datos.totalIva5)}</span>
      </div>` : ''}
      ${datos.subtotalExento > 0 ? `
      <div class="totales-fila">
        <span>Exento</span>
        <span>${formatGs(datos.subtotalExento)}</span>
      </div>` : ''}
      <div class="totales-fila">
        <span>Total IVA</span>
        <span>${formatGs(datos.totalIva)}</span>
      </div>
      <div class="totales-fila total-general">
        <span>TOTAL ${datos.moneda}</span>
        <span>${formatGs(datos.totalGeneral)}</span>
      </div>
    </div>
  </div>

  <!-- FOOTER: CDC + QR -->
  <div class="footer">
    <div class="qr-container">
      <div>
        <div>QR</div>
        <div style="font-size:6pt; margin-top:2px;">Escanear para<br>verificar en SET</div>
      </div>
    </div>
    <div class="cdc-container">
      <div class="cdc-label">Código de Control (CDC)</div>
      <div class="cdc-valor">${esc(datos.cdc)}</div>
      ${datos.nroProtocolo ? `<div class="protocolo">Nro. Protocolo: <strong>${esc(datos.nroProtocolo)}</strong></div>` : ''}
      <div class="footer-ambiente">Ambiente: ${esc(datos.ambiente)} — Generado con sifen-api (devsart95/sifen-api)</div>
    </div>
  </div>

</body>
</html>`
}
