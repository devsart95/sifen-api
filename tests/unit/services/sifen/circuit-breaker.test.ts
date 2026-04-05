/**
 * Tests para CircuitBreaker — FSM completo: CLOSED → OPEN → HALF_OPEN → CLOSED/OPEN.
 * Sin dependencias externas. Control de tiempo con vi.setSystemTime.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CircuitBreaker, CircuitBreakerOpenError } from '../../../../src/services/sifen/circuit-breaker.js'

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

const succeed = async () => 'ok'
const fail = async () => { throw new Error('SIFEN error') }

// ──────────────────────────────────────────────────────────────
// Estado inicial
// ──────────────────────────────────────────────────────────────

describe('CircuitBreaker — estado inicial CLOSED', () => {
  it('inicia en estado CLOSED', () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 3, cooldownMs: 1000 })
    expect(cb.estadoActual).toBe('CLOSED')
  })

  it('permite ejecutar funciones cuando está CLOSED', async () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 3, cooldownMs: 1000 })
    const resultado = await cb.ejecutar(succeed)
    expect(resultado).toBe('ok')
  })

  it('propaga los errores de las funciones sin abrir el circuito (bajo el umbral)', async () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 5, cooldownMs: 1000 })
    await expect(cb.ejecutar(fail)).rejects.toThrow('SIFEN error')
    expect(cb.estadoActual).toBe('CLOSED') // aún no llegó al umbral
  })
})

// ──────────────────────────────────────────────────────────────
// Transición CLOSED → OPEN
// ──────────────────────────────────────────────────────────────

describe('CircuitBreaker — CLOSED → OPEN al alcanzar umbral', () => {
  it('abre el circuito exactamente en el fallo número umbralFallos', async () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 3, cooldownMs: 5000 })

    // 2 fallos → sigue CLOSED
    for (let i = 0; i < 2; i++) {
      await expect(cb.ejecutar(fail)).rejects.toThrow()
    }
    expect(cb.estadoActual).toBe('CLOSED')

    // 3er fallo → OPEN
    await expect(cb.ejecutar(fail)).rejects.toThrow()
    expect(cb.estadoActual).toBe('OPEN')
  })

  it('un éxito en CLOSED resetea el contador de fallos consecutivos', async () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 3, cooldownMs: 5000 })

    // 2 fallos
    await expect(cb.ejecutar(fail)).rejects.toThrow()
    await expect(cb.ejecutar(fail)).rejects.toThrow()
    expect(cb.estadoActual).toBe('CLOSED')

    // Éxito → resetea contador
    await cb.ejecutar(succeed)

    // 2 fallos más → no debe abrir (contador empezó de 0)
    await expect(cb.ejecutar(fail)).rejects.toThrow()
    await expect(cb.ejecutar(fail)).rejects.toThrow()
    expect(cb.estadoActual).toBe('CLOSED')
  })

  it('con umbralFallos=1, abre en el primer fallo', async () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 1, cooldownMs: 5000 })
    await expect(cb.ejecutar(fail)).rejects.toThrow()
    expect(cb.estadoActual).toBe('OPEN')
  })
})

// ──────────────────────────────────────────────────────────────
// Estado OPEN — rechazo inmediato
// ──────────────────────────────────────────────────────────────

describe('CircuitBreaker — estado OPEN rechaza sin llamar a fn', () => {
  it('lanza CircuitBreakerOpenError cuando está OPEN', async () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 1, cooldownMs: 5000 })
    await expect(cb.ejecutar(fail)).rejects.toThrow() // abre el circuito

    await expect(cb.ejecutar(succeed)).rejects.toThrow(CircuitBreakerOpenError)
  })

  it('el mensaje del error menciona el nombre del circuit breaker', async () => {
    const cb = new CircuitBreaker('sifen-produccion', { umbralFallos: 1, cooldownMs: 5000 })
    await expect(cb.ejecutar(fail)).rejects.toThrow()

    try {
      await cb.ejecutar(succeed)
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitBreakerOpenError)
      expect((err as Error).message).toContain('sifen-produccion')
    }
  })

  it('no ejecuta fn cuando está OPEN (fn nunca es llamada)', async () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 1, cooldownMs: 5000 })
    await expect(cb.ejecutar(fail)).rejects.toThrow() // abre

    const fn = vi.fn().mockResolvedValue('resultado')
    await expect(cb.ejecutar(fn)).rejects.toThrow(CircuitBreakerOpenError)
    expect(fn).not.toHaveBeenCalled()
  })

  it('el error de CircuitBreakerOpenError tiene name correcto', async () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 1, cooldownMs: 5000 })
    await expect(cb.ejecutar(fail)).rejects.toThrow()

    try {
      await cb.ejecutar(succeed)
    } catch (err) {
      expect((err as Error).name).toBe('CircuitBreakerOpenError')
    }
  })
})

// ──────────────────────────────────────────────────────────────
// Transición OPEN → HALF_OPEN (tras cooldown)
// ──────────────────────────────────────────────────────────────

describe('CircuitBreaker — OPEN → HALF_OPEN tras cooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pasa a HALF_OPEN cuando ha pasado el cooldownMs', async () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 1, cooldownMs: 30_000 })

    // Abrir circuito
    vi.setSystemTime(new Date(0))
    await expect(cb.ejecutar(fail)).rejects.toThrow()
    expect(cb.estadoActual).toBe('OPEN')

    // Avanzar tiempo más del cooldown
    vi.setSystemTime(new Date(30_001))

    // Ejecutar una función exitosa — pasa por HALF_OPEN
    const resultado = await cb.ejecutar(succeed)
    expect(resultado).toBe('ok')
    expect(cb.estadoActual).toBe('CLOSED')
  })

  it('sigue OPEN antes de que expire el cooldown', async () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 1, cooldownMs: 30_000 })

    vi.setSystemTime(new Date(0))
    await expect(cb.ejecutar(fail)).rejects.toThrow()

    // Solo avanzar 29 segundos (no llega al cooldown)
    vi.setSystemTime(new Date(29_999))

    await expect(cb.ejecutar(succeed)).rejects.toThrow(CircuitBreakerOpenError)
    expect(cb.estadoActual).toBe('OPEN')
  })

  it('el mensaje de error en OPEN incluye tiempo restante', async () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 1, cooldownMs: 30_000 })

    vi.setSystemTime(new Date(0))
    await expect(cb.ejecutar(fail)).rejects.toThrow()

    vi.setSystemTime(new Date(5_000)) // 5 segundos después

    try {
      await cb.ejecutar(succeed)
    } catch (err) {
      expect((err as Error).message).toContain('s') // "Reintente en Xs"
    }
  })
})

// ──────────────────────────────────────────────────────────────
// HALF_OPEN → CLOSED (éxito) y HALF_OPEN → OPEN (fallo)
// ──────────────────────────────────────────────────────────────

describe('CircuitBreaker — HALF_OPEN transiciones', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function abrirCircuito(cb: CircuitBreaker): Promise<void> {
    vi.setSystemTime(new Date(0))
    await expect(cb.ejecutar(fail)).rejects.toThrow()
    // Avanzar al cooldown para entrar en HALF_OPEN
    vi.setSystemTime(new Date(30_001))
  }

  it('HALF_OPEN → CLOSED si el request de prueba tiene éxito', async () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 1, cooldownMs: 30_000 })
    await abrirCircuito(cb)

    // request de prueba exitoso
    await cb.ejecutar(succeed)
    expect(cb.estadoActual).toBe('CLOSED')
  })

  it('HALF_OPEN → OPEN si el request de prueba falla', async () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 1, cooldownMs: 30_000 })
    await abrirCircuito(cb)

    // request de prueba que falla
    await expect(cb.ejecutar(fail)).rejects.toThrow('SIFEN error') // lanza el error original
    expect(cb.estadoActual).toBe('OPEN')
  })

  it('después de HALF_OPEN→OPEN, puede volver a HALF_OPEN tras un nuevo cooldown', async () => {
    const cb = new CircuitBreaker('test', { umbralFallos: 1, cooldownMs: 30_000 })

    // Primer ciclo OPEN
    vi.setSystemTime(new Date(0))
    await expect(cb.ejecutar(fail)).rejects.toThrow()

    // Primer HALF_OPEN → falla
    vi.setSystemTime(new Date(30_001))
    await expect(cb.ejecutar(fail)).rejects.toThrow('SIFEN error')
    expect(cb.estadoActual).toBe('OPEN')

    // Segundo cooldown
    vi.setSystemTime(new Date(61_000))
    const resultado = await cb.ejecutar(succeed)
    expect(resultado).toBe('ok')
    expect(cb.estadoActual).toBe('CLOSED')
  })

  it('HALF_OPEN resetea el contador de fallos para el request de prueba', async () => {
    // umbralFallos=5 pero en HALF_OPEN un solo fallo cierra el circuito
    const cb = new CircuitBreaker('test', { umbralFallos: 5, cooldownMs: 30_000 })

    // Llenar hasta umbral=5 para abrir
    vi.setSystemTime(new Date(0))
    for (let i = 0; i < 5; i++) {
      await expect(cb.ejecutar(fail)).rejects.toThrow()
    }
    expect(cb.estadoActual).toBe('OPEN')

    // Cooldown y un solo fallo en HALF_OPEN → debe volver a OPEN inmediatamente
    vi.setSystemTime(new Date(30_001))
    await expect(cb.ejecutar(fail)).rejects.toThrow('SIFEN error')
    expect(cb.estadoActual).toBe('OPEN')
  })
})

// ──────────────────────────────────────────────────────────────
// Ventana de tiempo (reset de contador en CLOSED)
// ──────────────────────────────────────────────────────────────

describe('CircuitBreaker — ventana de tiempo para contar fallos', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('el contador se resetea si los fallos están fuera de la ventana de tiempo', async () => {
    const cb = new CircuitBreaker('test', {
      umbralFallos: 3,
      ventanaMs: 10_000,
      cooldownMs: 30_000,
    })

    vi.setSystemTime(new Date(0))
    // 2 fallos dentro de la ventana
    await expect(cb.ejecutar(fail)).rejects.toThrow()
    await expect(cb.ejecutar(fail)).rejects.toThrow()

    // Avanzar más de ventanaMs — el contador debe resetearse
    vi.setSystemTime(new Date(11_000))

    // 2 fallos más — NO debe abrir (contador empezó de 0)
    await expect(cb.ejecutar(fail)).rejects.toThrow()
    await expect(cb.ejecutar(fail)).rejects.toThrow()
    expect(cb.estadoActual).toBe('CLOSED')

    // Un tercer fallo — ahora sí llega al umbral
    await expect(cb.ejecutar(fail)).rejects.toThrow()
    expect(cb.estadoActual).toBe('OPEN')
  })
})

// ──────────────────────────────────────────────────────────────
// Configuración por defecto
// ──────────────────────────────────────────────────────────────

describe('CircuitBreaker — valores por defecto', () => {
  it('umbral por defecto es 5', async () => {
    const cb = new CircuitBreaker('test') // sin config
    for (let i = 0; i < 4; i++) {
      await expect(cb.ejecutar(fail)).rejects.toThrow()
    }
    expect(cb.estadoActual).toBe('CLOSED')

    await expect(cb.ejecutar(fail)).rejects.toThrow()
    expect(cb.estadoActual).toBe('OPEN')
  })
})
