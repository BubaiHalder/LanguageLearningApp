const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { LearningRepository } = require('../src/data/learning-repository.ts');
const { TutorRepository } = require('../src/data/tutor-repository.ts');
const { serializeDriver } = require('../src/data/serialized-driver.ts');
const { LANGUAGE_CATALOG, validateRegistration } = require('../src/domain/learning-profile.ts');
const input = { name: '  आशा  ', phone: '+919876543210', native: 'hi', target: 'en' };
const ids = { learnerId: 'learner-1', profileId: 'profile-en' };
function store(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  const faults = { migration: false, save: false };
  const connection = {
    exec: async (sql) => {
      if (faults.migration && sql.includes('CREATE TABLE local_learner')) {
        db.exec('CREATE TABLE interrupted(value TEXT)');
        throw new Error('Injected migration failure');
      }
      db.exec(sql);
    },
    run: async (sql, values = []) => {
      if (faults.save && sql.startsWith('UPDATE learning_app_state')) throw new Error('Injected interrupted save');
      db.prepare(sql).run(...values);
    },
    all: async (sql, values = []) => db.prepare(sql).all(...values),
  };
  const driver = serializeDriver({ ...connection, transaction: async (action) => {
    db.exec('BEGIN IMMEDIATE');
    try { await action(connection); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } });
  return { db, faults, driver, repo: new LearningRepository(driver) };
}
test('learning: all scheduled languages have stable unique tags and display script metadata', () => {
  assert.equal(LANGUAGE_CATALOG.length, 24);
  assert.equal(new Set(LANGUAGE_CATALOG.map((language) => language.tag)).size, 24);
  for (const language of LANGUAGE_CATALOG) {
    assert.ok(language.autonym); assert.match(language.script, /^[A-Z][a-z]{3}$/);
    assert.ok(['ltr', 'rtl'].includes(language.direction));
    assert.equal(validateRegistration({ ...input, native: language.tag, target: language.tag }).target, language.tag);
  }
  assert.equal(LANGUAGE_CATALOG.find((language) => language.tag === 'ur').direction, 'rtl');
});
test('learning: registration checks format only and rejects malformed external values', () => {
  assert.equal(validateRegistration(input).name, 'आशा');
  assert.equal(validateRegistration({ ...input, name: '𑀅'.repeat(80), phone: '+1234567' }).name.length, 160);
  assert.doesNotThrow(() => validateRegistration({ ...input, phone: '+123456789012345' }));
  for (const invalid of [null, {}, { ...input, name: ' ' }, { ...input, name: 'a'.repeat(81) },
    { ...input, phone: '+123456' }, { ...input, phone: '+1234567890123456' },
    { ...input, phone: '919876543210' }, { ...input, phone: '+91 9876543210' },
    { ...input, native: 'xx' }, { ...input, target: 'english' }, { ...input, name: 'a\u0000b' }]) {
    assert.throws(() => validateRegistration(invalid));
  }
});
test('learning: Unicode preferences persist after SQLite close/reopen without touching tutor database', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'learning-test-'));
  let current;
  const tutor = store(join(directory, 'speaking-tutor.db'));
  try {
    const oldTutor = new TutorRepository(tutor.driver); await oldTutor.initialize();
    await oldTutor.savePreferences({ native: 'hi', target: 'es', persona: 'male', correctionMode: 'end' });
    const before = tutor.db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
    current = store(join(directory, 'learning.db')); await current.repo.initialize();
    await current.repo.saveProfile({ ...input, native: 'ur', target: 'mni' }, ids, 100);
    current.db.close(); current = store(join(directory, 'learning.db')); await current.repo.initialize();
    const saved = await current.repo.snapshot();
    assert.equal(saved.learner.name, 'आशा'); assert.equal(saved.learner.native, 'ur');
    assert.equal(saved.learner.interfaceLocale, 'en'); assert.equal(saved.active.target, 'mni');
    assert.deepEqual(tutor.db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all(), before);
    assert.equal(tutor.db.prepare('PRAGMA user_version').get().user_version, 3);
    assert.equal((await oldTutor.preferences()).target, 'es');
  } finally { current?.db.close(); tutor.db.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('learning: retries and edits preserve identity; target A/B/A restores its original profile', async (t) => {
  const { repo, db } = store(); t.after(() => db.close()); await repo.initialize(); await repo.initialize();
  assert.deepEqual(await repo.snapshot(), { learner: null, active: null, profiles: [] });
  const first = await repo.saveProfile(input, ids, 100);
  const retry = await repo.saveProfile(input, { learnerId: 'retry-learner', profileId: 'retry-profile' }, 101);
  assert.equal(retry.learner.id, first.learner.id); assert.equal(retry.active.id, first.active.id); assert.equal(retry.profiles.length, 1);
  const b = await repo.saveProfile({ ...input, name: 'New name', native: 'bn', target: 'ta' }, { learnerId: 'new-learner', profileId: 'profile-ta' }, 102);
  assert.equal(b.learner.id, ids.learnerId); assert.equal(b.learner.createdAt, 100);
  assert.equal(b.learner.name, 'New name'); assert.equal(b.learner.native, 'bn');
  const a = await repo.saveProfile(input, { learnerId: 'ignored', profileId: 'ignored' }, 90);
  assert.equal(a.active.id, first.active.id); assert.equal(a.learner.updatedAt, 102);
  assert.deepEqual(a.profiles.find((profile) => profile.target === 'ta'), b.active);
  assert.equal(a.profiles.length, 2);
});
test('learning: failed first save or edit rolls back atomically and can retry', async (t) => {
  const { repo, db, faults } = store(); t.after(() => db.close()); await repo.initialize();
  faults.save = true;
  await assert.rejects(repo.saveProfile(input, ids, 100), /interrupted save/);
  assert.deepEqual(await repo.snapshot(), { learner: null, active: null, profiles: [] });
  faults.save = false; const before = await repo.saveProfile(input, ids, 100);
  faults.save = true;
  await assert.rejects(repo.saveProfile({ ...input, name: 'Changed', target: 'es' }, { ...ids, profileId: 'es' }, 101), /interrupted save/);
  assert.deepEqual(await repo.snapshot(), before);
  faults.save = false; assert.equal((await repo.saveProfile({ ...input, target: 'es' }, { ...ids, profileId: 'es' }, 101)).profiles.length, 2);
});
test('learning: migration failure rolls back DDL/version and is safely retryable', async (t) => {
  const { repo, db, faults } = store(); t.after(() => db.close()); faults.migration = true;
  await assert.rejects(repo.initialize(), /migration failure/);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n, 0);
  await assert.rejects(repo.snapshot(), /not initialized/);
  faults.migration = false; await repo.initialize();
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
});
test('learning: future versions and accidental tutor handles are refused without changing data', async (t) => {
  const { repo, db } = store(); t.after(() => db.close());
  db.exec("CREATE TABLE retained(value TEXT); INSERT INTO retained VALUES('original'); PRAGMA user_version=2;");
  await assert.rejects(repo.initialize(), /newer app/);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(db.prepare('SELECT value FROM retained').get().value, 'original');
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='local_learner'").get().n, 0);
});
test('learning: corrupted saved values fail visibly without a reset and parameter binding preserves input', async (t) => {
  const { repo, db } = store(); t.after(() => db.close()); await repo.initialize();
  const name = "O'Neil; DROP TABLE local_learner; --";
  assert.equal((await repo.saveProfile({ ...input, name }, ids, 1)).learner.name, name);
  db.prepare('UPDATE local_learner SET explanation_language=?').run('invalid');
  await assert.rejects(repo.snapshot(), /supported language/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM local_learner').get().n, 1);
});
test('learning: foreign keys and duplicate target constraints enforce isolation', async (t) => {
  const { repo, db } = store(); t.after(() => db.close()); await repo.initialize(); await repo.saveProfile(input, ids, 1);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.throws(() => db.prepare('INSERT INTO learning_profile VALUES(?,?,?,?)').run('orphan', 'missing', 'es', 1), /FOREIGN KEY/);
  assert.throws(() => db.prepare('INSERT INTO learning_profile VALUES(?,?,?,?)').run('duplicate', ids.learnerId, 'en', 1), /UNIQUE/);
});
