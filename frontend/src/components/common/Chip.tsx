import { Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts } from "../../theme";

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  // "checkbox" for pick-any lists, "radio" when only one can be chosen.
  role?: "checkbox" | "radio";
}

export function Chip({ label, selected, onPress, role = "checkbox" }: Props) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      hitSlop={4}
      style={[styles.chip, selected ? styles.on : styles.off]}
    >
      <Text style={[styles.text, { color: selected ? colors.paper : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  on: { backgroundColor: colors.ink },
  off: { backgroundColor: colors.paper },
  text: { fontFamily: fonts.semibold, fontSize: 15 },
});
