import axios, { type AxiosInstance } from 'axios'
import * as fs from 'node:fs'
import * as https from 'node:https'
import { SIFEN_ENDPOINTS, SIFEN_NAMESPACE, SOAP_NAMESPACE, LIMITES } from '../../config/constants.js'
import { env } from '../../config/env.js'
import { CircuitBreaker, CircuitBreakerOpenError, type CircuitState } from './circuit-breaker.js'

export type SifenAmbiente = 'test' | 'produccion'

export interface SoapResponse {
  ok: boolean
  data?: string       // XML de respuesta SIFEN
  error?: string
  statusCode?: number
}

/**
 * Cliente SOAP para SIFEN con mTLS.
 * Cada instancia carga el certificado PKCS#12 del contribuyente.
 * La autenticación ocurre en la capa TLS (no hay API key ni Bearer token).
 */
export class SifenSoapClient {
  private readonly http: AxiosInstance
  private readonly endpoints: (typeof SIFEN_ENDPOINTS)[SifenAmbiente]
  private readonly cb: CircuitBreaker

  constructor(ambiente: SifenAmbiente = env.SIFEN_AMBIENTE) {
    this.endpoints = SIFEN_ENDPOINTS[ambiente]
    this.cb = new CircuitBreaker('sifen', {
      umbralFallos: 5,
      ventanaMs: 60_000,
      cooldownMs: 30_000,
    })

    const pfxBuffer = fs.readFileSync(env.SIFEN_CERT_PATH)

    const httpsAgent = new https.Agent({
      pfx: pfxBuffer,
      passphrase: env.SIFEN_CERT_PASS,
      // En homologación los certs de prueba pueden ser autofirmados
      rejectUnauthorized: ambiente === 'produccion',
    })

    this.http = axios.create<string>({
      baseURL: this.endpoints.base,
      httpsAgent,
      timeout: LIMITES.TIMEOUT_SOAP_MS,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Accept': 'application/xml',
      },
      // Forzar respuesta como texto (SIFEN devuelve XML, no JSON)
      responseType: 'text',
    })
  }

  /** Estado del circuit breaker — expuesto para healthcheck y métricas */
  get circuitEstado(): CircuitState {
    return this.cb.estadoActual
  }

  /** Envía un DE de forma síncrona (respuesta inmediata) */
  async recibirDe(xmlFirmado: string, idEnvio = 1): Promise<SoapResponse> {
    const body = this.buildSoapEnvelope('rEnviDe', {
      dId: idEnvio,
      xDE: xmlFirmado,
    })
    return this.post(this.endpoints.recepcion, body)
  }

  /** Envía un lote de DEs de forma asíncrona (hasta 50 documentos) */
  async recibirLote(xmlsDe: string[], idLote = 1): Promise<SoapResponse> {
    if (xmlsDe.length === 0 || xmlsDe.length > LIMITES.MAX_DES_POR_LOTE) {
      return {
        ok: false,
        error: `El lote debe contener entre 1 y ${LIMITES.MAX_DES_POR_LOTE} documentos`,
      }
    }
    const deElements = xmlsDe.map((xml) => `<xDE>${xml}</xDE>`).join('')
    const body = this.buildSoapEnvelope('rEnvioLote', {
      dId: idLote,
      dCantReg: xmlsDe.length,
      xDELot: deElements,
    })
    return this.post(this.endpoints.recepcionLote, body)
  }

  /** Consulta el estado de un DE por CDC */
  async consultarPorCdc(cdc: string, idConsulta = 1): Promise<SoapResponse> {
    const body = this.buildSoapEnvelope('rEnviConsDeRequest', {
      dId: idConsulta,
      dCDC: cdc,
    })
    return this.post(this.endpoints.consultaCdc, body)
  }

  /** Consulta el estado de un lote por número de protocolo SIFEN */
  async consultarLote(nroProtocolo: string, idConsulta = 1): Promise<SoapResponse> {
    const body = this.buildSoapEnvelope('rEnviConsLoteDe', {
      dId: idConsulta,
      dProtConsLote: nroProtocolo,
    })
    return this.post(this.endpoints.consultaLote, body)
  }

  /** Consulta datos de un contribuyente por RUC (sin DV) */
  async consultarRuc(rucSinDv: string, idConsulta = 1): Promise<SoapResponse> {
    const body = this.buildSoapEnvelope('rEnviConsRUC', {
      dId: idConsulta,
      dRuc: rucSinDv,
    })
    return this.post(this.endpoints.consultaRuc, body)
  }

  /** Envía un evento firmado (cancelación, inutilización, conformidad, etc.) */
  async recibirEvento(xmlEventoFirmado: string, idEnvio = 1): Promise<SoapResponse> {
    const body = this.buildSoapEnvelope('rEnviEventoDe', {
      dId: idEnvio,
      xEvento: xmlEventoFirmado,
    })
    return this.post(this.endpoints.eventos, body)
  }

  private async post(endpoint: string, body: string): Promise<SoapResponse> {
    try {
      const response = await this.cb.ejecutar(() =>
        this.http.post<string>(endpoint, body),
      )
      const data: unknown = response.data
      return {
        ok: true,
        data: typeof data === 'string' ? data : String(data),
        statusCode: response.status,
      }
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        return { ok: false, error: error.message, statusCode: 503 }
      }
      if (axios.isAxiosError(error)) {
        const responseData: unknown = error.response?.data
        return {
          ok: false,
          error: typeof responseData === 'string' ? responseData : error.message,
          statusCode: error.response?.status,
        }
      }
      return { ok: false, error: String(error) }
    }
  }

  private buildSoapEnvelope(action: string, params: Record<string, unknown>): string {
    // Usar SIFEN_NAMESPACE de constants.ts (no hardcodeado)
    const innerXml = Object.entries(params)
      .map(([key, val]) => `<${key}>${String(val)}</${key}>`)
      .join('')

    return [
      `<env:Envelope xmlns:env="${SOAP_NAMESPACE}">`,
      '  <env:Header/>',
      '  <env:Body>',
      `    <${action} xmlns="${SIFEN_NAMESPACE}">`,
      `      ${innerXml}`,
      `    </${action}>`,
      '  </env:Body>',
      '</env:Envelope>',
    ].join('\n')
  }
}
