import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../components/common/Button";
import { ErrorLine } from "../components/common/ErrorLine";
import { Icon } from "../components/common/Icon";
import { Screen } from "../components/common/Screen";
import { Segmented } from "../components/common/Segmented";
import { GarmentForm } from "../components/closet/GarmentForm";
import { deleteItem, isMine, ownerName, saveEdits, type ClosetItem } from "../services/closet";
import { draftFromTags, garmentDetail, garmentName, setField, type GarmentDraft } from "../services/garment";
import type { MemberRow } from "../services/household";
import { closetGateway } from "../services/supabase";
import { colors, fonts, radius, size, type } from "../theme";
import type { GarmentStatus } from "../../../supabase/functions/_shared/types";

interface Props {
  item: ClosetItem;
  myId: string;
  members: MemberRow[];
  onBack: () => void;
  // Called after a save or a delete, so the closet reloads.
  onChanged: () => void;
}

const STATUS_CHOICES: { value: GarmentStatus; label: string }[] = [
  { value: "clean", label: "Clean" },
  { value: "dirty", label: "Dirty" },
];

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8} style={styles.back}>
        <Icon name="back" size={24} />
        <Text style={styles.backText}>Closet</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <View style={styles.back} />
    </View>
  );
}

function Photo({ item }: { item: ClosetItem }) {
  return item.photoUrl ? (
    <Image source={{ uri: item.photoUrl }} accessibilityLabel={garmentName(item)} style={styles.photo} resizeMode="cover" />
  ) : (
    <View style={[styles.photo, styles.noPhoto]}>
      <Text style={type.caption}>Garment photo</Text>
    </View>
  );
}

// Edit one of your garments (tags, clean or dirty, delete). A household member's garment is
// shown read-only: the database refuses changes to anyone else's garment.
export function GarmentEditScreen({ item, myId, members, onBack, onChanged }: Props) {
  const mine = isMine(item, myId);
  const [draft, setDraft] = useState<GarmentDraft>(() => draftFromTags(item));
  const [status, setStatus] = useState<GarmentStatus>(item.status);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!mine) {
    return (
      <Screen top={20}>
        <Header title="Garment" onBack={onBack} />
        <Photo item={item} />
        <View style={styles.readOnly}>
          <Text style={type.cardTitle}>{garmentName(item)}</Text>
          <Text style={type.body}>{garmentDetail(item)}</Text>
          <Text style={type.body}>{`Status: ${item.status === "dirty" ? "Dirty" : "Clean"}`}</Text>
          <Text style={type.body}>{`Belongs to ${ownerName(item, myId, members)}. Only the owner can change it.`}</Text>
        </View>
      </Screen>
    );
  }

  async function save() {
    setBusy("save");
    setError(null);
    const result = await saveEdits(closetGateway, item.id, draft, status);
    setBusy(null);
    if (result.ok) onChanged();
    else setError(result.error);
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    const result = await deleteItem(closetGateway, item);
    setBusy(null);
    if (result.ok) onChanged();
    else setError(result.error);
  }

  function confirmDelete() {
    Alert.alert("Delete this garment?", "This also removes its photo.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: remove },
    ]);
  }

  return (
    <Screen top={20}>
      <Header title="Edit garment" onBack={onBack} />
      <Photo item={item} />
      <GarmentForm draft={draft} onChoose={(field, value) => setDraft((d) => setField(d, field, value))} />
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Status</Text>
        <View style={styles.statusControl}>
          <Segmented options={STATUS_CHOICES} value={status} onChange={setStatus} />
        </View>
      </View>
      <View style={styles.actions}>
        {error && <ErrorLine message={error} />}
        <Button label="Save changes" onPress={save} busy={busy === "save"} disabled={busy === "delete"} />
        <Button label="Delete item" variant="secondary" onPress={confirmDelete} busy={busy === "delete"} disabled={busy === "save"} />
        <Text style={styles.hint}>Deleting also removes the photo.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { flexDirection: "row", alignItems: "center", minWidth: 84, minHeight: 44 },
  backText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  photo: { height: 150, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, backgroundColor: "#f2f2f2" },
  noPhoto: { alignItems: "center", justifyContent: "center" },
  readOnly: { gap: 8 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: size.border,
    borderColor: colors.ink,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    height: 56,
  },
  statusLabel: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  statusControl: { width: 170 },
  actions: { marginTop: "auto", gap: 10 },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: "center" },
});
