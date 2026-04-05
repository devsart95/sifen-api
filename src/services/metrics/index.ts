import { Registry, Counter, Histogram, Gauge } from 'prom-client'

export const registry = new Registry()
registry.setDefaultLabels({ service: 'sifen-api' })

// ─── Contadores ───────────────────────────────────────────────────────────────

export const deEmitidos = new Counter({
  name: 'sifen_de_emitidos_total',
  help: 'Total de Documentos Electrónicos emitidos',
  labelNames: ['tenantId', 'tipo', 'estado'] as const,
  registers: [registry],
})

export const soapRequests = new Counter({
  name: 'sifen_soap_requests_total',
  help: 'Total de requests al SOAP de SIFEN',
  labelNames: ['operacion', 'resultado'] as const,
  registers: [registry],
})

export const circuitBreakerTrips = new Counter({
  name: 'sifen_circuit_breaker_trips_total',
  help: 'Veces que el circuit breaker se abrió',
  registers: [registry],
})

export const webhooksEnviados = new Counter({
  name: 'sifen_webhooks_enviados_total',
  help: 'Total de webhooks entregados',
  labelNames: ['estado'] as const,
  registers: [registry],
})

// ─── Histogramas ──────────────────────────────────────────────────────────────

export const httpDuration = new Histogram({
  name: 'sifen_http_request_duration_seconds',
  help: 'Duración de requests HTTP entrantes',
  labelNames: ['method', 'route', 'statusCode'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
})

export const soapDuration = new Histogram({
  name: 'sifen_soap_request_duration_seconds',
  help: 'Duración de requests SOAP a SIFEN',
  labelNames: ['operacion'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
})

// ─── Gauges ───────────────────────────────────────────────────────────────────

/** 0 = CLOSED, 1 = OPEN, 2 = HALF_OPEN */
export const circuitBreakerEstado = new Gauge({
  name: 'sifen_circuit_breaker_state',
  help: 'Estado del circuit breaker (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
  registers: [registry],
})

export const certDiasRestantes = new Gauge({
  name: 'sifen_cert_days_until_expiry',
  help: 'Días hasta que vence el certificado del tenant',
  labelNames: ['tenantId'] as const,
  registers: [registry],
})
