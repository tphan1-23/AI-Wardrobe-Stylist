import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useOverview } from "./src/hooks/useOverview";
import { useSession } from "./src/hooks/useSession";
import { AuthScreen } from "./src/pages/AuthScreen";
import { HomeScreen } from "./src/pages/HomeScreen";
import { HouseholdScreen } from "./src/pages/HouseholdScreen";
import { LocationScreen } from "./src/pages/LocationScreen";
import { signOut } from "./src/services/auth";
import { supabase } from "./src/services/supabase";

function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator />
    </View>
  );
}

// Onboarding gate: household first, then weather location, then the app.
function SignedIn() {
  const { overview, loading, error, refresh } = useOverview();

  if (loading && !overview) return <Loading />;

  if (error || !overview) {
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

  if (overview.step === "household") return <HouseholdScreen onDone={refresh} />;
  if (overview.step === "location") return <LocationScreen submitLabel="Continue" onDone={refresh} />;
  return <HomeScreen overview={overview} onChanged={refresh} />;
}

export default function App() {
  const { session, loading } = useSession();

  return (
    <>
      {loading ? <Loading /> : session ? <SignedIn key={session.user.id} /> : <AuthScreen />}
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  error: { color: "#b00020", textAlign: "center" },
  link: { color: "#0a5bd8" },
});
