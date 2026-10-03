import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { signOut } from "../services/auth";
import { supabase } from "../services/supabase";

export function HomeScreen({ session }: { session: Session }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>You're signed in</Text>
      <Text style={styles.email}>{session.user.email}</Text>
      <Pressable style={styles.button} onPress={() => signOut(supabase.auth)}>
        <Text style={styles.buttonText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", gap: 12 },
  title: { fontSize: 24, fontWeight: "600" },
  email: { fontSize: 16, color: "#555" },
  button: { backgroundColor: "#111", borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
