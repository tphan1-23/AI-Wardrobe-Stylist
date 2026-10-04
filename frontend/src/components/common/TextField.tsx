import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, radius, size, type } from "../../theme";
import { ErrorLine } from "./ErrorLine";

interface Props extends Omit<TextInputProps, "style"> {
  label: string;
  error?: string | null;
}

export function TextField({ label, error, ...input }: Props) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? styles.inputError : null]}
        {...input}
      />
      {error ? <ErrorLine message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, marginBottom: 8 },
  input: {
    height: size.control,
    borderWidth: size.border,
    borderColor: colors.ink,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    fontFamily: type.body.fontFamily,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.paper,
  },
  inputError: { borderWidth: size.borderStrong },
});
