import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { signOut } from "../services/auth";
import { updateProfile, type Household, type Profile } from "../services/household";
import { householdClient, supabase } from "../services/supabase";

interface Props {
  profile: Profile;
  household: Household | null;
  onProfileChanged: () => void;
}

export function HomeScreen({ profile, household, onProfileChanged }: Props) {
  const [location, setLocation] = useState(profile.location ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveLocation() {
    setBusy(true);
    setMessage(null);
    const result = await updateProfile(householdClient, profile.id, { name: profile.name, location });
    setBusy(false);
    if (result.ok) {
      setMessage("Location saved.");
      onProfileChanged();
    } else {
      setMessage(result.error);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hi{profile.name ? `, ${profile.name}` : ""}</Text>
      {household && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{household.name}</Text>
          <Text style={styles.label}>Invite code (share it with your household)</Text>
          <Text selectable style={styles.code}>
            {household.invite_code}
          </Text>
        </View>
      )}

      <Text style={styles.label}>Your location (used for weather)</Text>
      <TextInput
        style={styles.input}
        placeholder="City or ZIP"
        value={location}
        onChangeText={setLocation}
        autoCorrect={false}
      />
      <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={saveLocation} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save location</Text>}
      </Pressable>
      {message && <Text style={styles.message}>{message}</Text>}

      <Pressable onPress={() => signOut(supabase.auth)}>
        <Text style={styles.link}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 26, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 16, gap: 4 },
  cardTitle: { fontSize: 18, fontWeight: "600" },
  label: { fontSize: 13, color: "#666" },
  code: { fontSize: 22, fontWeight: "700", letterSpacing: 2 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: "#111", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  message: { textAlign: "center", color: "#555" },
  link: { color: "#0a5bd8", textAlign: "center", marginTop: 12 },
});
