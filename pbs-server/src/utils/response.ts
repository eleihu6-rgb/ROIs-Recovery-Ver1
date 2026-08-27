import type { FastifyReply } from "fastify";

export const success = <TData>(
  reply: FastifyReply,
  data: TData,
  statusCode = 200,
) => {
  return reply.status(statusCode).send({
    code: statusCode,
    data,
    message: "ok",
  });
};

export const fail = (
  reply: FastifyReply,
  statusCode: number,
  message: string,
) => {
  return reply.status(statusCode).send({
    code: statusCode,
    data: null,
    message,
  });
};
