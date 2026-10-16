const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { TutorRepository } = require('../src/data/tutor-repository.ts');
const { serializeDriver } = require('../src/data/serialized-driver.ts');
const { TutorController } = require('../src/features/tutor/tutor-controller.ts');
const { MockTutorProvider, SAMPLE_INPUTS } = require('../src/features/tutor/mock-provider.ts');
const { DEFAULT_PREFERENCES: DEFAULT, validateInput, validatePreferences, visibleCorrections } = require('../src/features/tutor/types.ts');

function store(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  const connection = {
    exec: async (sql) => { db.exec(sql); },
    run: async (sql, values = []) => { db.prepare(sql).run(...values); },
    all: async (sql, values = []) => db.prepare(sql).all(...values),
  };
  const driver = serializeDriver({ ...connection, transaction: async (action) => {
    db.exec('BEGIN IMMEDIATE');
    try { await action(connection); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } });
  return { repository: new TutorRepository(driver), db, driver };
}
const session = (id = 's1', p = DEFAULT) => ({ ...p, id, createdAt: 100, endedAt: null, turnCount: 0 });
const reply = { response: 'Hello!', corrections: [{ category: 'grammar', corrected: 'I went.', explanation: 'Use the past.' }], analyzed: true, provider: 'mock-v1' };

test('unit: input and language preferences are validated', () => {
  assert.equal(validateInput('  hello  '), 'hello');
  assert.throws(() => validateInput('   '));
  assert.throws(() => validateInput('a'.repeat(2001)));
  assert.throws(() => validatePreferences({ ...DEFAULT, target: 'unknown' }));
  assert.throws(() => validatePreferences({ ...DEFAULT, persona: 'unknown' }));
  assert.deepEqual(validatePreferences(DEFAULT), DEFAULT);
});
test('unit: curated samples return corrections in each native language', async () => {
  const provider = new MockTutorProvider(0);
  for (const target of ['en', 'hi', 'es']) {
    for (const native of ['en', 'hi', 'es']) {
      const result = await provider.reply(SAMPLE_INPUTS[target], { ...DEFAULT, native, target });
      assert.equal(result.analyzed, true);
      assert.ok(result.corrections[0].corrected);
      assert.ok(result.corrections[0].explanation);
    }
  }
  const hindi = await provider.reply(SAMPLE_INPUTS.en, DEFAULT);
  assert.match(hindi.corrections[0].explanation, /कल/);
  assert.deepEqual(hindi.corrections.map((c) => c.category), ['grammar', 'vocabulary', 'sentence']);
});
test('unit: arbitrary and mixed-language text is honestly not analyzed', async () => {
  const result = await new MockTutorProvider(0).reply('आज I visited a cafe', DEFAULT);
  assert.equal(result.analyzed, false);
  assert.deepEqual(result.corrections, []);
});
test('unit: mock service failure is retryable without a paid service', async () => {
  await assert.rejects(new MockTutorProvider(0).reply('Hello', DEFAULT, true), /Simulated service failure/);
});
test('unit: end-mode corrections are hidden until the session ends', () => {
  const active = session('end', { ...DEFAULT, correctionMode: 'end' });
  assert.deepEqual(visibleCorrections({ ...reply }, active), []);
  assert.equal(visibleCorrections({ ...reply }, { ...active, endedAt: 200 }).length, 1);
  assert.equal(visibleCorrections({ ...reply }, session()).length, 1);
});

test('integration: migrations and preferences survive repeat initialization', async (t) => {
  const { repository: repo, db } = store(); t.after(() => db.close());
  await repo.initialize(); await repo.initialize();
  assert.deepEqual(await repo.preferences(), DEFAULT);
  const p = { ...DEFAULT, target: 'es', persona: 'male' };
  await repo.savePreferences(p);
  assert.deepEqual(await repo.preferences(), p);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
});
test('integration: Unicode transcripts, corrections, and history survive closing/reopening SQLite', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tutor-db-'));
  let current;
  try {
    const filename = join(directory, 'test.db');
    current = store(filename); await current.repository.initialize();
    await current.repository.savePreferences(DEFAULT);
    await current.repository.saveTurn(session(), 'turn1', 'आज I went to market', reply, 101);
    current.db.close(); current = store(filename); await current.repository.initialize();
    assert.equal((await current.repository.sessions())[0].turnCount, 1);
    const [turn] = await current.repository.turns('s1');
    assert.equal(turn.input, 'आज I went to market');
    assert.deepEqual(turn.corrections, reply.corrections);
    assert.deepEqual(await current.repository.preferences(), DEFAULT);
  } finally { current?.db.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('integration: idempotent submissions do not duplicate turns', async (t) => {
  const { repository: repo, db } = store(); t.after(() => db.close()); await repo.initialize();
  await Promise.all([repo.saveTurn(session(), 't1', 'Hello', reply, 101), repo.saveTurn(session(), 't1', 'Hello', reply, 101)]);
  assert.equal((await repo.turns('s1')).length, 1);
});
test('integration: failed turn inserts roll back the session and the write queue recovers', async (t) => {
  const { repository: repo, db } = store(); t.after(() => db.close()); await repo.initialize();
  await assert.rejects(repo.saveTurn(session(), 'bad', 'Hello', { ...reply, provider: 'invalid-provider' }, 101));
  assert.equal((await repo.sessions()).length, 0);
  await repo.saveTurn(session(), 'good', 'Hello', reply, 102);
  assert.equal((await repo.sessions()).length, 1);
});
test('integration: failed schema migration rolls back without advancing version', async (t) => {
  const { driver, db } = store(); t.after(() => db.close());
  const broken = new TutorRepository({ ...driver, transaction: (action) => driver.transaction((tx) => action({
    ...tx, exec: async (sql) => { await tx.exec(sql); throw new Error('Injected migration failure'); },
  })) });
  await assert.rejects(broken.initialize(), /Injected/);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='tutor_sessions'").get().n, 0);
});
test('integration: a newer database is refused without deleting its data', async (t) => {
  const { repository: repo, db } = store(); t.after(() => db.close());
  db.exec('CREATE TABLE evidence(value TEXT); INSERT INTO evidence VALUES (\'keep\'); PRAGMA user_version=9;');
  await assert.rejects(repo.initialize(), /newer app version/);
  assert.equal(db.prepare('SELECT value FROM evidence').get().value, 'keep');
});
test('integration: language switching isolates sessions and deletion cascades', async (t) => {
  const { repository: repo, db } = store(); t.after(() => db.close()); await repo.initialize();
  const spanish = { ...DEFAULT, target: 'es' };
  await repo.saveTurn(session('english'), 'en1', 'Hello', reply, 101);
  await repo.saveTurn(session('spanish', spanish), 'es1', 'Hola', reply, 102);
  assert.equal((await repo.resume(DEFAULT)).id, 'english');
  assert.equal((await repo.resume(spanish)).id, 'spanish');
  await repo.removeSession('english');
  assert.equal((await repo.turns('english')).length, 0);
  assert.equal((await repo.turns('spanish')).length, 1);
});
test('integration: completed conversations reject new turns but allow idempotent retry', async (t) => {
  const { repository: repo, db } = store(); t.after(() => db.close()); await repo.initialize();
  await repo.saveTurn(session(), 't1', 'Hello', reply, 101); await repo.finish('s1');
  await repo.saveTurn(session(), 't1', 'Hello', reply, 101);
  await assert.rejects(repo.saveTurn(session(), 't2', 'Hello again', reply, 102), /ended/);
});
test('integration: controller retries a failed turn once, finishes, and resumes persisted state', async (t) => {
  const { repository: repo, db } = store(); t.after(() => db.close()); await repo.initialize();
  const controller = new TutorController(async () => repo, new MockTutorProvider(0));
  await controller.initialize(); await controller.send(SAMPLE_INPUTS.en, true);
  assert.match(controller.getSnapshot().error, /Simulated/);
  assert.equal(controller.getSnapshot().turns.length, 0);
  await controller.retry(); assert.equal(controller.getSnapshot().turns.length, 1);
  const reopened = new TutorController(async () => repo, new MockTutorProvider(0));
  await reopened.initialize(); assert.equal(reopened.getSnapshot().turns.length, 1);
  await reopened.finish(); assert.ok(reopened.getSnapshot().session.endedAt);
});
test('integration: switching languages during a pending response cannot contaminate the new conversation', async (t) => {
  const { repository: repo, db } = store(); t.after(() => db.close()); await repo.initialize();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const provider = { reply: async () => { await gate; return reply; } };
  const controller = new TutorController(async () => repo, provider);
  await controller.initialize();
  const pending = controller.send(SAMPLE_INPUTS.en);
  await controller.changePreferences({ ...DEFAULT, target: 'es' });
  release(); await pending;
  assert.equal(controller.getSnapshot().preferences.target, 'es');
  assert.equal(controller.getSnapshot().turns.length, 0);
  const [old] = await repo.sessions();
  assert.equal(old.target, 'en'); assert.ok(old.endedAt);
  assert.equal((await repo.turns(old.id)).length, 1);
});
test('integration: bounded history and turn pagination', async (t) => {
  const { repository: repo, db } = store(); t.after(() => db.close()); await repo.initialize();
  for (let n = 0; n < 55; n++) await repo.saveTurn(session(), `t${n}`, `turn ${n}`, reply, 101 + n);
  const latest = await repo.turns('s1'); assert.equal(latest.length, 50);
  assert.equal(latest[0].input, 'turn 5');
  const earlier = await repo.turns('s1', latest[0].createdAt);
  assert.equal(earlier.length, 5); assert.equal(earlier[0].input, 'turn 0');
});

test('integration: end-mode controller reveals saved corrections only after completion', async (t) => {
  const { repository: repo, db } = store(); t.after(() => db.close()); await repo.initialize();
  const controller = new TutorController(async () => repo, new MockTutorProvider(0));
  await controller.initialize();
  await controller.changePreferences({ ...DEFAULT, correctionMode: 'end' });
  await controller.send(SAMPLE_INPUTS.en);
  let state = controller.getSnapshot();
  assert.equal(visibleCorrections(state.turns[0], state.session).length, 0);
  await controller.finish(); state = controller.getSnapshot();
  assert.equal(visibleCorrections(state.turns[0], state.session).length, 3);
  const count = state.turns.length;
  await controller.send('must not append');
  assert.equal(controller.getSnapshot().turns.length, count);
});
test('integration: retry after a preference save failure reports errors without rejecting', async (t) => {
  const { repository: repo, db } = store(); t.after(() => db.close()); await repo.initialize();
  repo.savePreferences = async () => { throw new Error('Simulated disk full'); };
  const controller = new TutorController(async () => repo, new MockTutorProvider(0));
  await controller.initialize();
  await controller.changePreferences({ ...DEFAULT, target: 'es' });
  assert.match(controller.getSnapshot().error, /disk full/);
  await assert.doesNotReject(controller.retry());
  assert.match(controller.getSnapshot().error, /disk full/);
});
test('integration: turn IDs cannot hide a different submission', async (t) => {
  const { repository: repo, db } = store(); t.after(() => db.close()); await repo.initialize();
  await repo.saveTurn(session(), 't1', 'Hello', reply, 101);
  await assert.rejects(repo.saveTurn(session(), 't1', 'Different text', reply, 102), /another submission/);
  assert.equal((await repo.turns('s1'))[0].input, 'Hello');
});
test('integration: selecting the current language does not reset a conversation', async (t) => {
  const { repository: repo, db } = store(); t.after(() => db.close()); await repo.initialize();
  const controller = new TutorController(async () => repo, new MockTutorProvider(0));
  await controller.initialize(); await controller.send(SAMPLE_INPUTS.en);
  const id = controller.getSnapshot().session.id;
  await controller.changePreferences({ ...DEFAULT });
  assert.equal(controller.getSnapshot().session.id, id);
  assert.equal(controller.getSnapshot().turns.length, 1);
});
test('integration: storage read failure after commit retries without duplicating the saved turn', async (t) => {
  const { repository: repo, db } = store(); t.after(() => db.close()); await repo.initialize();
  const controller = new TutorController(async () => repo, new MockTutorProvider(0));
  await controller.initialize();
  const readTurns = repo.turns.bind(repo);
  let shouldFail = true;
  repo.turns = async (...args) => {
    if (shouldFail) { shouldFail = false; throw new Error('Simulated read failure'); }
    return readTurns(...args);
  };
  await controller.send(SAMPLE_INPUTS.en);
  assert.match(controller.getSnapshot().error, /read failure/);
  await controller.retry();
  assert.equal(controller.getSnapshot().turns.length, 1);
  assert.equal((await repo.sessions())[0].turnCount, 1);
});
test('integration: connection scheduler prevents reads from entering a pending transaction', async (t) => {
  const { driver, db } = store(); t.after(() => db.close());
  await driver.exec('CREATE TABLE sample(value TEXT);');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let hasRead = false;
  const write = driver.transaction(async (tx) => {
    await tx.run('INSERT INTO sample VALUES (?)', ['committed']);
    await gate;
  });
  const read = driver.all('SELECT value FROM sample').then((rows) => { hasRead = true; return rows; });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(hasRead, false);
  release(); await write;
  assert.equal((await read)[0].value, 'committed');
});
