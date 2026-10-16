import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { File } from 'expo-file-system';
import { SymbolView } from 'expo-symbols';
import { fetch } from 'expo/fetch';
import { AudioController } from './audio-controller';
import { parseTranscription, transcriptionEndpoint } from './upload-contract';
import type { LiveAudioProps } from '../live-panel-props';
import { audioPresentation } from '../tutor-presentation';
import { ActivityPulse, StudioButton, StudioText, studioLayout, useStudioTheme } from '../../../ui/studio';

function createCredentialStore() {
  let token = '';
  return { read: () => token, write: (value: string) => { token = value; } };
}

export default function LocalAudioPanel({ preferences, client, disabled = false, onTranscript, onRecordStart,
  presentation = 'lab', onPhaseChange, onErrorChange, inactiveMessage }: LiveAudioProps) {
  const theme = useStudioTheme();
  const isDark = useColorScheme() === 'dark';
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, directory: 'cache' });
  const recorderState = useAudioRecorderState(recorder, 200);
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const [baseUrl, setBaseUrl] = useState(process.env.EXPO_PUBLIC_API_BASE_URL ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [credential] = useState(createCredentialStore);
  const [controller] = useState(() => new AudioController({
    permission: () => AudioModule.requestRecordingPermissionsAsync(),
    start: async () => {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: 60 });
      return recorder.uri;
    },
    stop: async () => {
      const status = recorder.getStatus();
      if (status.isRecording || status.canRecord) await recorder.stop();
      return { uri: recorder.uri, durationMs: status.durationMillis };
    },
    play: async (uri) => {
      const file = new File(uri);
      if (!file.exists) throw new Error('This temporary recording is no longer available. Please record again.');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false });
      player.replace({ uri });
      player.play();
    },
    pause: () => player.pause(),
    remove: async (uri) => { const file = new File(uri); if (file.exists) file.delete(); },
    deactivate: () => setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false }),
    upload: async (clip, url, signal) => {
      const file = new File(clip.uri);
      if (!file.exists || file.size === 0) throw new Error('Recording file is missing or empty. Please record again.');
      if (file.size > 10 * 1024 * 1024) throw new Error('Recording exceeds the 10 MB upload limit. Record a shorter clip.');
      const body = new FormData();
      body.append('audio', file, 'recording.m4a');
      body.append('nativeLanguage', clip.preferences.native);
      body.append('targetLanguage', clip.preferences.target);
      body.append('durationMs', String(clip.durationMs));
      if (client) return client.transcribe(body, signal);
      const endpoint = transcriptionEndpoint(url, process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__);
      const token = credential.read().trim();
      if (!token) throw new Error('Enter your client access token. Never enter an internal AI service credential.');
      const deadline = new AbortController();
      const cancel = () => deadline.abort();
      signal.addEventListener('abort', cancel);
      const timer = setTimeout(cancel, 130000);
      try {
        if (signal.aborted) throw new Error('Upload cancelled.');
        const response = await fetch(endpoint, { method: 'POST', body, signal: deadline.signal, redirect: 'error', headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error(`Transcription backend returned HTTP ${response.status}. Check that Stage B2 is running.`);
        // The service contract bounds transcripts; reject oversized response bodies as well.
        const json = await response.text();
        if (json.length > 32768) throw new Error('Transcription response exceeded the expected size.');
        return parseTranscription(JSON.parse(json));
      } catch (error) {
        if (signal.aborted) throw new Error('Upload cancelled.');
        if (deadline.signal.aborted) throw new Error('Upload timed out after 130 seconds. Check your PC backend and Wi-Fi.');
        if (error instanceof Error && error.message.startsWith('Transcription')) throw error;
        throw new Error('Cannot reach the local backend or read its response. Check the LAN URL, Wi-Fi, TLS certificate and Stage B2 service.');
      } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
    },
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const contextKey = `${preferences.native}/${preferences.target}/${preferences.persona}/${preferences.correctionMode}`;
  useEffect(() => {
    const recording = recorder.addListener('recordingStatusUpdate', (status) => {
      if (status.hasError || status.mediaServicesDidReset) controller.interrupted('Recording was interrupted. Please record again.');
      else if (status.isFinished) void controller.stop();
    });
    const playback = player.addListener('playbackStatusUpdate', (status) => {
      if (status.error) controller.playbackError();
      else if (status.didJustFinish) controller.playbackFinished();
    });
    const app = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void controller.cancel();
    });
    return () => { recording.remove(); playback.remove(); app.remove(); controller.dispose(); };
  }, [controller, recorder, player]);
  useEffect(() => { controller.progress(recorderState.durationMillis); }, [controller, recorderState.durationMillis]);
  useEffect(() => { return () => { void controller.cancel(); }; }, [controller, contextKey]);
  useEffect(() => { onPhaseChange?.(state.phase); }, [state.phase, onPhaseChange]);
  useEffect(() => { onErrorChange?.(state.error); }, [state.error, onErrorChange]);
  const busy = disabled || ['requesting', 'stopping', 'uploading'].includes(state.phase);
  const color = isDark ? '#F3F4FF' : '#1F253B';
  const button = (title: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled}
    accessibilityState={{ disabled }} onPress={action} style={[styles.button, { opacity: disabled ? 0.4 : 1 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
  function upload() {
    void (async () => {
      await controller.upload(baseUrl);
      const result = controller.getSnapshot();
      if (result.transcript && result.clip && onTranscript) await onTranscript(result.transcript, result.clip.preferences);
    })().catch(() => controller.interrupted('Could not send this turn. Retry from the conversation.'));
  }
  if (presentation === 'dock') {
    const display = audioPresentation(state.phase, disabled);
    const recording = state.phase === 'recording';
    return <View style={{ gap: 8 }} testID="voice-recording-dock">
      <View style={studioLayout.row}>
        <ActivityPulse active={display.active} color={recording ? theme.error : theme.primary} />
        <StudioText variant="label" accessibilityLiveRegion="polite" style={{ flex: 1 }}>{disabled && !display.active && inactiveMessage ? inactiveMessage : display.label}</StudioText>
        {(recording || state.clip) && <StudioText variant="caption" tone="muted">{(state.durationMs / 1000).toFixed(1)} / 60s</StudioText>}
      </View>
      <View style={[studioLayout.row, { justifyContent: 'center' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={recording ? 'Stop recording' : 'Record your voice'}
          accessibilityState={{ disabled: !display.canStop && !display.canRecord }} disabled={!display.canStop && !display.canRecord}
          onPress={() => { if (recording) void controller.stop(); else { onRecordStart?.(); void controller.start(preferences); } }}
          style={({ pressed }) => [{ minHeight: 76, minWidth: 104, maxWidth: 156, padding: 10, borderRadius: 28,
            alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 2, borderBottomWidth: pressed ? 2 : 6,
            borderColor: recording ? theme.error : theme.accentEdge, backgroundColor: recording ? theme.errorSurface : theme.accent,
            opacity: !display.canStop && !display.canRecord ? 0.5 : 1, transform: [{ translateY: pressed ? 3 : 0 }] }]}>
          <SymbolView name={recording ? { ios: 'stop.fill', android: 'stop', web: 'stop' } : { ios: 'mic.fill', android: 'mic', web: 'mic' }}
            size={30} tintColor={recording ? theme.error : theme.onAccent} />
          <StudioText variant="label" style={{ color: recording ? theme.error : theme.onAccent, textAlign: 'center' }}>
            {recording ? 'Stop' : state.clip ? 'Record again' : 'Tap to speak'}
          </StudioText>
        </Pressable>
        {state.clip && <StudioButton title="Send recording" variant="primary" disabled={!display.canSend} onPress={upload} />}
      </View>
      {state.phase !== 'idle' && <View style={[studioLayout.row, { justifyContent: 'center' }]}>
        {state.clip && <StudioButton title={state.phase === 'playing' ? 'Pause replay' : 'Replay my voice'} variant="quiet"
          disabled={!display.canReplay} onPress={() => { onRecordStart?.(); if (state.phase === 'playing') controller.pause(); else void controller.play(); }} />}
        <StudioButton title={state.phase === 'uploading' ? 'Cancel upload' : 'Discard recording'} variant="quiet"
          disabled={!display.canDiscard} onPress={() => { void controller.cancel(); }} />
      </View>}
      {state.needsSettings && <StudioButton title="Enable microphone in phone settings" onPress={() => {
        void Linking.openSettings().catch(() => controller.interrupted('Open your phone settings manually to enable microphone access.'));
      }} />}
    </View>;
  }
  return <View style={[styles.panel, { backgroundColor: isDark ? '#1C2033' : '#FFFFFF' }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color }]}>{client ? 'Speak to your tutor' : 'Real microphone · B1 lab'}</Text>
    <Text style={{ color }}>{client ? 'Record, stop, then Send recording. Your audio goes to your configured backend for recognition and a tutor reply.' : 'Record and replay your own voice. Upload to your configured local backend for transcription. Tutor conversation above still uses the Phase A mock service.'}</Text>
    <Text accessibilityLiveRegion="polite" style={{ color }}>{state.phase} · {(state.durationMs / 1000).toFixed(1)}s / 60s</Text>
    {busy && <ActivityIndicator accessibilityLabel="Audio operation in progress" />}
    <View style={styles.row}>
      {button('Record', () => { onRecordStart?.(); void controller.start(preferences); }, busy || !['idle', 'ready'].includes(state.phase))}
      {button('Stop recording', () => { void controller.stop(); }, state.phase !== 'recording')}
      {button(state.phase === 'playing' ? 'Pause replay' : 'Replay my voice', () => { if (state.phase === 'playing') controller.pause(); else void controller.play(); }, busy || !['ready', 'playing'].includes(state.phase))}
      {button('Cancel & discard', () => { void controller.cancel(); }, state.phase === 'idle')}
    </View>
    {state.error && <Text accessibilityRole="alert" style={{ color: isDark ? '#FFADB8' : '#A5223B' }}>{state.error}</Text>}
    {state.needsSettings && button('Open system settings', () => { void Linking.openSettings().catch(() => controller.interrupted('Open your phone settings manually to enable microphone access.')); })}
    {!client && <><Text style={{ color }}>Optional upload test · requires Stage B2 backend. Only tap Upload if you consent to sending this recording to your PC.</Text>
    <TextInput accessibilityLabel="Local backend LAN origin" autoCapitalize="none" autoCorrect={false} keyboardType="url"
      placeholder="http://192.168.1.49:3000" placeholderTextColor={isDark ? '#B5BDD0' : '#626B80'} value={baseUrl} onChangeText={setBaseUrl}
      editable={!busy && __DEV__} style={[styles.input, { color }]} />
    <TextInput accessibilityLabel="Client access token" secureTextEntry autoCapitalize="none" autoCorrect={false}
      placeholder="Client access token (kept in memory only)" placeholderTextColor={isDark ? '#B5BDD0' : '#626B80'}
      value={accessToken} onChangeText={(value) => { setAccessToken(value); credential.write(value); }}
      editable={!busy} style={[styles.input, { color }]} /></>}
    {button(client ? 'Send recording' : 'Upload to my PC', upload, busy || state.phase !== 'ready' || (!client && !baseUrl.trim()))}
    {state.transcript && <Text selectable style={{ color }}>Transcription: {state.transcript}</Text>}
    <Text style={{ color }}>Temporary recordings are discarded on cancel, replacement, language changes or backgrounding. {client ? 'Recognized text and AI feedback are saved locally; recordings are not saved in history.' : 'Audio is not added to conversation history in B1.'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  panel: { padding: 20, gap: 14, borderRadius: 22, borderWidth: 1, borderColor: '#8A83C9' },
  heading: { fontSize: 18, fontWeight: '700' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { padding: 12, minHeight: 46, backgroundColor: '#5146C7', borderRadius: 12, justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' }, input: { borderWidth: 1, borderColor: '#8A83C9', borderRadius: 12, minHeight: 46, padding: 12 },
});
