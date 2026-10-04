import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../components/common/Button";
import { Icon } from "../components/common/Icon";
import { Screen } from "../components/common/Screen";
import { signOut } from "../services/auth";
import type { Overview } from "../services/household";
import { supabase } from "../services/supabase";
import { colors, fonts, radius, size, type } from "../theme";
import { LocationScreen } from "./LocationScreen";

interface Props {
  overview: Overview;
  onChanged: () => void;
}

export function HomeScreen({ overview, onChanged }: Props) {
  const { profile, household } = overview;
  const [editingLocation, setEditingLocation] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (editingLocation) {
    return (
      <LocationScreen
        initialLocation={profile.location ?? ""}
        onBack={() => setEditingLocation(false)}
        onDone={() => {
          setEditingLocation(false);
          onChanged();
        }}
      />
    );
  }

  const inviteCode = household?.invite_code.toUpperCase() ?? "";

  async function copyCode() {
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
  }

  return (
    <Screen top={20} titleStyle="title" title="Household">
      {household && (
        <View style={styles.card}>
          <Text style={type.caption}>Household name</Text>
          <Text style={styles.householdName}>{household.name}</Text>
          <Text style={[type.caption, styles.gap]}>Invite code</Text>
          <View style={styles.codeRow}>
            <Text style={styles.code} selectable>
              {inviteCode}
            </Text>
            <Pressable accessibilityRole="button" onPress={copyCode} style={styles.copy}>
              <Icon name={copied ? "check" : "copy"} />
              <Text style={styles.copyText}>{copied ? "Copied" : "Copy"}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View>
        <Text style={styles.sectionLabel}>PROFILE</Text>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={type.caption}>Name</Text>
            <Text style={styles.rowValue}>{profile.name}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={type.caption}>Location</Text>
            <Text style={styles.rowValue}>{profile.location}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => setEditingLocation(true)} hitSlop={8}>
            <Text style={styles.rowAction}>Change</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.bottom}>
        <Button label="Log out" variant="secondary" onPress={() => signOut(supabase.auth)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: size.border, borderColor: colors.ink, borderRadius: radius.card, padding: 18, gap: 4 },
  householdName: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  gap: { marginTop: 12 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  code: { flex: 1, fontFamily: fonts.bold, fontSize: 24, letterSpacing: 4.3, color: colors.ink },
  copy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: size.segmented,
    paddingHorizontal: 14,
    borderRadius: radius.small,
    borderWidth: size.border,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
  },
  copyText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  sectionLabel: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 1, color: colors.muted, marginBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: size.segmented,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowText: { gap: 2, flex: 1 },
  rowValue: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  rowAction: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink, textDecorationLine: "underline" },
  bottom: { marginTop: "auto" },
});
