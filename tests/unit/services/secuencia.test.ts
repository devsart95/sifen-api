/**
 * Tests para secuencia.ts — validación de parámetros, conversión BigInt,
 * aritmética de rangos y atomicidad simulada.
 * Prisma mockeado con vi.fn().
 */
import { describe, it, expect, vi } from 'vitest'
import { reservarNumeros } from '../../../src/services/secuencia.js'

function makePrismaMock(ultimoNumero: bigint) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ ultimo_numero: ultimoNumero }]),
  }
}

// ──────────────────────────────────────────────────────────────
// Validación de parámetros
// ──────────────────────────────────────────────────────────────

describe('reservarNumeros — validación de parámetros', () => {
  it('lanza error si cantidad es 0', async () => {
    const prisma = makePrismaMock(0n)
    await expect(reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 0)).rejects.toThrow(/cantidad debe estar entre/)
  })

  it('lanza error si cantidad es negativa', async () => {
    const prisma = makePrismaMock(0n)
    await expect(reservarNumeros(prisma as any, 'timb-1', 'tenant-1', -1)).rejects.toThrow(/cantidad debe estar entre/)
  })

  it('lanza error si cantidad es 51 (por encima del máximo)', async () => {
    const prisma = makePrismaMock(0n)
    await expect(reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 51)).rejects.toThrow(/cantidad debe estar entre/)
  })

  it('acepta cantidad=1 (mínimo válido)', async () => {
    const prisma = makePrismaMock(1n)
    await expect(reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 1)).resolves.not.toThrow()
  })

  it('acepta cantidad=50 (máximo válido)', async () => {
    const prisma = makePrismaMock(50n)
    await expect(reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 50)).resolves.not.toThrow()
  })
})

// ──────────────────────────────────────────────────────────────
// Conversión BigInt → number
// ──────────────────────────────────────────────────────────────

describe('reservarNumeros — conversión BigInt', () => {
  it('convierte correctamente BigInt 1n a número [1]', async () => {
    const prisma = makePrismaMock(1n)
    const result = await reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 1)
    expect(result).toEqual([1])
  })

  it('convierte BigInt grande a número seguro (ej: 9999999n)', async () => {
    const prisma = makePrismaMock(9_999_999n)
    const result = await reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 1)
    expect(result).toEqual([9_999_999])
  })

  it('lanza error si $queryRaw no retorna filas', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) }
    await expect(reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 1)).rejects.toThrow(/Error al reservar/)
  })

  it('lanza error si ultimo_numero es undefined', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ ultimo_numero: undefined }]) }
    await expect(reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 1)).rejects.toThrow(/Error al reservar/)
  })

  it('lanza error si ultimo_numero es null', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ ultimo_numero: null }]) }
    await expect(reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 1)).rejects.toThrow(/Error al reservar/)
  })
})

// ──────────────────────────────────────────────────────────────
// Aritmética de rangos correlativos
// ──────────────────────────────────────────────────────────────

describe('reservarNumeros — rango de números retornados', () => {
  it('cantidad=1, ultimo=5 → retorna [5]', async () => {
    const prisma = makePrismaMock(5n)
    const result = await reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 1)
    expect(result).toEqual([5])
  })

  it('cantidad=3, ultimo=8 → retorna [6, 7, 8]', async () => {
    const prisma = makePrismaMock(8n)
    const result = await reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 3)
    expect(result).toEqual([6, 7, 8])
  })

  it('cantidad=1, ultimo=1 → retorna [1] (primer documento del timbrado)', async () => {
    const prisma = makePrismaMock(1n)
    const result = await reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 1)
    expect(result).toEqual([1])
  })

  it('cantidad=50, ultimo=50 → retorna [1, 2, ..., 50]', async () => {
    const prisma = makePrismaMock(50n)
    const result = await reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 50)
    expect(result).toHaveLength(50)
    expect(result[0]).toBe(1)
    expect(result[49]).toBe(50)
    // Verificar que son consecutivos
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBe(result[i - 1]! + 1)
    }
  })

  it('los números son consecutivos sin gaps', async () => {
    const prisma = makePrismaMock(103n)
    const result = await reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 3)
    expect(result).toEqual([101, 102, 103])
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBe(result[i - 1]! + 1)
    }
  })

  it('el último número del rango siempre coincide con ultimo_numero de DB', async () => {
    for (const [ultimo, cantidad] of [[10n, 1], [20n, 5], [100n, 10]] as const) {
      const prisma = makePrismaMock(ultimo)
      const result = await reservarNumeros(prisma as any, 'timb-x', 'tenant-x', cantidad)
      expect(result[result.length - 1]).toBe(Number(ultimo))
    }
  })

  it('retorna la cantidad exacta de números pedidos', async () => {
    for (const cantidad of [1, 5, 10, 25, 50]) {
      const prisma = makePrismaMock(BigInt(cantidad + 100))
      const result = await reservarNumeros(prisma as any, 'timb-x', 'tenant-x', cantidad)
      expect(result).toHaveLength(cantidad)
    }
  })
})

// ──────────────────────────────────────────────────────────────
// Invocación correcta al query raw (atomicidad)
// ──────────────────────────────────────────────────────────────

describe('reservarNumeros — llamada a $queryRaw', () => {
  it('llama a prisma.$queryRaw exactamente una vez', async () => {
    const prisma = makePrismaMock(1n)
    await reservarNumeros(prisma as any, 'timb-1', 'tenant-1', 1)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('no hace múltiples queries (operación atómica en un solo round-trip)', async () => {
    const prisma = makePrismaMock(5n)
    await reservarNumeros(prisma as any, 'timb-uuid', 'tenant-uuid', 5)
    // Un solo $queryRaw = INSERT ... ON CONFLICT DO UPDATE ... RETURNING
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
  })
})
