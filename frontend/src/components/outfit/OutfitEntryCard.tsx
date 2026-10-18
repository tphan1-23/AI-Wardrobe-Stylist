import { Pressable, StyleSheet, Text, View } from "react-native";
import { CachedImage } from "../common/CachedImage";
import type { OutfitEntry } from "../../services/history";
import { colors, fonts, radius, size, type } from "../../theme";
import { Icon } from "../common/Icon";

const PHOTO = 84;

interface Props {
  entry: OutfitEntry;
  busy: boolean;
  onToggleFavorite: () => void;
}

// One outfit in the history or favorites list: its photos, what it was made of, and a heart.
export function OutfitEntryCard({ entry, busy, onToggleFavorite }: Props) {
  const names = entry.pieces.map((piece) => piece.name).join(" · ");
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.photos}>
          {entry.pieces.length === 0 ? (
            <View style={[styles.photo, styles.empty]}>
              <Text style={type.caption}>No photos</Text>
            </View>
          ) : (
            entry.pieces.map((piece) => (
              <View key={piece.garmentId} style={styles.photo}>
                {piece.photoUrl ? (
                  <CachedImage url={piece.photoUrl} label={piece.name} style={styles.image} />
                ) : (
                  <Text style={styles.noPhoto}>{piece.name}</Text>
                )}
              </View>
            ))
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={entry.favorite ? "Remove outfit from favorites" : "Add outfit to favorites"}
          accessibilityState={{ selected: entry.favorite, busy }}
          onPress={onToggleFavorite}
          disabled={busy}
          hitSlop={8}
          style={[styles.heart, busy && styles.dim]}
        >
          <Icon name="heart" size={26} filled={entry.favorite} />
        </Pressable>
      </View>
      {names !== "" && <Text style={styles.names}>{names}</Text>}
      {entry.removed > 0 && (
        <Text style={type.caption}>
          {entry.removed === 1 ? "1 item" : `${entry.removed} items`} no longer in your closet
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: size.border, borderColor: colors.ink, borderRadius: radius.card, padding: 12, gap: 10 },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  photos: { flexDirection: "row", gap: 6, flex: 1, flexWrap: "wrap" },
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
    padding: 2,
  },
  empty: { width: "100%" },
  image: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  noPhoto: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, textAlign: "center" },
  heart: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  dim: { opacity: 0.5 },
  names: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.ink },
});
