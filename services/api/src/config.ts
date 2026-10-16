import { createHash, timingSafeEqual } from 'node:crypto';

export function positive(name: string, fallback: number, max = 600000): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}`);
  return value;
}
export function secret(name: string): string {
  const value = process.env[name] ?? '';
  if (value.length < 32 || value.startsWith('CHANGE_')) throw new Error(`${name} must be a generated secret of at least 32 characters`);
  return value;
}
export function sameSecret(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
export function config() {
  const environment = process.env.APP_ENV ?? 'development';
  const authMode = process.env.AUTH_MODE ?? 'token';
  if (!['development', 'test', 'production'].includes(environment) || !['token', 'jwt'].includes(authMode)) throw new Error('Invalid environment/auth mode');
  if (environment === 'production' && authMode !== 'jwt') throw new Error('Production requires JWT client authentication');
  const aiUrl = new URL(process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:8000');
  if (!['http:', 'https:'].includes(aiUrl.protocol) || aiUrl.username || aiUrl.password || aiUrl.search || aiUrl.hash || aiUrl.pathname !== '/') throw new Error('Invalid AI_SERVICE_URL origin');
  const serviceToken = secret('AI_SERVICE_TOKEN');
  const clientToken = authMode === 'token' ? secret('CLIENT_ACCESS_TOKEN') : '';
  if (clientToken === serviceToken) throw new Error('Client and internal service credentials must differ');
  const metricsToken = secret('METRICS_TOKEN');
  const jwtIssuer = process.env.JWT_ISSUER ?? '';
  const jwtAudience = process.env.JWT_AUDIENCE ?? '';
  const jwksUrl = process.env.JWT_JWKS_URL ?? '';
  if (authMode === 'jwt' && (!jwtIssuer || !jwtAudience || !jwksUrl.startsWith('https://'))) throw new Error('JWT issuer, audience and HTTPS JWKS URL required');
  return { environment, authMode, aiUrl: aiUrl.origin, serviceToken, clientToken, metricsToken,
    jwtIssuer, jwtAudience, jwksUrl, host: process.env.API_HOST ?? '127.0.0.1',
    port: positive('API_PORT', 3000, 65535), maxUpload: positive('MAX_UPLOAD_BYTES', 10485760, 20971520),
    timeout: positive('UPSTREAM_TIMEOUT_MS', 125000), maxConcurrent: positive('API_CONCURRENCY', 2, 32),
    rateLimit: positive('RATE_LIMIT_PER_MINUTE', 30, 10000) };
}
export type Config = ReturnType<typeof config>;
