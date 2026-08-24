/**
 * Google Ads click-id (gclid) extraction from the Conversion Linker cookie.
 *
 * GTM's "Conversion Linker" tag sets a `_gcl_aw` cookie shaped like
 * `GCL.<unix-seconds>.<gclid>`. We only ever read it here — the tag itself
 * is out of scope and must not be touched.
 */

export interface GclidData {
  gclid: string | null;
  gclidCapturedAt: Date | null;
}

const NO_GCLID: GclidData = { gclid: null, gclidCapturedAt: null };

/** Reads a single cookie value out of a raw `Cookie` request header. */
function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(pair.slice(eq + 1).trim());
    } catch {
      return pair.slice(eq + 1).trim();
    }
  }
  return undefined;
}

/**
 * Extracts { gclid, gclidCapturedAt } from the `_gcl_aw` cookie on an HTTP
 * request. Never throws — any missing/malformed input is expected traffic
 * (direct, email, social) and simply yields null values.
 */
export function extractGclid(cookieHeader: string | undefined): GclidData {
  const raw = readCookie(cookieHeader, '_gcl_aw');
  if (!raw) return NO_GCLID;

  const parts = raw.split('.');
  if (parts.length < 3 || !parts[2]) return NO_GCLID;

  const gclid = parts[2];
  const timestampSeconds = Number(parts[1]);
  const gclidCapturedAt = Number.isFinite(timestampSeconds) && timestampSeconds > 0
    ? new Date(timestampSeconds * 1000)
    : null;

  return { gclid, gclidCapturedAt };
}
