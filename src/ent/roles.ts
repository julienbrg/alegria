export type Role = 'teacher' | 'user';

export type Profile =
  'Teacher' | 'Personnel' | 'Student' | 'Parent' | 'Super-admin';

const PROFILE_BY_TYPE: Record<string, Profile> = {
  Teacher: 'Teacher',
  Personnel: 'Personnel',
  Student: 'Student',
  Relative: 'Parent',
};
const PRECEDENCE: Profile[] = ['Teacher', 'Personnel', 'Student', 'Parent'];

/**
 * Maps an Edifice profile type to an Alegria profile. Super-admin wins over
 * any type; guests and unknown profiles get `null` and are refused at login.
 */
export function profileFromUserinfo(
  type: string | string[] | undefined,
  functions: Record<string, unknown> = {},
): Profile | null {
  if ('SUPER_ADMIN' in functions) return 'Super-admin';
  const types = Array.isArray(type) ? type : type ? [type] : [];
  const profiles = types.map((t) => PROFILE_BY_TYPE[t]);
  return PRECEDENCE.find((p) => profiles.includes(p)) ?? null;
}

/** Teachers edit; every other profile only uses. */
export function roleFromProfile(profile: Profile): Role {
  return profile === 'Teacher' ? 'teacher' : 'user';
}
