import type { FastifyInstance } from "fastify";
import { success } from "../utils/response.js";

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get("/api/health", async (_request, reply) => {
    return success(reply, {
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });
}
