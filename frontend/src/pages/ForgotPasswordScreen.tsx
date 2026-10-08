import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../components/common/Button";
import { ErrorLine } from "../components/common/ErrorLine";
import { Icon } from "../components/common/Icon";
import { Screen } from "../components/common/Screen";
import { TextField } from "../components/common/TextField";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  fieldForError,
  requestPasswordReset,
  resetPassword,
  type AuthField,
} from "../services/auth";
import { supabase } from "../services/supabase";
import { colors, fonts, type } from "../theme";

interface Props {
  onBack: () => void;
  // Called once the password has been changed; the user is then signed in.
  onDone: () => void;
}

type Step = "email" | "code";

export function ForgotPasswordScreen({ onBack, onDone }: Props) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: AuthField; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const errorFor = (field: AuthField) => (error?.field === field ? error.message : null);

  async function sendCode(resend = false) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await requestPasswordReset(supabase.auth, email);
    setBusy(false);
    if (!result.ok) {
      setError({ field: fieldForError(result.error), message: result.error });
      return;
    }
    if (resend) setNotice("We sent a new code.");
    setStep("code");
  }

  async function submitNewPassword() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await resetPassword(supabase.auth, { email, code, newPassword });
    setBusy(false);
    if (result.ok) onDone();
    else setError({ field: fieldForError(result.error), message: result.error });
  }

  if (step === "email") {
    return (
      <Screen
        top={72}
        title="Forgot your password?"
        subtitle="Enter your email and we will send you a code to choose a new one."
      >
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          error={errorFor("email")}
        />
        {error && error.field !== "email" && <ErrorLine message={error.message} />}
        <View style={styles.actions}>
          <Button label="Send code" onPress={() => sendCode()} busy={busy} />
          <Button label="Back to log in" variant="secondary" onPress={onBack} disabled={busy} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      top={72}
      title="Check your email"
      subtitle={`If an account exists for ${email.trim()}, we sent it a code. Enter it below with your new password.`}
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
          error={errorFor("code")}
        />
        <View>
          <TextField
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New password"
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            error={errorFor("password")}
          />
          <Text style={[type.caption, styles.hint]}>
            {MIN_PASSWORD_LENGTH}-{MAX_PASSWORD_LENGTH} characters with an uppercase letter, a lowercase letter, a number
            and a symbol.
          </Text>
        </View>
        {error?.field === "form" && <ErrorLine message={error.message} />}
        {notice && (
          <View style={styles.notice}>
            <Icon name="check" />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}
      </View>
      <View style={styles.actions}>
        <Button label="Change password" onPress={submitNewPassword} busy={busy} />
        <Button label="Send a new code" variant="secondary" onPress={() => sendCode(true)} disabled={busy} />
        <Button label="Back to log in" variant="secondary" onPress={onBack} disabled={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 20 },
  hint: { marginTop: 8 },
  actions: { gap: 12, marginTop: "auto" },
  notice: { flexDirection: "row", alignItems: "center", gap: 6 },
  noticeText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
});
