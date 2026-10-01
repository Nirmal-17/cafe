import { useWindowDimensions, ScaledSize } from 'react-native';

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface ResponsiveValue<T> {
  xs?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
}

export const BREAKPOINTS: Record<Breakpoint, number> = {
  xs: 0,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
};

export function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
}

export function getResponsiveValue<T>(value: T | ResponsiveValue<T>, breakpoint: Breakpoint): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value;
  }
  const bpOrder: Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl'];
  const currentIndex = bpOrder.indexOf(breakpoint);
  const responsiveValue = value as ResponsiveValue<T>;
  for (let i = currentIndex; i >= 0; i--) {
    const bp = bpOrder[i];
    if (responsiveValue[bp] !== undefined) {
      return responsiveValue[bp];
    }
  }
  return responsiveValue.xs as T;
}

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const breakpoint = getBreakpoint(width);
  const isLandscape = width > height;

  return {
    width,
    height,
    breakpoint,
    isLandscape,
    isTablet: width >= BREAKPOINTS.md,
    isDesktop: width >= BREAKPOINTS.lg,
  };
}

export function useResponsiveValue<T>(value: T | ResponsiveValue<T>): T {
  const { breakpoint } = useResponsive();
  return getResponsiveValue(value, breakpoint);
}

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const RESPONSIVE_SPACING: Record<Breakpoint, typeof SPACING> = {
  xs: { xs: 3, sm: 6, md: 12, lg: 16, xl: 24, xxl: 32 },
  sm: { xs: 4, sm: 8, md: 14, lg: 20, xl: 28, xxl: 40 },
  md: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  lg: { xs: 5, sm: 10, md: 20, lg: 28, xl: 40, xxl: 56 },
  xl: { xs: 6, sm: 12, md: 24, lg: 32, xl: 48, xxl: 64 },
};

export function getSpacing(breakpoint: Breakpoint, size: keyof typeof SPACING) {
  return RESPONSIVE_SPACING[breakpoint][size];
}

export const TYPOGRAPHY = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  display: 32,
};

export const RESPONSIVE_TYPOGRAPHY: Record<Breakpoint, typeof TYPOGRAPHY> = {
  xs: { xs: 9, sm: 11, md: 13, lg: 14, xl: 16, xxl: 18, xxxl: 20, display: 26 },
  sm: { xs: 10, sm: 12, md: 14, lg: 16, xl: 17, xxl: 19, xxxl: 22, display: 28 },
  md: { xs: 10, sm: 12, md: 14, lg: 16, xl: 18, xxl: 20, xxxl: 24, display: 32 },
  lg: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 22, xxxl: 26, display: 36 },
  xl: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 24, xxxl: 28, display: 40 },
};

export function getFontSize(breakpoint: Breakpoint, size: keyof typeof TYPOGRAPHY) {
  return RESPONSIVE_TYPOGRAPHY[breakpoint][size];
}

export const BORDER_RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const RESPONSIVE_BORDER_RADIUS: Record<Breakpoint, typeof BORDER_RADIUS> = {
  xs: { xs: 3, sm: 6, md: 8, lg: 12, xl: 16, full: 9999 },
  sm: { xs: 4, sm: 7, md: 10, lg: 14, xl: 20, full: 9999 },
  md: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, full: 9999 },
  lg: { xs: 5, sm: 9, md: 14, lg: 18, xl: 28, full: 9999 },
  xl: { xs: 6, sm: 10, md: 16, lg: 20, xl: 32, full: 9999 },
};

export function getBorderRadius(breakpoint: Breakpoint, size: keyof typeof BORDER_RADIUS) {
  return RESPONSIVE_BORDER_RADIUS[breakpoint][size];
}

export function getColumnCount(breakpoint: Breakpoint, baseColumns: number = 3): number {
  switch (breakpoint) {
    case 'xs': return Math.max(1, baseColumns - 2);
    case 'sm': return Math.max(2, baseColumns - 1);
    case 'md': return baseColumns;
    case 'lg': return baseColumns + 1;
    case 'xl': return baseColumns + 2;
    default: return baseColumns;
  }
}

