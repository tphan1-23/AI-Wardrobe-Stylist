import { Image, StyleSheet, Text, View } from "react-native";
import { OUTFIT_SLOTS, SLOT_LABELS, type OutfitItem, type OutfitSlot } from "../../services/today";
import { colors, fonts, radius, size, type } from "../../theme";
import { Icon } from "../common/Icon";

const PHOTO = 112;

function Photo({ url, label }: { url: string | null; label: string }) {
  return (
    <View style={styles.photo}>
      {url ? (
        <Image source={{ uri: url }} accessibilityLabel={label} style={styles.image} resizeMode="cover" />
      ) : (
        <Text style={type.caption}>Photo</Text>
      )}
    </View>
  );
}

function ItemRow({ item, last }: { item: OutfitItem; last: boolean }) {
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <Photo url={item.photoUrl} label={item.name} />
      <View style={styles.text}>
        <Text style={styles.slot}>{SLOT_LABELS[item.slot].toUpperCase()}</Text>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={type.caption}>{item.detail}</Text>
      </View>
    </View>
  );
}

// A slot with nothing clean to wear (dashed box, as on the design board).
function MissingRow({ slot, last }: { slot: OutfitSlot; last: boolean }) {
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={[styles.photo, styles.dashed]}>
        <Icon name="plus" size={28} />
      </View>
      <View style={styles.text}>
        <Text style={styles.slot}>{SLOT_LABELS[slot].toUpperCase()}</Text>
        <Text style={styles.name}>{`No clean ${SLOT_LABELS[slot].toLowerCase()}`}</Text>
        <Text style={type.caption}>Add one, or mark one clean in your Closet.</Text>
      </View>
    </View>
  );
}

export function OutfitCard({ items }: { items: Record<OutfitSlot, OutfitItem> }) {
  return (
    <View style={styles.card}>
      {OUTFIT_SLOTS.map((slot, index) => (
        <ItemRow key={slot} item={items[slot]} last={index === OUTFIT_SLOTS.length - 1} />
      ))}
    </View>
  );
}

// Shown instead of the outfit when some slots have nothing clean to wear.
export function MissingCard({ missing }: { missing: OutfitSlot[] }) {
  return (
    <View style={styles.card}>
      {missing.map((slot, index) => (
        <MissingRow key={slot} slot={slot} last={index === missing.length - 1} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: size.border, borderColor: colors.ink, borderRadius: 20, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 16, padding: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  photo: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  dashed: { backgroundColor: colors.paper, borderWidth: size.border, borderColor: colors.ink, borderStyle: "dashed" },
  text: { flex: 1, gap: 4 },
  slot: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1, color: colors.muted },
  name: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
});
