import { DEFAULT_PREFERENCES, type Preferences, type Session, type Turn, type TutorReply,
  validatePreferences, validateInput } from '../features/tutor/types';

export type SqlValue = string | number | null;
export interface SqlConnection {
  exec(sql: string): Promise<void>;
  run(sql: string, values?: SqlValue[]): Promise<void>;
  all<T>(sql: string, values?: SqlValue[]): Promise<T[]>;
}
export interface SqlDriver extends SqlConnection {
  transaction(action: (connection: SqlConnection) => Promise<void>): Promise<void>;
}
const MIGRATION_1 = `
CREATE TABLE tutor_preferences (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  native TEXT NOT NULL CHECK(native IN ('en','hi','es')),
  target TEXT NOT NULL CHECK(target IN ('en','hi','es')),
  persona TEXT NOT NULL CHECK(persona IN ('female','male')),
  correctionMode TEXT NOT NULL CHECK(correctionMode IN ('immediate','end'))
);
CREATE TABLE tutor_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  native TEXT NOT NULL CHECK(native IN ('en','hi','es')),
  target TEXT NOT NULL CHECK(target IN ('en','hi','es')),
  persona TEXT NOT NULL CHECK(persona IN ('female','male')),
  correctionMode TEXT NOT NULL CHECK(correctionMode IN ('immediate','end')),
  createdAt INTEGER NOT NULL,
  endedAt INTEGER
);
CREATE TABLE tutor_turns (
  id TEXT PRIMARY KEY NOT NULL,
  sessionId TEXT NOT NULL REFERENCES tutor_sessions(id) ON DELETE CASCADE,
  input TEXT NOT NULL CHECK(length(input) BETWEEN 1 AND 2000),
  response TEXT NOT NULL,
  corrections TEXT NOT NULL,
  analyzed INTEGER NOT NULL CHECK(analyzed IN (0,1)),
  provider TEXT NOT NULL CHECK(provider = 'mock-v1'),
  createdAt INTEGER NOT NULL
);
CREATE INDEX tutor_session_history ON tutor_sessions(createdAt DESC);
CREATE INDEX tutor_turn_history ON tutor_turns(sessionId, createdAt);
PRAGMA user_version = 1;
`;

