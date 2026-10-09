import { InstrumentSans_400Regular } from "@expo-google-fonts/instrument-sans/400Regular";
import { InstrumentSans_500Medium } from "@expo-google-fonts/instrument-sans/500Medium";
import { InstrumentSans_600SemiBold } from "@expo-google-fonts/instrument-sans/600SemiBold";
import { InstrumentSans_700Bold } from "@expo-google-fonts/instrument-sans/700Bold";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button } from "./src/components/common/Button";
import { useOverview } from "./src/hooks/useOverview";
import { useSession } from "./src/hooks/useSession";
import { AuthScreen } from "./src/pages/AuthScreen";
import { ForgotPasswordScreen } from "./src/pages/ForgotPasswordScreen";
import { HomeScreen } from "./src/pages/HomeScreen";
import { LocationScreen } from "./src/pages/LocationScreen";
import { QuizScreen } from "./src/pages/QuizScreen";
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

// Onboarding gate: weather location, then the app. Households are optional (D18)
// and are created or joined later from the home screen.
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

  if (overview.step === "location") {
    return <LocationScreen step={{ current: 1, total: 2 }} submitLabel="Continue" onDone={refresh} />;
  }
  if (overview.step === "quiz") return <QuizScreen onDone={refresh} />;
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
  // Held here, not in AuthScreen: entering the emailed code signs the user in
  // before the new password is saved, and the reset screen must stay up until then.
  const [resettingPassword, setResettingPassword] = useState(false);

  function screen() {
    if (!fontsLoaded || loading) return <Loading />;
    if (resettingPassword) {
      return (
        <ForgotPasswordScreen onBack={() => setResettingPassword(false)} onDone={() => setResettingPassword(false)} />
      );
    }
    if (session) return <SignedIn key={session.user.id} />;
    return <AuthScreen onForgotPassword={() => setResettingPassword(true)} />;
  }

  return (
    <SafeAreaProvider>
      {screen()}
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  error: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, textAlign: "center" },
  actions: { alignSelf: "stretch", gap: 12 },
});
