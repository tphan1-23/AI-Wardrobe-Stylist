import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "../../theme";

export type IconName = "logo" | "alert" | "copy" | "check" | "close" | "sun" | "home" | "plus" | "cloud";

// Paths copied from the design board (24x24, rounded). `stroke` defaults to the board's 1.75;
// the big answer buttons on the Today screen use 2.
export function Icon({
  name,
  size = 18,
  color = colors.ink,
  stroke = 1.75,
}: {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "logo" && <Path d="M8 3l-5 4 3 4 2-1v11h8V10l2 1 3-4-5-4a4 4 0 01-8 0z" />}
      {name === "alert" && (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="M12 7v6M12 16.5v.5" />
        </>
      )}
      {name === "copy" && (
        <>
          <Rect x={8} y={8} width={12} height={12} />
          <Path d="M4 16V4h12" />
        </>
      )}
      {name === "check" && <Path d="M5 12.5l4.5 4.5L19 7.5" />}
      {name === "close" && <Path d="M6 6l12 12M18 6L6 18" />}
      {name === "sun" && (
        <>
          <Circle cx={12} cy={12} r={4} />
          <Path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      )}
      {name === "home" && (
        <>
          <Path d="M3 11l9-8 9 8" />
          <Path d="M5 10v10h14V10" />
        </>
      )}
      {name === "plus" && (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="M12 8v8M8 12h8" />
        </>
      )}
      {name === "cloud" && (
        <>
          <Path d="M7 18a4 4 0 010-8 5 5 0 019.6-1A4.5 4.5 0 0117 18z" />
          <Path d="M9 21l1-2M13 21l1-2" />
        </>
      )}
    </Svg>
  );
}
