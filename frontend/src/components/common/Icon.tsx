import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "../../theme";

export type IconName = "logo" | "alert" | "copy" | "check";

// Paths copied from the design board (24x24, 1.75 stroke, rounded).
export function Icon({ name, size = 18, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.75}
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
    </Svg>
  );
}
