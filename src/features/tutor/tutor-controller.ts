import type { TutorRepository } from '../../data/tutor-repository';
import { MockTutorProvider, SAMPLE_INPUTS, toMockLanguage } from './mock-provider';
import { DEFAULT_PREFERENCES, type Preferences, type Session, type Turn, type TutorProvider, type TutorReply, validateInput, validatePreferences } from './types';

export interface TutorState {
  preferences: Preferences;
  session: Session | null;
  turns: Turn[];
  history: Session[];
  hasMoreHistory: boolean;
  ready: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
}
let idCounter = 0;
function localId() { return `${Date.now().toString(36)}-${(++idCounter).toString(36)}-${Math.random().toString(36).slice(2)}`; }

/** UI-independent state machine; a changed context can never receive an old reply. */
export class TutorController {
  private state: TutorState = { preferences: { ...DEFAULT_PREFERENCES }, session: null,
    turns: [], history: [], hasMoreHistory: false, ready: false, busy: false, error: null, notice: null };
  private listeners = new Set<() => void>();
  private repository: TutorRepository | null = null;
  private revision = 0;
  private retryAction: (() => Promise<void>) | null = null;
  constructor(private readonly open: () => Promise<TutorRepository>,
    private readonly provider: TutorProvider = new MockTutorProvider(), private readonly mode: 'mock' | 'live' = 'mock') {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<TutorState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private fail(error: unknown, retry: () => Promise<void>) {
    this.retryAction = retry;
    this.update({ error: error instanceof Error ? error.message : 'Something went wrong. Please retry.' });
  }
  async initialize(): Promise<void> {
    this.update({ error: null, busy: true });
    try {
      const repo = await this.open();
      const preferences = await repo.preferences();
      const session = await repo.resume(preferences, this.mode);
      const turns = session ? await repo.turns(session.id) : [];
      const history = await repo.sessions(0, this.mode);
      this.repository = repo;
      this.update({ ready: true, preferences, session, turns, history, hasMoreHistory: history.length === 20 });
    } catch (error) { this.fail(error, () => this.initialize()); }
    finally { this.update({ busy: false }); }
  }
  retry = async () => {
    const action = this.retryAction;
    this.update({ error: null });
    try { await action?.(); }
    catch (error) { if (action) this.fail(error, action); }
  };
  async refreshHistory(loadMore = false): Promise<void> {
    if (!this.repository) return;
    const offset = loadMore ? this.state.history.length : 0;
    try {
      const history = await this.repository.sessions(offset, this.mode);
      const combined = loadMore ? [...this.state.history, ...history] : history;
      this.update({ history: [...new Map(combined.map((session) => [session.id, session])).values()], hasMoreHistory: history.length === 20 });
    } catch (error) { this.fail(error, () => this.refreshHistory(loadMore)); }
  }
  async changePreferences(value: Preferences): Promise<void> {
    if (!this.repository) return;
    const preferences = validatePreferences(value);
    if (Object.keys(preferences).every((key) => preferences[key as keyof Preferences] === this.state.preferences[key as keyof Preferences])) return;
    const previous = this.state.session;
    const pending = this.state.busy;
    this.revision++;
    this.retryAction = null;
    this.update({ preferences, session: null, turns: [], error: null,
      notice: 'Preferences updated. Your next turn starts a new conversation; earlier history is kept.' });
    const persist = async () => {
      await this.repository!.savePreferences(preferences);
      if (previous && !pending) await this.repository!.finish(previous.id);
    };
    try { await persist(); await this.refreshHistory(); }
    catch (error) { this.fail(error, persist); }
  }
  async send(text: string, fail = false, retryId?: string, retrySession?: Session, cachedReply?: TutorReply): Promise<void> {
    if (!this.repository || this.state.busy) return;
    let input: string;
    try { input = validateInput(text); }
    catch (error) { this.fail(error, async () => {}); return; }
    if (this.state.session && this.state.session.endedAt !== null) return;
    const revision = this.revision;
    const preferences = { ...this.state.preferences };
    const session: Session = retrySession ?? this.state.session ?? {
      ...preferences, mode: this.mode, id: localId(), createdAt: Date.now(), endedAt: null, turnCount: 0,
    };
    const id = retryId ?? localId();
    const createdAt = Math.max(Date.now(), (this.state.turns.at(-1)?.createdAt ?? 0) + 1);
    this.update({ busy: true, error: null, notice: null });
    let reply = cachedReply;
    const context = this.state.turns.slice(-6);
    try {
      reply ??= await this.provider.reply(input, preferences, fail, context);
      await this.repository.saveTurn(session, id, input, reply, createdAt);
      if (revision === this.revision) {
        const turns = await this.repository.turns(session.id);
        this.update({ session: { ...session, turnCount: session.turnCount + 1 }, turns,
          notice: this.mode === 'live' ? 'AI response saved on this device.' : 'Saved on this device. Mock response ready.' });
      } else {
        await this.repository.finish(session.id);
        this.update({ notice: 'The previous reply was saved to its original conversation in History.' });
      }
      this.retryAction = null;
      await this.refreshHistory();
    } catch (error) {
      if (revision === this.revision) this.fail(error, () => this.send(input, false, id, session, reply));
      else {
        this.fail(new Error('The previous turn could not be completed. Retry saves it to its original conversation.'), async () => {
          // Keep the original languages even if the learner has switched since the failure.
          const recovered = reply ?? await this.provider.reply(input, preferences, false, context);
          await this.repository!.saveTurn(session, id, input, recovered, createdAt);
          await this.repository!.finish(session.id);
          this.update({ error: null, notice: 'Previous turn recovered in History.' });
          await this.refreshHistory();
        });
      }
    } finally { this.update({ busy: false }); }
  }
  async finish(): Promise<void> {
    const session = this.state.session;
    if (!session || !this.repository || this.state.busy) return;
    const revision = this.revision;
    this.update({ busy: true, error: null });
    try {
      await this.repository.finish(session.id);
      if (revision === this.revision) this.update({ session: { ...session, endedAt: Date.now() }, notice: 'Conversation ended. All saved corrections are now visible.' });
      await this.refreshHistory();
    } catch (error) { this.fail(error, () => this.finish()); }
    finally { this.update({ busy: false }); }
  }
  newConversation() {
    if (this.state.busy) return;
    this.revision++;
    this.retryAction = null;
    this.update({ session: null, turns: [], error: null, notice: 'A fresh conversation is ready.' });
  }
  async openSession(session: Session): Promise<void> {
    if (!this.repository || this.state.busy) return;
    if ((session.mode ?? 'mock') !== this.mode) return;
    const revision = this.revision;
    this.update({ busy: true, error: null });
    try {
      const turns = await this.repository.turns(session.id);
      if (revision !== this.revision) return;
      await this.repository.savePreferences(session);
      if (revision !== this.revision) return;
      this.revision++;
      this.update({ session, turns, preferences: validatePreferences(session),
        notice: session.endedAt === null ? 'Conversation resumed.' : 'Viewing a completed conversation.' });
    } catch (error) { this.fail(error, () => this.openSession(session)); }
    finally { this.update({ busy: false }); }
  }
  async olderTurns(): Promise<void> {
    if (!this.repository || !this.state.session || !this.state.turns.length || this.state.busy) return;
    const revision = this.revision;
    this.update({ busy: true });
    try {
      const older = await this.repository.turns(this.state.session.id, this.state.turns[0].createdAt);
      if (revision === this.revision) this.update({ turns: [...older, ...this.state.turns], notice: older.length ? 'Earlier turns loaded.' : 'You are at the beginning.' });
    } catch (error) { this.fail(error, () => this.olderTurns()); }
    finally { this.update({ busy: false }); }
  }
  async deleteSession(session: Session): Promise<void> {
    if (!this.repository || this.state.busy) return;
    try {
      await this.repository.removeSession(session.id);
      if (this.state.session?.id === session.id) this.newConversation();
      await this.refreshHistory();
    } catch (error) { this.fail(error, () => this.deleteSession(session)); }
  }
  sample(): string { return SAMPLE_INPUTS[toMockLanguage(this.state.preferences.target)]; }
}
