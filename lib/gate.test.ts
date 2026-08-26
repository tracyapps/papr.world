/**
 * The alpha door, tested.
 *
 * This is the one piece of the site where being wrong has a consequence: too
 * strict and invited testers cannot get in, too loose and the invite-only
 * alpha is not invite-only. So every way a pass should be refused is written
 * down here rather than assumed.
 */
import { describe, expect, it } from 'vitest';
import {
  acceptedCodes,
  cookieFromHeader,
  COOKIE_NAME,
  gateIsOpen,
  mintPass,
  passCookie,
  readPass,
  tidyCode,
} from './gate';

const SECRET = 'a-long-random-secret-for-testing-only';

describe('tidyCode', () => {
  it('accepts what a person would actually type', () => {
    expect(tidyCode('wren42')).toBe('WREN-42');
    expect(tidyCode(' Fern-73 ')).toBe('FERN-73');
    expect(tidyCode('WREN 42')).toBe('WREN-42');
  });

  it('refuses the letters and digits that are ambiguous out loud', () => {
    // This rule has teeth: a plausible-looking code with a 1 or a 0 in it is
    // silently NOT a code, so an example like FERN-19 in a README would land
    // in PAPR_ALPHA_CODES and quietly never work.
    // I and O are excluded so a code read over the phone has one spelling.
    expect(tidyCode('IREN-42')).toBeNull();
    expect(tidyCode('WOEN-42')).toBeNull();
    // 0 and 1 for the same reason.
    expect(tidyCode('WREN-40')).toBeNull();
    expect(tidyCode('WREN-41')).toBeNull();
  });

  it('refuses anything that is not the shape', () => {
    for (const bad of ['', 'WREN', 'WREN-4', 'WRENN-42', 'WREN-422', '../../etc', null, 42, {}]) {
      expect(tidyCode(bad)).toBeNull();
    }
  });
});

describe('the code list', () => {
  it('tidies and filters whatever is in the environment variable', () => {
    const env = { PAPR_ALPHA_CODES: 'wren42, FERN-73 , nonsense,, WREN-42' };
    expect(acceptedCodes(env)).toEqual(['WREN-42', 'FERN-73', 'WREN-42']);
  });

  it('treats an unset or empty list as an unlocked door', () => {
    expect(gateIsOpen({})).toBe(true);
    expect(gateIsOpen({ PAPR_ALPHA_CODES: '' })).toBe(true);
    expect(gateIsOpen({ PAPR_ALPHA_CODES: '   ,  ' })).toBe(true);
    // …and anything valid as a locked one.
    expect(gateIsOpen({ PAPR_ALPHA_CODES: 'WREN-42' })).toBe(false);
  });
});

describe('passes', () => {
  it('mints one that reads back', async () => {
    const pass = await mintPass('WREN-42', SECRET);
    const read = await readPass(pass, SECRET);
    expect(read?.code).toBe('WREN-42');
    expect(read!.expires).toBeGreaterThan(Date.now());
  });

  it('refuses a pass signed with a different secret', async () => {
    const pass = await mintPass('WREN-42', SECRET);
    // This is what rotating PAPR_ALPHA_SECRET does: every pass dies at once.
    expect(await readPass(pass, 'some-other-secret')).toBeNull();
  });

  it('refuses a pass whose code has been swapped', async () => {
    const pass = await mintPass('WREN-42', SECRET);
    expect(await readPass(pass.replace('WREN-42', 'FERN-73'), SECRET)).toBeNull();
  });

  it('refuses a pass whose expiry has been pushed out', async () => {
    const pass = await mintPass('WREN-42', SECRET);
    const [code, expires, signature] = pass.split('.');
    const later = `${code}.${Number(expires) + 999_999}.${signature}`;
    expect(await readPass(later, SECRET)).toBeNull();
  });

  it('refuses an expired pass even when the signature is genuine', async () => {
    // Signed correctly, but for a moment that has already passed.
    const pass = await mintPass('WREN-42', SECRET);
    const [code, , signature] = pass.split('.');
    expect(await readPass(`${code}.1.${signature}`, SECRET)).toBeNull();
  });

  it('refuses nonsense and nothing at all', async () => {
    for (const bad of [undefined, '', 'nonsense', 'a.b', 'a.b.c.d']) {
      expect(await readPass(bad, SECRET)).toBeNull();
    }
  });
});

describe('the cookie', () => {
  it('cannot be read by scripts on the page', () => {
    const cookie = passCookie('anything');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('is found among other cookies, and not confused with them', () => {
    const header = `other=1; ${COOKIE_NAME}=the-pass; papr_passenger=no`;
    expect(cookieFromHeader(header, COOKIE_NAME)).toBe('the-pass');
    expect(cookieFromHeader('other=1', COOKIE_NAME)).toBeUndefined();
    expect(cookieFromHeader(null, COOKIE_NAME)).toBeUndefined();
  });
});
