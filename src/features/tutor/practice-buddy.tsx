import { StyleSheet, View } from 'react-native';
import { useStudioTheme } from '../../ui/studio';

/** Original speech-bubble character, drawn locally without downloaded assets. */
export function PracticeBuddy({ small = false }: { small?: boolean }) {
  const t = useStudioTheme();
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ width: small ? 42 : 116, height: small ? 44 : 126, justifyContent: 'center', alignItems: 'center' }}>
    <View style={[styles.leaf, { backgroundColor: t.primary, width: small ? 12 : 29, height: small ? 7 : 16, top: small ? 0 : 4 }]} />
    <View style={[styles.body, { width: small ? 36 : 96, height: small ? 32 : 88, borderRadius: small ? 13 : 32,
      backgroundColor: t.accent, borderColor: t.accentEdge, borderBottomWidth: small ? 3 : 6 }]}>
      <View style={{ flexDirection: 'row', gap: small ? 7 : 21, marginTop: small ? 0 : 4 }}>
        {[0, 1].map((eye) => <View key={eye} style={{ width: small ? 4 : 8, height: small ? 7 : 14, borderRadius: 8, backgroundColor: t.onAccent }} />)}
      </View>
      {!small && <View style={[styles.smile, { borderColor: t.onAccent }]} />}
    </View>
    <View style={{ position: 'absolute', bottom: small ? 1 : 6, left: small ? 10 : 29, width: small ? 10 : 22,
      height: small ? 9 : 19, backgroundColor: t.accentEdge, borderBottomLeftRadius: 10, transform: [{ rotate: '16deg' }] }} />
  </View>;
}
const styles = StyleSheet.create({
  body: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, zIndex: 1, gap: 10 },
  leaf: { position: 'absolute', borderTopLeftRadius: 22, borderBottomRightRadius: 22, transform: [{ rotate: '-24deg' }] },
  smile: { width: 24, height: 13, borderWidth: 3, borderTopWidth: 0, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
});
