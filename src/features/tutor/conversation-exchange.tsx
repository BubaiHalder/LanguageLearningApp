import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StudioButton, StudioCard, StudioText, useStudioTheme } from '../../ui/studio';
import { space } from '../../ui/tokens';
import { type Session, type Turn, visibleCorrections } from './types';

export const ConversationExchange = memo(function ConversationExchange({ turn, session, onListen, listenDisabled }:
  { turn: Turn; session: Session | null; onListen: (turn: Turn) => void; listenDisabled: boolean }) {
  const t = useStudioTheme();
  const [expanded, setExpanded] = useState(false);
  const visible = session && (session.correctionMode === 'immediate' || session.endedAt !== null);
  const corrections = session ? visibleCorrections(turn, session) : [];
  return <View style={{ gap: space.md }}>
    <View style={[styles.learner, { backgroundColor: t.surfaceRaised }]}>
      <StudioText variant="label" tone="primary">You said</StudioText><StudioText selectable>{turn.input}</StudioText>
    </View>
    <StudioCard style={{ borderTopLeftRadius: 8 }}>
      <StudioText variant="label" tone="primary">YOUR PRACTICE BUDDY</StudioText><StudioText selectable>{turn.response}</StudioText>
      <StudioButton title="Listen to this reply" variant="quiet" disabled={listenDisabled} onPress={() => onListen(turn)} style={{ alignSelf: 'flex-start' }} />
      {visible && turn.correctedSentence && <View style={[styles.feedback, { borderColor: t.success, backgroundColor: t.successSurface }]}>
        <StudioText variant="label" tone="success">A clearer way to say it</StudioText><StudioText selectable>{turn.correctedSentence}</StudioText>
      </View>}
      {visible && (turn.explanation || corrections.length > 0) && <>
        <StudioButton title={expanded ? 'Hide explanation' : `Why this works${corrections.length ? ` · ${corrections.length} notes` : ''}`}
          variant="quiet" onPress={() => setExpanded((value) => !value)} />
        {expanded && <View style={{ gap: space.md }}>
          {turn.explanation && <StudioText selectable>{turn.explanation}</StudioText>}
          {corrections.map((correction, index) => <View key={index} style={[styles.note, { borderColor: t.divider }]}>
            <StudioText variant="label" tone="success">{correction.category.toUpperCase()}</StudioText>
            {correction.original && <StudioText selectable tone="muted">You said: {correction.original}</StudioText>}
            <StudioText selectable>Try: {correction.corrected}</StudioText><StudioText selectable>{correction.explanation}</StudioText>
          </View>)}
        </View>}
      </>}
      {!visible && session?.correctionMode === 'end' && <StudioText variant="caption" tone="muted">Feedback will appear when you end and review this conversation.</StudioText>}
    </StudioCard>
  </View>;
});
const styles = StyleSheet.create({
  learner: { maxWidth: '92%', alignSelf: 'flex-end', padding: space.lg, borderRadius: 24, borderBottomRightRadius: 6, borderWidth: 2, borderColor: 'transparent', gap: space.xs },
  feedback: { borderLeftWidth: 3, borderRadius: 12, padding: space.md, gap: space.sm },
  note: { borderTopWidth: 1, paddingTop: space.md, gap: space.xs },
});
