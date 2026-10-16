/** Catalog membership is a language preference, not a promise of AI or course support. */
export const LANGUAGE_CATALOG = [
  { tag: 'en', name: 'English', autonym: 'English', script: 'Latn', direction: 'ltr' },
  { tag: 'es', name: 'Spanish', autonym: 'Español', script: 'Latn', direction: 'ltr' },
  { tag: 'as', name: 'Assamese', autonym: 'অসমীয়া', script: 'Beng', direction: 'ltr' },
  { tag: 'bn', name: 'Bengali', autonym: 'বাংলা', script: 'Beng', direction: 'ltr' },
  { tag: 'brx', name: 'Bodo', autonym: 'बड़ो', script: 'Deva', direction: 'ltr' },
  { tag: 'doi', name: 'Dogri', autonym: 'डोगरी', script: 'Deva', direction: 'ltr' },
  { tag: 'gu', name: 'Gujarati', autonym: 'ગુજરાતી', script: 'Gujr', direction: 'ltr' },
  { tag: 'hi', name: 'Hindi', autonym: 'हिन्दी', script: 'Deva', direction: 'ltr' },
  { tag: 'kn', name: 'Kannada', autonym: 'ಕನ್ನಡ', script: 'Knda', direction: 'ltr' },
  { tag: 'ks', name: 'Kashmiri', autonym: 'کٲشُر', script: 'Arab', direction: 'rtl' },
  { tag: 'kok', name: 'Konkani', autonym: 'कोंकणी', script: 'Deva', direction: 'ltr' },
  { tag: 'mai', name: 'Maithili', autonym: 'मैथिली', script: 'Deva', direction: 'ltr' },
  { tag: 'ml', name: 'Malayalam', autonym: 'മലയാളം', script: 'Mlym', direction: 'ltr' },
  { tag: 'mni', name: 'Manipuri / Meitei', autonym: 'ꯃꯤꯇꯩꯂꯣꯟ', script: 'Mtei', direction: 'ltr' },
  { tag: 'mr', name: 'Marathi', autonym: 'मराठी', script: 'Deva', direction: 'ltr' },
  { tag: 'ne', name: 'Nepali', autonym: 'नेपाली', script: 'Deva', direction: 'ltr' },
  { tag: 'or', name: 'Odia', autonym: 'ଓଡ଼ିଆ', script: 'Orya', direction: 'ltr' },
  { tag: 'pa', name: 'Punjabi', autonym: 'ਪੰਜਾਬੀ', script: 'Guru', direction: 'ltr' },
  { tag: 'sa', name: 'Sanskrit', autonym: 'संस्कृतम्', script: 'Deva', direction: 'ltr' },
  { tag: 'sat', name: 'Santali', autonym: 'ᱥᱟᱱᱛᱟᱲᱤ', script: 'Olck', direction: 'ltr' },
  { tag: 'sd', name: 'Sindhi', autonym: 'سنڌي', script: 'Arab', direction: 'rtl' },
  { tag: 'ta', name: 'Tamil', autonym: 'தமிழ்', script: 'Taml', direction: 'ltr' },
  { tag: 'te', name: 'Telugu', autonym: 'తెలుగు', script: 'Telu', direction: 'ltr' },
  { tag: 'ur', name: 'Urdu', autonym: 'اردو', script: 'Arab', direction: 'rtl' },
] as const;
// Script metadata describes the displayed autonym, not every script a language can use.
export type LanguageTag = (typeof LANGUAGE_CATALOG)[number]['tag'];
export interface Registration { name: string; phone: string; native: LanguageTag; target: LanguageTag }
export interface LocalLearner {
  id: string; name: string; phone: string; native: LanguageTag;
  interfaceLocale: 'en'; createdAt: number; updatedAt: number;
}
export interface TargetProfile { id: string; learnerId: string; target: LanguageTag; createdAt: number }
export interface LearningSnapshot { learner: LocalLearner | null; active: TargetProfile | null; profiles: TargetProfile[] }
export function isLanguageTag(value: unknown): value is LanguageTag {
  return typeof value === 'string' && LANGUAGE_CATALOG.some((language) => language.tag === value);
}
export function validateRegistration(value: unknown): Registration {
  if (value === null || typeof value !== 'object' || !('name' in value) || typeof value.name !== 'string' ||
    !('phone' in value) || typeof value.phone !== 'string' || !('native' in value) ||
    !isLanguageTag(value.native) || !('target' in value) || !isLanguageTag(value.target)) {
    throw new Error('Enter a name, international phone number and supported language preferences.');
  }
  const name = value.name.trim();
  const phone = value.phone.trim();
  if (Array.from(name).length < 1 || Array.from(name).length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error('Name must contain 1–80 characters without control characters.');
  }
  if (!/^\+[0-9]{7,15}$/.test(phone)) throw new Error('Use + followed by 7–15 digits including country code. This checks format only.');
  return { name, phone, native: value.native, target: value.target };
}
