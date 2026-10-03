import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createHousehold, joinHousehold } from "../services/household";
import { householdClient } from "../services/supabase";

type Mode = "create" | "join";

export function HouseholdScreen({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>("create");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCreate = mode === "create";

  function switchMode() {
    setMode(isCreate ? "join" : "create");
    setValue("");
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const result = isCreate ? await createHousehold(householdClient, value) : await joinHousehold(householdClient, value);
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isCreate ? "Create your household" : "Join a household"}</Text>
      <Text style={styles.subtitle}>
        {isCreate
          ? "A household shares one closet. You can invite others with a code."
          : "Ask a household member for their invite code."}
      </Text>

      <TextInput
        style={styles.input}
        placeholder={isCreate ? "Household name" : "Invite code"}
        value={value}
        onChangeText={setValue}
        autoCapitalize={isCreate ? "words" : "none"}
        autoCorrect={false}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={submit} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{isCreate ? "Create household" : "Join household"}</Text>
        )}
      </Pressable>

      <Pressable onPress={switchMode} disabled={busy}>
        <Text style={styles.link}>
          {isCreate ? "Have an invite code? Join instead" : "Start a new household instead"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 15, color: "#555", textAlign: "center", marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: "#111", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { color: "#0a5bd8", textAlign: "center", marginTop: 8 },
  error: { color: "#b00020" },
});
