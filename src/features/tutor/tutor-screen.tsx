import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, KeyboardAvoidingView, Platform,
  Pressable, StyleSheet, Switch, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openTutorRepository } from '@/data/open-tutor-repository';
import { TutorController } from './tutor-controller';
import LocalAudioPanel from './audio/local-audio-panel';
import LiveTutorScreen from './live-tutor-screen';
import { useLearner } from '../learning/learner-context';
import { LANGUAGES, type Preferences, type Session, visibleCorrections } from './types';
import { studioThemes } from '../../ui/tokens';

const palette = (t: typeof studioThemes.light | typeof studioThemes.dark) => ({ bg: t.background, card: t.surface, text: t.text, muted: t.muted,
  line: t.divider, soft: t.surfaceRaised, accent: t.primary, positive: t.success, error: t.error });
const light = palette(studioThemes.light);
const dark = palette(studioThemes.dark);
const label = (code: string) => LANGUAGES.find((language) => language.code === code)?.label ?? code;

function Button({ title, onPress, selected = false, disabled = false, primary = false }:
  { title: string; onPress: () => void; selected?: boolean; disabled?: boolean; primary?: boolean }) {
  const colors = useColorScheme() === 'dark' ? dark : light;
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button,
      { backgroundColor: primary ? '#5146C7' : selected ? colors.soft : colors.card,
        borderColor: selected || primary ? colors.accent : colors.line, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
    <Text style={[styles.buttonText, { color: primary ? '#FFFFFF' : selected ? colors.accent : colors.text }]}>{title}</Text>
  </Pressable>;
}

export default function TutorScreen() {
  const [live, setLive] = useState(true);
  const learner = useLearner();
  return live ? <LiveTutorScreen onMock={() => setLive(false)} learnerName={learner?.name} onEditProfile={learner?.editProfile} />
    : <MockTutorScreen onLive={() => setLive(true)} />;
}

function MockTutorScreen({ onLive }: { onLive: () => void }) {
  const colors = useColorScheme() === 'dark' ? dark : light;
  const [controller] = useState(() => new TutorController(openTutorRepository));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [draft, setDraft] = useState('');
  const [tab, setTab] = useState<'practice' | 'history'>('practice');
  const [sampleRecording, setSampleRecording] = useState(false);
  const [denyPermission, setDenyPermission] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [mockError, setMockError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const playbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingPersona = useRef(state.preferences.persona);
  useEffect(() => { void controller.initialize(); }, [controller]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') {
        setPlaying(null); setSampleRecording(false);
        if (playbackTimer.current) clearTimeout(playbackTimer.current);
      }
    });
    return () => { subscription.remove(); if (playbackTimer.current) clearTimeout(playbackTimer.current); };
  }, []);

  function resetSimulation() {
    setSampleRecording(false); setPlaying(null); setMockError(null);
    if (playbackTimer.current) clearTimeout(playbackTimer.current);
  }
  function changePreferences(value: Preferences) {
    resetSimulation();
    void controller.changePreferences(value);
  }
  const text = (value: string, muted = false) => <Text style={[styles.body, { color: muted ? colors.muted : colors.text }]}>{value}</Text>;
  const heading = (value: string) => <Text style={[styles.sectionTitle, { color: colors.text }]}>{value}</Text>;
  const panel = { backgroundColor: colors.card, borderColor: colors.line };
  const ended = state.session?.endedAt != null;
  function microphone() {
    if (denyPermission) {
      setMockError('Simulated microphone permission denied. Turn off “Deny mock permission” and retry, or type a sentence. No device permission was requested.');
      return;
    }
    setMockError(null);
    if (sampleRecording) { setDraft(controller.sample()); setSampleRecording(false); }
    else setSampleRecording(true);
  }
  function simulatePlayback(id: string) {
    if (playbackTimer.current) clearTimeout(playbackTimer.current);
    if (playing === id) { setPlaying(null); return; }
    playingPersona.current = state.preferences.persona;
    setPlaying(id);
    playbackTimer.current = setTimeout(() => setPlaying(null), 1600);
  }
  function removeSession(session: Session) {
    Alert.alert('Delete conversation?', 'This removes the transcript and corrections from this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void controller.deleteSession(session); } },
    ]);
  }

  const header = <View style={styles.header}>
    <Button title="Open Local AI speaking tutor" onPress={onLive} disabled={state.busy} primary />
    <View style={styles.topLine}><Text style={[styles.eyebrow, { color: colors.accent }]}>SPEAK STUDIO</Text>
      <View style={[styles.badge, { backgroundColor: colors.soft }]}><Text style={{ color: colors.accent, fontWeight: '700' }}>PHASE A · MOCK</Text></View></View>
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>A little practice.{ '\n' }A lot more confidence.</Text>
    {text('Your space to make mistakes, find your words, and keep going.', true)}
    <View style={[styles.disclosure, { borderColor: colors.line }]}>{text('The Phase A tutor uses scripted mock responses. The separate B1 microphone lab below records and replays your voice; it does not generate AI speech.', true)}</View>
    <View style={styles.row}><Button title="Practice" selected={tab === 'practice'} onPress={() => setTab('practice')} />
      <Button title="History" selected={tab === 'history'} onPress={() => { setTab('history'); void controller.refreshHistory(); }} /></View>
  </View>;
  const error = (state.error || mockError) && <View accessibilityRole="alert" style={[styles.error, { borderColor: colors.error }]}>
    <Text style={[styles.body, { color: colors.error }]}>{mockError ?? state.error}</Text>
    <Button title="Retry" onPress={() => { if (mockError) microphone(); else void controller.retry(); }} />
  </View>;
  const preferences = <View style={[styles.card, panel]}>
    {heading('Make it your conversation')}
    {text('I understand', true)}
    <View style={styles.wrap}>{LANGUAGES.map((language) => <Button key={language.code} title={language.label}
      selected={state.preferences.native === language.code} disabled={!state.ready}
      onPress={() => { changePreferences({ ...state.preferences, native: language.code }); }} />)}</View>
    {text('I want to practise', true)}
    <View style={styles.wrap}>{LANGUAGES.map((language) => <Button key={language.code} title={language.label}
      selected={state.preferences.target === language.code} disabled={!state.ready}
      onPress={() => { changePreferences({ ...state.preferences, target: language.code }); }} />)}</View>
    {text('Choose your tutor · voice preferences are simulated', true)}
    <View style={styles.wrap}>
      <Button title="Maya · Female" selected={state.preferences.persona === 'female'} disabled={!state.ready}
        onPress={() => { changePreferences({ ...state.preferences, persona: 'female' }); }} />
      <Button title="Alex · Male" selected={state.preferences.persona === 'male'} disabled={!state.ready}
        onPress={() => { changePreferences({ ...state.preferences, persona: 'male' }); }} />
    </View>
    {text('When should corrections appear?', true)}
    <View style={styles.wrap}>
      <Button title="After each turn" selected={state.preferences.correctionMode === 'immediate'} disabled={!state.ready}
        onPress={() => { changePreferences({ ...state.preferences, correctionMode: 'immediate' }); }} />
      <Button title="At the end" selected={state.preferences.correctionMode === 'end'} disabled={!state.ready}
        onPress={() => { changePreferences({ ...state.preferences, correctionMode: 'end' }); }} />
    </View>
    {text('Changing a preference keeps history and starts a new conversation on your next turn.', true)}
  </View>;

  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {tab === 'history' ? <FlatList data={state.history} keyExtractor={(item) => item.id} contentContainerStyle={styles.content}
        ListHeaderComponent={<>{header}{error}{heading('Your conversation journal')}{text('Saved only on this device. Plain SQLite is not encrypted or a cloud backup.', true)}</>}
        ListEmptyComponent={<View style={[styles.card, panel]}>{text('Your first conversation starts a new chapter. Try the sample in Practice.', true)}</View>}
        renderItem={({ item }) => <View style={[styles.card, panel]}>
          {heading(`${label(item.native)} → ${label(item.target)}`)}
          {text(`${item.persona === 'female' ? 'Maya' : 'Alex'} · ${item.turnCount} turns · ${item.endedAt ? 'Completed' : 'In progress'}`, true)}
          {text(new Date(item.createdAt).toLocaleString(), true)}
          <View style={styles.wrap}><Button title={item.endedAt ? 'View conversation' : 'Resume conversation'} disabled={state.busy}
            onPress={() => { resetSimulation(); void controller.openSession(item).then(() => setTab('practice')); }} />
            <Button title="Delete" disabled={state.busy} onPress={() => removeSession(item)} /></View>
        </View>}
        ListFooterComponent={state.hasMoreHistory ? <Button title="Load more history" onPress={() => { void controller.refreshHistory(true); }} /> : null} /> :
      <FlatList data={state.turns} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}
        ListHeaderComponent={<>{header}{preferences}{error}
          {state.notice && <Text accessibilityLiveRegion="polite" style={[styles.notice, { color: colors.positive }]}>{state.notice}</Text>}
          {!state.ready && state.busy && <ActivityIndicator accessibilityLabel="Opening local history" color={colors.accent} />}
          <View style={[styles.card, panel]}>
            <View style={styles.tutorRow}><View style={styles.avatar}><Text style={styles.avatarLetter}>{state.preferences.persona === 'female' ? 'M' : 'A'}</Text></View>
              <View style={styles.flex}>{heading(state.preferences.persona === 'female' ? 'Maya' : 'Alex')}{text('Patient. Curious. Here for your next sentence.', true)}</View></View>
            <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {[12, 22, 16, 32, 44, 26, 18, 36, 20, 30, 14].map((height, i) => <View key={i} style={{ height, width: 5, borderRadius: 5, backgroundColor: colors.accent, opacity: 0.3 + (i % 3) * 0.2 }} />)}
            </View>
            {text('Let’s talk about a visit to the market. Start with the sample sentence to see curated feedback.', true)}
          </View>
          {state.turns.length >= 50 && <Button title="Load earlier turns" onPress={() => { void controller.olderTurns(); }} />}
        </>}
        renderItem={({ item }) => <View style={styles.exchange}>
          <View style={[styles.learnerBubble, { backgroundColor: colors.soft }]}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>YOU</Text>{text(item.input)}
          </View>
          <View style={[styles.card, panel]}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>{state.preferences.persona === 'female' ? 'MAYA' : 'ALEX'} · SCRIPTED</Text>
            {text(item.response)}
            {!item.analyzed && text('No automated analysis was performed.', true)}
            <Button title={playing === item.id ? 'Stop simulation · no sound' : 'Simulate voice playback · no sound'} onPress={() => simulatePlayback(item.id)} />
            {playing === item.id && text(`Simulating ${playingPersona.current} voice playback. No audio is playing.`, true)}
            {state.session && visibleCorrections(item, state.session).map((correction, index) => <View key={index} style={[styles.correction, { borderColor: colors.positive }]}>
              <Text style={[styles.eyebrow, { color: colors.positive }]}>{correction.category.toUpperCase()} · TRY SAYING</Text>{text(correction.corrected)}{text(correction.explanation, true)}
            </View>)}
            {state.session?.correctionMode === 'end' && !ended && item.corrections.length > 0 && text('Feedback saved for the end of this conversation.', true)}
          </View>
        </View>}
        ListFooterComponent={<View style={styles.footer}>
          {state.busy && state.ready && <View accessibilityLiveRegion="polite" style={styles.row}><ActivityIndicator color={colors.accent} />{text('Preparing your mock response…', true)}</View>}
          <View style={[styles.card, panel]}>
            {heading(ended ? 'Conversation complete' : 'Your next sentence')}
            {ended ? text('Your transcript and feedback are saved. Start a fresh conversation whenever you are ready.', true) : <>
              <TextInput accessibilityLabel="Your practice sentence" placeholder="Type a sentence, or try the sample mic…" placeholderTextColor={colors.muted}
                value={draft} onChangeText={setDraft} multiline maxLength={2000} editable={state.ready && !state.busy}
                style={[styles.input, { color: colors.text, borderColor: colors.line, backgroundColor: colors.bg }]} />
              <View style={styles.wrap}>
                <Button title={sampleRecording ? 'Stop sample mic' : 'Sample mic · simulated'} disabled={!state.ready || state.busy} onPress={microphone} />
                <Button title="Use example" disabled={!state.ready || state.busy} onPress={() => setDraft(controller.sample())} />
              </View>
              {sampleRecording && <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.accent }]}>Simulating listening… Tap Stop to insert a sample. Your microphone is off.</Text>}
              <Button title="Send practice sentence" primary disabled={!state.ready || state.busy || !draft.trim() || sampleRecording}
                onPress={() => { setSampleRecording(false); void controller.send(draft, simulateFailure); setSimulateFailure(false); }} />
            </>}
            <View style={styles.wrap}>
              <Button title="End & review" disabled={!state.session || ended || state.busy} onPress={() => { void controller.finish(); }} />
              <Button title="New conversation" disabled={!state.ready || state.busy} onPress={() => { resetSimulation(); controller.newConversation(); setDraft(''); }} />
            </View>
          </View>
          <View style={[styles.card, panel]}>
            {heading('Prototype controls')}
            <View style={styles.switchRow}>{text('Deny mock permission', true)}<Switch accessibilityLabel="Deny mock microphone permission" value={denyPermission} onValueChange={setDenyPermission} /></View>
            <View style={styles.switchRow}>{text('Fail the next mock response', true)}<Switch accessibilityLabel="Fail next mock response" value={simulateFailure} onValueChange={setSimulateFailure} /></View>
            {text('These toggles affect only the Phase A mock tutor. Real recording is separate in the B1 lab.', true)}
          </View>
          <LocalAudioPanel preferences={state.preferences} />
        </View>} />}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, flex: { flex: 1 },
  content: { padding: 20, paddingBottom: Platform.OS === 'web' ? 130 : 110, gap: 16, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { gap: 16, marginBottom: 6 }, topLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.6 }, badge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20 },
  title: { fontSize: 34, fontWeight: '800', lineHeight: 42, letterSpacing: -1.2 }, body: { fontSize: 15, lineHeight: 23 },
  disclosure: { borderLeftWidth: 3, paddingLeft: 12 }, sectionTitle: { fontSize: 18, fontWeight: '700', lineHeight: 26 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { padding: 20, borderRadius: 22, borderWidth: 1, gap: 13 }, button: { minHeight: 46, paddingVertical: 12, paddingHorizontal: 15, borderRadius: 13, borderWidth: 1, justifyContent: 'center' },
  buttonText: { fontSize: 14, fontWeight: '700', textAlign: 'center' }, input: { minHeight: 112, maxHeight: 220, borderRadius: 14, borderWidth: 1, padding: 14, textAlignVertical: 'top', fontSize: 16, lineHeight: 24 },
  tutorRow: { flexDirection: 'row', gap: 14, alignItems: 'center' }, avatar: { width: 54, height: 54, borderRadius: 20, backgroundColor: '#5146C7', alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: 'white', fontSize: 25, fontWeight: '700' }, wave: { height: 52, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  exchange: { gap: 12 }, learnerBubble: { alignSelf: 'flex-end', maxWidth: '92%', borderRadius: 20, padding: 18, gap: 8 }, correction: { paddingLeft: 12, borderLeftWidth: 3, gap: 8 },
  footer: { gap: 16 }, error: { padding: 16, borderWidth: 1, borderRadius: 16, gap: 12 }, notice: { fontSize: 14, lineHeight: 21 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
});
