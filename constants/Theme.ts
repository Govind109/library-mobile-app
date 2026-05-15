import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

/** ERP-style palette (navy header, cool gray canvas, pastel stat chips) */
export const palette = {
  canvas: '#F4F6FA',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  overlay: 'rgba(15, 23, 42, 0.45)',
  border: 'rgba(26, 54, 124, 0.12)',
  borderSubtle: 'rgba(26, 54, 124, 0.08)',
  text: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  textHint: '#94a3b8',
  /** Primary navy — headers, hero cards */
  primary: '#1A367C',
  primaryDark: '#142a5c',
  /** Soft blue chip / tab active (reference) */
  primarySoft: '#E0F2FE',
  mint: '#A7F3D0',
  mintSoft: '#D1FAE5',
  dangerSoft: '#FEE2E2',
  success: '#059669',
  successSoft: '#ECFDF5',
  warning: '#b45309',
  warningSoft: '#FFFBEB',
  danger: '#dc2626',
  /** Header / on-primary */
  onPrimary: '#ffffff',
  headerBg: '#1A367C',
  tabInactive: '#64748b',
} as const;

export const layout = {
  radius: { sm: 8, md: 12, lg: 16, xl: 20, xxl: 22, full: 9999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 },
} as const;

export const shadow = {
  sm: {
    shadowColor: '#1A367C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#1A367C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
} as const;

export const typography = {
  hero: {
    fontSize: 26,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
    color: palette.text,
  },
  title: {
    fontSize: 20,
    fontWeight: '700' as const,
    letterSpacing: -0.35,
    color: palette.text,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: -0.25,
    color: palette.text,
  },
  body: { fontSize: 15, color: palette.textSecondary, lineHeight: 22 },
  caption: { fontSize: 13, color: palette.textMuted, lineHeight: 18 },
  micro: { fontSize: 11, color: palette.textHint, letterSpacing: 0.2 },
  overline: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.8,
    color: palette.textMuted,
    textTransform: 'uppercase' as const,
  },
} as const;

export function card(): ViewStyle {
  return {
    backgroundColor: palette.surface,
    borderRadius: layout.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...shadow.md,
  };
}

export function cardFlat(): ViewStyle {
  return {
    backgroundColor: palette.surface,
    borderRadius: layout.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  };
}

export function primaryButton(): ViewStyle {
  return {
    backgroundColor: palette.primary,
    borderRadius: layout.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  };
}

export function primaryButtonText(): TextStyle {
  return {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  };
}

export function input(): TextStyle {
  return {
    backgroundColor: palette.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    borderRadius: layout.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: palette.text,
  };
}
