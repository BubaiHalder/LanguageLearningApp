const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { TutorRepository } = require('../src/data/tutor-repository.ts');
const { TutorController } = require('../src/features/tutor/tutor-controller.ts');
const { LiveTutorClient, parseFeedback } = require('../src/features/tutor/live-client.ts');
const { SpeechController } = require('../src/features/tutor/audio/speech-controller.ts');
const { DEFAULT_PREFERENCES: p, visibleCorrections } = require('../src/features/tutor/types.ts');

function store() {
  const db = new DatabaseSync(':memory:');
  const connection = { exec: async (sql) => db.exec(sql), run: async (sql, values = []) => { db.prepare(sql).run(...values); },
    all: async (sql, values = []) => db.prepare(sql).all(...values) };
  const driver = { ...connection, transaction: async (action) => {
    db.exec('BEGIN'); try { await action(connection); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  } };
  return { db, driver, repo: new TutorRepository(driver) };
}
const feedback = { mode: 'live', provider: 'ollama', correctedSentence: 'Yesterday I went home.', explanation: 'Use past tense.',
  response: 'What did you do at home?', corrections: [{ category: 'grammar', original: 'go', corrected: 'went', explanation: 'Past tense.' }] };
const voice = { id: 'sapi-0', language: 'en', gender: 'female', label: 'Installed female' };
const wav = () => { const data = new Uint8Array(44); data.set(Buffer.from('RIFF')); data.set(Buffer.from('WAVE'), 8); return data; };
const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
function client(transport, timeout = 1000) { const c = new LiveTutorClient(transport, undefined, true, timeout); c.configure('http://192.168.1.49:3000', 'device-token'); return c; }

test('B5 migration preserves v1 Unicode records, preferences, IDs, and foreign keys', async (t) => {
  const { db, repo } = store(); t.after(() => db.close());
  db.exec(readFileSync(join(__dirname, 'fixtures/tutor-v1.sql'), 'utf8'));
  const original = db.prepare('SELECT * FROM tutor_turns').get();
  await repo.initialize(); await repo.initialize();
  const migrated = db.prepare('SELECT * FROM tutor_turns').get();
  for (const key of Object.keys(original)) assert.equal(migrated[key], original[key]);
  assert.equal(migrated.correctedSentence, null);
  assert.equal((await repo.preferences()).correctionMode, 'end');
  assert.equal((await repo.resume(await repo.preferences(), 'mock')).id, 'legacy');
  assert.equal(await repo.resume(await repo.preferences(), 'live'), null);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
});
test('B5 failed v1 upgrade restores original schema and records', async (t) => {
  const { db, driver } = store(); t.after(() => db.close());
  db.exec(readFileSync(join(__dirname, 'fixtures/tutor-v1.sql'), 'utf8'));
  const broken = new TutorRepository({ ...driver, transaction: (action) => driver.transaction((tx) => action({ ...tx,
    exec: async (sql) => { await tx.exec(sql); if (sql.includes('tutor_turns_v2')) throw new Error('Upgrade interrupted'); } })) });
  await assert.rejects(broken.initialize(), /Upgrade interrupted/);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(db.prepare('SELECT input FROM tutor_turns').get().input, 'नमस्ते Hello');
  assert.equal(db.prepare('PRAGMA table_info(tutor_sessions)').all().some((c) => c.name === 'mode'), false);
});
test('B5 client authenticates every stage, bounds context and rejects fixture results', async () => {
  const requests = [];
  const c = client(async (url, options) => { requests.push({ url, options });
    if (url.endsWith('/transcriptions')) return json({ provider: 'faster-whisper', transcript: 'Hello' });
    return json(feedback);
  });
  const form = new FormData(); form.append('audio', new Blob(['sample']), 'recording.wav');
  assert.equal(await c.transcribe(form), 'Hello');
  const turn = { input: 'Earlier', response: 'Previous answer' };
  assert.equal((await c.reply('Yesterday I go home.', p, false, Array(20).fill(turn))).provider, 'local-v1');
  assert.equal(JSON.parse(requests[1].options.body).context.length, 12);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer device-token');
  assert.equal(requests[0].options.body, form);
  assert.throws(() => parseFeedback({ ...feedback, mode: 'fixture' }), /not in live/);
  assert.throws(() => parseFeedback({ ...feedback, corrections: [{ category: 'fake' }] }), /category/);
});
test('B5 client rejects tone provenance, oversize responses, auth failures and never retries POST', async () => {
  let calls = 0;
  const c = client(async () => { calls++; return new Response('', { status: 401 }); });
  await assert.rejects(c.reply('Hello', p), /expired or invalid/); assert.equal(calls, 1);
  const audio = client(async () => new Response(wav(), { headers: { 'content-type': 'audio/wav', 'x-ai-mode': 'fixture' } }));
  await assert.rejects(audio.speech('Hello', 'en', voice.id), /real live WAV/);
  const large = client(async () => new Response('x'.repeat(65537)));
  await assert.rejects(large.reply('Hello', p), /size limit/);
});
test('B5 cancellation and timeout abort the actual transport', async () => {
  const transport = async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const c = client(transport, 10);
  await assert.rejects(c.reply('Hello', p), /cancelled or timed out/);
  const second = client(transport);
  const pending = second.reply('Hello', p); second.cancel();
  await assert.rejects(pending, /cancelled or timed out/);
});
test('B5 live controller saves feedback, hides end corrections, isolates mock history and retries only persistence', async (t) => {
  const { db, repo } = store(); t.after(() => db.close()); await repo.initialize();
  let calls = 0;
  const c = client(async () => { calls++; return json(feedback); });
  const controller = new TutorController(async () => repo, c, 'live');
  await controller.initialize(); await controller.changePreferences({ ...p, correctionMode: 'end' });
  const original = repo.saveTurn.bind(repo); let fail = true;
  repo.saveTurn = async (...args) => { if (fail) { fail = false; throw new Error('Disk temporarily busy'); } return original(...args); };
  await controller.send('Yesterday I go home.'); assert.match(controller.getSnapshot().error, /Disk/);
  await controller.retry(); assert.equal(calls, 1);
  let s = controller.getSnapshot();
  assert.equal(s.turns[0].correctedSentence, feedback.correctedSentence);
  assert.equal(s.turns[0].explanation, feedback.explanation);
  assert.deepEqual(visibleCorrections(s.turns[0], s.session), []);
  assert.equal((await repo.sessions(0, 'mock')).length, 0);
  await controller.finish(); s = controller.getSnapshot();
  assert.equal(visibleCorrections(s.turns[0], s.session).length, 1);
  await controller.retry(); assert.equal((await repo.turns(s.session.id)).length, 1);
});
test('B5 speech failures do not resend conversation; available gender is respected and WAV files cleaned', async () => {
  const events = [];
  const speech = new SpeechController({ voices: async () => [voice], speech: async () => wav() }, {
    write: async () => 'cache://reply.wav', play: async (uri) => events.push(uri), pause: () => {}, remove: async (uri) => events.push('remove:' + uri),
  });
  await speech.speak('Hello', { ...p, target: 'hi' });
  assert.match(speech.getSnapshot().error, /No installed/); assert.deepEqual(events, []);
  await speech.speak('Hello', p); assert.equal(speech.getSnapshot().playing, true);
  speech.playbackError(); assert.match(speech.getSnapshot().error, /playback failed/);
  assert.deepEqual(events, ['cache://reply.wav', 'remove:cache://reply.wav']);
});
test('B5 cancellation during synthesis discards late speech without playback', async () => {
  let resolve; let started;
  const ready = new Promise((r) => { started = r; });
  let wrote = false;
  const speech = new SpeechController({ voices: async () => [voice], speech: async () => { started(); return new Promise((r) => { resolve = r; }); } },
    { write: async () => { wrote = true; return 'cache://late.wav'; }, play: async () => assert.fail('late playback'), pause: () => {}, remove: async () => {} });
  const pending = speech.speak('Hello', p); await ready; speech.stop(); resolve(wav()); await pending;
  assert.equal(wrote, false); assert.equal(speech.getSnapshot().playing, false);
});
