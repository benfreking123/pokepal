import type { FastifyReply, FastifyRequest } from "fastify";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
export const isLocalRequest = (ip: string) => LOOPBACK.has(ip);

export async function pcOnly(req: FastifyRequest, reply: FastifyReply) {
  if (!isLocalRequest(req.ip)) return reply.code(403).send({ error: "This action only works on the PC running PokePal." });
}
