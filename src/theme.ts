/**
 * ROAM design tokens — light "JodoDeal" style: slate-50 canvas, white cards with a soft
 * shadow and a thin ink ring, ink (deep indigo) text and the orange → pink brand gradient.
 *
 * Key names are kept from the previous theme so every screen picks up the new look:
 * `cyan` is the primary accent (now brand orange), `purple`/`violet` are the ink/pink pair.
 */
export const colors = {
  bg: '#F8FAFC', // slate-50
  bgDeep: '#F1F5F9',
  card: '#FFFFFF',
  cardAlt: '#F5F5FB', // ink-50
  cardBorder: '#EBEAF6', // ink-100
  input: '#F5F5FB',
  text: '#1B1838', // ink-900
  textMuted: '#6157A9', // ink-500
  textDim: '#8279C1', // ink-400
  onBrand: '#FFFFFF',
  brand: '#FE4A16', // brand-500
  brandDark: '#EF300C',
  brandSoft: '#FFF4ED', // brand-50
  ink: '#1B1838',
  ink700: '#3F3774',
  purple: '#4D438E', // ink-600
  violet: '#E11D74',
  cyan: '#FE4A16', // primary accent (brand orange)
  blue: '#3B82F6',
  pink: '#E11D74',
  orange: '#FF6F3C',
  green: '#16A34A',
  red: '#E11D48',
  yellow: '#F59E0B',
  overlay: 'rgba(17, 15, 38, 0.55)',
};

export const gradients = {
  brand: ['#FF6F3C', '#FE4A16', '#E11D74'] as const,
  primary: ['#FF6F3C', '#FE4A16', '#E11D74'] as const,
  purple: ['#1B1838', '#3F3774'] as const, // ink gradient
  sunset: ['#FF6F3C', '#E11D74', '#6157A9'] as const,
  screen: ['#F8FAFC', '#F8FAFC'] as const,
  logo: ['#FF6F3C', '#FE4A16', '#E11D74'] as const,
  danger: ['#F43F5E', '#E11D48'] as const,
  success: ['#22C55E', '#16A34A'] as const,
  hero: ['#1B1838', '#3F3774', '#E11D74'] as const,
};

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** JodoDeal "shadow-soft" + "shadow-glow" equivalents. */
export const shadows = {
  soft: { shadowColor: '#1B1838', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  lift: { shadowColor: '#1B1838', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  glow: { shadowColor: '#FE4A16', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
};

export const type = {
  hero: { fontSize: 34, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.5 },
  h1: { fontSize: 26, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.3 },
  h2: { fontSize: 20, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.2 },
  h3: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textMuted },
  tiny: { fontSize: 11, color: colors.textDim },
};

/** Text styles for content placed on photos / dark gradients. */
export const onDark = {
  h1: { ...type.h1, color: '#fff' },
  h2: { ...type.h2, color: '#fff' },
  h3: { ...type.h3, color: '#fff' },
  body: { ...type.body, color: '#fff' },
  small: { ...type.small, color: '#ffffffd9' },
  tiny: { ...type.tiny, color: '#ffffffb3' },
};
