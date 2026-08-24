import { extractGclid } from '../../lib/gclid';

describe('extractGclid', () => {
  it('extracts gclid and captured-at from a valid _gcl_aw cookie', () => {
    const result = extractGclid('foo=bar; _gcl_aw=GCL.1692454800.TEST123456; other=1');
    expect(result.gclid).toBe('TEST123456');
    expect(result.gclidCapturedAt).toEqual(new Date(1692454800 * 1000));
  });

  it('returns nulls when the cookie header is missing entirely', () => {
    expect(extractGclid(undefined)).toEqual({ gclid: null, gclidCapturedAt: null });
  });

  it('returns nulls when _gcl_aw is absent from the cookie header', () => {
    expect(extractGclid('session=abc; theme=dark')).toEqual({ gclid: null, gclidCapturedAt: null });
  });

  it('returns nulls without throwing on a malformed cookie value', () => {
    expect(extractGclid('_gcl_aw=abc')).toEqual({ gclid: null, gclidCapturedAt: null });
  });

  it('returns nulls when the gclid segment is empty', () => {
    expect(extractGclid('_gcl_aw=GCL.1692454800.')).toEqual({ gclid: null, gclidCapturedAt: null });
  });

  it('still extracts gclid when the timestamp segment is not numeric', () => {
    const result = extractGclid('_gcl_aw=GCL.notanumber.TEST123456');
    expect(result.gclid).toBe('TEST123456');
    expect(result.gclidCapturedAt).toBeNull();
  });
});
