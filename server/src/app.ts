import Fastify, { FastifyInstance } from 'fastify';

export function buildApp(): FastifyInstance {
  const isDev = process.env.NODE_ENV !== 'production';
  const app = Fastify({
    logger: isDev
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : true,
  });

  return app;
}
