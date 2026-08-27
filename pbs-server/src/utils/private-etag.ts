import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { success } from "./response.js";

export const buildPrivateEtag = (payload: unknown): string => {
  const hash = createHash("sha1")
    .update(JSON.stringify(payload))
    .digest("base64");

  return `"${hash}"`;
};

/**
 * Send a `{ code, data, message }` JSON body with a private, weak-revalidation
 * ETag for stable user-specific GETs. Returns 304 (empty body) when the
 * client's `If-None-Match` matches, saving overseas transfer on repeat loads.
 *
 * Cache-Control is `private, no-cache`: caches may store the response but must
 * revalidate every time, so authenticated data is never served stale or shared.
 */
export const sendPrivateJsonWithEtag = (
  request: FastifyRequest,
  reply: FastifyReply,
  data: unknown,
) => {
  const body = { code: 200, data, message: "ok" };
  const etag = buildPrivateEtag(body);

  reply.header("ETag", etag);
  reply.header("Cache-Control", "private, no-cache");

  if (request.headers["if-none-match"] === etag) {
    return reply.code(304).send();
  }

  return success(reply, data);
};
