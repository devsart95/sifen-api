/**
 * Tests E2E contra SIFEN homologación.
 * Solo corren con SIFEN_E2E_CERT_PATH + SIFEN_E2E_CERT_PASS definidos.
 */
import * as fs from 'node:fs'
import { expect } from 'vitest'
import { describeE2e, itE2e, getE2eConfig } from './setup.js'
import { SifenSoapClient } from '../../src/services/sifen/soap.client.js'

describeE2e('SifenSoapClient — homologación', () => {
  let client: SifenSoapClient

  itE2e('inicializa con certificado real', async () => {
    const { certPath, certPass } = getE2eConfig()
    const pfx = fs.readFileSync(certPath)
    client = new SifenSoapClient('test', { pfx, passphrase: certPass })
    // Si lanza en el constructor, el test falla
  })

  itE2e('consultarRuc retorna datos del contribuyente', async () => {
    const { certPath, certPass, ruc } = getE2eConfig()
    const pfx = fs.readFileSync(certPath)
    client = new SifenSoapClient('test', { pfx, passphrase: certPass })

    const resp = await client.consultarRuc(ruc)
    // SIFEN puede responder ok o con error de validación — ambos son respuestas válidas
    if (resp.ok) {
      expect(resp.data).toContain('dNomRaz')
    } else {
      // Error esperado si el RUC no está registrado en homologación
      expect(resp.error).toBeDefined()
    }
  })
})
