import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { signOut } from "../services/auth";
import type { Overview } from "../services/household";
import { supabase } from "../services/supabase";
import { LocationScreen } from "./LocationScreen";

interface Props {
  overview: Overview;
  onChanged: () => void;
}

export function HomeScreen({ overview, onChanged }: Props) {
  const { profile, household } = overview;
  const [editingLocation, setEditingLocation] = useState(false);

  if (editingLocation) {
    return (
      <LocationScreen
        initialLocation={profile.location ?? ""}
        onDone={() => {
          setEditingLocation(false);
          onChanged();
        }}
      />
    );
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

      <View style={styles.card}>
        <Text style={styles.label}>Your location (used for weather)</Text>
        <Text style={styles.value}>{profile.location}</Text>
        <Pressable onPress={() => setEditingLocation(true)}>
          <Text style={styles.link}>Change location</Text>
        </Pressable>
      </View>

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
  value: { fontSize: 18, fontWeight: "600" },
  code: { fontSize: 22, fontWeight: "700", letterSpacing: 2 },
  link: { color: "#0a5bd8", textAlign: "center", marginTop: 8 },
});
