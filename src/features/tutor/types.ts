import { LANGUAGE_CATALOG, type LanguageTag } from '../../domain/learning-profile';

export type Language = LanguageTag;
/** Every selectable language. Presence here is a preference, not a promise of recognition, speech or teaching quality. */
export const LANGUAGES: readonly { code: Language; label: string }[] = LANGUAGE_CATALOG.map((language) => ({ code: language.tag, label: language.autonym }));
/** Languages the speaking tutor is built and tested for; every other language is experimental text practice. */
export const FULL_TUTOR_LANGUAGES: readonly Language[] = ['en', 'hi', 'es'];
export const isFullTutorLanguage = (code: string) => FULL_TUTOR_LANGUAGES.some((language) => language === code);
/** Languages Whisper can recognise from speech; others can still be practised by typing. */
export const SPEECH_INPUT_LANGUAGES: readonly Language[] = ['en', 'es', 'as', 'bn', 'gu', 'hi', 'kn', 'ml', 'mr', 'ne', 'pa', 'sa', 'sd', 'ta', 'te', 'ur'];
export const canRecognizeSpeech = (native: string, target: string) =>
  SPEECH_INPUT_LANGUAGES.some((language) => language === native || language === target);
export type MockLanguage = 'en' | 'hi' | 'es';
export type Persona = 'female' | 'male';
export type CorrectionMode = 'immediate' | 'end';
export interface Preferences {
  native: Language;
  target: Language;
  persona: Persona;
  correctionMode: CorrectionMode;
}
export const DEFAULT_PREFERENCES: Preferences = {
  native: 'hi', target: 'en', persona: 'female', correctionMode: 'immediate',
};
export interface Correction {
  original?: string;
  category: 'grammar' | 'vocabulary' | 'sentence';
  corrected: string;
  explanation: string;
}
export interface TutorReply {
  response: string;
  corrections: Correction[];
  analyzed: boolean;
  provider: 'mock-v1' | 'local-v1';
  correctedSentence?: string | null;
  explanation?: string | null;
}
export interface Turn extends TutorReply {
  id: string;
  sessionId: string;
  input: string;
  createdAt: number;
}
export interface Session extends Preferences {
  mode?: 'mock' | 'live';
  id: string;
  createdAt: number;
  endedAt: number | null;
  turnCount: number;
}
export interface TutorProvider {
  reply(text: string, preferences: Preferences, fail?: boolean, context?: Turn[]): Promise<TutorReply>;
}
export function validatePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object') throw new Error('Invalid language preferences.');
  const p = value as Record<string, unknown>;
  const validLanguage = (code: unknown) => LANGUAGES.some((language) => language.code === code);
  if (!validLanguage(p.native) || !validLanguage(p.target) ||
      !['male', 'female'].includes(String(p.persona)) ||
      !['immediate', 'end'].includes(String(p.correctionMode))) {
    throw new Error('Unsupported language or tutor preference.');
  }
  return { native: p.native as Language, target: p.target as Language,
    persona: p.persona as Persona, correctionMode: p.correctionMode as CorrectionMode };
}
export function validateInput(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Type a sentence or use the sample microphone.');
  if (trimmed.length > 2000) throw new Error('Please keep each turn under 2,000 characters.');
  return trimmed;
}
export function visibleCorrections(turn: Turn, session: Session): Correction[] {
  return session.correctionMode === 'immediate' || session.endedAt !== null ? turn.corrections : [];
}
