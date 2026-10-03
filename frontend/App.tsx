import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSession } from "./src/hooks/useSession";
import { AuthScreen } from "./src/pages/AuthScreen";
import { HomeScreen } from "./src/pages/HomeScreen";

export default function App() {
  const { session, loading } = useSession();

  return (
    <>
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator />
        </View>
      ) : session ? (
        <HomeScreen session={session} />
      ) : (
        <AuthScreen />
      )}
      <StatusBar style="auto" />
    </>
  );
}
