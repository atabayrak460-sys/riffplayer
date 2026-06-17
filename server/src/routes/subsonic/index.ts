import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sendOk } from './response.js';

interface SubsonicQuery {
  f?: string;
}

export async function subsonicPlugin(app: FastifyInstance): Promise<void> {
  const pingHandler = (
    request: FastifyRequest<{ Querystring: SubsonicQuery }>,
    reply: FastifyReply,
  ): void => {
    sendOk(reply, request.query.f);
  };

  app.route({
    method: ['GET', 'POST'],
    url: '/ping.view',
    handler: pingHandler,
  });
}
