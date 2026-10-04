import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, size } from "../../theme";

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, index > 0 && styles.divider, selected ? styles.on : styles.off]}
          >
            <Text style={[styles.text, { color: selected ? colors.paper : colors.ink }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderWidth: size.border,
    borderColor: colors.ink,
    borderRadius: radius.small,
    overflow: "hidden",
  },
  segment: { flex: 1, height: size.segmented, alignItems: "center", justifyContent: "center" },
  divider: { borderLeftWidth: size.border, borderLeftColor: colors.ink },
  on: { backgroundColor: colors.ink },
  off: { backgroundColor: colors.paper },
  text: { fontFamily: fonts.semibold, fontSize: 14 },
});
