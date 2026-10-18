import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { garmentName } from "../../services/garment";
import type { ClosetItem } from "../../services/closet";
import { colors, fonts, radius } from "../../theme";
import { Icon } from "../common/Icon";

interface Props {
  item: ClosetItem;
  size: number;
  // "M" for the person's own garments, otherwise the owner's initial.
  badge: string;
  ownerLabel: string;
  onPress: () => void;
  // Holding the tile: the closet uses it to offer removing the garment.
  onLongPress?: () => void;
}

// One garment in the closet grid: its photo, who owns it, and whether it is in the laundry.
export function ClosetTile({ item, size, badge, ownerLabel, onPress, onLongPress }: Props) {
  const name = garmentName(item);
  const dirty = item.status === "dirty";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${dirty ? "dirty" : "clean"}, ${item.favorite ? "favorite, " : ""}${ownerLabel}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.tile, { width: size, height: size }]}
    >
      {item.photoUrl ? (
        <Image source={{ uri: item.photoUrl }} style={styles.image} resizeMode="cover" />
      ) : (
        <Text style={styles.name}>{name}</Text>
      )}
      {/* Never color-only: a dirty garment says so in words. */}
      {dirty && (
        <View style={styles.dirty}>
          <Text style={styles.dirtyText}>Dirty</Text>
        </View>
      )}
      {item.favorite && (
        <View style={styles.heart}>
          <Icon name="heart" size={14} filled />
        </View>
      )}
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: "#f2f2f2",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.small,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: 4,
  },
  image: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  name: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, textAlign: "center" },
  dirty: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  dirtyText: { fontFamily: fonts.bold, fontSize: 11, color: colors.paper },
  heart: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.paper,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.paper,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
});
