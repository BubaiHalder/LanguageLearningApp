import type { TutorRepository } from './tutor-repository';

export async function openTutorRepository(): Promise<TutorRepository> {
  throw new Error('Tutor history uses native SQLite. Please open this prototype on Android or iOS. Web storage is not enabled.');
}
