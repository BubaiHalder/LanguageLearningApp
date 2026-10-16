import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import { openTutorRepository } from '../../data/open-tutor-repository';
import { TokenStore } from './token-store';
import { StudioButton, StudioCard, StudioInput, StudioPanel, StudioText, StatusBadge, studioLayout, useStudioTheme } from '../../ui/studio';
import { space } from '../../ui/tokens';
import { TutorController } from './tutor-controller';
import { LiveTutorClient, type TutorVoice } from './live-client';
import { LANGUAGES, canRecognizeSpeech, isFullTutorLanguage, type Preferences, type Turn } from './types';
import { ConversationExchange } from './conversation-exchange';
import LocalAudioPanel from './audio/local-audio-panel';
import TutorSpeech from './audio/tutor-speech';
import type { AudioPhase } from './audio/audio-controller';
import { PracticeBuddy } from './practice-buddy';
import { ProcessingStatus, type ProcessingStage } from './processing-status';

const languageName = (code: string) => LANGUAGES.find((language) => language.code === code)?.label ?? code;
export default function LiveTutorScreen({ onMock, learnerName, onEditProfile }:
  { onMock: () => void; learnerName?: string; onEditProfile?: () => void }) {
  const t = useStudioTheme();
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 720 || fontScale > 1.3;
  // The test APK sets EXPO_PUBLIC_ALLOW_LAN_HTTP=1 at build time to reach the owner's PC on a private network.
  const [client] = useState(() => new LiveTutorClient(fetch, process.env.EXPO_PUBLIC_API_BASE_URL,
    __DEV__ || process.env.EXPO_PUBLIC_ALLOW_LAN_HTTP === '1'));
  const [controller] = useState(() => new TutorController(openTutorRepository, client, 'live'));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [origin, setOrigin] = useState(process.env.EXPO_PUBLIC_API_BASE_URL ?? '');
  const [token, setToken] = useState('');
  const [tokenStore] = useState(() => new TokenStore(SecureStore));
  const [tokenSaved, setTokenSaved] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [voices, setVoices] = useState<TutorVoice[]>([]);
  const [draft, setDraft] = useState('');
  const [pendingInput, setPendingInput] = useState<string | null>(null);
  const [autoId, setAutoId] = useState<string | null>(null);
  const [playbackId, setPlaybackId] = useState<string | null>(null);
  const [playRequest, setPlayRequest] = useState(0);
  const [stopKey, setStopKey] = useState(0);
  const [connectionKey, setConnectionKey] = useState(0);
  const [history, setHistory] = useState(false);
  const [panel, setPanel] = useState<'connection' | 'preferences' | 'text' | null>(null);
  const [audioPhase, setAudioPhase] = useState<AudioPhase>('idle');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [speechActivity, setSpeechActivity] = useState({ busy: false, playing: false, error: null as string | null });
  const list = useRef<FlatList<Turn>>(null);
  const nearEnd = useRef(true);
  const ended = state.session?.endedAt != null;
  const inputActive = !ended && !['idle', 'ready'].includes(audioPhase);
  const occupied = inputActive || state.busy || speechActivity.busy || speechActivity.playing;
  const latest = state.turns.at(-1) ?? null;
  const playbackTurn = state.turns.find((turn) => turn.id === playbackId) ?? latest;
  const speechInput = canRecognizeSpeech(state.preferences.native, state.preferences.target);
  const experimental = !isFullTutorLanguage(state.preferences.native) || !isFullTutorLanguage(state.preferences.target);
  const voiceAvailable = voices.some((voice) => voice.language === state.preferences.target && voice.gender === state.preferences.persona);
  useEffect(() => {
    void controller.initialize();
    const app = AppState.addEventListener('change', (status) => { if (status !== 'active') { client.cancel(); setAutoId(null); } });
    return () => { app.remove(); client.disconnect(); };
  }, [controller, client]);
  useEffect(() => {
    let active = true;
    void (async () => {
      // Temporary owner decision: a built-in development token connects every learner automatically.
      const builtIn = process.env.EXPO_PUBLIC_DEV_ACCESS_TOKEN ?? '';
      const saved = builtIn || await tokenStore.load();
      const address = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
      if (!saved || !address || !active) return;
      setToken(saved); setTokenSaved(!builtIn);
      try {
        client.configure(address, saved);
        const available = await client.voices();
        if (!active) return;
        setVoices(available); setConnected(true); setConnectionKey((key) => key + 1);
      } catch { if (active) setConnectionError('Saved token could not connect. Open Settings to reconnect.'); }
    })();
    return () => { active = false; };
  }, [client, tokenStore]);
  const stopAudio = useCallback(() => { setAutoId(null); setStopKey((key) => key + 1); }, []);
  const listen = useCallback((turn: Turn) => {
    setStopKey((key) => key + 1); setPlaybackId(turn.id); setAutoId(turn.id); setPlayRequest((key) => key + 1);
  }, []);
  async function connect() {
    setConnecting(true); setConnectionError(null); stopAudio();
    try {
      client.configure(origin, token);
      const available = await client.voices();
      setVoices(available); setConnected(true); setConnectionKey((key) => key + 1); setPanel(null);
      setTokenSaved(await tokenStore.save(token));
    } catch (error) { setConnected(false); setConnectionError(error instanceof Error ? error.message : 'Connection failed.'); }
    finally { setConnecting(false); }
  }
  async function send(text: string, snapshot = state.preferences) {
    if (controller.getSnapshot().busy || !connected || !state.ready) return;
    if (Object.keys(snapshot).some((key) => snapshot[key as keyof Preferences] !== state.preferences[key as keyof Preferences])) {
      setConnectionError('Languages changed after recording. Record again in the current conversation.'); return;
    }
    setConnectionError(null);
    stopAudio(); setPanel(null); nearEnd.current = true;
    const previousId = controller.getSnapshot().turns.at(-1)?.id;
    setPendingInput(text);
    try { await controller.send(text); }
    finally { setPendingInput(null); }
    const result = controller.getSnapshot(); const reply = result.turns.at(-1);
    if (!result.error && reply && reply.id !== previousId) { setDraft(''); listen(reply); }
  }
  function change(preferences: Preferences) {
    stopAudio(); client.cancel(); setDraft(''); setPlaybackId(null);
    void controller.changePreferences(preferences);
  }
  function openPanel(value: 'connection' | 'preferences' | 'text') { stopAudio(); setPanel(value); }
  const renderTurn = useCallback(({ item }: { item: Turn }) => <ConversationExchange turn={item} session={state.session}
    onListen={listen} listenDisabled={!connected || state.busy || inputActive || panel !== null || speechActivity.busy} />,
  [state.session, connected, state.busy, inputActive, panel, speechActivity.busy, listen]);
  const error = state.error ?? connectionError ?? (ended ? null : audioError) ?? speechActivity.error;
  const processingStage: ProcessingStage | null = audioPhase === 'uploading' ? 'recognition'
    : state.busy && state.ready ? 'reply' : speechActivity.busy ? 'speech' : null;
  return <SafeAreaView edges={Platform.OS === 'ios' ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']}
    style={{ flex: 1, backgroundColor: t.background, paddingBottom: Platform.OS === 'ios' ? 50 : 0 }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={studioLayout.flex}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={studioLayout.row}>
            <PracticeBuddy small />
            <View style={{ flex: 1 }}><StudioText variant="heading" accessibilityRole="header">speak studio</StudioText>
              {!compact && state.turns.length === 0 && <StudioText variant="caption" tone="muted">{learnerName ? `Hi ${learnerName}. Small steps, real conversations.` : 'Small steps. Real conversations.'}</StudioText>}</View>
            <StudioButton title="Settings" variant="quiet" disabled={occupied} onPress={() => openPanel('connection')} />
          </View>
          <View style={studioLayout.row}>
            <StatusBadge label={!state.ready ? state.error ? 'History needs attention' : 'Opening history…' : connected ? 'Ready to practise' : 'Connection needed'}
              tone={!state.ready ? state.error ? 'error' : 'active' : connected ? 'success' : 'neutral'} />
            {!compact && (history || state.turns.length === 0) && <StudioText variant="caption" tone="muted">{history ? 'Saved on this device' : 'A little practice. More confidence.'}</StudioText>}
          </View>
          <View style={studioLayout.row}>
            <StudioButton title={`${languageName(state.preferences.native)} → ${languageName(state.preferences.target)}`} disabled={occupied || !state.ready}
              onPress={() => openPanel('preferences')} style={{ flexGrow: 1 }} />
            <StudioButton title={history ? 'Back to practice' : 'History'} disabled={occupied}
              onPress={() => { stopAudio(); setHistory((value) => !value); if (!history) void controller.refreshHistory(); }} />
          </View>
        </View>
        {history ? <FlatList data={state.history} keyExtractor={(session) => session.id} style={studioLayout.flex}
          contentContainerStyle={styles.messages} ListEmptyComponent={<StudioCard><StudioText variant="heading">Your story starts here</StudioText>
            <StudioText tone="muted">Saved Local AI conversations will appear here. Mock history is kept in mock mode.</StudioText></StudioCard>}
          renderItem={({ item }) => <StudioCard>
            <StudioText variant="heading">{languageName(item.target)} practice</StudioText>
            <StudioText tone="muted" variant="caption">{new Date(item.createdAt).toLocaleString()} · {item.turnCount} turns · {item.endedAt ? 'Completed' : 'In progress'}</StudioText>
            <StudioButton title={item.endedAt ? 'View conversation' : 'Resume conversation'} disabled={state.busy}
              onPress={() => { stopAudio(); client.cancel(); setPlaybackId(null); void controller.openSession(item).then(() => setHistory(false)); }} />
          </StudioCard>} ListFooterComponent={state.hasMoreHistory ? <StudioButton title="More history" onPress={() => { void controller.refreshHistory(true); }} /> : null} /> :
          <FlatList ref={list} data={state.turns} keyExtractor={(turn) => turn.id} renderItem={renderTurn} style={studioLayout.flex}
            keyboardShouldPersistTaps="handled" contentContainerStyle={styles.messages}
            onScroll={(event) => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              nearEnd.current = contentSize.height - layoutMeasurement.height - contentOffset.y < 120; }} scrollEventThrottle={100}
            onContentSizeChange={() => { if (nearEnd.current && (state.turns.length > 0 || processingStage !== null)) list.current?.scrollToEnd({ animated: false }); }}
            ListHeaderComponent={state.turns.length >= 50 ? <StudioButton title="Earlier turns" disabled={state.busy}
              onPress={() => { nearEnd.current = false; void controller.olderTurns(); }} /> : null}
            ListEmptyComponent={<StudioCard style={[styles.welcome, { backgroundColor: t.surfaceRaised }]}>
              <View style={styles.heroTop}>
                <View style={{ backgroundColor: t.highlight, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5 }}>
                  <StudioText variant="label" style={{ color: '#543707' }}>YOUR SPEAKING PRACTICE</StudioText>
                </View>
                <PracticeBuddy />
              </View>
              <StudioText variant="display" accessibilityRole="header">Speak a little. Grow a lot.</StudioText>
              <StudioText>Big confidence starts with one small conversation. Your tutor is here to help.</StudioText>
              <View style={{ borderRadius: 18, padding: space.md, gap: space.xs, backgroundColor: t.surface }}>
                <StudioText variant="label" tone="primary">A little inspiration</StudioText>
                <StudioText>“Let me tell you about my day.”</StudioText>
              </View>
              <StudioText variant="caption" tone="muted">{state.preferences.correctionMode === 'end'
                ? 'Speak freely. We’ll review your corrections at the end.'
                : 'Speak, get a helpful correction, and try again. You’ve got this.'}</StudioText>
              {!connected ? <StudioButton title="LET’S GET STARTED" variant="primary" onPress={() => openPanel('connection')} />
                : <StudioText variant="label" tone="primary">Tap the microphone below to begin.</StudioText>}
            </StudioCard>}
            ListFooterComponent={<View style={{ gap: space.md }}>
              {pendingInput && <StudioCard style={{ backgroundColor: t.surfaceRaised }}>
                <StudioText variant="label" tone="primary">You said</StudioText><StudioText selectable>{pendingInput}</StudioText>
              </StudioCard>}
              <ProcessingStatus stage={processingStage} />
              {state.notice && <StudioText variant="caption" tone="muted" accessibilityLiveRegion="polite">{state.notice}</StudioText>}
              {ended && <StudioCard><StudioText variant="heading">Conversation complete</StudioText>
                <StudioText>Review your saved corrections above, or start a fresh conversation.</StudioText></StudioCard>}
            </View>} />}
        {error && <View style={[styles.error, { backgroundColor: t.errorSurface }]}>
          <ScrollView style={{ maxHeight: height * 0.12 }}><StudioText accessibilityRole="alert" tone="error" variant="caption">{error}</StudioText></ScrollView>
          {state.error && <StudioButton title="Retry failed turn / save" disabled={state.busy} onPress={() => {
            stopAudio(); const previousId = controller.getSnapshot().turns.at(-1)?.id;
            void controller.retry().then(() => { const result = controller.getSnapshot(); const reply = result.turns.at(-1);
              if (!result.error && reply && reply.id !== previousId) listen(reply); });
          }} />}
        </View>}
        <View style={[styles.dock, { borderColor: t.divider, backgroundColor: t.surface }, history && { display: 'none' }]}>
          <View style={studioLayout.row}>
            {!compact && <StudioText variant="label" style={{ flex: 1 }}>{state.preferences.persona === 'female' ? 'Maya · Female' : 'Alex · Male'}</StudioText>}
            {!ended && <StudioButton title="Type" variant="quiet" disabled={!connected || state.busy || inputActive || speechActivity.busy}
              onPress={() => openPanel('text')} />}
            {!ended && <StudioButton title="End & review" variant="quiet" disabled={occupied || !state.ready || !state.session}
              onPress={() => { stopAudio(); void controller.finish(); }} />}
          </View>
          <ScrollView style={{ maxHeight: height * 0.18 }} keyboardShouldPersistTaps="handled">
          <TutorSpeech key={`${connectionKey}/${state.session?.id ?? 'new'}`} client={client} preferences={state.preferences} turn={playbackTurn}
            autoplay={playbackTurn?.id === autoId && !history} autoplayKey={playRequest} stopKey={stopKey} compact
            blocked={!connected || inputActive || state.busy || panel !== null || history} onActivityChange={setSpeechActivity} />
          </ScrollView>
          {state.busy && <View style={studioLayout.row}>
            <StudioButton title="Cancel request" variant="quiet" onPress={() => { client.cancel(); stopAudio(); }} /></View>}
          {ended ? <StudioButton title="New conversation" variant="primary" disabled={occupied || !state.ready}
            onPress={() => { stopAudio(); controller.newConversation(); setPlaybackId(null); setDraft(''); }} /> :
          <LocalAudioPanel key={`${connectionKey}/${state.session?.id ?? 'new'}`} preferences={state.preferences} client={client} presentation="dock"
            disabled={!connected || !speechInput || state.busy || !state.ready || ended || history || panel !== null || speechActivity.busy || speechActivity.playing}
            inactiveMessage={!state.ready ? 'Opening your history…' : !connected ? 'Connect in Settings to begin' : !speechInput ? 'Voice input is not available for this language pair yet. Tap Type to practise.' : ended ? 'Conversation complete' : state.busy ? 'Waiting for your tutor…' : speechActivity.busy || speechActivity.playing ? 'Stop tutor audio to record again' : undefined}
            onTranscript={send} onRecordStart={stopAudio} onPhaseChange={setAudioPhase} onErrorChange={setAudioError} />}
          {connected && !voiceAvailable && <StudioText variant="caption" tone="muted">No matching voice installed for this target. Text practice is available.</StudioText>}
        </View>
      </View>
    </KeyboardAvoidingView>
    <StudioPanel visible={panel === 'connection'} title="Connection & settings" onClose={() => setPanel(null)}>
      {learnerName && onEditProfile && <StudioCard><StudioText variant="heading">Your profile</StudioText>
        <StudioText tone="muted">{learnerName} · saved on this phone</StudioText>
        <StudioButton title="Edit profile" disabled={state.busy || connecting} onPress={() => { setPanel(null); onEditProfile(); }} />
      </StudioCard>}
      <StudioCard><StudioText variant="heading">Your local AI connection</StudioText>
        <StudioText tone="muted">{tokenSaved ? 'Your device token is saved in this phone’s secure storage. The app reconnects automatically.'
          : 'After a successful connect, your device token is saved in this phone’s secure storage so you only enter it once.'}</StudioText>
        <StudioInput label="Backend address" value={origin} autoCapitalize="none" autoCorrect={false} keyboardType="url"
          editable={__DEV__ && !connecting && !state.busy} placeholder="http://192.168.1.49:3000"
          onChangeText={(value) => { setOrigin(value); setConnected(false); client.disconnect(); stopAudio(); }} />
        <StudioInput label="Device access token" value={token} secureTextEntry autoCapitalize="none" autoCorrect={false}
          editable={!connecting && !state.busy} placeholder="Device token / production access JWT"
          onChangeText={(value) => { setToken(value); setConnected(false); client.disconnect(); stopAudio(); }} />
        {connectionError && <StudioText accessibilityRole="alert" tone="error">{connectionError}</StudioText>}
        <StudioButton title={connected ? 'Reconnect / refresh voices' : 'Connect'} variant="primary" busy={connecting} onPress={() => { void connect(); }} />
        {tokenSaved && <StudioButton title="Forget saved token" disabled={connecting || state.busy} onPress={() => {
          void tokenStore.clear().then((cleared) => {
            if (!cleared) { setConnectionError('Could not remove the saved token. Try again.'); return; }
            setTokenSaved(false); setToken(''); setConnected(false); client.disconnect(); stopAudio();
          });
        }} />}
      </StudioCard>
      <StudioCard><StudioText variant="heading">Available voices</StudioText>
        {voices.length ? voices.map((voice) => <StudioText key={voice.id} variant="caption">{voice.label} · {languageName(voice.language)} · {voice.gender}</StudioText>) :
          <StudioText tone="muted">Connect to discover installed voices. Unsupported voices are never substituted.</StudioText>}
        <StudioText variant="caption" tone="muted">Local AI currently uses A1 difficulty. Recognition of mixed speech may vary. No pronunciation score is calculated.</StudioText>
      </StudioCard>
      <StudioButton title="Switch to mock mode" disabled={state.busy || connecting} onPress={onMock} />
      <StudioButton title="Start a new conversation" disabled={state.busy || connecting || !state.ready} onPress={() => {
        stopAudio(); controller.newConversation(); setPlaybackId(null); setDraft(''); setConnectionKey((key) => key + 1); setPanel(null);
      }} />
    </StudioPanel>
    <StudioPanel visible={panel === 'preferences'} title="Make it your conversation" onClose={() => setPanel(null)}>
      <StudioText variant="label">I understand · explanation language</StudioText>
      <View style={studioLayout.row}>{LANGUAGES.map((language) => <StudioButton key={language.code} title={language.label} selected={state.preferences.native === language.code}
        disabled={!state.ready} onPress={() => change({ ...state.preferences, native: language.code })} />)}</View>
      <StudioText variant="label">I want to practise · target language</StudioText>
      <View style={studioLayout.row}>{LANGUAGES.map((language) => <StudioButton key={language.code} title={language.label} selected={state.preferences.target === language.code}
        disabled={!state.ready} onPress={() => change({ ...state.preferences, target: language.code })} />)}</View>
      <StudioText variant="label">Tutor voice preference</StudioText>
      <View style={studioLayout.row}>{(['female', 'male'] as const).map((persona) => <StudioButton key={persona} title={persona === 'female' ? 'Maya · Female' : 'Alex · Male'}
        selected={state.preferences.persona === persona} onPress={() => change({ ...state.preferences, persona })} disabled={!state.ready} />)}</View>
      <StudioText variant="label">Corrections</StudioText>
      <View style={studioLayout.row}>{(['immediate', 'end'] as const).map((correctionMode) => <StudioButton key={correctionMode}
        title={correctionMode === 'immediate' ? 'After each turn' : 'At the end'} selected={state.preferences.correctionMode === correctionMode}
        disabled={!state.ready} onPress={() => change({ ...state.preferences, correctionMode })} />)}</View>
      {experimental && <StudioText tone="primary">{speechInput
        ? 'Experimental pair: the tutor can hear you, but its replies may be weaker and it cannot speak this language yet. English, Hindi and Spanish are fully supported.'
        : 'Experimental pair: practise by typing. Voice input and spoken replies are not available for this pair yet. English, Hindi and Spanish are fully supported.'}</StudioText>}
      <StudioText tone="muted">Changing a preference starts a new conversation on your next turn. Your earlier sessions stay in History.</StudioText>
      {connected && !voiceAvailable && <StudioText tone="error">No matching voice is installed for this selection. Text conversation is available.</StudioText>}
    </StudioPanel>
    <StudioPanel visible={panel === 'text'} title="Your next sentence" onClose={() => setPanel(null)}>
      <StudioInput label="Message your tutor" value={draft} onChangeText={setDraft} multiline maxLength={2000} autoFocus
        placeholder="Tell your tutor about your day…" style={{ minHeight: 120 }} editable={!state.busy && connected} />
      <StudioButton title="Send message" variant="primary" disabled={!draft.trim() || !connected || state.busy || ended}
        onPress={() => { void send(draft); }} />
      <StudioText tone="muted">Your reply and feedback use the same tutor and correction preferences as speaking practice.</StudioText>
    </StudioPanel>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  messages: { padding: space.lg, gap: space.lg, flexGrow: 1 },
  welcome: { marginTop: space.sm, gap: space.lg },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  dock: { borderTopWidth: 2, paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.sm, gap: space.xs },
  error: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
});
