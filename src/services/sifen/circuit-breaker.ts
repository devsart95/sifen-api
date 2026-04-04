/**
 * Circuit Breaker liviano para llamadas SIFEN.
 * Sin dependencias externas — implementado sobre un FSM simple.
 *
 * Estados:
 *   CLOSED     → estado normal, todos los requests pasan
 *   OPEN       → SIFEN detectado como caído, rechaza inmediatamente
 *   HALF_OPEN  → prueba un request tras el cooldown; si pasa, vuelve a CLOSED
 *
 * Transiciones:
 *   CLOSED  → OPEN      cuando `fallosConsecutivos >= umbralFallos` o timeout
 *   OPEN    → HALF_OPEN cuando ha pasado `cooldownMs` desde la apertura
 *   HALF_OPEN → CLOSED  cuando el request de prueba tiene éxito
 *   HALF_OPEN → OPEN    cuando el request de prueba falla
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerConfig {
  umbralFallos?: number      // fallos consecutivos antes de abrir (default: 5)
  ventanaMs?: number         // ventana de tiempo para contar fallos (default: 60_000)
  cooldownMs?: number        // tiempo en OPEN antes de probar (default: 30_000)
}

export class CircuitBreaker {
  private estado: CircuitState = 'CLOSED'
  private fallosConsecutivos = 0
  private ultimoFalloEn = 0
  private abrioEn = 0

  private readonly umbralFallos: number
  private readonly ventanaMs: number
  private readonly cooldownMs: number
  private readonly nombre: string

  constructor(nombre: string, config: CircuitBreakerConfig = {}) {
    this.nombre = nombre
    this.umbralFallos = config.umbralFallos ?? 5
    this.ventanaMs = config.ventanaMs ?? 60_000
    this.cooldownMs = config.cooldownMs ?? 30_000
  }

  get estadoActual(): CircuitState {
    return this.estado
  }

  /**
   * Ejecuta `fn`. Si el circuito está OPEN, lanza un error inmediatamente.
   * Si está HALF_OPEN, permite pasar un único request de prueba.
   */
  async ejecutar<T>(fn: () => Promise<T>): Promise<T> {
    if (this.debeRechazar()) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker ${this.nombre} ABIERTO — SIFEN no disponible. Reintente en ${Math.ceil((this.cooldownMs - (Date.now() - this.abrioEn)) / 1000)}s`,
      )
    }

    try {
      const resultado = await fn()
      this.onExito()
      return resultado
    } catch (err) {
      this.onFallo()
      throw err
    }
  }

  private debeRechazar(): boolean {
    const ahora = Date.now()

    if (this.estado === 'OPEN') {
      if (ahora - this.abrioEn >= this.cooldownMs) {
        // Cooldown expirado → intentar HALF_OPEN
        this.estado = 'HALF_OPEN'
        return false
      }
      return true
    }

    // Limpiar contador si la ventana expiró
    if (this.estado === 'CLOSED' && ahora - this.ultimoFalloEn > this.ventanaMs) {
      this.fallosConsecutivos = 0
    }

    return false
  }

  private onExito(): void {
    if (this.estado === 'HALF_OPEN') {
      console.info(`[circuit-breaker] ${this.nombre}: cerrado tras prueba exitosa`)
    }
    this.estado = 'CLOSED'
    this.fallosConsecutivos = 0
  }

  private onFallo(): void {
    this.fallosConsecutivos++
    this.ultimoFalloEn = Date.now()

    if (this.estado === 'HALF_OPEN' || this.fallosConsecutivos >= this.umbralFallos) {
      this.estado = 'OPEN'
      this.abrioEn = Date.now()
      console.warn(
        `[circuit-breaker] ${this.nombre}: ABIERTO tras ${this.fallosConsecutivos} fallos consecutivos`,
      )
    }
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CircuitBreakerOpenError'
  }
}
