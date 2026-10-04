import { InstrumentSans_400Regular } from "@expo-google-fonts/instrument-sans/400Regular";
import { InstrumentSans_500Medium } from "@expo-google-fonts/instrument-sans/500Medium";
import { InstrumentSans_600SemiBold } from "@expo-google-fonts/instrument-sans/600SemiBold";
import { InstrumentSans_700Bold } from "@expo-google-fonts/instrument-sans/700Bold";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button } from "./src/components/common/Button";
import { useOverview } from "./src/hooks/useOverview";
import { useSession } from "./src/hooks/useSession";
import { AuthScreen } from "./src/pages/AuthScreen";
import { HomeScreen } from "./src/pages/HomeScreen";
import { HouseholdScreen } from "./src/pages/HouseholdScreen";
import { LocationScreen } from "./src/pages/LocationScreen";
import { signOut } from "./src/services/auth";
import { supabase } from "./src/services/supabase";
import { colors, fonts } from "./src/theme";

function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.ink} />
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
        <View style={styles.actions}>
          <Button label="Try again" onPress={refresh} />
          <Button label="Log out" variant="secondary" onPress={() => signOut(supabase.auth)} />
        </View>
      </View>
    );
  }

  if (overview.step === "household") return <HouseholdScreen onDone={refresh} />;
  if (overview.step === "location") {
    return <LocationScreen step={{ current: 2, total: 2 }} submitLabel="Continue" onDone={refresh} />;
  }
  return <HomeScreen overview={overview} onChanged={refresh} />;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  });
  const { session, loading } = useSession();

  return (
    <>
      {!fontsLoaded || loading ? <Loading /> : session ? <SignedIn key={session.user.id} /> : <AuthScreen />}
      <StatusBar style="dark" />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  error: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, textAlign: "center" },
  actions: { alignSelf: "stretch", gap: 12 },
});
