import { StyleSheet, Text, View } from "react-native";
import { CachedImage } from "../common/CachedImage";
import { SLOT_LABELS, type OutfitItem, type OutfitSlot } from "../../services/today";
import { colors, fonts, radius, size, type } from "../../theme";
import { Icon } from "../common/Icon";

const PHOTO = 112;

function Photo({ url, label }: { url: string | null; label: string }) {
  return (
    <View style={styles.photo}>
      {url ? (
        <CachedImage url={url} label={label} style={styles.image} />
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
        <Text style={styles.slot}>{item.label.toUpperCase()}</Text>
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
        <Text style={type.caption}>
          {slot === "shoes" ? "Add a pair, or mark a pair clean in your Closet." : "Add one (or a dress), or mark one clean in your Closet."}
        </Text>
      </View>
    </View>
  );
}

// The pieces of the outfit, from the outer layer down to the shoes: two for a dress, three for a top and
// bottom, one more when a jacket, coat, hoodie or sweater goes over them.
export function OutfitCard({ items }: { items: OutfitItem[] }) {
  return (
    <View style={styles.card}>
      {items.map((item, index) => (
        <ItemRow key={item.id} item={item} last={index === items.length - 1} />
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