type StoredTurn = Omit<Turn, 'corrections' | 'analyzed'> & { corrections: string; analyzed: number };
// Rebuild only the constrained child table inside the same transaction. Original IDs,
// timestamps and JSON are copied unchanged; any failure rolls the entire upgrade back.
const MIGRATION_2 = `
ALTER TABLE tutor_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'mock' CHECK(mode IN ('mock','live'));
CREATE TABLE tutor_turns_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  sessionId TEXT NOT NULL REFERENCES tutor_sessions(id) ON DELETE CASCADE,
  input TEXT NOT NULL CHECK(length(input) BETWEEN 1 AND 2000),
  response TEXT NOT NULL, corrections TEXT NOT NULL,
  analyzed INTEGER NOT NULL CHECK(analyzed IN (0,1)),
  provider TEXT NOT NULL CHECK(provider IN ('mock-v1','local-v1')),
  createdAt INTEGER NOT NULL, correctedSentence TEXT, explanation TEXT
);
INSERT INTO tutor_turns_v2(id,sessionId,input,response,corrections,analyzed,provider,createdAt)
SELECT id,sessionId,input,response,corrections,analyzed,provider,createdAt FROM tutor_turns;
DROP TABLE tutor_turns;
ALTER TABLE tutor_turns_v2 RENAME TO tutor_turns;
CREATE INDEX tutor_turn_history ON tutor_turns(sessionId,createdAt);
PRAGMA user_version = 2;
`;
// Widen the language rule from en/hi/es to the 24 supported language tags. SQLite cannot alter a CHECK, so the
// preferences and sessions tables are rebuilt with every row copied unchanged. initialize() turns foreign-key
// enforcement off for this step only, so dropping the old sessions table cannot cascade-delete turns, and then
// requires PRAGMA foreign_key_check to be clean before the transaction commits. Any failure rolls everything back.
const LANGUAGE_RULE = `IN ('en','es','as','bn','brx','doi','gu','hi','kn','ks','kok','mai','ml','mni','mr','ne','or','pa','sa','sat','sd','ta','te','ur')`;
const MIGRATION_3 = `
CREATE TABLE tutor_preferences_v3 (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  native TEXT NOT NULL CHECK(native ${LANGUAGE_RULE}),
  target TEXT NOT NULL CHECK(target ${LANGUAGE_RULE}),
  persona TEXT NOT NULL CHECK(persona IN ('female','male')),
  correctionMode TEXT NOT NULL CHECK(correctionMode IN ('immediate','end'))
);
INSERT INTO tutor_preferences_v3(singleton,native,target,persona,correctionMode)
SELECT singleton,native,target,persona,correctionMode FROM tutor_preferences;
DROP TABLE tutor_preferences;
ALTER TABLE tutor_preferences_v3 RENAME TO tutor_preferences;
CREATE TABLE tutor_sessions_v3 (
  id TEXT PRIMARY KEY NOT NULL,
  native TEXT NOT NULL CHECK(native ${LANGUAGE_RULE}),
  target TEXT NOT NULL CHECK(target ${LANGUAGE_RULE}),
  persona TEXT NOT NULL CHECK(persona IN ('female','male')),
  correctionMode TEXT NOT NULL CHECK(correctionMode IN ('immediate','end')),
  createdAt INTEGER NOT NULL,
  endedAt INTEGER,
  mode TEXT NOT NULL DEFAULT 'mock' CHECK(mode IN ('mock','live'))
);
INSERT INTO tutor_sessions_v3(id,native,target,persona,correctionMode,createdAt,endedAt,mode)
SELECT id,native,target,persona,correctionMode,createdAt,endedAt,mode FROM tutor_sessions;
DROP TABLE tutor_sessions;
ALTER TABLE tutor_sessions_v3 RENAME TO tutor_sessions;
CREATE INDEX tutor_session_history ON tutor_sessions(createdAt DESC);
PRAGMA user_version = 3;
`;
const SCHEMA_VERSION = 3;
function decodeTurn(row: StoredTurn): Turn {
  const value: unknown = JSON.parse(row.corrections);
  if (!Array.isArray(value) || !value.every((c: unknown) => c !== null && typeof c === 'object' &&
    'category' in c && ['grammar', 'vocabulary', 'sentence'].includes(String(c.category)) &&
    'corrected' in c && typeof c.corrected === 'string' &&
    'explanation' in c && typeof c.explanation === 'string')) {
    throw new Error('Saved corrections could not be read. Your database has not been reset.');
  }
  return { ...row, analyzed: row.analyzed === 1, corrections: value };
}

