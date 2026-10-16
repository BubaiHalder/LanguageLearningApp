import 'reflect-metadata';
import { Body, Catch, Controller, ExceptionFilter, ArgumentsHost, Get, HttpException, Module,
  Post, Res, UploadedFile, UseInterceptors, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config, sameSecret, type Config } from './config.js';
import { SpeechRequest, TranscriptionRequest, TutorRequest } from './contracts.js';
import { Upstream } from './upstream.js';

@Catch()
class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    response.status(status).json({ error: { code: status, message: status === 500 ? 'API processing failed' :
      status === 400 ? 'Invalid request fields or upload' : error instanceof Error ? error.message : 'Request failed' },
      requestId: response.getHeader('X-Request-ID') });
  }
}

@Controller()
class ApiController {
  constructor(private readonly upstream: Upstream) {}
  @Get('health/live') live() { return { status: 'alive' }; }
  @Get('health/ready') ready() { return this.upstream.json('/health/ready'); }
  @Get('v1/voices') voices() { return this.upstream.json('/v1/voices'); }
  @Post('v1/tutor/respond') tutor(@Body() body: TutorRequest) { return this.upstream.json('/v1/tutor/respond', body); }
  @Post('v1/corrections') corrections(@Body() body: TutorRequest) { return this.upstream.json('/v1/corrections', body); }
  @Post('v1/audio/speech') async speech(@Body() body: SpeechRequest, @Res() response: Response) {
    const bytes = await this.upstream.call('/v1/audio/speech', body, true, (mode) => response.setHeader('X-AI-Mode', mode));
    response.type('audio/wav').send(bytes);
  }
  @Post('v1/audio/transcriptions')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 3, fieldSize: 256 } }))
  async transcription(@UploadedFile() audio: Express.Multer.File | undefined, @Body() body: TranscriptionRequest) {
    if (!audio?.buffer?.length) throw new HttpException('Audio file required', 400);
    const form = new FormData();
    form.append('audio', new Blob([Uint8Array.from(audio.buffer)], { type: audio.mimetype }), 'recording.audio');
    form.append('nativeLanguage', body.nativeLanguage);
    form.append('targetLanguage', body.targetLanguage);
    form.append('durationMs', String(body.durationMs));
    return this.upstream.json('/v1/audio/transcriptions', form);
  }
}

export async function createApplication(cfg: Config = config()) {
  @Module({ controllers: [ApiController], providers: [{ provide: Upstream, useValue: new Upstream(cfg) }] })
  class ApiModule {}
  const app = await NestFactory.create(ApiModule, { logger: ['error', 'warn'], bodyParser: false });
  const { json } = await import('express');
  // Authenticate and enforce limits before parsing JSON/multipart.
  let active = 0;
  let count = 0;
  let rejected = 0;
  let totalMs = 0;
  const windows = new Map<string, { reset: number; count: number }>();
  const jwks = cfg.authMode === 'jwt' ? createRemoteJWKSet(new URL(cfg.jwksUrl)) : null;
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-ID', randomUUID());
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'GET' && req.path === '/health/live') return next();
    if (req.method === 'GET' && req.path === '/metrics') {
      if (!sameSecret(req.headers.authorization ?? '', `Bearer ${cfg.metricsToken}`)) return res.status(401).end();
      const memory = process.memoryUsage();
      return res.type('text/plain').send(`api_requests_total ${count}\napi_rejected_total ${rejected}\napi_active_requests ${active}\napi_request_milliseconds_total ${totalMs}\napi_process_rss_bytes ${memory.rss}\napi_process_cpu_seconds ${(process.cpuUsage().user + process.cpuUsage().system) / 1000000}\n`);
    }
    let principal = 'development-client';
    try {
      const auth = req.headers.authorization ?? '';
      if (cfg.authMode === 'token') {
        if (!sameSecret(auth, `Bearer ${cfg.clientToken}`)) throw new Error('unauthorized');
      } else {
        if (!auth.startsWith('Bearer ') || !jwks) throw new Error('unauthorized');
        const { payload } = await jwtVerify(auth.slice(7), jwks, { issuer: cfg.jwtIssuer, audience: cfg.jwtAudience, algorithms: ['RS256', 'ES256'] });
        if (!payload.sub || typeof payload.scope !== 'string' || !payload.scope.split(' ').includes('tutor:use')) throw new Error('missing scope');
        principal = payload.sub;
      }
    } catch { rejected++; return res.status(401).json({ error: { code: 'unauthorized', message: 'Client authentication required' } }); }
    const now = Date.now();
    for (const [key, value] of windows) if (value.reset < now) windows.delete(key);
    if (windows.size >= 10000 && !windows.has(principal)) return res.status(429).end();
    const bucket = windows.get(principal) ?? { reset: now + 60000, count: 0 };
    windows.set(principal, bucket);
    if (++bucket.count > cfg.rateLimit || active >= cfg.maxConcurrent) {
      rejected++; res.setHeader('Retry-After', '5');
      return res.status(429).json({ error: { code: 'busy', message: 'Rate or concurrency limit reached; retry later' } });
    }
    if (req.method === 'POST') {
      const length = Number(req.headers['content-length']);
      if (!Number.isSafeInteger(length) || length < 0) return res.status(411).end();
      if (length > cfg.maxUpload + 16384) return res.status(413).end();
    }
    active++; count++;
    const start = performance.now();
    let released = false;
    const release = () => { if (!released) { released = true; active--; totalMs += performance.now() - start; } };
    res.once('finish', release); res.once('close', release);
    next();
  });
  app.use(json({ limit: '64kb' }));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  await app.init();
  // Do not trust arbitrary X-Forwarded-For from clients. Limits use authenticated identity.
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  return app;
}
