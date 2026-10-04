import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, size, type } from "../../theme";

interface Props {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  busy?: boolean;
  disabled?: boolean;
}

export function Button({ label, onPress, variant = "primary", busy = false, disabled = false }: Props) {
  const primary = variant === "primary";
  const inactive = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        (disabled || pressed) && styles.dim,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.paper : colors.ink} />
      ) : (
        <Text style={[type.button, { color: primary ? colors.paper : colors.ink }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: size.control,
    borderRadius: radius.control,
    borderWidth: size.border,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  primary: { backgroundColor: colors.ink },
  secondary: { backgroundColor: colors.paper },
  dim: { opacity: 0.6 },
});
