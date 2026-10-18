import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button } from "../components/common/Button";
import { ErrorLine } from "../components/common/ErrorLine";
import { Screen } from "../components/common/Screen";
import { Segmented } from "../components/common/Segmented";
import { OutfitEntryCard } from "../components/outfit/OutfitEntryCard";
import {
  HISTORY_DAYS,
  groupByDay,
  loadFavoriteOutfits,
  loadHistory,
  setOutfitFavorite,
  type OutfitEntry,
} from "../services/history";
import { historyGateway } from "../services/supabase";
import { colors, fonts, type } from "../theme";

type View_ = "worn" | "favorites";

const VIEWS: { value: View_; label: string }[] = [
  { value: "worn", label: `Last ${HISTORY_DAYS} days` },
  { value: "favorites", label: "Favorites" },
];

// What you wore recently, and the outfits you love. Tap the heart to add an outfit to the
// favorites, or to take it out again.
export function HistoryScreen() {
  const [view, setView] = useState<View_>("worn");
  const [entries, setEntries] = useState<OutfitEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (which: View_) => {
    setLoading(true);
    setError(null);
    const result = which === "worn" ? await loadHistory(historyGateway) : await loadFavoriteOutfits(historyGateway);
    if (result.ok) setEntries(result.value);
    else {
      setEntries(null);
      setError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(view);
  }, [load, view]);

  async function toggle(entry: OutfitEntry) {
    setBusyId(entry.id);
    setError(null);
    const result = await setOutfitFavorite(historyGateway, entry.id, !entry.favorite);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // In the favorites list an outfit that is no longer a favorite leaves the list.
    setEntries((current) =>
      (current ?? []).flatMap((e) => {
        if (e.id !== entry.id) return [e];
        return view === "favorites" ? [] : [{ ...e, favorite: !e.favorite }];
      }),
    );
  }

  function body() {
    if (loading && !entries) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ink} />
        </View>
      );
    }
    if (!entries) {
      return (
        <View style={styles.gap}>
          {error && <ErrorLine message={error} />}
          <Button label="Try again" onPress={() => load(view)} />
        </View>
      );
    }
    if (entries.length === 0) {
      return (
        <View style={styles.gap}>
          <Text style={type.cardTitle}>{view === "worn" ? "Nothing worn yet" : "No favorite outfits yet"}</Text>
          <Text style={type.body}>
            {view === "worn"
              ? "Tap the check on the Today screen when you wear an outfit, and it will show up here for 7 days."
              : "Open the last 7 days and tap the heart on an outfit you like."}
          </Text>
        </View>
      );
    }
    if (view === "favorites") {
      return (
        <View style={styles.gap}>
          {entries.map((entry) => (
            <OutfitEntryCard key={entry.id} entry={entry} busy={busyId === entry.id} onToggleFavorite={() => toggle(entry)} />
          ))}
        </View>
      );
    }
    return (
      <View style={styles.groups}>
        {groupByDay(entries).map((group) => (
          <View key={group.date} style={styles.gap}>
            <Text style={styles.dayLabel}>{group.label}</Text>
            {group.entries.map((entry) => (
              <OutfitEntryCard key={entry.id} entry={entry} busy={busyId === entry.id} onToggleFavorite={() => toggle(entry)} />
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <Screen top={20}>
      <Text accessibilityRole="header" style={type.title}>
        History
      </Text>
      <Segmented options={VIEWS} value={view} onChange={setView} />
      {error && entries ? <ErrorLine message={error} /> : null}
      {body()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 48, alignItems: "center" },
  gap: { gap: 12 },
  groups: { gap: 20 },
  dayLabel: { fontFamily: fonts.bold, fontSize: 14, color: colors.muted },
});
