import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { TabBar, type Tab } from "../components/common/TabBar";
import type { Overview } from "../services/household";
import { colors } from "../theme";
import { HomeScreen } from "./HomeScreen";
import { TodayScreen } from "./TodayScreen";

type TabId = "today" | "household";

// Closet and Add join this list as those screens are built (see the design board).
const TABS: Tab<TabId>[] = [
  { id: "today", label: "Today", icon: "sun" },
  { id: "household", label: "Household", icon: "home" },
];

// The signed-in app once onboarding is finished.
export function MainTabs({ overview, onChanged }: { overview: Overview; onChanged: () => void }) {
  const [tab, setTab] = useState<TabId>("today");
  return (
    <View style={styles.root}>
      <View style={styles.body}>
        {tab === "today" ? (
          <TodayScreen location={overview.profile.location} />
        ) : (
          <HomeScreen overview={overview} onChanged={onChanged} />
        )}
      </View>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1 },
});
