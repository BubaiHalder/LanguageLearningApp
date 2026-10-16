import type { Preferences } from '../types';

export type AudioPhase = 'idle' | 'requesting' | 'recording' | 'stopping' | 'ready' | 'playing' | 'uploading';
export interface Clip { uri: string; durationMs: number; preferences: Preferences }
export interface AudioState {
  phase: AudioPhase; clip: Clip | null; durationMs: number;
  error: string | null; needsSettings: boolean; transcript: string | null;
}
export interface AudioDevice {
  permission(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  start(): Promise<string | null | void>;
  stop(): Promise<{ uri: string | null; durationMs: number }>;
  play(uri: string): Promise<void>;
  pause(): void;
  remove(uri: string): Promise<void>;
  deactivate(): Promise<void>;
  upload(clip: Clip, baseUrl: string, signal: AbortSignal): Promise<string>;
}

/** Serializes native calls and invalidates late permission/upload results after cancellation. */
export class AudioController {
  private state: AudioState = { phase: 'idle', clip: null, durationMs: 0, error: null, needsSettings: false, transcript: null };
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;
  private recordingOwned = false;
  private activeUri: string | null = null;
  private preferences: Preferences | null = null;
  private abort: AbortController | null = null;
  constructor(private readonly device: AudioDevice) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<AudioState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private enqueue(action: () => Promise<void>): Promise<void> {
    const result = this.queue.then(action).catch(async (error: unknown) => {
      let stillRecording = false;
      if (this.recordingOwned) {
        try {
          const partial = await this.device.stop();
          this.recordingOwned = false;
          if (partial.uri) await this.device.remove(partial.uri);
          await this.device.deactivate();
        } catch { stillRecording = this.recordingOwned; }
      }
      this.update({ phase: stillRecording ? 'stopping' : this.state.clip ? 'ready' : 'idle',
        error: error instanceof Error ? error.message : 'Audio operation failed. Please retry.' });
    });
    this.queue = result;
    return result;
  }
  start(preferences: Preferences): Promise<void> {
    if (!['idle', 'ready'].includes(this.state.phase)) return Promise.resolve();
    const generation = ++this.generation;
    this.update({ phase: 'requesting', error: null, needsSettings: false, transcript: null });
    return this.enqueue(async () => {
      this.device.pause();
      if (this.state.clip) { await this.device.remove(this.state.clip.uri); this.update({ clip: null, durationMs: 0 }); }
      const permission = await this.device.permission();
      if (generation !== this.generation) return;
      if (!permission.granted) {
        this.update({ phase: 'idle', needsSettings: !permission.canAskAgain,
          error: permission.canAskAgain ? 'Microphone access was denied. Tap Record to try again, or keep using mock mode.' : 'Microphone access is blocked. Enable it in system settings, then tap Record.' });
        return;
      }
      this.preferences = { ...preferences };
      this.recordingOwned = true;
      try { this.activeUri = (await this.device.start()) ?? null; }
      catch (error) {
        const partial = await this.device.stop();
        this.recordingOwned = false;
        if (partial.uri) await this.device.remove(partial.uri);
        await this.device.deactivate();
        throw error;
      }
      if (generation !== this.generation) return; // queued cancel owns cleanup
      this.update({ phase: 'recording', durationMs: 0 });
    });
  }
  progress(durationMs: number) {
    if (this.state.phase === 'recording') this.update({ durationMs: Math.max(0, durationMs) });
  }
  stop(): Promise<void> {
    if (this.state.phase !== 'recording') return Promise.resolve();
    const generation = this.generation;
    this.update({ phase: 'stopping' });
    return this.enqueue(async () => {
      const result = await this.device.stop();
      this.recordingOwned = false;
      await this.device.deactivate();
      if (generation !== this.generation) { if (result.uri) await this.device.remove(result.uri); return; }
      const durationMs = Math.max(result.durationMs, this.state.durationMs);
      if (!result.uri || durationMs < 300) {
        if (result.uri) await this.device.remove(result.uri);
        throw new Error('Recording was too short or no audio file was produced. Record at least one second and retry.');
      }
      if (!this.preferences) throw new Error('Recording context is missing. Please record again.');
      this.update({ phase: 'ready', durationMs, clip: { uri: result.uri, durationMs, preferences: this.preferences } });
    });
  }
  play(): Promise<void> {
    const clip = this.state.clip;
    if (!clip || this.state.phase !== 'ready') return Promise.resolve();
    const generation = this.generation;
    this.update({ phase: 'playing', error: null });
    return this.enqueue(async () => {
      await this.device.play(clip.uri);
      if (generation !== this.generation) this.device.pause();
    });
  }
  pause() {
    try { this.device.pause(); if (this.state.phase === 'playing') this.update({ phase: 'ready' }); }
    catch { this.update({ error: 'Unable to pause playback. Tap Cancel & discard to release audio.' }); }
  }
  playbackFinished() { if (this.state.phase === 'playing') this.update({ phase: 'ready' }); }
  playbackError() { this.update({ phase: this.state.clip ? 'ready' : 'idle', error: 'Audio playback failed. Retry replay, or record another clip.' }); }
  upload(baseUrl: string): Promise<void> {
    const clip = this.state.clip;
    if (!clip || this.state.phase !== 'ready') return Promise.resolve();
    const generation = this.generation;
    const abort = new AbortController();
    this.abort = abort;
    this.update({ phase: 'uploading', error: null, transcript: null });
    return this.enqueue(async () => {
      try {
        const transcript = await this.device.upload(clip, baseUrl, abort.signal);
        if (generation === this.generation) this.update({ phase: 'ready', transcript });
      } finally { if (this.abort === abort) this.abort = null; }
    });
  }
  cancel(): Promise<void> {
    ++this.generation;
    this.abort?.abort();
    this.update({ phase: 'stopping', error: null, transcript: null });
    return this.enqueue(async () => {
      this.device.pause();
      if (this.recordingOwned) {
        const result = await this.device.stop();
        this.recordingOwned = false;
        if (result.uri) await this.device.remove(result.uri);
      }
      if (this.state.clip) await this.device.remove(this.state.clip.uri);
      await this.device.deactivate();
      this.update({ phase: 'idle', clip: null, durationMs: 0 });
    });
  }
  interrupted(message: string) {
    void this.cancel().then(() => this.update({ error: message }));
  }
  /** Hooks may release native objects before async cleanup; file deletion must still run. */
  dispose(): void {
    const uri = this.state.clip?.uri ?? this.activeUri;
    void this.cancel().finally(async () => {
      if (uri) {
        try { await this.device.remove(uri); }
        catch { /* Cache cleanup is best effort after unmount; no transcript data is affected. */ }
      }
    });
  }
}
