import { describe, expect, it } from 'vitest';

import {
  isCustomTranslatorAllowed,
  isCustomTTSAllowed,
  isCloudSyncAllowed,
  isAbsOfflineAllowed,
  isNearbyPairingAllowed,
  isTTSCacheAllowed,
  isPersonalEdition,
} from '@/utils/access';

describe('personal edition access policy', () => {
  it('allows local user-configured services without a Readest session', () => {
    const expected = process.env['NEXT_PUBLIC_READEST_PERSONAL_EDITION'] === 'true';
    expect(isPersonalEdition()).toBe(expected);
    expect(isCustomTranslatorAllowed(null)).toBe(expected);
    expect(isCustomTTSAllowed(null)).toBe(expected);
    expect(isCloudSyncAllowed('free', false)).toBe(expected);
    expect(isAbsOfflineAllowed('free', false)).toBe(expected);
    expect(isNearbyPairingAllowed('free', false)).toBe(expected);
    expect(isTTSCacheAllowed('free', false)).toBe(expected);
  });
});
