import { PrismaClient } from '@prisma/client'
import { hashApiKey } from '../src/middleware/auth.js'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Tenant de prueba (SET RUC de homologación)
  const tenant = await prisma.tenant.upsert({
    where: { ruc: '80069563' },
    update: {},
    create: {
      nombre: 'Empresa Test SIFEN',
      ruc: '80069563',
      dvRuc: '1',
    },
  })

  console.log(`Tenant: ${tenant.nombre} (${tenant.ruc}-${tenant.dvRuc})`)

  // API key de prueba
  const rawKey = 'test-api-key-32-chars-minimum-here'
  const apiKey = await prisma.apiKey.upsert({
    where: { hash: hashApiKey(rawKey) },
    update: {},
    create: {
      tenantId: tenant.id,
      hash: hashApiKey(rawKey),
      nombre: 'Key de desarrollo local',
    },
  })

  console.log(`API Key creada (ID: ${apiKey.id})`)
  console.log(`  → Usar en header X-API-Key: ${rawKey}`)

  // Timbrado de prueba (homologación)
  const timbrado = await prisma.timbrado.upsert({
    where: {
      tenantId_numero_establecimiento_puntoExpedicion_tipoDocumento: {
        tenantId: tenant.id,
        numero: '12345678',
        establecimiento: '001',
        puntoExpedicion: '001',
        tipoDocumento: 1,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      numero: '12345678',
      establecimiento: '001',
      puntoExpedicion: '001',
      tipoDocumento: 1,  // Factura Electrónica
      fechaInicio: new Date('2024-01-01'),
    },
  })

  console.log(`Timbrado: ${timbrado.numero} EST:${timbrado.establecimiento} PTO:${timbrado.puntoExpedicion}`)
  console.log('\nSeed completado.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
