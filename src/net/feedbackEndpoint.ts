import { readSharedModeConfig } from './sharedConfig';

/** HTTP intake origin for solo or shared feedback. */
export function feedbackEndpointForPage(url: URL): string {
  const configured = import.meta.env.VITE_FEEDBACK_HTTP_ENDPOINT?.trim();
  if (configured) {
    const endpoint = new URL(configured);
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
      throw new Error('The feedback server must use an http:// or https:// address.');
    }
    return endpoint.toString().replace(/\/$/, '');
  }
  const shared = readSharedModeConfig(url);
  if (shared) return shared.httpEndpoint;
  return import.meta.env.DEV ? 'http://localhost:2567' : url.origin;
}
