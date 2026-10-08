import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../components/common/Button";
import { Icon } from "../components/common/Icon";
import { Screen } from "../components/common/Screen";
import { TextField } from "../components/common/TextField";
import { confirmSignUp, resendSignUpCode } from "../services/auth";
import { supabase } from "../services/supabase";
import { colors, fonts } from "../theme";

interface Props {
  email: string;
  onBack: () => void;
}

// Confirming signs the user in, so the session listener in App takes over on success.
export function ConfirmEmailScreen({ email, onBack }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await confirmSignUp(supabase.auth, { email, code });
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  async function resend() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await resendSignUpCode(supabase.auth, email);
    setBusy(false);
    if (result.ok) setNotice("We sent a new code.");
    else setError(result.error);
  }

  return (
    <Screen
      top={72}
      title="Check your email"
      subtitle={`We sent a code to ${email.trim()}. Enter it to confirm your account.`}
    >
      <View style={styles.form}>
        <TextField
          label="Code"
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          keyboardType="number-pad"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="oneTimeCode"
          error={error}
        />
        {notice && (
          <View style={styles.notice}>
            <Icon name="check" />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}
      </View>
      <View style={styles.actions}>
        <Button label="Confirm" onPress={confirm} busy={busy} />
        <Button label="Send a new code" variant="secondary" onPress={resend} disabled={busy} />
        <Button label="Back to log in" variant="secondary" onPress={onBack} disabled={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 20 },
  actions: { gap: 12, marginTop: "auto" },
  notice: { flexDirection: "row", alignItems: "center", gap: 6 },
  noticeText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
});
