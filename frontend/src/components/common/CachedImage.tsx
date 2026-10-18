import { Image } from "expo-image";
import type { ImageStyle, StyleProp } from "react-native";
import { photoCacheKey } from "../../services/photoCache";

// A garment photo from a signed link, cached on the phone so it is downloaded once.
export function CachedImage({ url, label, style }: { url: string; label?: string; style: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={{ uri: url, cacheKey: photoCacheKey(url) }}
      accessibilityLabel={label}
      style={style}
      contentFit="cover"
      cachePolicy="disk"
      transition={120}
    />
  );
}
