import type { SqlDriver } from './tutor-repository';

/** Own all access to one connection, including reads, to prevent transaction interleaving. */
export function serializeDriver(raw: SqlDriver): SqlDriver {
  let queue: Promise<void> = Promise.resolve();
  function schedule<T>(action: () => Promise<T>): Promise<T> {
    const result = queue.then(action);
    queue = result.then(() => {}, () => {});
    return result;
  }
  return {
    exec: (sql) => schedule(() => raw.exec(sql)),
    run: (sql, values) => schedule(() => raw.run(sql, values)),
    all: <T>(sql: string, values?: (string | number | null)[]) => schedule(() => raw.all<T>(sql, values)),
    transaction: (action) => schedule(() => raw.transaction(action)),
  };
}
