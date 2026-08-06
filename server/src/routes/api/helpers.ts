import path from 'path';
import type { FastifyReply } from 'fastify';

export function getCoversDir(): string {
  return process.env.COVERS_DIR ?? path.join(process.cwd(), 'covers');
}

export function jsonError(reply: FastifyReply, statusCode: number, message: string): void {
  reply.code(statusCode).send({ error: message });
}
