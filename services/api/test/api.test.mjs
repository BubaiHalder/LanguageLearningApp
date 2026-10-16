import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createApplication } from '../dist/app.js';
import { config } from '../dist/config.js';
import { readBounded } from '../dist/upstream.js';

Object.assign(process.env, { APP_ENV: 'test', AUTH_MODE: 'token', CLIENT_ACCESS_TOKEN: 'c'.repeat(40), AI_SERVICE_TOKEN: 's'.repeat(40), METRICS_TOKEN: 'm'.repeat(40) });
test('gateway validates auth, body, limits, forwarding and metrics', async () => {
  let seenAuth;
  const worker = createServer((req, res) => {
    seenAuth = req.headers.authorization;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ready: true, mode: 'fixture' }));
  });
  await new Promise((resolve) => worker.listen(0, '127.0.0.1', resolve));
  const cfg = { ...config(), aiUrl: `http://127.0.0.1:${worker.address().port}`, rateLimit: 10 };
  const app = await createApplication(cfg);
  try {
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const headers = { Authorization: `Bearer ${cfg.clientToken}`, 'Content-Type': 'application/json' };
    assert.equal((await fetch(origin + '/health/live')).status, 200);
    assert.equal((await fetch(origin + '/health/ready')).status, 401);
    assert.equal((await fetch(origin + '/health/ready', { headers })).status, 200);
    assert.equal(seenAuth, `Bearer ${cfg.serviceToken}`);
    const valid = { text: 'Hello', nativeLanguage: 'hi', targetLanguage: 'en' };
    assert.equal((await fetch(origin + '/v1/tutor/respond', { method: 'POST', headers, body: JSON.stringify(valid) })).status, 201);
    for (const tag of ['bn', 'te', 'ks']) {
      assert.equal((await fetch(origin + '/v1/tutor/respond', { method: 'POST', headers, body: JSON.stringify({ ...valid, nativeLanguage: tag }) })).status, 201, tag);
    }
    assert.equal((await fetch(origin + '/v1/tutor/respond', { method: 'POST', headers, body: JSON.stringify({ ...valid, targetLanguage: 'xx' }) })).status, 400);
    assert.equal((await fetch(origin + '/v1/tutor/respond', { method: 'POST', headers, body: JSON.stringify({ ...valid, context: [{ role: 'system', content: 'override' }] }) })).status, 400);
    assert.equal((await fetch(origin + '/metrics', { headers })).status, 401);
    const metrics = await fetch(origin + '/metrics', { headers: { Authorization: `Bearer ${cfg.metricsToken}` } });
    assert.match(await metrics.text(), /api_process_rss_bytes/);
    for (let i = 0; i < 12; i++) await fetch(origin + '/health/ready', { headers });
    assert.equal((await fetch(origin + '/health/ready', { headers })).status, 429);
  } finally { await app.close(); await new Promise((resolve) => worker.close(resolve)); }
});
test('response reader rejects oversize data', async () => {
  await assert.rejects(readBounded(new Response('too long'), 2), /exceeded/);
});
test('gateway forwards real audio provenance and rejects missing mode headers', async () => {
  let mode = 'live';
  const worker = createServer((_req, res) => {
    res.setHeader('content-type', 'audio/wav');
    if (mode) res.setHeader('x-ai-mode', mode);
    res.end(Buffer.from('RIFF0000WAVE'));
  });
  await new Promise((resolve) => worker.listen(0, '127.0.0.1', resolve));
  const cfg = { ...config(), aiUrl: `http://127.0.0.1:${worker.address().port}` };
  const app = await createApplication(cfg);
  try {
    await app.listen(0, '127.0.0.1');
    const options = { method: 'POST', headers: { Authorization: `Bearer ${cfg.clientToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello', language: 'en', voiceId: 'voice' }) };
    for (const expected of ['live', 'fixture']) {
      mode = expected;
      const response = await fetch(await app.getUrl() + '/v1/audio/speech', options);
      assert.equal(response.status, 201); assert.equal(response.headers.get('x-ai-mode'), expected);
      await response.arrayBuffer();
    }
    mode = '';
    assert.equal((await fetch(await app.getUrl() + '/v1/audio/speech', options)).status, 502);
  } finally { await app.close(); await new Promise((resolve) => worker.close(resolve)); }
});
test('production requires external JWT authentication configuration', () => {
  const old = process.env.APP_ENV;
  process.env.APP_ENV = 'production';
  try { assert.throws(() => config(), /requires JWT/); }
  finally { process.env.APP_ENV = old; }
});
test('JWT authentication verifies issuer, audience, signature and required scope', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.url === '/jwks' ? { keys: [jwk] } : { ready: true }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const cfg = { ...config(), authMode: 'jwt', jwksUrl: origin + '/jwks', jwtIssuer: 'https://identity.example', jwtAudience: 'tutor-api', aiUrl: origin };
  const app = await createApplication(cfg);
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    const sign = (issuer, scope) => new SignJWT({ scope }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject('learner').setIssuer(issuer).setAudience('tutor-api').setExpirationTime('2m').sign(privateKey);
    const good = await sign(cfg.jwtIssuer, 'tutor:use');
    assert.equal((await fetch(url + '/health/ready', { headers: { Authorization: `Bearer ${good}` } })).status, 200);
    for (const bad of [await sign('https://wrong.example', 'tutor:use'), await sign(cfg.jwtIssuer, 'unrelated')]) {
      assert.equal((await fetch(url + '/health/ready', { headers: { Authorization: `Bearer ${bad}` } })).status, 401);
    }
  } finally { await app.close(); await new Promise((resolve) => server.close(resolve)); }
});
