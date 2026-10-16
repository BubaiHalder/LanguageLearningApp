import { LANGUAGE_CATALOG, isLanguageTag, validateRegistration, type LearningSnapshot,
  type LocalLearner, type TargetProfile, type Registration } from '../domain/learning-profile';
import type { SqlConnection, SqlDriver } from './tutor-repository';

// Applies only to the separate learning.db. Released tutor migrations remain untouched.
const MIGRATION_1 = `
CREATE TABLE local_learner (
  id TEXT PRIMARY KEY NOT NULL,
  singleton INTEGER NOT NULL UNIQUE CHECK(singleton=1),
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 80),
  phone TEXT NOT NULL,
  interface_locale TEXT NOT NULL CHECK(interface_locale='en'),
  explanation_language TEXT NOT NULL,
  created_at INTEGER NOT NULL CHECK(created_at>=0),
  updated_at INTEGER NOT NULL CHECK(updated_at>=created_at)
);
CREATE TABLE learning_profile (
  id TEXT PRIMARY KEY NOT NULL,
  learner_id TEXT NOT NULL REFERENCES local_learner(id) ON DELETE RESTRICT,
  target_language TEXT NOT NULL,
  created_at INTEGER NOT NULL CHECK(created_at>=0),
  UNIQUE(learner_id,target_language)
);
CREATE TABLE learning_app_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  active_profile_id TEXT REFERENCES learning_profile(id) ON DELETE RESTRICT,
  onboarding_completed INTEGER NOT NULL CHECK(onboarding_completed IN (0,1))
);
INSERT INTO learning_app_state VALUES(1,NULL,0);
PRAGMA user_version = 1;
`;
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Saved profile is invalid. No data was reset.');
  return Object.fromEntries(Object.entries(value));
}
function identity(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || value.trim() !== value) throw new Error('Profile identifier is invalid.');
  return value;
}
function timestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Profile timestamp is invalid.');
  return value;
}
function learnerFrom(value: unknown): LocalLearner {
  const row = record(value);
  const valid = validateRegistration({ name: row.display_name, phone: row.phone, native: row.explanation_language, target: row.explanation_language });
  if (valid.name !== row.display_name || valid.phone !== row.phone || row.interface_locale !== 'en') throw new Error('Saved learner preferences are invalid.');
  const createdAt = timestamp(row.created_at);
  const updatedAt = timestamp(row.updated_at);
  if (updatedAt < createdAt) throw new Error('Saved profile timestamps are invalid.');
  return { id: identity(row.id), name: valid.name, phone: valid.phone, native: valid.native, interfaceLocale: 'en', createdAt, updatedAt };
}
function profileFrom(value: unknown): TargetProfile {
  const row = record(value);
  if (!isLanguageTag(row.target_language)) throw new Error('Saved target language is unsupported. No data was reset.');
  return { id: identity(row.id), learnerId: identity(row.learner_id), target: row.target_language, createdAt: timestamp(row.created_at) };
}
async function readSnapshot(tx: SqlConnection): Promise<LearningSnapshot> {
  const learners = await tx.all<unknown>('SELECT * FROM local_learner LIMIT 2');
  const rows = await tx.all<unknown>('SELECT * FROM learning_profile ORDER BY created_at,id LIMIT 25');
  const states = await tx.all<unknown>('SELECT * FROM learning_app_state LIMIT 2');
  if (learners.length > 1 || rows.length > LANGUAGE_CATALOG.length || states.length !== 1) throw new Error('Saved learning state is inconsistent. No data was reset.');
  const learner = learners.length === 1 ? learnerFrom(learners[0]) : null;
  const profiles = rows.map(profileFrom);
  const state = record(states[0]);
  if (state.singleton !== 1 || (state.onboarding_completed !== 0 && state.onboarding_completed !== 1)) throw new Error('Saved learning state is invalid.');
  if (profiles.some((profile) => profile.learnerId !== learner?.id) || new Set(profiles.map((profile) => profile.target)).size !== profiles.length) throw new Error('Saved target ownership is inconsistent.');
  const active = profiles.find((profile) => profile.id === state.active_profile_id) ?? null;
  if (learner ? !active || state.onboarding_completed !== 1 : profiles.length !== 0 || state.active_profile_id !== null || state.onboarding_completed !== 0) throw new Error('Saved active profile is inconsistent. No data was reset.');
  return { learner, active, profiles };
}
function versionFrom(rows: unknown[]): number {
  if (rows.length !== 1) throw new Error('Could not read learning database version.');
  const version = timestamp(record(rows[0]).user_version);
  if (version > 1) throw new Error('This learning database needs a newer app version. No data was changed.');
  return version;
}
export class LearningRepository {
  private operations: Promise<void> = Promise.resolve();
  private ready = false;
  // The opener must provide serializeDriver(raw) so every connection read/write is scheduled.
  constructor(private readonly db: SqlDriver) {}
  private schedule<T>(action: () => Promise<T>): Promise<T> {
    const next = this.operations.then(action);
    this.operations = next.then(() => {}, () => {});
    return next;
  }
  initialize(): Promise<void> {
    return this.schedule(async () => {
      versionFrom(await this.db.all<unknown>('PRAGMA user_version'));
      await this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
      await this.db.transaction(async (tx) => {
        const version = versionFrom(await tx.all<unknown>('PRAGMA user_version'));
        if (version === 0) await tx.exec(MIGRATION_1);
        await readSnapshot(tx);
      });
      this.ready = true;
    });
  }
  private requireReady(): void {
    if (!this.ready) throw new Error('Learning database is not initialized. Retry opening it.');
  }
  snapshot(): Promise<LearningSnapshot> {
    return this.schedule(async () => {
      this.requireReady();
      let snapshot: LearningSnapshot = { learner: null, active: null, profiles: [] };
      await this.db.transaction(async (tx) => { snapshot = await readSnapshot(tx); });
      return snapshot;
    });
  }
  saveProfile(input: Registration, ids: { learnerId: string; profileId: string }, now: number): Promise<LearningSnapshot> {
    return this.schedule(async () => {
      this.requireReady();
      const valid = validateRegistration(input);
      const learnerId = identity(ids.learnerId);
      const profileId = identity(ids.profileId);
      const at = timestamp(now);
      let snapshot: LearningSnapshot = { learner: null, active: null, profiles: [] };
      await this.db.transaction(async (tx) => {
        const previous = await readSnapshot(tx);
        const stableId = previous.learner?.id ?? learnerId;
        if (previous.learner) {
          await tx.run('UPDATE local_learner SET display_name=?,phone=?,explanation_language=?,updated_at=? WHERE id=?',
            [valid.name, valid.phone, valid.native, Math.max(at, previous.learner.updatedAt), stableId]);
        } else {
          await tx.run('INSERT INTO local_learner VALUES(?,1,?,?,?,?,?,?)',
            [stableId, valid.name, valid.phone, 'en', valid.native, at, at]);
        }
        const existing = previous.profiles.find((profile) => profile.target === valid.target);
        const activeId = existing?.id ?? profileId;
        if (!existing) await tx.run('INSERT INTO learning_profile VALUES(?,?,?,?)', [activeId, stableId, valid.target, at]);
        await tx.run('UPDATE learning_app_state SET active_profile_id=?,onboarding_completed=1 WHERE singleton=1', [activeId]);
        snapshot = await readSnapshot(tx);
      });
      return snapshot;
    });
  }
}
