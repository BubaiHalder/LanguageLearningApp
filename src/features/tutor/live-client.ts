import { transcriptionEndpoint, parseTranscription } from './audio/upload-contract';
import { LANGUAGES, validateInput, type Correction, type Language, type Preferences, type Turn, type TutorProvider, type TutorReply } from './types';

export interface TutorVoice { id: string; language: Language; gender: 'male' | 'female' | 'unspecified'; label: string }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid AI service response.');
  return value as Record<string, unknown>;
}
function field(value: unknown, limit = 2000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error('Invalid AI service text.');
  return value.trim();
}
export function parseFeedback(value: unknown): TutorReply {
  const data = record(value);
  if (data.mode !== 'live' || data.provider !== 'ollama') throw new Error('The backend is not in live AI mode. Mock responses were not saved as real AI.');
  if (!Array.isArray(data.corrections) || data.corrections.length > 10) throw new Error('Invalid AI corrections.');
  const corrections: Correction[] = data.corrections.map((item: unknown) => {
    const c = record(item);
    if (c.category !== 'grammar' && c.category !== 'vocabulary' && c.category !== 'sentence') throw new Error('Invalid correction category.');
    return { category: c.category, original: field(c.original), corrected: field(c.corrected), explanation: field(c.explanation, 1000) };
  });
  return { response: field(data.response), correctedSentence: field(data.correctedSentence),
    explanation: field(data.explanation, 1000), corrections, analyzed: true, provider: 'local-v1' };
}

/** Runtime user access credential only. No worker secret, token persistence or automatic POST retries. */
export class LiveTutorClient implements TutorProvider {
  private origin = '';
  private token = '';
  private requests = new Set<AbortController>();
  constructor(private readonly transport: typeof globalThis.fetch = globalThis.fetch,
    private readonly configuredOrigin?: string, private readonly development = false, private readonly timeoutMs = 130000) {}
  configure(origin: string, token: string) {
    const endpoint = transcriptionEndpoint(origin, this.configuredOrigin, this.development);
    if (!token.trim()) throw new Error('Enter your device access token, not the internal service token.');
    this.cancel();
    this.origin = endpoint.replace('/v1/audio/transcriptions', '');
    this.token = token.trim();
  }
  cancel() { this.requests.forEach((request) => request.abort()); this.requests.clear(); }
  disconnect() { this.cancel(); this.origin = ''; this.token = ''; }
  private async request(path: string, body?: object | FormData, signal?: AbortSignal, audio = false) {
    if (!this.origin || !this.token) throw new Error('Connect to your backend with a device access token first.');
    const abort = new AbortController();
    const cancel = () => abort.abort();
    signal?.addEventListener('abort', cancel);
    this.requests.add(abort);
    const timer = setTimeout(cancel, this.timeoutMs);
    try {
      if (signal?.aborted) throw new Error('Request cancelled.');
      const multipart = body instanceof FormData;
      const response = await this.transport(this.origin + path, { method: body ? 'POST' : 'GET',
        signal: abort.signal, redirect: 'error', headers: { Authorization: `Bearer ${this.token}`,
          ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? multipart ? body : JSON.stringify(body) : undefined });
      if (!response.ok) {
        const message: Record<number, string> = { 401: 'Access token expired or invalid. Reconnect.', 403: 'Your access token lacks permission.',
          413: 'Recording is too large. Record a shorter clip.', 422: 'Audio was unclear or the request was invalid. Try again.',
          429: 'Local AI is busy. Wait and retry.', 502: 'The model returned invalid feedback. Retry this turn.',
          503: 'A local model or service is unavailable.', 504: 'Local AI timed out. Wait before retrying.' };
        throw new Error(message[response.status] ?? `AI request failed (HTTP ${response.status}).`);
      }
      const limit = audio ? 10 * 1024 * 1024 : 65536;
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (Number(response.headers.get('content-length')) > limit) throw new Error('AI response exceeds the size limit.');
      const reader = response.body?.getReader();
      if (reader) {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > limit) { await reader.cancel(); throw new Error('AI response exceeds the size limit.'); }
          chunks.push(part.value);
        }
      } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > limit) throw new Error('AI response exceeds the size limit.');
        size = bytes.length; chunks.push(bytes);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (audio) {
        if (response.headers.get('x-ai-mode') !== 'live' || !response.headers.get('content-type')?.startsWith('audio/wav') ||
          new TextDecoder().decode(bytes.slice(0, 4)) !== 'RIFF' || new TextDecoder().decode(bytes.slice(8, 12)) !== 'WAVE') {
          throw new Error('The backend did not return real live WAV speech.');
        }
        return bytes;
      }
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch (error) {
      if (abort.signal.aborted) throw new Error('Request cancelled or timed out. Your saved history is unchanged.');
      if (error instanceof TypeError) throw new Error('Cannot reach your backend. Check Wi-Fi, server URL and services.');
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); this.requests.delete(abort); }
  }
  async transcribe(body: FormData, signal?: AbortSignal): Promise<string> {
    const result = record(await this.request('/v1/audio/transcriptions', body, signal));
    if (result.provider !== 'faster-whisper') throw new Error('Whisper is not running in live mode.');
    return parseTranscription(result);
  }
  async reply(text: string, p: Preferences, _fail = false, turns: Turn[] = []): Promise<TutorReply> {
    const context = turns.slice(-6).flatMap((turn) => [{ role: 'user', content: turn.input }, { role: 'assistant', content: turn.response }]);
    return parseFeedback(await this.request('/v1/tutor/respond', { text: validateInput(text), nativeLanguage: p.native,
      targetLanguage: p.target, proficiency: 'A1', correctionMode: p.correctionMode, context }));
  }
  async voices(signal?: AbortSignal): Promise<TutorVoice[]> {
    const data = record(await this.request('/v1/voices', undefined, signal));
    if (data.mode !== 'live' || !Array.isArray(data.voices)) throw new Error('The backend voice catalog is not live.');
    return data.voices.map((item: unknown) => {
      const v = record(item);
      if (!LANGUAGES.some((l) => l.code === v.language) || !['male', 'female', 'unspecified'].includes(String(v.gender))) throw new Error('Invalid voice catalog.');
      const id = field(v.id, 100);
      if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Invalid voice ID.');
      return { id, label: field(v.label, 200), language: v.language as Language, gender: v.gender as TutorVoice['gender'] };
    });
  }
  async speech(text: string, language: Language, voiceId: string, signal?: AbortSignal): Promise<Uint8Array> {
    const result = await this.request('/v1/audio/speech', { text: validateInput(text), language, voiceId }, signal, true);
    if (!(result instanceof Uint8Array)) throw new Error('Invalid speech output.');
    return result;
  }
}
