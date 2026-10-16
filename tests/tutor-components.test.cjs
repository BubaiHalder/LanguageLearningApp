// Render actual shared components with React Native Web's server renderer.
// Safe-area layout is stubbed: these are presentation/privacy checks, not device tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.tsx'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  module._compile(result.outputText, filename);
};
const native = require('react-native-web');
const original = Module._load;
Module._load = function (request, ...args) {
  if (request === 'react-native') return native;
  if (request === 'react-native-safe-area-context') return { SafeAreaView: native.View };
  return original.call(this, request, ...args);
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { ConversationExchange } = require('../src/features/tutor/conversation-exchange.tsx');
const { StudioButton } = require('../src/ui/studio.tsx');
const p = { native: 'hi', target: 'en', persona: 'female', correctionMode: 'end' };
const session = { ...p, id: 's', createdAt: 1, endedAt: null, turnCount: 1, mode: 'live' };
const turn = { id: 't', sessionId: 's', input: 'Learner sentence', response: 'Natural tutor reply', createdAt: 2,
  provider: 'local-v1', analyzed: true, correctedSentence: 'FULL_CORRECTED_SENTENCE', explanation: 'PRIVATE_EXPLANATION',
  corrections: [{ category: 'grammar', original: 'go', corrected: 'went', explanation: 'DETAIL_EXPLANATION' }] };
const render = (session) => renderToStaticMarkup(React.createElement(ConversationExchange, { turn, session, onListen: () => {}, listenDisabled: false }));
test('components: active end-mode conversation hides full feedback while keeping tutor reply readable', () => {
  const markup = render(session);
  assert.match(markup, /Natural tutor reply/);
  assert.doesNotMatch(markup, /FULL_CORRECTED_SENTENCE|PRIVATE_EXPLANATION|DETAIL_EXPLANATION/);
  assert.match(markup, /Feedback will appear/);
});
test('components: ending a conversation reveals its corrected sentence and explanation control', () => {
  const markup = render({ ...session, endedAt: 5 });
  assert.match(markup, /FULL_CORRECTED_SENTENCE/);
  assert.match(markup, /Why this works/);
  assert.doesNotMatch(markup, /Feedback will appear/);
});
test('components: immediate correction is visible before the session ends', () => {
  assert.match(render({ ...session, correctionMode: 'immediate' }), /FULL_CORRECTED_SENTENCE/);
});
test('components: busy shared actions expose disabled state to accessibility', () => {
  const markup = renderToStaticMarkup(React.createElement(StudioButton, { title: 'Connect', busy: true, onPress: () => {} }));
  assert.match(markup, /aria-disabled="true"/);
  assert.match(markup, /aria-busy="true"/);
});
