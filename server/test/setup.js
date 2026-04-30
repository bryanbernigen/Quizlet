/**
 * Test setup for server-side tests.
 * This file runs BEFORE any server modules are imported, allowing us to mock
 * modules like 'pg' before they get loaded by db.js.
 *
 * Strategy: Make pg.Pool throw an error during initialization.
 * This prevents any actual connection attempt and makes initDbPostgres fail,
 * causing initDb() to fall back to SQLite (which tests control directly).
 */
import { vi } from 'vitest';

vi.mock('pg', () => ({
  default: {
    Pool: vi.fn(() => {
      throw new Error('Postgres not available in test environment — forcing SQLite');
    }),
  },
}));