export function getCardWidth(breakpoint: Breakpoint, columns: number = 3, gap: number = 10): string {
  const colCount = getColumnCount(breakpoint, columns);
  const totalGap = gap * (colCount - 1);
  return `calc((100% - ${totalGap}px) / ${colCount})`;
}

export function getResponsiveStyle<T extends Record<string, any>>(
  styles: T,
  breakpoint: Breakpoint
): T {
  const result = { ...styles } as T;
  return result;
}

export const MODAL_WIDTH: Record<Breakpoint, number | string> = {
  xs: '100%',
  sm: '100%',
  md: 500,
  lg: 600,
  xl: 700,
};

export const MODAL_MAX_HEIGHT: Record<Breakpoint, number | string> = {
  xs: '90%',
  sm: '90%',
  md: '85%',
  lg: '80%',
  xl: '75%',
};

export function getModalWidth(breakpoint: Breakpoint): number | string {
  return MODAL_WIDTH[breakpoint];
}

export function getModalMaxHeight(breakpoint: Breakpoint): number | string {
  return MODAL_MAX_HEIGHT[breakpoint];
}

export const HEADER_HEIGHT: Record<Breakpoint, number> = {
  xs: 56,
  sm: 56,
  md: 64,
  lg: 72,
  xl: 80,
};

export const TAB_BAR_HEIGHT: Record<Breakpoint, number> = {
  xs: 68,
  sm: 72,
  md: 80,
  lg: 88,
  xl: 96,
};

export function getHeaderHeight(breakpoint: Breakpoint): number {
  return HEADER_HEIGHT[breakpoint];
}

export function getTabBarHeight(breakpoint: Breakpoint): number {
  return TAB_BAR_HEIGHT[breakpoint];
}

export const GRID_GAP: Record<Breakpoint, number> = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
};

export function getGridGap(breakpoint: Breakpoint): number {
  return GRID_GAP[breakpoint];
}

export const CARD_PADDING: Record<Breakpoint, number> = {
  xs: 10,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

export function getCardPadding(breakpoint: Breakpoint): number {
  return CARD_PADDING[breakpoint];
}

export const ICON_SIZE: Record<Breakpoint, { sm: number; md: number; lg: number; xl: number }> = {
  xs: { sm: 16, md: 20, lg: 24, xl: 28 },
  sm: { sm: 18, md: 22, lg: 26, xl: 30 },
  md: { sm: 20, md: 24, lg: 28, xl: 32 },
  lg: { sm: 22, md: 26, lg: 30, xl: 36 },
  xl: { sm: 24, md: 28, lg: 32, xl: 40 },
};

export function getIconSize(breakpoint: Breakpoint, size: 'sm' | 'md' | 'lg' | 'xl'): number {
  return ICON_SIZE[breakpoint][size];
}

export function scale(value: number, breakpoint: Breakpoint): number {
  const baseWidth = 375;
  const scaleFactors: Record<Breakpoint, number> = {
    xs: 0.85,
    sm: 0.95,
    md: 1,
    lg: 1.1,
    xl: 1.2,
  };
  return Math.round(value * scaleFactors[breakpoint]);
}

export function moderateScale(value: number, factor: number = 0.5, breakpoint: Breakpoint = 'md'): number {
  const scaled = scale(value, breakpoint);
  return Math.round(value + (scaled - value) * factor);
}

export function verticalScale(value: number, breakpoint: Breakpoint): number {
  const baseHeight = 667;
  const scaleFactors: Record<Breakpoint, number> = {
    xs: 0.85,
    sm: 0.95,
    md: 1,
    lg: 1.1,
    xl: 1.2,
  };
  return Math.round(value * scaleFactors[breakpoint]);
}