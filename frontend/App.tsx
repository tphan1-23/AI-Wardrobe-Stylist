import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { useProfile } from "./src/hooks/useProfile";
import { useSession } from "./src/hooks/useSession";
import { AuthScreen } from "./src/pages/AuthScreen";
import { HomeScreen } from "./src/pages/HomeScreen";
import { HouseholdScreen } from "./src/pages/HouseholdScreen";
import { signOut } from "./src/services/auth";
import { supabase } from "./src/services/supabase";

function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator />
    </View>
  );
}

function SignedIn({ session }: { session: Session }) {
  const { profile, household, loading, error, refresh } = useProfile(session.user.id);

  if (loading && !profile) return <Loading />;

  if (error || !profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Something went wrong."}</Text>
        <Pressable onPress={refresh}>
          <Text style={styles.link}>Try again</Text>
        </Pressable>
        <Pressable onPress={() => signOut(supabase.auth)}>
          <Text style={styles.link}>Log out</Text>
        </Pressable>
      </View>
    );
  }

  if (!profile.household_id) return <HouseholdScreen onDone={refresh} />;

  return <HomeScreen profile={profile} household={household} onProfileChanged={refresh} />;
}

export default function App() {
  const { session, loading } = useSession();

  return (
    <>
      {loading ? <Loading /> : session ? <SignedIn session={session} /> : <AuthScreen />}
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  error: { color: "#b00020", textAlign: "center" },
  link: { color: "#0a5bd8" },
});
