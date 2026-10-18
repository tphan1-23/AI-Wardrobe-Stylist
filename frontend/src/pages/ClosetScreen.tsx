import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Button } from "../components/common/Button";
import { Chip } from "../components/common/Chip";
import { ErrorLine } from "../components/common/ErrorLine";
import { Screen } from "../components/common/Screen";
import { Segmented } from "../components/common/Segmented";
import { ClosetTile } from "../components/closet/ClosetTile";
import {
  CATEGORY_OPTIONS,
  DEFAULT_FILTERS,
  OWNER_OPTIONS,
  STATUS_OPTIONS,
  countLabel,
  filterItems,
  loadCloset,
  ownerBadge,
  ownerName,
  type ClosetFilters,
  type ClosetItem,
} from "../services/closet";
import type { MemberRow } from "../services/household";
import { closetGateway } from "../services/supabase";
import { colors, fonts, type } from "../theme";
import { GarmentEditScreen } from "./GarmentEditScreen";

const COLUMNS = 3;
const GAP = 8;
// Screen's side padding is 24 on each side.
const SIDE = 48;

function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.filterControl}>
        <Segmented options={options} value={value} onChange={onChange} />
      </View>
    </View>
  );
}

// Your garments, and your household members' (read-only). Tap one to open it.
export function ClosetScreen({ myId, members }: { myId: string; members: MemberRow[] }) {
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<ClosetItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ClosetFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<ClosetItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadCloset(closetGateway);
    if (result.ok) setItems(result.value);
    else setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (selected) {
    return (
      <GarmentEditScreen
        item={selected}
        myId={myId}
        members={members}
        onBack={() => setSelected(null)}
        onChanged={() => {
          setSelected(null);
          load();
        }}
      />
    );
  }

  const visible = items ? filterItems(items, filters, myId) : [];
  const size = Math.floor((width - SIDE - GAP * (COLUMNS - 1)) / COLUMNS);
  // Someone else's garments can only appear when the person is in a household.
  const sharing = members.length > 1;

  function body() {
    if (loading && !items) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ink} />
        </View>
      );
    }
    if (error && !items) {
      return (
        <View style={styles.gap}>
          <ErrorLine message={error} />
          <Button label="Try again" onPress={load} />
        </View>
      );
    }
    if (items && items.length === 0) {
      return (
        <View style={styles.gap}>
          <Text style={type.cardTitle}>Your closet is empty</Text>
          <Text style={type.body}>Add your first garment from the Add tab and it will show up here.</Text>
        </View>
      );
    }
    if (visible.length === 0) return <Text style={type.body}>No items match these filters.</Text>;
    return (
      <View style={styles.grid}>
        {visible.map((item) => (
          <ClosetTile
            key={item.id}
            item={item}
            size={size}
            badge={ownerBadge(item, myId, members)}
            ownerLabel={ownerName(item, myId, members)}
            onPress={() => setSelected(item)}
          />
        ))}
      </View>
    );
  }

  return (
    <Screen top={20}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={type.title}>
          Closet
        </Text>
        {items ? <Text style={styles.count}>{countLabel(visible.length)}</Text> : null}
      </View>
      <View style={styles.chips}>
        {CATEGORY_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            role="radio"
            label={o.label}
            selected={filters.category === o.value}
            onPress={() => setFilters((f) => ({ ...f, category: o.value }))}
          />
        ))}
      </View>
      <FilterRow label="Status" options={STATUS_OPTIONS} value={filters.status} onChange={(status) => setFilters((f) => ({ ...f, status }))} />
      {sharing && (
        <FilterRow label="Owner" options={OWNER_OPTIONS} value={filters.owner} onChange={(owner) => setFilters((f) => ({ ...f, owner }))} />
      )}
      {error && items ? <ErrorLine message={error} /> : null}
      {body()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  count: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  filterLabel: { width: 52, fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  filterControl: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  center: { paddingVertical: 48, alignItems: "center" },
  gap: { gap: 16 },
});
