import { FastifyReply } from 'fastify'

interface ApiResponse<T> {
  code: number
  data: T | null
  message: string
}

export const success = <T>(reply: FastifyReply, data: T, message = 'ok') => {
  return reply.code(200).send({ code: 200, data, message } satisfies ApiResponse<T>)
}

export const fail = (reply: FastifyReply, code: number, message: string) => {
  return reply.code(200).send({ code, data: null, message } satisfies ApiResponse<null>)
}

export const error = (reply: FastifyReply, statusCode: number, message: string) => {
  return reply.code(statusCode).send({ code: statusCode, data: null, message } satisfies ApiResponse<null>)
}
