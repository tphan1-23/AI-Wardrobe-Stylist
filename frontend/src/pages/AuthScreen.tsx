import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../components/common/Button";
import { ErrorLine } from "../components/common/ErrorLine";
import { Icon } from "../components/common/Icon";
import { Screen } from "../components/common/Screen";
import { Segmented } from "../components/common/Segmented";
import { TextField } from "../components/common/TextField";
import { fieldForError, signIn, signUp, type AuthField } from "../services/auth";
import { supabase } from "../services/supabase";
import { colors, fonts, type } from "../theme";

type Mode = "sign_in" | "sign_up";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("sign_in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: AuthField; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignUp = mode === "sign_up";
  const errorFor = (field: AuthField) => (error?.field === field ? error.message : null);

  function changeMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = isSignUp
      ? await signUp(supabase.auth, { name, email, password })
      : await signIn(supabase.auth, { email, password });
    setBusy(false);

    if (!result.ok) {
      setError({ field: fieldForError(result.error), message: result.error });
    } else if (result.status === "confirmation_required") {
      setNotice("Check your email to confirm your account, then log in.");
      setMode("sign_in");
    }
    // On success the session listener in App swaps to the signed-in screen.
  }

  return (
    <Screen top={72}>
      <View style={styles.brand}>
        <Icon name="logo" size={32} />
        <Text style={styles.brandName}>DressWell</Text>
      </View>

      <View>
        <Text accessibilityRole="header" style={type.display}>
          {isSignUp ? "Create your account" : "Welcome back"}
        </Text>
        <Text style={[type.body, styles.subtitle]}>
          {isSignUp ? "Sign up to start your digital closet." : "Log in to see what to wear today."}
        </Text>
      </View>

      <Segmented
        value={mode}
        onChange={changeMode}
        options={[
          { value: "sign_in", label: "Log in" },
          { value: "sign_up", label: "Sign up" },
        ]}
      />

      <View style={styles.form}>
        {isSignUp && (
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoCapitalize="words"
            textContentType="name"
            error={errorFor("name")}
          />
        )}
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
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          autoCapitalize="none"
          textContentType={isSignUp ? "newPassword" : "password"}
          error={errorFor("password")}
        />
        {error?.field === "form" && <ErrorLine message={error.message} />}
        {notice && (
          <View style={styles.notice}>
            <Icon name="check" />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}
        <Button label={isSignUp ? "Sign up" : "Log in"} onPress={submit} busy={busy} />
      </View>

      <Text style={styles.footer}>
        {isSignUp ? "Already have an account? Choose Log in above." : "New here? Choose Sign up above."}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandName: { fontFamily: fonts.bold, fontSize: 24, letterSpacing: -0.48, color: colors.ink },
  subtitle: { marginTop: 8 },
  form: { gap: 20 },
  notice: { flexDirection: "row", alignItems: "center", gap: 6 },
  noticeText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  footer: { ...type.caption, fontSize: 14, textAlign: "center", marginTop: "auto" },
});
