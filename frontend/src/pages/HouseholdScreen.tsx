import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../components/common/Button";
import { Screen } from "../components/common/Screen";
import { TextField } from "../components/common/TextField";
import { createHousehold, joinHousehold } from "../services/household";
import { gateway } from "../services/supabase";
import { colors, fonts, radius, size, type } from "../theme";

type Which = "create" | "join";

interface Props {
  onBack: () => void;
  onDone: () => void;
}

// Optional (D18): opened from the home screen to start sharing closets.
export function HouseholdScreen({ onBack, onDone }: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<Which | null>(null);
  const [error, setError] = useState<{ which: Which; message: string } | null>(null);

  async function submit(which: Which) {
    setBusy(which);
    setError(null);
    const result = which === "create" ? await createHousehold(gateway, name) : await joinHousehold(gateway, code);
    setBusy(null);
    if (result.ok) onDone();
    else setError({ which, message: result.error });
  }

  return (
    <Screen
      title="Share your closet"
      subtitle="Everyone in a household can see each other's closets. Your clothes stay yours, and you can leave at any time."
    >
      <View style={styles.card}>
        <Text style={type.cardTitle}>Create a household</Text>
        <TextField
          label="Household name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Maple Street"
          autoCapitalize="words"
          error={error?.which === "create" ? error.message : null}
        />
        <Button label="Create" onPress={() => submit("create")} busy={busy === "create"} disabled={busy === "join"} />
      </View>

      <View style={styles.divider}>
        <View style={styles.rule} />
        <Text style={styles.or}>or</Text>
        <View style={styles.rule} />
      </View>

      <View style={styles.card}>
        <Text style={type.cardTitle}>Join with an invite code</Text>
        <TextField
          label="Invite code"
          value={code}
          onChangeText={setCode}
          placeholder="8 characters"
          autoCapitalize="none"
          autoCorrect={false}
          error={error?.which === "join" ? error.message : null}
        />
        <Button
          label="Join"
          variant="secondary"
          onPress={() => submit("join")}
          busy={busy === "join"}
          disabled={busy === "create"}
        />
      </View>

      <Button label="Back" variant="secondary" onPress={onBack} disabled={busy !== null} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: size.border,
    borderColor: colors.ink,
    borderRadius: radius.card,
    padding: 20,
    gap: 16,
  },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  rule: { flex: 1, height: 1, backgroundColor: colors.line },
  or: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
});
