import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LANGUAGE_CATALOG, validateRegistration, type LanguageTag, type Registration } from '../../domain/learning-profile';
import { StudioButton, StudioCard, StudioInput, StudioText, studioLayout, useStudioTheme } from '../../ui/studio';
import { space } from '../../ui/tokens';
import { PracticeBuddy } from '../tutor/practice-buddy';
import { canRecognizeSpeech, isFullTutorLanguage } from '../tutor/types';


interface Props { initial?: Registration | null; saving: boolean; error: string | null; onSubmit: (value: Registration) => void; onCancel?: () => void }

function LanguageChoices({ value, onChange, label }: { value: LanguageTag; onChange: (tag: LanguageTag) => void; label: string }) {
  return <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
    <StudioText variant="label">{label}</StudioText>
    <View style={studioLayout.row}>
      {LANGUAGE_CATALOG.map((language) => <StudioButton key={language.tag} title={`${language.autonym} · ${language.name}`}
        selected={value === language.tag} onPress={() => onChange(language.tag)} />)}
    </View>
  </View>;
}

export function RegistrationScreen({ initial, saving, error, onSubmit, onCancel }: Props) {
  const t = useStudioTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone.replace(/^\+91/, '') ?? '');
  const [native, setNative] = useState<LanguageTag>(initial?.native ?? 'hi');
  const [target, setTarget] = useState<LanguageTag>(initial?.target ?? 'en');
  const [errors, setErrors] = useState<{ name?: string; phone?: string; general?: string }>({});
  const tutorReady = isFullTutorLanguage(native) && isFullTutorLanguage(target);
  function submit() {
    setErrors({});
    // Indian mobile numbers only: accept spaces/dashes and a leading +91, 91 or 0, then store as +91 and ten digits.
    const digits = phone.replace(/\D/g, '').replace(/^(91(?=\d{10}$)|0(?=\d{10}$))/, '');
    if (!/^[6-9]\d{9}$/.test(digits)) { setErrors({ phone: 'Enter your 10-digit mobile number, for example 98765 43210.' }); return; }
    try { onSubmit(validateRegistration({ name, phone: '+91' + digits, native, target })); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Check your details and try again.';
      setErrors(message.startsWith('Name') ? { name: message } : { general: message });
    }
  }
  const shown = errors.general ?? error;
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: t.background }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.huge,
        width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        <View style={studioLayout.row}>
          <PracticeBuddy />
          <View style={{ flex: 1 }}>
            <StudioText variant="title" accessibilityRole="header">{initial ? 'Your profile' : 'Welcome to speak studio'}</StudioText>
            <StudioText tone="muted">{initial ? 'Update your details any time.' : 'Create your profile once. It stays on this phone.'}</StudioText>
          </View>
        </View>
        <StudioCard>
          <StudioInput label="Your name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" maxLength={80}
            placeholder="e.g. Asha" returnKeyType="next" />
          {errors.name && <StudioText accessibilityRole="alert" tone="error" variant="caption">{errors.name}</StudioText>}
          <StudioInput label="Mobile number (+91 is added for you)" value={phone} onChangeText={setPhone} keyboardType="phone-pad"
            autoComplete="tel" maxLength={16} placeholder="98765 43210" />
          {errors.phone && <StudioText accessibilityRole="alert" tone="error" variant="caption">{errors.phone}</StudioText>}
          <StudioText variant="caption" tone="muted">Just your 10-digit mobile number. Stored only on this phone; the number is not verified or sent anywhere.</StudioText>
        </StudioCard>
        <StudioCard>
          <LanguageChoices label="I understand best (explanations in)" value={native} onChange={setNative} />
        </StudioCard>
        <StudioCard>
          <LanguageChoices label="I want to practise" value={target} onChange={setTarget} />
          <StudioText variant="caption" tone={tutorReady ? 'success' : 'muted'}>{tutorReady
            ? 'The speaking tutor works for this pair.'
            : canRecognizeSpeech(native, target)
              ? 'Experimental: English, Hindi and Spanish are fully supported. For this pair the tutor can hear you, but replies may be weaker and it cannot speak back yet.'
              : 'Experimental: for this pair you can practise by typing. Voice input and spoken replies are not available yet.'}</StudioText>
        </StudioCard>
        {shown && <StudioText accessibilityRole="alert" tone="error">{shown}</StudioText>}
        <StudioButton title={initial ? 'Save profile' : 'Create my profile'} variant="primary" busy={saving} onPress={submit} />
        {onCancel && <StudioButton title="Cancel" variant="quiet" disabled={saving} onPress={onCancel} />}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
