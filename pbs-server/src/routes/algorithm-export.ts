import type { FastifyInstance, FastifyReply } from "fastify";
import { pbsAlgorithmExportRoutes } from "../../../packages/contracts/pbs-algorithm-export.js";
import { fail } from "../utils/response.js";

const deprecatedAlgorithmExport = (reply: FastifyReply) =>
  fail(reply, 410, "PBS algorithm export has moved to live-server.");

export default async function algorithmExportRoutes(fastify: FastifyInstance) {
  fastify.get(
    pbsAlgorithmExportRoutes.currentPackage,
    async (_request, reply) => deprecatedAlgorithmExport(reply),
  );

  fastify.get(
    pbsAlgorithmExportRoutes.yeg14TestPackage,
    async (_request, reply) => deprecatedAlgorithmExport(reply),
  );

  fastify.post(
    pbsAlgorithmExportRoutes.scenarioPackage,
    async (_request, reply) => deprecatedAlgorithmExport(reply),
  );
}
