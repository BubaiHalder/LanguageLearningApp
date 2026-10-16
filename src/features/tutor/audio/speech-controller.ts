import type { LiveTutorClient, TutorVoice } from '../live-client';
import type { Preferences } from '../types';

interface SpeechDevice {
  write(bytes: Uint8Array): Promise<string>;
  play(uri: string, isCurrent: () => boolean): Promise<void>;
  pause(): void;
  remove(uri: string): Promise<void>;
}
interface SpeechState { voices: TutorVoice[]; selected: string; busy: boolean; playing: boolean; error: string | null }
export class SpeechController {
  private state: SpeechState = { voices: [], selected: '', busy: false, playing: false, error: null };
  private listeners = new Set<() => void>();
  private revision = 0;
  private abort: AbortController | null = null;
  private uri: string | null = null;
  constructor(private readonly client: Pick<LiveTutorClient, 'voices' | 'speech'>, private readonly device: SpeechDevice) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<SpeechState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((listener) => listener()); }
  select(id: string) { if (!this.state.busy && this.state.voices.some((voice) => voice.id === id)) this.update({ selected: id }); }
  stop() {
    this.revision++; this.abort?.abort(); this.abort = null;
    try { this.device.pause(); } catch { /* The native hook may already be released on unmount. */ }
    const uri = this.uri; this.uri = null;
    if (uri) void this.device.remove(uri).catch(() => {});
    this.update({ busy: false, playing: false });
  }
  finished() { this.update({ playing: false }); }
  playbackError() { this.stop(); this.update({ error: 'Audio playback failed. Tap Replay tutor to try again. Your text is saved.' }); }
  async speak(text: string, preferences: Preferences) {
    this.stop();
    const revision = this.revision;
    const abort = new AbortController(); this.abort = abort;
    this.update({ busy: true, error: null });
    let uri: string | null = null;
    try {
      const voices = (await this.client.voices(abort.signal)).filter((voice) => voice.language === preferences.target);
      if (revision !== this.revision) return;
      const selected = voices.find((voice) => voice.id === this.state.selected && voice.gender === preferences.persona) ??
        voices.find((voice) => voice.gender === preferences.persona);
      this.update({ voices, selected: selected?.id ?? '' });
      if (!selected) throw new Error(`No installed ${preferences.persona} voice for ${preferences.target}. Text conversation is available; no substitute voice was used.`);
      const bytes = await this.client.speech(text, preferences.target, selected.id, abort.signal);
      if (revision !== this.revision) return;
      uri = await this.device.write(bytes);
      if (revision !== this.revision) { await this.device.remove(uri); return; }
      this.uri = uri;
      await this.device.play(uri, () => revision === this.revision);
      if (revision !== this.revision) return;
      this.update({ busy: false, playing: true });
    } catch (error) {
      if (revision === this.revision) {
        this.stop();
        this.update({ error: error instanceof Error ? error.message : 'Speech generation failed. Retry playback; your text is saved.' });
      }
    } finally { if (revision === this.revision) { this.abort = null; this.update({ busy: false }); } }
  }
}
