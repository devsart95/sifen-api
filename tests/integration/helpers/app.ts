/**
 * Helper para levantar la app en tests de integración.
 * Inyecta un PrismaClient real (DB de test) y un SifenSoapClient mockeado.
 */
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../../../src/app.js'
import type { SifenSoapClient, SoapResponse } from '../../../src/services/sifen/soap.client.js'
import { hashApiKey } from '../../../src/middleware/auth.js'

// Mock del cliente SOAP — no llama a SIFEN real en tests de integración
export function crearSoapClientMock(overrides: Partial<SifenSoapClient> = {}): SifenSoapClient {
  const mock: SifenSoapClient = {
    recibirDe: async (_xml, _id): Promise<SoapResponse> => ({
      ok: true,
      data: '<rRetEnviDe><dEstRes>Aprobado</dEstRes><dProtAut>123456789</dProtAut></rRetEnviDe>',
      statusCode: 200,
    }),
    recibirLote: async (_xmls, _id): Promise<SoapResponse> => ({
      ok: true,
      data: '<rRetEnvioLote><dProtConsLote>999888777</dProtConsLote></rRetEnvioLote>',
      statusCode: 200,
    }),
    consultarPorCdc: async (_cdc, _id): Promise<SoapResponse> => ({
      ok: true,
      data: '<rRetConsDeResponse><dEstRes>Aprobado</dEstRes></rRetConsDeResponse>',
      statusCode: 200,
    }),
    consultarLote: async (_proto, _id): Promise<SoapResponse> => ({
      ok: true,
      data: '<rRetConsLoteDe><dEstRes>Procesado</dEstRes></rRetConsLoteDe>',
      statusCode: 200,
    }),
    consultarRuc: async (_ruc, _id): Promise<SoapResponse> => ({
      ok: true,
      data: '<rRetConsRuc><dNomRaz>EMPRESA TEST SA</dNomRaz></rRetConsRuc>',
      statusCode: 200,
    }),
    recibirEvento: async (_xml, _id): Promise<SoapResponse> => ({
      ok: true,
      data: '<rRetEnvioEvento><dEstRes>Aceptado</dEstRes></rRetEnvioEvento>',
      statusCode: 200,
    }),
    ...overrides,
  }
  return mock
}

// Prisma compartido entre tests del mismo suite para performance
let prismaInstance: PrismaClient | null = null

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      datasources: { db: { url: process.env['DATABASE_URL'] } },
    })
  }
  return prismaInstance
}

export async function teardownPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect()
    prismaInstance = null
  }
}

export interface TestContext {
  tenantId: string
  apiKey: string    // raw key para usar en headers
  timbradoId: string
}

/**
 * Crea un tenant con API key y timbrado en la DB de test.
 * Retorna los datos necesarios para autenticar requests.
 */
export async function crearContextoTest(prisma: PrismaClient): Promise<TestContext> {
  const rawKey = `test-key-${Date.now()}`
  const ruc = String(Math.floor(10_000_000 + Math.random() * 89_999_999))

  const tenant = await prisma.tenant.create({
    data: {
      nombre: `Tenant Test ${ruc}`,
      ruc,
      dvRuc: '1',
    },
  })

  await prisma.apiKey.create({
    data: {
      tenantId: tenant.id,
      hash: hashApiKey(rawKey),
      nombre: 'Key de test',
    },
  })

  const timbrado = await prisma.timbrado.create({
    data: {
      tenantId: tenant.id,
      numero: '12345678',
      establecimiento: '001',
      puntoExpedicion: '001',
      tipoDocumento: 1,
      fechaInicio: new Date('2024-01-01'),
    },
  })

  return { tenantId: tenant.id, apiKey: rawKey, timbradoId: timbrado.id }
}

export async function buildTestApp(
  prisma: PrismaClient,
  soapOverrides: Partial<SifenSoapClient> = {},
) {
  const soapClient = crearSoapClientMock(soapOverrides)
  return buildApp({ prisma, soapClient })
}
