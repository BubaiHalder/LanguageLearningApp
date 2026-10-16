import type { LearningRepository } from './learning-repository';

export async function openLearningRepository(): Promise<LearningRepository> {
  throw new Error('Profiles use native SQLite. Please open this app on Android or iOS. Web storage is not enabled.');
}
