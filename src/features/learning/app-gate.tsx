import { useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { openLearningRepository } from '../../data/open-learning-repository';
import { openTutorRepository } from '../../data/open-tutor-repository';
import type { LearningSnapshot, Registration } from '../../domain/learning-profile';
import { StudioButton, StudioText, useStudioTheme } from '../../ui/studio';
import { space } from '../../ui/tokens';
import type { Language } from '../tutor/types';
import { LearnerContext } from './learner-context';
import { RegistrationScreen } from './registration-screen';

/** Shows full-screen registration for a first-time learner, otherwise the app. No password: profile only. */
export default function AppGate({ children }: PropsWithChildren) {
  const t = useStudioTheme();
  const [snapshot, setSnapshot] = useState<LearningSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    openLearningRepository().then((repository) => repository.snapshot()).then(
      (value) => { if (active) setSnapshot(value); },
      (cause: unknown) => { if (active) setLoadError(cause instanceof Error ? cause.message : 'Could not open your profile.'); });
    return () => { active = false; };
  }, [attempt]);

  async function save(registration: Registration) {
    setSaving(true); setSaveError(null);
    try {
      const repository = await openLearningRepository();
      const next = await repository.saveProfile(registration, { learnerId: randomUUID(), profileId: randomUUID() }, Date.now());
      try {
        const tutor = await openTutorRepository();
        const current = await tutor.preferences();
        await tutor.savePreferences({ ...current, native: registration.native as Language, target: registration.target as Language });
      } catch { /* Tutor preferences can still be changed in the tutor's own settings. */ }
      setSnapshot(next); setEditing(false);
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Could not save your profile. Try again.'); }
    finally { setSaving(false); }
  }

  if (loadError) {
    return <View style={{ flex: 1, backgroundColor: t.background, padding: space.xl, gap: space.lg, justifyContent: 'center' }}>
      <StudioText variant="title" accessibilityRole="header">Your profile could not be opened</StudioText>
      <StudioText tone="error" accessibilityRole="alert">{loadError}</StudioText>
      <StudioText tone="muted">Nothing was deleted or reset.</StudioText>
      <StudioButton title="Try again" variant="primary" onPress={() => { setLoadError(null); setAttempt((value) => value + 1); }} />
    </View>;
  }
  if (!snapshot) {
    return <View style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator accessibilityLabel="Opening your profile" />
    </View>;
  }
  if (!snapshot.learner || !snapshot.active || editing) {
    const initial = snapshot.learner && snapshot.active
      ? { name: snapshot.learner.name, phone: snapshot.learner.phone, native: snapshot.learner.native, target: snapshot.active.target } : null;
    return <RegistrationScreen initial={initial} saving={saving} error={saveError} onSubmit={(value) => { void save(value); }}
      onCancel={initial ? () => { setEditing(false); setSaveError(null); } : undefined} />;
  }
  return <LearnerContext.Provider value={{ name: snapshot.learner.name, editProfile: () => setEditing(true) }}>{children}</LearnerContext.Provider>;
}
