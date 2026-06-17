import 'fastify';
import type { SubsonicUser } from '../auth/preHandler.js';

declare module 'fastify' {
  interface FastifyRequest {
    subsonicUser?: SubsonicUser;
  }
}
