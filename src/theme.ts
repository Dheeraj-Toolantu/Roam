export const colors = {
  bg: '#0A0F2C',
  bgDeep: '#060A1F',
  card: '#141A3F',
  cardAlt: '#1B2250',
  cardBorder: 'rgba(139, 150, 255, 0.16)',
  input: '#10163A',
  text: '#FFFFFF',
  textMuted: '#A7B0D6',
  textDim: '#6B759F',
  purple: '#8B5CF6',
  violet: '#A855F7',
  cyan: '#22D3EE',
  blue: '#3B82F6',
  pink: '#EC4899',
  orange: '#F97316',
  green: '#22C55E',
  red: '#EF4444',
  yellow: '#FACC15',
  overlay: 'rgba(6, 10, 31, 0.72)',
};

export const gradients = {
  brand: ['#22D3EE', '#8B5CF6'] as const,
  primary: ['#22D3EE', '#6366F1', '#A855F7'] as const,
  purple: ['#A855F7', '#6366F1'] as const,
  sunset: ['#F97316', '#EC4899', '#8B5CF6'] as const,
  screen: ['#0A0F2C', '#16124A', '#0A0F2C'] as const,
  logo: ['#22D3EE', '#8B5CF6', '#F97316'] as const,
  danger: ['#F43F5E', '#EF4444'] as const,
  success: ['#22C55E', '#10B981'] as const,
};

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const type = {
  hero: { fontSize: 34, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.5 },
  h1: { fontSize: 26, fontWeight: '800' as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textMuted },
  tiny: { fontSize: 11, color: colors.textMuted },
};
