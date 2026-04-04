import axios, { type AxiosInstance } from 'axios'
import * as fs from 'node:fs'
import * as https from 'node:https'
import { SIFEN_ENDPOINTS, SOAP_NAMESPACE, LIMITES } from '../../config/constants.js'
import { env } from '../../config/env.js'

export type SifenAmbiente = 'test' | 'produccion'

export interface SoapResponse {
  ok: boolean
  data?: string       // XML de respuesta
  error?: string
  statusCode?: number
}

/**
 * Cliente SOAP para SIFEN con mTLS.
 * Cada instancia carga el certificado PKCS#12 del contribuyente.
 */
export class SifenSoapClient {
  private readonly http: AxiosInstance
  private readonly endpoints: (typeof SIFEN_ENDPOINTS)[SifenAmbiente]

  constructor(ambiente: SifenAmbiente = env.SIFEN_AMBIENTE) {
    this.endpoints = SIFEN_ENDPOINTS[ambiente]

    const pfxBuffer = fs.readFileSync(env.SIFEN_CERT_PATH)

    const httpsAgent = new https.Agent({
      pfx: pfxBuffer,
      passphrase: env.SIFEN_CERT_PASS,
      rejectUnauthorized: ambiente === 'produccion',
    })

    this.http = axios.create({
      baseURL: this.endpoints.base,
      httpsAgent,
      timeout: LIMITES.TIMEOUT_SOAP_MS,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Accept': 'application/xml',
      },
    })
  }

  /** Envía un DE de forma síncrona (respuesta inmediata) */
  async recibirDe(xmlFirmado: string, idEnvio = 1): Promise<SoapResponse> {
    const body = this.buildSoapEnvelope('rEnviDe', {
      dId: idEnvio,
      xDE: xmlFirmado,
    })
    return this.post(this.endpoints.recepcion, body)
  }

  /** Envía un lote de DEs de forma asíncrona (hasta 50) */
  async recibirLote(xmlsDe: string[], idLote = 1): Promise<SoapResponse> {
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

  /** Consulta el estado de un lote por número de protocolo */
  async consultarLote(nroProtocolo: string, idConsulta = 1): Promise<SoapResponse> {
    const body = this.buildSoapEnvelope('rEnviConsLoteDe', {
      dId: idConsulta,
      dProtConsLote: nroProtocolo,
    })
    return this.post(this.endpoints.consultaLote, body)
  }

  /** Consulta datos de un contribuyente por RUC */
  async consultarRuc(ruc: string, idConsulta = 1): Promise<SoapResponse> {
    const body = this.buildSoapEnvelope('rEnviConsRUC', {
      dId: idConsulta,
      dRuc: ruc,
    })
    return this.post(this.endpoints.consultaRuc, body)
  }

  /** Envía un evento (cancelación, inutilización, conformidad, etc.) */
  async recibirEvento(xmlEvento: string, idEnvio = 1): Promise<SoapResponse> {
    const body = this.buildSoapEnvelope('rEnviEventoDe', {
      dId: idEnvio,
      xEvento: xmlEvento,
    })
    return this.post(this.endpoints.eventos, body)
  }

  private async post(endpoint: string, body: string): Promise<SoapResponse> {
    try {
      const response = await this.http.post(endpoint, body)
      return { ok: true, data: response.data as string, statusCode: response.status }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          ok: false,
          error: error.response?.data as string ?? error.message,
          statusCode: error.response?.status,
        }
      }
      return { ok: false, error: String(error) }
    }
  }

  private buildSoapEnvelope(action: string, params: Record<string, unknown>): string {
    const ns = 'http://ekuatia.set.gov.py/sifen/xsd'
    const innerXml = Object.entries(params)
      .map(([key, val]) => `<${key}>${String(val)}</${key}>`)
      .join('')

    return [
      `<env:Envelope xmlns:env="${SOAP_NAMESPACE}">`,
      '  <env:Header/>',
      '  <env:Body>',
      `    <${action} xmlns="${ns}">`,
      `      ${innerXml}`,
      `    </${action}>`,
      '  </env:Body>',
      '</env:Envelope>',
    ].join('\n')
  }
}
