import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { signIn, signUp } from "../services/auth";
import { supabase } from "../services/supabase";

type Mode = "sign_in" | "sign_up";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("sign_in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignUp = mode === "sign_up";

  function switchMode() {
    setMode(isSignUp ? "sign_in" : "sign_up");
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
      setError(result.error);
    } else if (result.status === "confirmation_required") {
      setNotice("Check your email to confirm your account, then sign in.");
      setMode("sign_in");
    }
    // On success the session listener in App swaps to the signed-in screen.
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>AI Wardrobe Stylist</Text>
      <Text style={styles.subtitle}>{isSignUp ? "Create your account" : "Welcome back"}</Text>

      {isSignUp && (
        <TextInput
          style={styles.input}
          placeholder="Name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          textContentType="name"
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        textContentType={isSignUp ? "newPassword" : "password"}
      />

      {error && <Text style={styles.error}>{error}</Text>}
      {notice && <Text style={styles.notice}>{notice}</Text>}

      <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={submit} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{isSignUp ? "Sign up" : "Log in"}</Text>
        )}
      </Pressable>

      <Pressable onPress={switchMode} disabled={busy}>
        <Text style={styles.link}>
          {isSignUp ? "Already have an account? Log in" : "New here? Create an account"}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 16, color: "#555", textAlign: "center", marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: "#111", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { color: "#0a5bd8", textAlign: "center", marginTop: 8 },
  error: { color: "#b00020" },
  notice: { color: "#1b6e2b" },
});
