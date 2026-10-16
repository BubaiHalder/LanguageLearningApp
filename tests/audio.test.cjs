const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AudioController } = require('../src/features/tutor/audio/audio-controller.ts');
const { transcriptionEndpoint, parseTranscription } = require('../src/features/tutor/audio/upload-contract.ts');
const { DEFAULT_PREFERENCES } = require('../src/features/tutor/types.ts');

function fixture(overrides = {}) {
  const events = [];
  const device = {
    permission: async () => ({ granted: true, canAskAgain: true }),
    start: async () => { events.push('start'); },
    stop: async () => { events.push('stop'); return { uri: 'file:///cache/practice.m4a', durationMs: 1200 }; },
    play: async (uri) => { events.push(`play:${uri}`); },
    pause: () => { events.push('pause'); },
    remove: async (uri) => { events.push(`remove:${uri}`); },
    deactivate: async () => { events.push('deactivate'); },
    upload: async (clip, url) => { events.push(`upload:${clip.preferences.target}:${url}`); return 'hello'; },
    ...overrides,
  };
  return { controller: new AudioController(device), events };
}
test('B1: real permission denial never starts the recorder', async () => {
  const { controller, events } = fixture({ permission: async () => ({ granted: false, canAskAgain: true }) });
  await controller.start(DEFAULT_PREFERENCES);
  assert.equal(controller.getSnapshot().phase, 'idle');
  assert.match(controller.getSnapshot().error, /denied/);
  assert.ok(!events.includes('start'));
});
test('B1: permanent denial offers system settings', async () => {
  const { controller } = fixture({ permission: async () => ({ granted: false, canAskAgain: false }) });
  await controller.start(DEFAULT_PREFERENCES);
  assert.equal(controller.getSnapshot().needsSettings, true);
});
test('B1: record, duration, stop and replay use the captured audio URI', async () => {
  const { controller, events } = fixture();
  await controller.start(DEFAULT_PREFERENCES);
  controller.progress(1300);
  assert.equal(controller.getSnapshot().durationMs, 1300);
  await controller.stop();
  assert.equal(controller.getSnapshot().clip.durationMs, 1300);
  await controller.play();
  assert.equal(controller.getSnapshot().phase, 'playing');
  assert.ok(events.includes('play:file:///cache/practice.m4a'));
  controller.playbackFinished();
  assert.equal(controller.getSnapshot().phase, 'ready');
});
test('B1: duplicate Record and Stop actions do not overlap native operations', async () => {
  const { controller, events } = fixture();
  await Promise.all([controller.start(DEFAULT_PREFERENCES), controller.start(DEFAULT_PREFERENCES)]);
  await Promise.all([controller.stop(), controller.stop()]);
  assert.equal(events.filter((event) => event === 'start').length, 1);
  assert.equal(events.filter((event) => event === 'stop').length, 1);
});
test('B1: cancel during a pending permission prompt prevents late recording', async () => {
  let grant;
  const permission = new Promise((resolve) => { grant = resolve; });
  const { controller, events } = fixture({ permission: () => permission });
  const start = controller.start(DEFAULT_PREFERENCES);
  await new Promise((resolve) => setImmediate(resolve));
  const cancel = controller.cancel();
  grant({ granted: true, canAskAgain: true });
  await Promise.all([start, cancel]);
  assert.equal(controller.getSnapshot().phase, 'idle');
  assert.ok(!events.includes('start'));
});
test('B1: cancel during native preparation stops and deletes the partial file', async () => {
  let prepared;
  const preparation = new Promise((resolve) => { prepared = resolve; });
  const { controller, events } = fixture({ start: () => preparation });
  const start = controller.start(DEFAULT_PREFERENCES);
  await new Promise((resolve) => setImmediate(resolve));
  const cancel = controller.cancel();
  prepared(); await Promise.all([start, cancel]);
  assert.ok(events.includes('stop'));
  assert.ok(events.includes('remove:file:///cache/practice.m4a'));
  assert.equal(controller.getSnapshot().clip, null);
});
test('B1: discard stops active recording and removes its file', async () => {
  const { controller, events } = fixture();
  await controller.start(DEFAULT_PREFERENCES); await controller.cancel();
  assert.ok(events.includes('stop'));
  assert.ok(events.includes('remove:file:///cache/practice.m4a'));
  assert.equal(controller.getSnapshot().phase, 'idle');
});
test('B1: interruption clears the clip and exposes an actionable error', async () => {
  const { controller } = fixture();
  await controller.start(DEFAULT_PREFERENCES);
  controller.interrupted('Recording interrupted. Retry.');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getSnapshot().clip, null);
  assert.match(controller.getSnapshot().error, /interrupted/);
});
test('B1: short recordings are rejected and deleted', async () => {
  const { controller, events } = fixture({ stop: async () => ({ uri: 'file:///short.m4a', durationMs: 100 }) });
  await controller.start(DEFAULT_PREFERENCES); await controller.stop();
  assert.match(controller.getSnapshot().error, /too short/);
  assert.ok(events.includes('remove:file:///short.m4a'));
  assert.equal(controller.getSnapshot().clip, null);
});
test('B1: failed native start is cleaned up and does not poison retry', async () => {
  let fails = true;
  const { controller, events } = fixture({ start: async () => { if (fails) { fails = false; throw new Error('Microphone busy'); } } });
  await controller.start(DEFAULT_PREFERENCES);
  assert.match(controller.getSnapshot().error, /busy/);
  assert.ok(events.includes('deactivate'));
  await controller.start(DEFAULT_PREFERENCES);
  assert.equal(controller.getSnapshot().phase, 'recording');
});
test('B1: uploads retain the recording language snapshot and can be retried', async () => {
  let fails = true;
  const { controller } = fixture({ upload: async (clip) => {
    assert.equal(clip.preferences.target, 'en');
    if (fails) { fails = false; throw new Error('Backend offline'); }
    return 'recognized text';
  } });
  const preferences = { ...DEFAULT_PREFERENCES };
  await controller.start(preferences); preferences.target = 'es';
  await controller.stop(); await controller.upload('http://192.168.1.49:3000');
  assert.match(controller.getSnapshot().error, /offline/);
  assert.equal(controller.getSnapshot().phase, 'ready');
  await controller.upload('http://192.168.1.49:3000');
  assert.equal(controller.getSnapshot().transcript, 'recognized text');
});
test('B1: cancelling an upload aborts transport and ignores any stale response', async () => {
  let release;
  let signal;
  const response = new Promise((resolve) => { release = resolve; });
  const { controller } = fixture({ upload: async (_clip, _url, s) => { signal = s; return response; } });
  await controller.start(DEFAULT_PREFERENCES); await controller.stop();
  const upload = controller.upload('http://192.168.1.49:3000');
  await new Promise((resolve) => setImmediate(resolve));
  const cancel = controller.cancel(); assert.equal(signal.aborted, true);
  release('stale result'); await Promise.all([upload, cancel]);
  assert.equal(controller.getSnapshot().transcript, null);
  assert.equal(controller.getSnapshot().phase, 'idle');
});
test('B1: only private LAN endpoint origins are accepted', () => {
  assert.equal(transcriptionEndpoint('http://192.168.1.49:3000'), 'http://192.168.1.49:3000/v1/audio/transcriptions');
  assert.ok(transcriptionEndpoint('https://10.1.2.3:3000'));
  assert.ok(transcriptionEndpoint('http://172.16.2.3:3000'));
  for (const url of ['https://example.com', 'http://127.0.0.1:3000', 'http://172.32.0.1', 'file:///tmp/a',
    'http://user:pass@192.168.1.2', 'http://192.168.1.2/path', 'http://192.168.1.2?q=1', 'not a URL']) {
    assert.throws(() => transcriptionEndpoint(url), url);
  }
});
test('B1: transcription responses are validated and no-speech results rejected', () => {
  assert.equal(parseTranscription({ transcript: ' नमस्ते hello ' }), 'नमस्ते hello');
  for (const value of [null, {}, { transcript: '' }, { transcript: 123 }, { transcript: 'a'.repeat(2001) }]) {
    assert.throws(() => parseTranscription(value));
  }
});
test('production mobile uploads require an explicitly configured HTTPS origin', () => {
  assert.equal(transcriptionEndpoint('https://tutor.example.com', 'https://tutor.example.com', false), 'https://tutor.example.com/v1/audio/transcriptions');
  assert.throws(() => transcriptionEndpoint('https://other.example.com', 'https://tutor.example.com', false));
  assert.throws(() => transcriptionEndpoint('http://192.168.1.49:3000', undefined, false));
});