export class TutorRepository {
  // Serialize writes on this connection; failures never poison the next operation.
  private writes: Promise<void> = Promise.resolve();
  constructor(private readonly db: SqlDriver) {}
  private write(action: (tx: SqlConnection) => Promise<void>): Promise<void> {
    const next = this.writes.then(() => this.db.transaction(action));
    this.writes = next.catch(() => {});
    return next;
  }
  async initialize(): Promise<void> {
    await this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    const [current] = await this.db.all<{ user_version: number }>('PRAGMA user_version');
    if (current.user_version > SCHEMA_VERSION) throw new Error('This database needs a newer app version. No data was changed.');
    // PRAGMA foreign_keys cannot change inside a transaction, so it is switched around the whole upgrade.
    const rebuilding = current.user_version < SCHEMA_VERSION;
    if (rebuilding) await this.db.exec('PRAGMA foreign_keys = OFF');
    try {
      await this.write(async (tx) => {
        const [row] = await tx.all<{ user_version: number }>('PRAGMA user_version');
        if (row.user_version > SCHEMA_VERSION) throw new Error('This database needs a newer app version. No data was changed.');
        if (row.user_version === 0) await tx.exec(MIGRATION_1);
        if (row.user_version < 2) await tx.exec(MIGRATION_2);
        if (row.user_version < 3) {
          await tx.exec(MIGRATION_3);
          const broken = await tx.all<unknown>('PRAGMA foreign_key_check');
          if (broken.length) throw new Error('Upgrade stopped: saved turns would be orphaned. No data was changed.');
        }
      });
    } finally {
      if (rebuilding) await this.db.exec('PRAGMA foreign_keys = ON');
    }
  }
  async preferences(): Promise<Preferences> {
    await this.writes;
    const [row] = await this.db.all<Preferences>('SELECT native,target,persona,correctionMode FROM tutor_preferences WHERE singleton=1');
    return row ? validatePreferences(row) : { ...DEFAULT_PREFERENCES };
  }
  savePreferences(preferences: Preferences): Promise<void> {
    const p = validatePreferences(preferences);
    return this.write((tx) => tx.run(`INSERT INTO tutor_preferences VALUES (1,?,?,?,?)
      ON CONFLICT(singleton) DO UPDATE SET native=excluded.native,target=excluded.target,
      persona=excluded.persona,correctionMode=excluded.correctionMode`,
    [p.native, p.target, p.persona, p.correctionMode]));
  }
  async sessions(offset = 0, mode?: 'mock' | 'live'): Promise<Session[]> {
    await this.writes;
    return this.db.all<Session>(`SELECT s.*, (SELECT count(*) FROM tutor_turns t WHERE t.sessionId=s.id) AS turnCount
      FROM tutor_sessions s WHERE (? IS NULL OR s.mode=?) ORDER BY createdAt DESC,id DESC LIMIT 20 OFFSET ?`, [mode ?? null, mode ?? null, offset]);
  }
  async turns(sessionId: string, before = Number.MAX_SAFE_INTEGER): Promise<Turn[]> {
    await this.writes;
    const rows = await this.db.all<StoredTurn>(`SELECT * FROM tutor_turns WHERE sessionId=? AND createdAt<?
      ORDER BY createdAt DESC,id DESC LIMIT 50`, [sessionId, before]);
    return rows.reverse().map(decodeTurn);
  }
  async resume(p: Preferences, mode: 'mock' | 'live' = 'mock'): Promise<Session | null> {
    await this.writes;
    const [session] = await this.db.all<Session>(`SELECT s.*, (SELECT count(*) FROM tutor_turns t WHERE t.sessionId=s.id) AS turnCount
      FROM tutor_sessions s WHERE endedAt IS NULL AND native=? AND target=? AND persona=? AND correctionMode=? AND mode=?
      ORDER BY createdAt DESC LIMIT 1`, [p.native, p.target, p.persona, p.correctionMode, mode]);
    return session ?? null;
  }
  saveTurn(session: Session, id: string, input: string, reply: TutorReply, createdAt: number): Promise<void> {
    const p = validatePreferences(session);
    const text = validateInput(input);
    return this.write(async (tx) => {
      // The same client turn ID can be retried after a commit/read failure without duplicating it.
      const [existing] = await tx.all<{ sessionId: string; input: string }>('SELECT sessionId,input FROM tutor_turns WHERE id=?', [id]);
      if (existing) {
        if (existing.sessionId !== session.id || existing.input !== text) throw new Error('Turn ID already belongs to another submission.');
        return;
      }
      const mode = session.mode ?? 'mock';
      if ((mode === 'live') !== (reply.provider === 'local-v1')) throw new Error('Tutor provider does not match conversation mode.');
      await tx.run('INSERT OR IGNORE INTO tutor_sessions(id,native,target,persona,correctionMode,createdAt,endedAt,mode) VALUES (?,?,?,?,?,?,NULL,?)',
        [session.id, p.native, p.target, p.persona, p.correctionMode, session.createdAt, mode]);
      const [saved] = await tx.all<Session>('SELECT * FROM tutor_sessions WHERE id=?', [session.id]);
      if (saved.endedAt !== null) throw new Error('This conversation has ended. Start a new conversation.');
      if (saved.mode !== mode || saved.native !== p.native || saved.target !== p.target || saved.persona !== p.persona || saved.correctionMode !== p.correctionMode) {
        throw new Error('Conversation settings do not match. Start a new conversation.');
      }
      await tx.run('INSERT INTO tutor_turns VALUES (?,?,?,?,?,?,?,?,?,?)',
        [id, session.id, text, reply.response, JSON.stringify(reply.corrections), reply.analyzed ? 1 : 0, reply.provider, createdAt,
          reply.correctedSentence ?? null, reply.explanation ?? null]);
    });
  }
  finish(id: string, time = Date.now()): Promise<void> {
    return this.write((tx) => tx.run('UPDATE tutor_sessions SET endedAt=COALESCE(endedAt,?) WHERE id=?', [time, id]));
  }
  removeSession(id: string): Promise<void> {
    return this.write((tx) => tx.run('DELETE FROM tutor_sessions WHERE id=?', [id]));
  }
}
