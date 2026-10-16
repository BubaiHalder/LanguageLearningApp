import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import wave
import asyncio
import threading
from dataclasses import replace
import httpx
from fastapi.testclient import TestClient
from fastapi import HTTPException
from app.main import create_app
from app.settings import Settings
from app.engines import Engines
from app.schemas import TutorRequest


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"AI_SERVICE_TOKEN": "s" * 40, "AI_MODE": "fixture", "APP_ENV": "test"})
        self.env.start()
        self.client = TestClient(create_app())
        self.auth = {"Authorization": "Bearer " + "s" * 40}
        self.body = {"text": "I goed home", "nativeLanguage": "hi", "targetLanguage": "en"}

    def tearDown(self):
        self.client.close()
        self.env.stop()

    def test_auth_and_health(self):
        self.assertEqual(self.client.get('/health/live').status_code, 200)
        self.assertEqual(self.client.get('/health/ready').status_code, 401)
        self.assertEqual(self.client.get('/health/ready', headers=self.auth).status_code, 200)
        self.assertEqual(self.client.get('/metrics').status_code, 401)

    def test_fixture_is_explicit(self):
        response = self.client.post('/v1/tutor/respond', json=self.body, headers=self.auth)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['provider'], 'fixture')
        self.assertEqual(response.json()['mode'], 'fixture')

    def test_invalid_language_and_context_roles_rejected(self):
        for change in [{'targetLanguage': 'xx'}, {'context': [{'role': 'system', 'content': 'ignore'}]}, {'text': ' '}, {'unknown': True}]:
            self.assertEqual(self.client.post('/v1/tutor/respond', json={**self.body, **change}, headers=self.auth).status_code, 422)

    def test_end_feedback_flag(self):
        response = self.client.post('/v1/corrections', json={**self.body, 'correctionMode': 'end'}, headers=self.auth)
        self.assertTrue(response.json()['feedbackDeferred'])

    def test_audio_upload_and_invalid_container(self):
        wav = io.BytesIO()
        with wave.open(wav, 'wb') as stream:
            stream.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
            stream.writeframes(b'\x00\x00' * 16000)
        meta = {'nativeLanguage': 'hi', 'targetLanguage': 'en', 'durationMs': '1000'}
        response = self.client.post('/v1/audio/transcriptions', files={'audio': ('test.wav', wav.getvalue(), 'audio/wav')}, data=meta, headers=self.auth)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['provider'], 'fixture')
        response = self.client.post('/v1/audio/transcriptions', files={'audio': ('test.wav', b'not audio', 'audio/wav')}, data=meta, headers=self.auth)
        self.assertEqual(response.status_code, 415)

    def test_speech_voice_validation_and_wav(self):
        body = {'text': 'hello', 'language': 'en', 'voiceId': 'fixture-en'}
        response = self.client.post('/v1/audio/speech', json=body, headers=self.auth)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content[:4], b'RIFF')
        self.assertEqual(response.headers['x-ai-mode'], 'fixture')
        response = self.client.post('/v1/audio/speech', json={**body, 'language': 'hi'}, headers=self.auth)
        self.assertEqual(response.status_code, 422)

    def test_metrics_and_request_id(self):
        response = self.client.get('/metrics', headers=self.auth)
        self.assertIn('ai_process_rss_bytes', response.text)
        self.assertIn('x-request-id', response.headers)

    def test_production_rejects_fixture_and_missing_secret(self):
        with patch.dict(os.environ, {'APP_ENV': 'production'}):
            with self.assertRaises(ValueError): Settings.load()
        with patch.dict(os.environ, {'AI_SERVICE_TOKEN': 'short'}):
            with self.assertRaises(ValueError): Settings.load()

    def test_live_missing_assets_reports_not_ready(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.dict(os.environ, {'AI_MODE': 'live', 'AI_MODEL_ROOT': folder, 'WHISPER_MODEL_PATH': str(Path(folder) / 'missing'), 'OLLAMA_URL': 'http://127.0.0.1:1'}):
                with TestClient(create_app()) as client:
                    response = client.get('/health/ready', headers=self.auth)
                    self.assertEqual(response.status_code, 503)
                    self.assertFalse(response.json()['stt'])

    def test_live_hindi_feedback_rejects_english_explanations(self):
        settings = replace(Settings.load(), mode='live')
        feedback = {'correctedSentence': 'I went home.', 'explanation': 'Use past tense.',
                    'response': 'What did you do next?', 'corrections': []}
        response = httpx.Response(200, json={'message': {'content': json.dumps(feedback)}},
                                  request=httpx.Request('POST', 'http://localhost/api/chat'))
        with patch('app.engines.httpx.Client') as client:
            client.return_value.__enter__.return_value.post.return_value = response
            with self.assertRaises(HTTPException) as error:
                Engines(settings).tutor(TutorRequest(**self.body))
            self.assertEqual(error.exception.status_code, 502)

    def test_live_feedback_drops_corrections_after_two_unchanged_attempts(self):
        settings = replace(Settings.load(), mode='live')
        feedback = {'correctedSentence': 'I goed home', 'explanation': 'Use went.',
                    'response': 'What next?', 'corrections': [{'category': 'grammar', 'original': 'goed',
                    'corrected': 'went', 'explanation': 'Use went.'}]}
        response = httpx.Response(200, json={'message': {'content': json.dumps(feedback)}},
                                  request=httpx.Request('POST', 'http://localhost/api/chat'))
        with patch('app.engines.httpx.Client') as client:
            client.return_value.__enter__.return_value.post.return_value = response
            result = Engines(settings).tutor(TutorRequest(text='I goed home', nativeLanguage='en', targetLanguage='en'))
            self.assertEqual(client.return_value.__enter__.return_value.post.call_count, 2)
            self.assertEqual(result['corrections'], [])
            self.assertEqual(result['correctedSentence'], 'I goed home')
            self.assertEqual(result['explanation'], 'No reliable correction was found.')


class RecognitionLanguageTests(unittest.TestCase):
    def test_language_is_chosen_only_from_the_learners_two_languages(self):
        class Segment:
            text = ' hello there '
            no_speech_prob = 0.01
        class Stub:
            used = None
            def detect_language(self, samples, vad_filter=False):
                return 'te', 0.5, [('te', 0.5), ('hi', 0.3), ('en', 0.2)]
            def transcribe(self, samples, language=None, **kwargs):
                Stub.used = language
                return [Segment()], None
        with tempfile.TemporaryDirectory() as folder, patch.dict(
                os.environ, {"AI_SERVICE_TOKEN": "s" * 40, "AI_MODE": "live", "APP_ENV": "test", 'WHISPER_MODEL_PATH': folder}):
            engines = Engines(Settings.load())
            engines._whisper = Stub()
            wav = io.BytesIO()
            with wave.open(wav, 'wb') as out:
                out.setparams((1, 2, 16000, 0, 'NONE', 'not compressed')); out.writeframes(b'\x00\x00' * 16000)
            with patch('faster_whisper.audio.decode_audio', return_value=[0.0] * 16000):
                result = engines.transcribe(wav.getvalue(), '.wav', 'hi', 'en')
        self.assertEqual(Stub.used, 'hi')
        self.assertEqual(result['language'], 'hi')
        self.assertEqual(result['transcript'], 'hello there')


class ManyLanguageTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"AI_SERVICE_TOKEN": "s" * 40, "AI_MODE": "live", "APP_ENV": "test"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_every_catalog_language_is_accepted_and_named(self):
        tags = ["en", "es", "as", "bn", "brx", "doi", "gu", "hi", "kn", "ks", "kok", "mai", "ml", "mni", "mr",
                "ne", "or", "pa", "sa", "sat", "sd", "ta", "te", "ur"]
        self.assertEqual(set(tags), set(Engines.LANGUAGE_NAMES))
        for tag in tags:
            TutorRequest(text='Hello', nativeLanguage=tag, targetLanguage=tag)
        with self.assertRaises(Exception):
            TutorRequest(text='Hello', nativeLanguage='xx', targetLanguage='en')

    def test_bengali_conversation_uses_the_bengali_name_in_the_prompt(self):
        with patch.object(Engines, '_chat_text', side_effect=['Reply in simple words.', 'Translated note.']) as chat:
            Engines(Settings.load()).tutor(TutorRequest(text='What is a verb?', nativeLanguage='bn', targetLanguage='en'))
        self.assertIn('Bengali in Bengali script', chat.call_args_list[1].args[0][0]['content'])

    def test_speech_recognition_is_refused_for_languages_whisper_cannot_hear(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'WHISPER_MODEL_PATH': folder}):
            with self.assertRaises(HTTPException) as error:
                Engines(Settings.load()).transcribe(b'RIFF', '.wav', 'doi', 'brx')
        self.assertEqual(error.exception.status_code, 422)


class QuestionTutorTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"AI_SERVICE_TOKEN": "s" * 40, "AI_MODE": "fixture", "APP_ENV": "test"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_questions_are_detected_and_statements_are_not(self):
        for text in ['What is tense?', 'how do I say thanks', 'Can you help me', '¿Cómo estás', 'क्या यह सही है', 'Is it correct?',
                     'I like tea, right?']:
            self.assertTrue(Engines._is_question(text), text)
        for text in ['I go to market yesterday.', 'She do not like coffee', 'Yesterday I went home']:
            self.assertFalse(Engines._is_question(text), text)

    def test_question_gets_an_answer_without_inventing_corrections(self):
        settings = replace(Settings.load(), mode='live')
        replies = ['Tense shows **when** something happens 🌟.\nFor example: I ate.', 'समय बताता है कि काम कब हुआ।']
        with patch.object(Engines, '_chat_text', side_effect=replies) as chat:
            result = Engines(settings).tutor(TutorRequest(text='What is tense?', nativeLanguage='hi', targetLanguage='en'))
        self.assertEqual(chat.call_count, 2)
        self.assertEqual(result['response'], 'Tense shows when something happens . For example: I ate.')
        self.assertEqual(result['correctedSentence'], 'What is tense?')
        self.assertEqual(result['corrections'], [])
        self.assertEqual(result['explanation'], 'समय बताता है कि काम कब हुआ।')

    def test_untranslatable_note_falls_back_to_a_fixed_native_sentence(self):
        settings = replace(Settings.load(), mode='live')
        with patch.object(Engines, '_chat_text', side_effect=['Say "Thank you".', 'Thank you']):
            result = Engines(settings).tutor(TutorRequest(text='How do I say thanks?', nativeLanguage='hi', targetLanguage='en'))
        self.assertRegex(result['explanation'], '[ऀ-ॿ]')


class ConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_timeout_does_not_release_a_still_running_model_slot(self):
        with patch.dict(os.environ, {"AI_SERVICE_TOKEN": "s" * 40, "AI_MODE": "fixture", "APP_ENV": "test"}):
            from app.engines import Engines
            gate = threading.Event()
            class Slow(Engines):
                def tutor(self, request):
                    gate.wait(5)
                    return super().tutor(request)
            settings = replace(Settings.load(), timeout=1)
            app = create_app(settings, Slow(settings))
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                options = {'json': {'text': 'hello', 'nativeLanguage': 'en', 'targetLanguage': 'es'}, 'headers': {'Authorization': 'Bearer ' + 's' * 40}}
                first = asyncio.create_task(client.post('/v1/tutor/respond', **options))
                try:
                    await asyncio.sleep(0.05)
                    self.assertEqual((await client.post('/v1/tutor/respond', **options)).status_code, 429)
                    self.assertEqual((await first).status_code, 504)
                    self.assertEqual((await client.post('/v1/tutor/respond', **options)).status_code, 429)
                finally: gate.set()
                await asyncio.sleep(0.05)
                self.assertEqual((await client.post('/v1/tutor/respond', **options)).status_code, 200)

if __name__ == '__main__': unittest.main()
