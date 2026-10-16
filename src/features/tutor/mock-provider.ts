import { type Language, type MockLanguage, type Preferences, type TutorProvider, type TutorReply, validateInput } from './types';

/** The scripted demo only exists for these three languages; any other language is saved but not analysed. */
export const toMockLanguage = (language: Language): MockLanguage => language === 'hi' || language === 'es' ? language : 'en';
const hasMockScript = (language: Language) => language === 'en' || language === 'hi' || language === 'es';
export const SAMPLE_INPUTS: Record<MockLanguage, string> = {
  en: 'Yesterday I go to market. I buyed a bread.',
  hi: 'मैं कल बाजार जाता हूँ।',
  es: 'Ayer yo ir al mercado.',
};
const explanations: Record<MockLanguage, Record<MockLanguage, string>> = {
  en: {
    en: 'For a finished action yesterday, use “went” and “bought”. Say “some bread”, not “a bread”.',
    hi: 'Use the past form “गया था” for an action completed yesterday.',
    es: 'Use “fui”, the past form of “ir”, for an action completed yesterday.',
  },
  hi: {
    en: 'कल पूरी हुई क्रिया के लिए “went” और “bought” का प्रयोग करें। “a bread” के बजाय “some bread” कहें।',
    hi: 'कल पूरी हुई क्रिया के लिए भूतकाल “गया था” का प्रयोग करें।',
    es: 'कल पूरी हुई क्रिया के लिए “ir” का भूतकाल “fui” प्रयोग करें।',
  },
  es: {
    en: 'Para una acción terminada ayer, usa “went” y “bought”. Di “some bread”, no “a bread”.',
    hi: 'Usa la forma de pasado “गया था” para una acción terminada ayer.',
    es: 'Usa “fui”, el pasado de “ir”, para una acción terminada ayer.',
  },
};
const responses: Record<MockLanguage, string> = {
  en: 'That sounds like a lovely outing. What else did you see at the market?',
  hi: 'बाजार जाना अच्छा लगा होगा। वहाँ आपने और क्या देखा?',
  es: '¡Qué buena salida! ¿Qué más viste en el mercado?',
};
const corrected: Record<MockLanguage, string> = {
  en: 'Yesterday I went to the market. I bought some bread.',
  hi: 'मैं कल बाजार गया था।',
  es: 'Ayer fui al mercado.',
};
const fallback: Record<MockLanguage, string> = {
  en: 'This is a scripted demo. Your sentence was saved, but it was not analyzed. Try the sample sentence for curated feedback.',
  hi: 'यह एक स्क्रिप्टेड डेमो है। आपका वाक्य सहेजा गया है, लेकिन उसका विश्लेषण नहीं हुआ। प्रतिक्रिया देखने के लिए नमूना वाक्य आज़माएँ।',
  es: 'Esta es una demostración con guion. Tu frase se guardó, pero no se analizó. Prueba la frase de ejemplo para ver las correcciones.',
};
const englishDetails: Record<MockLanguage, [string, string, string]> = {
  en: ['Use “went” for the completed action yesterday.',
    '“Bought” is the past tense of “buy”; “buyed” is not a word.',
    'Bread is uncountable here. Use “some bread”, or “a loaf of bread”.'],
  hi: ['कल पूरी हुई क्रिया के लिए “went” का प्रयोग करें।',
    '“Buy” का भूतकाल “bought” है; “buyed” सही शब्द नहीं है।',
    'यहाँ “bread” अगणनीय है। “some bread” या “a loaf of bread” कहें।'],
  es: ['Usa “went” para la acción terminada ayer.',
    'El pasado de “buy” es “bought”; “buyed” no es una palabra.',
    'Aquí “bread” es incontable. Usa “some bread” o “a loaf of bread”.'],
};

/** No network, microphone, speech recognition, or general-purpose AI is used. */
export class MockTutorProvider implements TutorProvider {
  constructor(private readonly latencyMs = 650) {}
  async reply(text: string, p: Preferences, fail = false): Promise<TutorReply> {
    const input = validateInput(text);
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    if (fail) throw new Error('Simulated service failure. Your draft is safe. Tap Retry to try again.');
    const target = toMockLanguage(p.target);
    const native = toMockLanguage(p.native);
    const analyzed = hasMockScript(p.target) && input === SAMPLE_INPUTS[target];
    return {
      response: analyzed ? responses[target] : fallback[native],
      corrections: !analyzed ? [] : target === 'en' ? [
        { category: 'grammar', corrected: 'Yesterday I went to the market.', explanation: englishDetails[native][0] },
        { category: 'vocabulary', corrected: 'I bought some bread.', explanation: englishDetails[native][1] },
        { category: 'sentence', corrected: corrected.en, explanation: englishDetails[native][2] },
      ] : [{ category: 'grammar', corrected: corrected[target], explanation: explanations[native][target] }],
      analyzed, provider: 'mock-v1',
    };
  }
}
