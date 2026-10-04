import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { saveLocation } from "../services/household";
import { gateway } from "../services/supabase";

interface Props {
  initialLocation?: string;
  submitLabel?: string;
  onDone: () => void;
}

export function LocationScreen({ initialLocation = "", submitLabel = "Save location", onDone }: Props) {
  const [location, setLocation] = useState(initialLocation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await saveLocation(gateway, location);
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Where are you?</Text>
      <Text style={styles.subtitle}>We use your location to check the weather for your daily outfit.</Text>
      <TextInput
        style={styles.input}
        placeholder="City or ZIP code"
        value={location}
        onChangeText={setLocation}
        autoCorrect={false}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{submitLabel}</Text>}
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
  error: { color: "#b00020" },
});
