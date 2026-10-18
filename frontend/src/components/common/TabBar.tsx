import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, size } from "../../theme";
import { Icon, type IconName } from "./Icon";

export interface Tab<T extends string> {
  id: T;
  label: string;
  icon: IconName;
}

interface Props<T extends string> {
  tabs: Tab<T>[];
  active: T;
  onChange: (id: T) => void;
}

// Bottom navigation from the design board: a heavy rule on top and a 3 px bar over the active tab.
export function TabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            onPress={() => onChange(tab.id)}
            style={[styles.tab, { borderTopWidth: selected ? 3 : 0 }]}
          >
            <Icon name={tab.icon} size={24} color={selected ? colors.ink : colors.muted} />
            <Text style={[styles.label, { color: selected ? colors.ink : colors.muted, fontFamily: selected ? fonts.bold : fonts.medium }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: size.border, borderTopColor: colors.ink, backgroundColor: colors.paper },
  tab: { flex: 1, height: 68, alignItems: "center", justifyContent: "center", gap: 4, borderTopColor: colors.ink },
  label: { fontSize: 12 },
});
