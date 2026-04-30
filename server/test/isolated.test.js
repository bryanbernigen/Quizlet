import { test, expect, beforeAll } from 'vitest';

import path from 'path';
import os from 'os';
import fs from 'fs';
import request from 'supertest';
import app from '../index.js';
import { query, initDb, hashPassword } from '../db.js';

const DB = path.join(os.tmpdir(), `iso-test-${process.pid}.db`);
let token;

beforeAll(async () => {
  await initDb();
  await query('DELETE FROM sessions', []);
  await query('DELETE FROM users', []);
  const [h1, h2] = await Promise.all([hashPassword('pw12345678'), hashPassword('pw12345678')]);
  const r = await query('INSERT INTO users (username,password_hash,is_admin) VALUES ($1,$2,0) RETURNING id', ['u', h1]);
  const a = await query('INSERT INTO users (username,password_hash,is_admin) VALUES ($1,$2,1) RETURNING id', ['admin', h2]);
  const t1 = Buffer.alloc(32).fill(1).toString('hex');
  const t2 = Buffer.alloc(32).fill(2).toString('hex');
  await Promise.all([
    query('INSERT INTO sessions (token,user_id) VALUES ($1,$2)', [t1, r.rows[0].id]),
    query('INSERT INTO sessions (token,user_id) VALUES ($1,$2)', [t2, a.rows[0].id]),
  ]);
  token = t1;
});

afterAll(() => { try { fs.unlinkSync(DB); } catch {} });

test('auth works', async () => {
  const r = await request(app).post('/api/auth/login').send({ username: 'u', password: 'pw12345678' });
  expect(r.status).toBe(200);
});

test('me works', async () => {
  const r = await request(app).set('Authorization', `Bearer ${token}`).get('/api/auth/me');
  expect(r.status).toBe(200);
});
