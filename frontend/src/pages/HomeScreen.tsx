import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../components/common/Button";
import { ErrorLine } from "../components/common/ErrorLine";
import { Icon } from "../components/common/Icon";
import { Screen } from "../components/common/Screen";
import { signOut } from "../services/auth";
import { leaveHousehold, type Overview } from "../services/household";
import { gateway, supabase } from "../services/supabase";
import { colors, fonts, radius, size, type } from "../theme";
import { HouseholdScreen } from "./HouseholdScreen";
import { LocationScreen } from "./LocationScreen";

interface Props {
  overview: Overview;
  onChanged: () => void;
}

export function HomeScreen({ overview, onChanged }: Props) {
  const { profile, household, members } = overview;
  const [subscreen, setSubscreen] = useState<"location" | "share" | null>(null);
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  function finish() {
    setSubscreen(null);
    onChanged();
  }

  if (subscreen === "location") {
    return (
      <LocationScreen initialLocation={profile.location ?? ""} onBack={() => setSubscreen(null)} onDone={finish} />
    );
  }
  if (subscreen === "share") {
    return <HouseholdScreen onBack={() => setSubscreen(null)} onDone={finish} />;
  }

  const inviteCode = household?.invite_code.toUpperCase() ?? "";

  async function copyCode() {
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
  }

  async function leave() {
    setLeaving(true);
    setLeaveError(null);
    const result = await leaveHousehold(gateway);
    setLeaving(false);
    if (result.ok) onChanged();
    else setLeaveError(result.error);
  }

  function confirmLeave() {
    const lastMember = members.length <= 1;
    Alert.alert(
      "Leave household?",
      lastMember
        ? "You are the last member, so the household will be deleted. Your clothes stay in your closet."
        : "Your clothes stay in your closet. You will stop seeing the other members' closets, and they will stop seeing yours.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: leave },
      ],
    );
  }

  return (
    <Screen top={20} titleStyle="title" title="Household">
      {household ? (
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
          <Text style={[type.caption, styles.gap]}>Members</Text>
          {members.map((member) => (
            <Text key={member.id} style={styles.member}>
              {member.name}
              {member.id === profile.id ? " (you)" : ""}
            </Text>
          ))}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={type.cardTitle}>Share your closet</Text>
          <Text style={type.body}>
            Create or join a household to see a partner's or roommate's closet. Your clothes stay yours.
          </Text>
          <View style={styles.gap}>
            <Button label="Create or join a household" variant="secondary" onPress={() => setSubscreen("share")} />
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
          <Pressable accessibilityRole="button" onPress={() => setSubscreen("location")} hitSlop={8}>
            <Text style={styles.rowAction}>Change</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.bottom}>
        {household && (
          <View>
            <Button label="Leave household" variant="secondary" onPress={confirmLeave} busy={leaving} />
            {leaveError && <ErrorLine message={leaveError} />}
          </View>
        )}
        <Button label="Log out" variant="secondary" onPress={() => signOut(supabase.auth)} disabled={leaving} />
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
  member: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  bottom: { marginTop: "auto", gap: 12 },
});
