import { HttpException, Injectable } from '@nestjs/common';
import type { Config } from './config.js';

export async function readBounded(response: Response, limit: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) return Buffer.concat(chunks);
    bytes += next.value.length;
    if (bytes > limit) { await reader.cancel(); throw new HttpException('AI response exceeded limit', 502); }
    chunks.push(next.value);
  }
}

@Injectable()
export class Upstream {
  constructor(private readonly cfg: Config) {}
  async call(path: string, body?: FormData | object, binary = false, onMode?: (mode: string) => void): Promise<Buffer> {
    const method = body ? 'POST' : 'GET';
    const attempts = method === 'GET' ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const multipart = body instanceof FormData;
        const response = await fetch(this.cfg.aiUrl + path, {
          method, redirect: 'error', signal: AbortSignal.timeout(this.cfg.timeout),
          headers: { Authorization: `Bearer ${this.cfg.serviceToken}`, ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? multipart ? body : JSON.stringify(body) : undefined,
        });
        const bytes = await readBounded(response, binary ? this.cfg.maxUpload : 65536);
        if (!response.ok) {
          // Never relay internal service configuration, stack traces or upstream response bodies.
          const status = [400, 413, 415, 422, 429, 503, 504].includes(response.status) ? response.status : 502;
          throw new HttpException(status === 503 ? 'Local AI model or service is not ready' : `AI processing returned HTTP ${status}`, status);
        }
        if (binary && !response.headers.get('content-type')?.startsWith('audio/wav')) throw new HttpException('Invalid AI audio response', 502);
        if (binary) {
          const mode = response.headers.get('x-ai-mode');
          if (mode !== 'live' && mode !== 'fixture') throw new HttpException('Missing AI audio provenance', 502);
          onMode?.(mode);
        }
        return bytes;
      } catch (error) {
        if (error instanceof HttpException) throw error;
        if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new HttpException('AI service timed out', 504);
        if (attempt + 1 < attempts) { await new Promise((resolve) => setTimeout(resolve, 100)); continue; }
        throw new HttpException('AI service is unavailable', 503);
      }
    }
    throw new HttpException('AI service is unavailable', 503);
  }
  async json(path: string, body?: FormData | object): Promise<unknown> {
    const bytes = await this.call(path, body);
    try { return JSON.parse(bytes.toString('utf8')); }
    catch { throw new HttpException('AI service returned invalid JSON', 502); }
  }
}
