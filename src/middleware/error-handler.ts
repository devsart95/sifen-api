import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'

export interface ApiError {
  statusCode: number
  error: string
  message: string
  details?: unknown
}

export function errorHandler(
  error: FastifyError | Error,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  // Errores de validación Zod
  if (error instanceof ZodError) {
    const response: ApiError = {
      statusCode: 422,
      error: 'Validation Error',
      message: 'Los datos enviados son inválidos',
      details: error.flatten().fieldErrors,
    }
    reply.status(422).send(response)
    return
  }

  // Errores Fastify con statusCode
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    const response: ApiError = {
      statusCode: error.statusCode,
      error: error.name,
      message: error.message,
    }
    reply.status(error.statusCode).send(response)
    return
  }

  // Error genérico — nunca exponer stack en producción
  const statusCode = 500
  const response: ApiError = {
    statusCode,
    error: 'Internal Server Error',
    message:
      process.env['NODE_ENV'] === 'production'
        ? 'Error interno del servidor'
        : error.message,
  }

  reply.status(statusCode).send(response)
}
