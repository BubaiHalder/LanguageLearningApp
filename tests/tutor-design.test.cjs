const { test } = require('node:test');
const assert = require('node:assert/strict');
const { studioThemes } = require('../src/ui/tokens.ts');
const { audioPresentation } = require('../src/features/tutor/tutor-presentation.ts');
function luminance(hex) {
  const values = [1, 3, 5].map((offset) => { const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
test('design: both themes keep readable text, actions, errors and corrections', () => {
  for (const theme of Object.values(studioThemes)) {
    for (const [foreground, background] of [['text', 'background'], ['text', 'surface'], ['muted', 'surface'], ['primary', 'surfaceRaised'],
      ['onPrimary', 'primary'], ['onAccent', 'accent'], ['success', 'successSurface'], ['text', 'successSurface'], ['error', 'errorSurface']]) {
      assert.ok(contrast(theme[foreground], theme[background]) >= 4.5, `${foreground}/${background} must meet 4.5:1`);
    }
    assert.ok(contrast(theme.border, theme.surface) >= 3, 'control boundaries must meet 3:1');
  }
});
test('design: recording can always be stopped and is never mistaken for ready-to-send', () => {
  for (const locked of [true, false]) {
    const ui = audioPresentation('recording', locked);
    assert.equal(ui.canStop, true); assert.equal(ui.canSend, false); assert.equal(ui.canRecord, false);
    assert.equal(ui.label, 'Recording your voice'); assert.equal(ui.canDiscard, true);
  }
});
test('design: uploads and permission requests prevent duplicate send/record actions while retaining cancel', () => {
  for (const phase of ['requesting', 'stopping', 'uploading']) {
    const ui = audioPresentation(phase, false);
    assert.equal(ui.canRecord, false); assert.equal(ui.canSend, false); assert.equal(ui.canReplay, false);
    assert.equal(ui.canDiscard, true); assert.equal(ui.active, true);
  }
});
test('design: ready clip supports review and send; external AI/playback locks preserve that clip', () => {
  const ready = audioPresentation('ready', false);
  assert.equal(ready.canSend, true); assert.equal(ready.canReplay, true); assert.equal(ready.canRecord, true);
  const locked = audioPresentation('ready', true);
  assert.equal(locked.canSend, false); assert.equal(locked.canReplay, false); assert.equal(locked.canRecord, false);
  assert.equal(locked.canDiscard, true);
});
