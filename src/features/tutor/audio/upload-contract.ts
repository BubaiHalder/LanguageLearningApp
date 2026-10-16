/** Development permits private IPv4; release builds require the configured HTTPS origin. */
export function transcriptionEndpoint(baseUrl: string, configuredOrigin?: string, development = true): string {
  let url: URL;
  try { url = new URL(baseUrl.trim()); }
  catch { throw new Error('Enter the PC LAN URL, for example http://192.168.1.49:3000.'); }
  const parts = url.hostname.split('.').map(Number);
  const valid = parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
  const configuredHttps = configuredOrigin?.replace(/\/$/, '') === url.origin && url.protocol === 'https:';
  if (!(development && valid || configuredHttps) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use a private LAN origin in development or the configured HTTPS service origin. Credentials and URL paths are not allowed.');
  }
  return `${url.origin}/v1/audio/transcriptions`;
}
export function parseTranscription(value: unknown): string {
  if (!value || typeof value !== 'object' || !('transcript' in value) || typeof value.transcript !== 'string') {
    throw new Error('The backend returned an invalid transcription response.');
  }
  const text = value.transcript.trim();
  if (!text || text.length > 2000) throw new Error('No clear speech was recognized, or the transcript was too long. Record again.');
  return text;
}
