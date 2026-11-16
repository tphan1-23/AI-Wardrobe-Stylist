import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../components/common/Button";
import { Screen } from "../components/common/Screen";
import { TextField } from "../components/common/TextField";
import { CONFIRM_WORD, DELETION_SUMMARY, deleteMyAccount, isDeletionConfirmed } from "../services/account";
import { accountGateway } from "../services/supabase";
import { colors, fonts, radius, size, type } from "../theme";

interface Props {
  onBack: () => void;
}

// Asks for the confirmation word, then deletes the account. On success the app notices the sign-out by itself and
// returns to the login screen, so there is nothing to navigate to from here.
export function DeleteAccountScreen({ onBack }: Props) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await deleteMyAccount(accountGateway);
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
    }
  }

  return (
    <Screen title="Delete account" subtitle="This cannot be undone.">
      <View style={styles.card}>
        <Text style={type.cardTitle}>This will permanently delete:</Text>
        {DELETION_SUMMARY.map((line) => (
          <Text key={line} style={styles.line}>
            • {line}
          </Text>
        ))}
      </View>
      <TextField
        label={`Type ${CONFIRM_WORD} to confirm`}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={CONFIRM_WORD}
        error={error}
      />
      <View style={styles.actions}>
        <Button label="Delete my account and data" onPress={submit} busy={busy} disabled={!isDeletionConfirmed(typed)} />
        <Button label="Cancel" variant="secondary" onPress={onBack} disabled={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: size.borderStrong, borderColor: colors.ink, borderRadius: radius.card, padding: 18, gap: 6 },
  line: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.ink },
  actions: { marginTop: "auto", gap: 12 },
});
