import { XMLParser } from 'fast-xml-parser'
import { SIFEN_NAMESPACE, VERSION_FORMATO } from '../../config/constants.js'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validador de estructura del XML del DE.
 *
 * Nota: La validación completa contra los XSD oficiales de SIFEN (v150) requiere
 * una librería de validación XSD como `libxml2` o `xsd-validator` que depende de
 * binarios nativos. Esta implementación valida la estructura lógica del documento
 * (campos obligatorios, formatos, rangos) sin necesidad de binarios adicionales.
 *
 * Para validación XSD estricta en producción, usar el endpoint SIFEN de homologación
 * que retorna los errores de validación en su respuesta.
 */
export function validarEstructuraXml(xml: string): ValidationResult {
  const errors: string[] = []

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
  })

  let parsed: Record<string, unknown>
  try {
    parsed = parser.parse(xml) as Record<string, unknown>
  } catch {
    return { valid: false, errors: ['XML malformado: no se pudo parsear'] }
  }

  const rDE = parsed['rDE'] as Record<string, unknown> | undefined
  if (!rDE) {
    return { valid: false, errors: ['Falta elemento raíz <rDE>'] }
  }

  // Versión del formato
  const dVerFor = rDE['dVerFor']
  if (String(dVerFor) !== VERSION_FORMATO) {
    errors.push(`dVerFor debe ser "${VERSION_FORMATO}", se recibió "${String(dVerFor)}"`)
  }

  const de = rDE['DE'] as Record<string, unknown> | undefined
  if (!de) {
    errors.push('Falta elemento <DE>')
    return { valid: false, errors }
  }

  // CDC
  const cdcId = (de['@_Id'] as string | undefined) ?? ''
  if (!cdcId || cdcId.length !== 44) {
    errors.push(`El atributo Id de <DE> debe tener 44 caracteres (CDC), se encontró: ${cdcId.length}`)
  }
  if (cdcId && !/^\d+$/.test(cdcId)) {
    errors.push('El CDC debe contener solo dígitos')
  }

  // Namespace
  const xmlns = de['@_xmlns'] as string | undefined
  if (xmlns && xmlns !== SIFEN_NAMESPACE) {
    errors.push(`Namespace incorrecto: se esperaba "${SIFEN_NAMESPACE}"`)
  }

  // gTimb — timbrado
  const gTimb = de['gTimb'] as Record<string, unknown> | undefined
  if (!gTimb) {
    errors.push('Falta elemento <gTimb>')
  } else {
    validarCampoRequerido(gTimb, 'iTiDE', errors, (v) => {
      const n = parseInt(String(v), 10)
      return n >= 1 && n <= 9
    }, 'iTiDE debe ser 1-9')

    validarCampoRequerido(gTimb, 'dNumTim', errors, (v) =>
      /^\d{8}$/.test(String(v)),
    'dNumTim debe tener 8 dígitos')

    validarCampoRequerido(gTimb, 'dEst', errors, (v) =>
      /^\d{3}$/.test(String(v)),
    'dEst debe tener 3 dígitos')

    validarCampoRequerido(gTimb, 'dPunExp', errors, (v) =>
      /^\d{3}$/.test(String(v)),
    'dPunExp debe tener 3 dígitos')
  }

  // gDatGralOpe — datos generales
  const gDatGralOpe = de['gDatGralOpe'] as Record<string, unknown> | undefined
  if (!gDatGralOpe) {
    errors.push('Falta elemento <gDatGralOpe>')
  } else {
    if (!gDatGralOpe['dFeEmiDE']) errors.push('Falta campo dFeEmiDE')
    if (!gDatGralOpe['gOpeCom']) errors.push('Falta elemento <gOpeCom>')
    if (!gDatGralOpe['gEmis']) errors.push('Falta elemento <gEmis>')
    if (!gDatGralOpe['gDatRec']) errors.push('Falta elemento <gDatRec>')
  }

  // gTotSub — totales
  const gTotSub = de['gTotSub'] as Record<string, unknown> | undefined
  if (!gTotSub) {
    errors.push('Falta elemento <gTotSub>')
  } else {
    for (const campo of ['dTotGralOpe', 'dTotIVA']) {
      if (gTotSub[campo] === undefined) errors.push(`Falta campo ${campo} en <gTotSub>`)
    }
  }

  // gCamFuFD — QR
  const gCamFuFD = rDE['gCamFuFD'] as Record<string, unknown> | undefined
  if (!gCamFuFD || !gCamFuFD['dCarQR']) {
    errors.push('Falta elemento <gCamFuFD> o campo dCarQR (URL del QR)')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Verifica que un XML contiene una firma XMLDSig válida en estructura.
 * No verifica la firma criptográfica (eso lo hace SIFEN al recibir el documento).
 */
export function tieneFirmaXml(xml: string): boolean {
  return xml.includes('ds:Signature') && xml.includes('ds:SignatureValue')
}

// ─── Helper interno ───────────────────────────────────────────────────────────

function validarCampoRequerido(
  obj: Record<string, unknown>,
  campo: string,
  errors: string[],
  validar?: (v: unknown) => boolean,
  mensajeFormato?: string,
): void {
  if (obj[campo] === undefined || obj[campo] === null || obj[campo] === '') {
    errors.push(`Falta campo requerido: ${campo}`)
    return
  }
  if (validar && mensajeFormato && !validar(obj[campo])) {
    errors.push(mensajeFormato)
  }
}
