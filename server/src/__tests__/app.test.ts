import { describe, it, expect } from 'vitest';
import { buildApp } from '../app.js';

describe('buildApp', () => {
  it('creates a Fastify instance', async () => {
    const app = buildApp();
    expect(app).toBeDefined();
    await app.close();
  });
});
