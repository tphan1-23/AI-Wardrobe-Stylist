import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../../theme";
import { Icon } from "./Icon";

// Errors are never color-only: an icon and text accompany the heavier field border.
export function ErrorLine({ message }: { message: string }) {
  return (
    <View style={styles.row} accessibilityRole="alert">
      <Icon name="alert" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  text: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
});
