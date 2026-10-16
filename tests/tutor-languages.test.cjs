const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { TutorRepository } = require('../src/data/tutor-repository.ts');
const { serializeDriver } = require('../src/data/serialized-driver.ts');
const { LANGUAGES, DEFAULT_PREFERENCES: DEFAULT, validatePreferences, canRecognizeSpeech, isFullTutorLanguage } = require('../src/features/tutor/types.ts');
const { LANGUAGE_CATALOG } = require('../src/domain/learning-profile.ts');

const fixture = readFileSync(join(__dirname, 'fixtures/tutor-v2.sql'), 'utf8');
function store(inject) {
  const db = new DatabaseSync(':memory:');
  const connection = { exec: async (sql) => { db.exec(sql); }, run: async (sql, values = []) => { db.prepare(sql).run(...values); },
    all: async (sql, values = []) => db.prepare(sql).all(...values) };
  const driver = serializeDriver({ ...connection, transaction: async (action) => {
    db.exec('BEGIN IMMEDIATE');
    try { await action(inject ? { ...connection, exec: async (sql) => { await connection.exec(sql); inject(sql); } } : connection); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } });
  return { db, repo: new TutorRepository(driver) };
}
const snapshot = (db) => ({
  preferences: db.prepare('SELECT * FROM tutor_preferences').all(),
  sessions: db.prepare('SELECT * FROM tutor_sessions ORDER BY id').all(),
  turns: db.prepare('SELECT * FROM tutor_turns ORDER BY id').all(),
});

test('languages: the tutor language list is the whole 24-language catalog with native names', () => {
  assert.equal(LANGUAGES.length, 24);
  assert.deepEqual(LANGUAGES.map((l) => l.code), LANGUAGE_CATALOG.map((l) => l.tag));
  for (const language of LANGUAGES) assert.deepEqual(validatePreferences({ ...DEFAULT, native: language.code, target: language.code }).target, language.code);
  assert.throws(() => validatePreferences({ ...DEFAULT, target: 'fr' }));
  assert.equal(isFullTutorLanguage('bn'), false); assert.equal(isFullTutorLanguage('hi'), true);
  assert.equal(canRecognizeSpeech('bn', 'en'), true); assert.equal(canRecognizeSpeech('doi', 'brx'), false);
  assert.equal(canRecognizeSpeech('doi', 'en'), true);
});

test('migration 3: a released v2 database keeps every row exactly and gains all 24 languages', async (t) => {
  const { db, repo } = store(); t.after(() => db.close());
  db.exec(fixture);
  const before = snapshot(db);
  await repo.initialize(); await repo.initialize();
  assert.deepEqual(snapshot(db), before);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'tutor_%' ORDER BY name").all().map((r) => r.name);
  assert.ok(names.includes('tutor_session_history') && names.includes('tutor_turn_history'));
  assert.equal((await repo.preferences()).native, 'hi');
  const bengali = { ...DEFAULT, native: 'bn', target: 'en', persona: 'male' };
  await repo.savePreferences(bengali);
  assert.deepEqual(await repo.preferences(), bengali);
  assert.throws(() => db.prepare("INSERT INTO tutor_sessions(id,native,target,persona,correctionMode,createdAt,mode) VALUES('x','xx','en','male','end',1,'live')").run(), /CHECK/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM tutor_turns WHERE sessionId='s-live'").get().n, 2);
});

test('migration 3: foreign keys still cascade and still protect turns after the rebuild', async (t) => {
  const { db, repo } = store(); t.after(() => db.close());
  db.exec(fixture); await repo.initialize();
  assert.throws(() => db.prepare("INSERT INTO tutor_turns(id,sessionId,input,response,corrections,analyzed,provider,createdAt) VALUES('bad','missing','a','b','[]',0,'mock-v1',1)").run(), /FOREIGN KEY/);
  db.exec("DELETE FROM tutor_sessions WHERE id='s-live'");
  assert.deepEqual(db.prepare('SELECT id FROM tutor_turns ORDER BY id').all().map((r) => r.id), ['t3', 't4']);
});

test('migration 3: a failure after the rebuild rolls everything back and restores the old rules', async (t) => {
  const { db, repo } = store((sql) => { if (sql.includes('tutor_sessions_v3')) throw new Error('Upgrade interrupted'); });
  t.after(() => db.close());
  db.exec(fixture);
  const before = snapshot(db);
  const oldRule = db.prepare("SELECT sql FROM sqlite_master WHERE name='tutor_sessions'").get().sql;
  await assert.rejects(repo.initialize(), /Upgrade interrupted/);
  assert.deepEqual(snapshot(db), before);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(db.prepare("SELECT sql FROM sqlite_master WHERE name='tutor_sessions'").get().sql, oldRule);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE '%_v3'").get().n, 0);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
});

test('migration 3: orphaned turns stop the upgrade without changing any data', async (t) => {
  const { db, repo } = store(); t.after(() => db.close());
  db.exec(fixture);
  db.exec("PRAGMA foreign_keys=OFF; INSERT INTO tutor_turns(id,sessionId,input,response,corrections,analyzed,provider,createdAt) VALUES('orphan','missing','a','b','[]',0,'mock-v1',1); PRAGMA foreign_keys=ON;");
  const before = snapshot(db);
  await assert.rejects(repo.initialize(), /orphaned/);
  assert.deepEqual(snapshot(db), before);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
});
