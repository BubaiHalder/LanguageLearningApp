/** Semantic colors shared by the native tutor, mock mode and navigation. */
export const studioThemes = {
  light: {
    background: '#F7FAF3', surface: '#FFFFFF', surfaceRaised: '#E9F5DC', text: '#20362A', muted: '#58665E',
    primary: '#286A36', onPrimary: '#FFFFFF', border: '#758677', divider: '#DCE5D8',
    accent: '#A6E85D', onAccent: '#183B13', accentEdge: '#659A36', highlight: '#FFE29A',
    success: '#27653A', successSurface: '#EFF8E8', error: '#AD2F44', errorSurface: '#FFF0F2',
    warning: '#6E4E13', warningSurface: '#FFF2CD', overlay: 'rgba(13,32,23,0.55)',
  },
  dark: {
    background: '#14251E', surface: '#1C3027', surfaceRaised: '#294333', text: '#F1F7EC', muted: '#B7C9BC',
    primary: '#B0E77E', onPrimary: '#183515', border: '#7F9B86', divider: '#3A5344',
    accent: '#B0E77E', onAccent: '#183515', accentEdge: '#608B43', highlight: '#E9C36C',
    success: '#AFE2AA', successSurface: '#24412D', error: '#FFADB8', errorSurface: '#452332',
    warning: '#F5D58F', warningSurface: '#3C321D', overlay: 'rgba(0,0,0,0.7)',
  },
} as const;
export type StudioTheme = { [K in keyof typeof studioThemes.light]: string };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const;
export const radius = { control: 18, card: 26, pill: 999 } as const;
export const typography = {
  display: { fontSize: 34, lineHeight: 42, fontWeight: '800' },
  title: { fontSize: 26, lineHeight: 34, fontWeight: '800' },
  heading: { fontSize: 21, lineHeight: 29, fontWeight: '800' },
  body: { fontSize: 16, lineHeight: 26, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 22, fontWeight: '700' },
  caption: { fontSize: 14, lineHeight: 22, fontWeight: '400' },
} as const;
