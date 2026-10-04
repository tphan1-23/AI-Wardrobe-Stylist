import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "../../theme";

export function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.wrap} accessible accessibilityLabel={`Step ${step} of ${total}`}>
      <View style={styles.bars}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.bar, { backgroundColor: i < step ? colors.ink : colors.line }]} />
        ))}
      </View>
      <Text style={type.caption}>{`Step ${step} of ${total}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  bars: { flexDirection: "row", gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
});
