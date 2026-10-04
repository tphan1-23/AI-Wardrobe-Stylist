import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, type } from "../../theme";

interface Props {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  // Design uses 56 for onboarding screens, 72 for the log-in screen, 20 for tab screens.
  top?: number;
  titleStyle?: "display" | "title";
}

export function Screen({ children, title, subtitle, top = 56, titleStyle = "display" }: Props) {
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: top }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {title ? (
          <View>
            <Text accessibilityRole="header" style={type[titleStyle]}>
              {title}
            </Text>
            {subtitle ? <Text style={[type.body, styles.subtitle]}>{subtitle}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32, gap: 24 },
  subtitle: { marginTop: 8 },
});
