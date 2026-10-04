import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { screenTopPadding } from "../../layout";
import { colors, type } from "../../theme";

interface Props {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  // Design offset (56 onboarding, 72 log in, 20 tab screens); see screenTopPadding.
  top?: number;
  titleStyle?: "display" | "title";
}

export function Screen({ children, title, subtitle, top = 56, titleStyle = "display" }: Props) {
  const insets = useSafeAreaInsets();
  const paddingTop = screenTopPadding(top, insets.top);
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop }]}
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
