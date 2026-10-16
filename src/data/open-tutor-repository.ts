import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { TutorRepository, type SqlConnection, type SqlDriver } from './tutor-repository';
import { serializeDriver } from './serialized-driver';

function connection(db: SQLiteDatabase): SqlConnection {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, values = []) => { await db.runAsync(sql, values); },
    all: <T>(sql: string, values: (string | number | null)[] = []) => db.getAllAsync<T>(sql, values),
  };
}
let opening: Promise<TutorRepository> | undefined;
export function openTutorRepository(): Promise<TutorRepository> {
  if (!opening) {
    opening = (async () => {
      const db = await openDatabaseAsync('speaking-tutor.db');
      // Keep PRAGMA foreign_keys on the same owned connection for every write.
      // Expo's exclusive helper creates another connection; pragmas are per-connection.
      const driver: SqlDriver = serializeDriver({ ...connection(db),
        transaction: (action) => db.withTransactionAsync(() => action(connection(db))),
      });
      const repository = new TutorRepository(driver);
      try { await repository.initialize(); }
      catch (error) { await db.closeAsync(); throw error; }
      return repository;
    })().catch((error: unknown) => { opening = undefined; throw error; });
  }
  return opening;
}
