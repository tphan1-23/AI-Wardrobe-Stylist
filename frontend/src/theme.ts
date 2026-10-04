// Design tokens from docs/Wardrobe App.html: high-contrast black and white,
// Instrument Sans, heavy borders, large touch targets.
export const colors = {
  ink: "#000000",
  paper: "#ffffff",
  muted: "#595959",
  line: "#d4d4d4",
} as const;

export const fonts = {
  regular: "InstrumentSans_400Regular",
  medium: "InstrumentSans_500Medium",
  semibold: "InstrumentSans_600SemiBold",
  bold: "InstrumentSans_700Bold",
} as const;

export const radius = { control: 12, small: 10, card: 16 } as const;

export const size = { control: 52, segmented: 44, border: 1.5, borderStrong: 2.5 } as const;

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 35, letterSpacing: -0.64, color: colors.ink },
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 32, letterSpacing: -0.56, color: colors.ink },
  cardTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.muted },
  label: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  caption: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  button: { fontFamily: fonts.semibold, fontSize: 16 },
} as const;
