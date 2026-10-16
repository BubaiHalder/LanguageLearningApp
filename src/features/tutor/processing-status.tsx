import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ActivityPulse, StudioText, studioLayout, useStudioTheme } from '../../ui/studio';

export type ProcessingStage = 'recognition' | 'reply' | 'speech';
const stages = [
  { key: 'recognition', label: 'Hear you', title: 'Turning your voice into words…' },
  { key: 'reply', label: 'Reply', title: 'Thinking through your sentence…' },
  { key: 'speech', label: 'Speak', title: 'Getting your tutor’s voice ready…' },
] as const;
/** Shows the current job, never a guessed percentage or time remaining. */
export function ProcessingStatus({ stage }: { stage: ProcessingStage | null }) {
  return stage ? <ActiveProcessingStatus key={stage} stage={stage} /> : null;
}
function ActiveProcessingStatus({ stage }: { stage: ProcessingStage }) {
  const t = useStudioTheme();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [stage]);
  const active = stages.find((item) => item.key === stage);
  return <View style={{ gap: 8, paddingVertical: 8 }}>
    <View style={studioLayout.row}>
      <ActivityPulse active />
      <StudioText variant="label" style={{ flex: 1 }}>{active?.title}</StudioText>
      <StudioText variant="caption" tone="muted" accessibilityLabel={'Elapsed time: ' + seconds + ' seconds'}>{seconds}s</StudioText>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {stages.map((item, i) => <View key={item.key} style={{ flexGrow: 1, paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 12, backgroundColor: stage === item.key ? t.accent : t.background }}>
        <StudioText variant="label" style={{ textAlign: 'center', color: stage === item.key ? t.onAccent : t.muted }}>
          {i + 1} · {item.label}
        </StudioText>
      </View>)}
    </View>
    <StudioText variant="caption" tone="muted">{seconds >= 15
      ? 'Still working on your PC. You can cancel this step; shorter recordings need less recognition work.'
      : 'Your PC processes each step locally. Short sentences are a good place to start.'}</StudioText>
  </View>;
}
