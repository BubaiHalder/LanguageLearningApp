import type { Preferences } from './types';
import type { LiveTutorClient } from './live-client';
import type { AudioPhase } from './audio/audio-controller';
export interface LiveAudioProps {
  preferences: Preferences;
  client?: LiveTutorClient;
  disabled?: boolean;
  onTranscript?: (text: string, preferences: Preferences) => Promise<void>;
  onRecordStart?: () => void;
  presentation?: 'lab' | 'dock';
  onPhaseChange?: (phase: AudioPhase) => void;
  onErrorChange?: (error: string | null) => void;
  inactiveMessage?: string;
}
