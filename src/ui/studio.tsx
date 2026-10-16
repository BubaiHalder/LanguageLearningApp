import { useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View, useColorScheme, type StyleProp, type TextInputProps, type TextProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, space, studioThemes, typography, type StudioTheme } from './tokens';

export function useStudioTheme(): StudioTheme { return useColorScheme() === 'dark' ? studioThemes.dark : studioThemes.light; }
export function StudioText({ variant = 'body', tone = 'text', style, ...props }: TextProps & {
  variant?: keyof typeof typography; tone?: 'text' | 'muted' | 'primary' | 'success' | 'error';
}) {
  const theme = useStudioTheme();
  return <Text {...props} style={[typography[variant], { color: theme[tone] }, style]} />;
}
export function StudioCard({ children, style, ...props }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; testID?: string }>) {
  const theme = useStudioTheme();
  return <View {...props} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.divider }, style]}>{children}</View>;
}
export function StudioButton({ title, onPress, variant = 'secondary', selected = false, disabled = false, busy = false, style, accessibilityLabel }:
  { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; selected?: boolean;
    disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const t = useStudioTheme();
  const primary = selected || variant === 'primary';
  const foreground = primary ? t.onAccent : variant === 'danger' ? t.error : t.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}
    aria-busy={busy}
    accessibilityState={{ disabled: disabled || busy, selected, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: primary ? t.accent : variant === 'quiet' ? 'transparent' : t.surface,
      borderColor: primary ? t.accentEdge : variant === 'quiet' ? 'transparent' : t.border,
      borderWidth: variant === 'quiet' ? 0 : 2,
      borderBottomWidth: variant === 'quiet' ? 0 : pressed && !disabled && !busy ? 2 : 5,
      transform: [{ translateY: pressed && !disabled && !busy ? 2 : 0 }],
      opacity: disabled || busy ? 0.5 : 1 }, style]}>
    {busy && <ActivityIndicator color={foreground} />}
    <Text style={[typography.label, { color: foreground, textAlign: 'center', flexShrink: 1 }]}>{title}</Text>
  </Pressable>;
}
export function StudioInput({ label, style, ...props }: TextInputProps & { label: string }) {
  const t = useStudioTheme();
  return <View style={{ gap: space.xs }}><StudioText variant="label">{label}</StudioText>
    <TextInput accessibilityLabel={label} placeholderTextColor={t.muted} {...props}
      style={[styles.input, typography.body, { color: t.text, borderColor: t.border, backgroundColor: t.background }, style]} />
  </View>;
}
export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'error' | 'active' }) {
  const t = useStudioTheme();
  const foreground = tone === 'active' ? t.primary : tone === 'neutral' ? t.muted : t[tone];
  const background = tone === 'success' ? t.successSurface : tone === 'error' ? t.errorSurface : t.surfaceRaised;
  return <View style={[styles.badge, { backgroundColor: background }]} accessibilityLiveRegion="polite">
    {tone === 'active' ? <ActivityIndicator color={foreground} size="small" /> :
      <View accessible={false} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: foreground }} />}
    <StudioText variant="label" style={{ color: foreground }}>{label}</StudioText>
  </View>;
}
/** Actual activity indicator, deliberately not presented as audio amplitude or progress. */
export function ActivityPulse({ active, color }: { active: boolean; color?: string }) {
  const theme = useStudioTheme();
  const [opacity] = useState(() => new Animated.Value(1));
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduced(value); }).catch(() => {});
    const event = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { mounted = false; event.remove(); };
  }, []);
  useEffect(() => {
    if (!active || reduced) { opacity.setValue(1); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.35, duration: 600, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    animation.start(); return () => { animation.stop(); };
  }, [active, reduced, opacity]);
  return <Animated.View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ opacity, flexDirection: 'row', gap: 4, alignItems: 'center', height: 20 }}>
    {[6, 12, 18, 12, 6].map((height, i) => <View key={i} style={{ height, width: 4, borderRadius: 3, backgroundColor: color ?? theme.primary }} />)}
  </Animated.View>;
}
export function StudioPanel({ visible, title, onClose, children }: PropsWithChildren<{ visible: boolean; title: string; onClose: () => void }>) {
  const t = useStudioTheme();
  return <Modal visible={visible} animationType="none" onRequestClose={onClose} presentationStyle="fullScreen">
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View accessibilityViewIsModal style={{ flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
          <View style={styles.panelHeader}><StudioText accessibilityRole="header" variant="title" style={{ flex: 1 }}>{title}</StudioText>
            <StudioButton title="Done" onPress={onClose} /></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
export const studioLayout = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  stack: { gap: space.md }, flex: { flex: 1 } });
const styles = StyleSheet.create({
  card: { borderWidth: 2, borderBottomWidth: 4, padding: space.lg, gap: space.md, borderRadius: radius.card },
  button: { minHeight: 48, minWidth: 48, maxWidth: '100%', paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.control,
    borderWidth: 1, flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.control, padding: space.md, textAlignVertical: 'top' },
  badge: { flexDirection: 'row', gap: space.sm, alignItems: 'center', paddingVertical: space.xs, paddingHorizontal: space.md,
    borderRadius: radius.pill, alignSelf: 'flex-start', flexShrink: 1 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
});
