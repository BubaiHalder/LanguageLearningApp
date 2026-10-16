import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { LearningRepository } from './learning-repository';
import { serializeDriver } from './serialized-driver';
import type { SqlConnection, SqlDriver } from './tutor-repository';

function connection(db: SQLiteDatabase): SqlConnection {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, values = []) => { await db.runAsync(sql, values); },
    all: <T>(sql: string, values: (string | number | null)[] = []) => db.getAllAsync<T>(sql, values),
  };
}
let opening: Promise<LearningRepository> | undefined;
/** Opens the separate learning.db; the tutor's speaking-tutor.db is never touched. */
export function openLearningRepository(): Promise<LearningRepository> {
  if (!opening) {
    opening = (async () => {
      const db = await openDatabaseAsync('learning.db');
      const driver: SqlDriver = serializeDriver({ ...connection(db),
        transaction: (action) => db.withTransactionAsync(() => action(connection(db))),
      });
      const repository = new LearningRepository(driver);
      try { await repository.initialize(); }
      catch (error) { await db.closeAsync(); throw error; }
      return repository;
    })().catch((error: unknown) => { opening = undefined; throw error; });
  }
  return opening;
}
