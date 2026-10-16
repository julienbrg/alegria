import type { Profile } from '../ent/roles';

const PROFILES: Profile[] = [
  'Teacher',
  'Personnel',
  'Student',
  'Parent',
  'Super-admin',
];

/** Questions allowed per day, by profile. A missing profile is unlimited. */
export type AskLimits = Partial<Record<Profile, number>>;

/**
 * Parses `ASK_DAILY_LIMITS`, such as `Student:30,Teacher:100`. Throws on an
 * unknown profile, a repeated one, or a count that is not a positive integer.
 */
export function parseAskLimits(value: string): AskLimits {
  const limits: AskLimits = {};
  for (const entry of value.split(',').map((s) => s.trim())) {
    if (!entry) continue;
    const [profile, count, ...rest] = entry.split(':').map((s) => s.trim());
    if (!PROFILES.includes(profile as Profile)) {
      throw new Error(`unknown profile "${profile}"`);
    }
    if (rest.length > 0 || !/^[1-9]\d*$/.test(count ?? '')) {
      throw new Error(`"${entry}" needs a positive integer count`);
    }
    if (profile in limits) {
      throw new Error(`profile "${profile}" is listed twice`);
    }
    limits[profile as Profile] = Number(count);
  }
  return limits;
}
