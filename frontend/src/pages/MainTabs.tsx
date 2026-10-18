import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { TabBar, type Tab } from "../components/common/TabBar";
import type { Overview } from "../services/household";
import { colors } from "../theme";
import { AddScreen } from "./AddScreen";
import { HomeScreen } from "./HomeScreen";
import { TodayScreen } from "./TodayScreen";

type TabId = "today" | "add" | "household";

// Closet joins this list when it is built (see the design board).
const TABS: Tab<TabId>[] = [
  { id: "today", label: "Today", icon: "sun" },
  { id: "add", label: "Add", icon: "plus" },
  { id: "household", label: "Household", icon: "home" },
];

// The signed-in app once onboarding is finished.
export function MainTabs({ overview, onChanged }: { overview: Overview; onChanged: () => void }) {
  const [tab, setTab] = useState<TabId>("today");
  return (
    <View style={styles.root}>
      <View style={styles.body}>
        {tab === "today" && <TodayScreen location={overview.profile.location} />}
        {tab === "add" && <AddScreen userId={overview.profile.id} />}
        {tab === "household" && <HomeScreen overview={overview} onChanged={onChanged} />}
      </View>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1 },
});
