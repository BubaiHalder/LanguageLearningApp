import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, View } from 'react-native';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { SpeechController } from './speech-controller';
import type { LiveTutorClient } from '../live-client';
import type { Preferences, Turn } from '../types';
import { ActivityPulse, StudioButton, StudioPanel, StudioText, studioLayout } from '../../../ui/studio';

export interface TutorSpeechProps { client: LiveTutorClient; preferences: Preferences; turn: Turn | null; autoplay: boolean; stopKey: number;
  autoplayKey?: number; compact?: boolean; blocked?: boolean; onActivityChange?: (activity: { busy: boolean; playing: boolean; error: string | null }) => void }
export default function TutorSpeech({ client, preferences, turn, autoplay, stopKey, autoplayKey = 0, compact = false, blocked = false, onActivityChange }: TutorSpeechProps) {
  const [voiceOptions, setVoiceOptions] = useState(false);
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const [speech] = useState(() => new SpeechController(client, {
    write: async (bytes) => {
      const file = new File(Paths.cache, `tutor-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
      try { file.create({ intermediates: true }); file.write(bytes); return file.uri; }
      catch (error) { if (file.exists) file.delete(); throw error; }
    },
    play: async (uri, isCurrent) => {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false });
      if (!isCurrent()) return;
      player.replace({ uri }); player.play();
    },
    pause: () => player.pause(),
    remove: async (uri) => { const file = new File(uri); if (file.exists) file.delete(); },
  }));
  const state = useSyncExternalStore(speech.subscribe, speech.getSnapshot, speech.getSnapshot);
  useEffect(() => { onActivityChange?.({ busy: state.busy, playing: state.playing, error: state.error }); },
    [onActivityChange, state.busy, state.playing, state.error]);
  useEffect(() => {
    const playback = player.addListener('playbackStatusUpdate', (status) => {
      if (status.error) speech.playbackError(); else if (status.didJustFinish) speech.finished();
    });
    const app = AppState.addEventListener('change', (next) => { if (next !== 'active') speech.stop(); });
    return () => { playback.remove(); app.remove(); speech.stop(); };
  }, [player, speech]);
  useEffect(() => { speech.stop(); }, [speech, stopKey]);
  useEffect(() => {
    if (turn && autoplay) void speech.speak(turn.response, preferences);
    return () => speech.stop();
  }, [speech, turn, autoplay, preferences, autoplayKey]);
  const voiceButtons = state.voices.filter((voice) => voice.gender === preferences.persona).map((voice) =>
    <StudioButton key={voice.id} title={voice.label} selected={state.selected === voice.id} disabled={state.busy || blocked}
      onPress={() => speech.select(voice.id)} />);
  if (compact && !turn) return null;
  return <View style={{ gap: 10 }}>
    {(!compact || state.busy || state.playing || state.error) && <View style={studioLayout.row}>
      {(state.busy || state.playing) && <ActivityPulse active />}
      <StudioText variant="caption" tone="muted" accessibilityLiveRegion="polite">
        {state.busy ? 'Preparing tutor audio…' : state.playing ? 'Tutor is speaking' : state.error ? 'Text saved · speech needs attention' : 'Listen to your tutor'}
      </StudioText>
    </View>}
    {state.error && !compact && <StudioText accessibilityRole="alert" tone="error">{state.error}</StudioText>}
    {!compact && voiceButtons}
    <View style={studioLayout.row}>
      {(state.busy || state.playing) && <StudioButton title="Stop tutor audio" variant="danger" onPress={() => speech.stop()} />}
      {turn && <StudioButton title={state.error ? 'Retry tutor speech' : 'Replay tutor'} disabled={blocked || state.busy}
        onPress={() => { void speech.speak(turn.response, preferences); }} />}
      {compact && <StudioButton title={state.error ? 'Speech details' : 'Voices'} variant="quiet" disabled={blocked || state.busy}
        onPress={() => { speech.stop(); setVoiceOptions(true); }} />}
    </View>
    <StudioPanel visible={voiceOptions} title="Tutor speech" onClose={() => setVoiceOptions(false)}>
      <StudioText tone="muted">Only installed voices matching your language and voice preference appear here. Select a voice, close this panel and tap Replay tutor.</StudioText>
      {state.error && <StudioText accessibilityRole="alert" tone="error">{state.error}</StudioText>}
      {voiceButtons}
      {voiceButtons.length === 0 && <StudioText>No matching voice is available. Your text conversation is still saved.</StudioText>}
    </StudioPanel>
  </View>;
}
