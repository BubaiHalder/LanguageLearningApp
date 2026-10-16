import type { AudioPhase } from './audio/audio-controller';
export function audioPresentation(phase: AudioPhase, locked: boolean) {
  const labels: Record<AudioPhase, string> = { idle: 'Ready to speak', requesting: 'Requesting microphone access', recording: 'Recording your voice',
    stopping: 'Finishing recording', ready: 'Recording ready to send', playing: 'Replaying your recording', uploading: 'Recognizing your speech' };
  return { label: labels[phase], active: !['idle', 'ready'].includes(phase),
    canRecord: !locked && (phase === 'idle' || phase === 'ready'), canStop: phase === 'recording',
    canSend: !locked && phase === 'ready', canReplay: !locked && (phase === 'ready' || phase === 'playing'), canDiscard: phase !== 'idle' };
}
