import type { PrismaClient } from '@prisma/client'

/**
 * Reserva N números correlativos de forma atómica para un timbrado.
 * Usa UPDATE ... RETURNING para evitar race conditions bajo concurrencia.
 *
 * Para emision individual (cantidad=1): retorna [numero]
 * Para lotes (cantidad=N): retorna [inicio+1, inicio+2, ..., inicio+N]
 *
 * Si la secuencia no existe para el timbrado, la crea con valor 0 y retorna [1..N].
 */
export async function reservarNumeros(
  prisma: PrismaClient,
  timbradoId: string,
  tenantId: string,
  cantidad: number,
): Promise<number[]> {
  if (cantidad < 1 || cantidad > 50) {
    throw new Error(`cantidad debe estar entre 1 y 50, recibido: ${cantidad}`)
  }

  // Upsert atómico: crea la secuencia si no existe, luego incrementa N
  // El UPDATE es atómico en PostgreSQL — sin race condition posible
  const resultado = await prisma.$queryRaw<Array<{ ultimo_numero: number }>>`
    INSERT INTO secuencias_timbrado (timbrado_id, tenant_id, ultimo_numero, actualizado_en)
    VALUES (${timbradoId}, ${tenantId}, ${cantidad}, NOW())
    ON CONFLICT (timbrado_id) DO UPDATE
      SET ultimo_numero   = secuencias_timbrado.ultimo_numero + ${cantidad},
          actualizado_en  = NOW()
    RETURNING ultimo_numero
  `

  const ultimoNumero = resultado[0]?.ultimo_numero
  if (ultimoNumero === undefined) {
    throw new Error(`Error al reservar número correlativo para timbrado ${timbradoId}`)
  }

  // Si cantidad=1 y ultimoNumero=5, devuelve [5]
  // Si cantidad=3 y ultimoNumero=8, devuelve [6, 7, 8]
  const numeros: number[] = []
  for (let i = cantidad - 1; i >= 0; i--) {
    numeros.unshift(ultimoNumero - i)
  }

  return numeros
}
