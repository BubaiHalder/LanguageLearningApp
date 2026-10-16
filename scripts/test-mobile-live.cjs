// Real HTTP/model/SQLite integration of the mobile application's pure controllers.
// Native microphone and playback are deliberately outside this automated test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { LiveTutorClient } = require('../src/features/tutor/live-client.ts');
const { TutorController } = require('../src/features/tutor/tutor-controller.ts');
const { TutorRepository } = require('../src/data/tutor-repository.ts');
const { SpeechController } = require('../src/features/tutor/audio/speech-controller.ts');
const { visibleCorrections } = require('../src/features/tutor/types.ts');

function repository(filename) {
  const db = new DatabaseSync(filename);
  const tx = { exec: async (sql) => db.exec(sql), run: async (sql, args = []) => { db.prepare(sql).run(...args); },
    all: async (sql, args = []) => db.prepare(sql).all(...args) };
  return { db, repo: new TutorRepository({ ...tx, transaction: async (action) => {
    db.exec('BEGIN'); try { await action(tx); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
  } }) };
}

async function main() {
  if (process.env.AI_MODE !== 'live') throw new Error('Real-model testing must be explicitly live');
  const origin = process.env.TEST_GATEWAY_ORIGIN;
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  // Rewrite a valid development origin to the temporary loopback test listener.
  // This exercises the production client methods without claiming a LAN/device test.
  const client = new LiveTutorClient((url, options) => fetch(origin + new URL(url).pathname, options), undefined, true);
  client.configure('http://192.168.1.49:3000', process.env.CLIENT_ACCESS_TOKEN);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'b5-mobile-'));
  let current;
  try {
    const sample = fs.readFileSync(path.join(process.env.AI_MODEL_ROOT, 'test-hello.wav'));
    const body = new FormData(); body.append('audio', new Blob([sample], { type: 'audio/wav' }), 'test.wav');
    body.append('nativeLanguage', 'hi'); body.append('targetLanguage', 'en'); body.append('durationMs', '6000');
    const transcript = await client.transcribe(body);
    assert.match(transcript, /hello/i);
    console.log('PASS mobile client -> NestJS -> FastAPI -> real Whisper synthetic English transcription');
    const filename = path.join(temp, 'history.db');
    current = repository(filename); await current.repo.initialize();
    const controller = new TutorController(async () => current.repo, client, 'live');
    await controller.initialize();
    await controller.changePreferences({ ...controller.getSnapshot().preferences, correctionMode: 'end' });
    await controller.send(transcript);
    let state = controller.getSnapshot();
    assert.equal(state.error, null, state.error); assert.equal(state.turns.length, 1);
    assert.equal(state.turns[0].provider, 'local-v1');
    assert.deepEqual(visibleCorrections(state.turns[0], state.session), []);
    assert.match(state.turns[0].explanation, /[\u0900-\u097f]/);
    const id = state.session.id;
    console.log('PASS real Qwen reply, Hindi explanation, deferred feedback and SQLite save using mobile controller');
    let playbackCalls = 0;
    const speech = new SpeechController(client, {
      write: async (bytes) => {
        assert.equal(Buffer.from(bytes.subarray(0, 4)).toString(), 'RIFF'); assert.ok(bytes.length > 1000);
        const filename = path.join(temp, `reply-${playbackCalls}.wav`); fs.writeFileSync(filename, bytes); return filename;
      },
      play: async (uri) => { assert.ok(fs.statSync(uri).size > 1000); playbackCalls++; },
      pause: () => {}, remove: async (uri) => { if (fs.existsSync(uri)) fs.unlinkSync(uri); },
    });
    for (const persona of ['female', 'male']) {
      await speech.speak(state.turns[0].response, { ...state.preferences, persona });
      assert.equal(speech.getSnapshot().error, null, speech.getSnapshot().error);
    }
    speech.stop(); assert.equal(playbackCalls, 2);
    console.log('PASS real local male/female tutor response WAV through mobile speech controller; playback port stubbed, no audible-device claim');
    await controller.finish(); state = controller.getSnapshot();
    const expected = state.turns[0];
    current.db.close(); current = repository(filename); await current.repo.initialize();
    assert.deepEqual((await current.repo.turns(id))[0], expected);
    assert.equal((await current.repo.preferences()).correctionMode, 'end');
    assert.equal((await current.repo.sessions(0, 'mock')).length, 0);
    console.log('PASS real transcript, correction, explanation and response survive SQLite close/reopen; mock/live histories isolated');
    const voices = await client.voices();
    console.log('Installed live voices: ' + voices.map((v) => `${v.language}/${v.gender}/${v.label}`).join(', '));
    for (const target of ['hi', 'es']) {
      const input = target === 'hi' ? 'मैं हिंदी सीख रहा हूँ।' : 'Estoy aprendiendo español.';
      try {
        const feedback = await client.reply(input, { ...state.preferences, native: 'en', target });
        assert.equal(feedback.provider, 'local-v1');
        if (target === 'hi') assert.match(feedback.response, /[\u0900-\u097f]/);
        console.log(`PASS ${target} structured Qwen text compatibility probe (not a teaching-quality benchmark)`);
      } catch (error) { console.log(`FAIL ${target} Qwen text probe: ${error.message}`); process.exitCode = 1; }
      console.log(`${target} TTS voices: ${voices.filter((v) => v.language === target).length}; actual ${target} / mixed-language speech recognition NOT tested`);
    }
  } finally {
    client.disconnect(); current?.db.close(); fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
