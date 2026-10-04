// Gap kept between the device safe area (status bar, notch, Dynamic Island) and screen content.
export const SAFE_AREA_GAP = 12;

// The design board's offsets (56 onboarding, 72 log in, 20 tab screens) assume a plain status bar.
// Real padding is never smaller than the device's top inset plus a gap.
export function screenTopPadding(designTop: number, insetTop: number): number {
  return Math.max(designTop, insetTop + SAFE_AREA_GAP);
}
