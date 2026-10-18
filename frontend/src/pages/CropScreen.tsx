import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Button } from "../components/common/Button";
import { Chip } from "../components/common/Chip";
import { Icon } from "../components/common/Icon";
import { Screen } from "../components/common/Screen";
import {
  fitImage,
  fullFrame,
  isFullImage,
  moveFrame,
  resizeFrame,
  squareFrame,
  toImageRegion,
  type Corner,
  type CropRegion,
  type Rect,
  type Size,
} from "../services/crop";
import { colors, fonts, type } from "../theme";

interface Props {
  uri: string;
  // The real size of the picture in pixels.
  image: Size;
  busy: boolean;
  // `null` means use the photo exactly as it was taken.
  onUse: (region: CropRegion | null) => void;
  onCancel: () => void;
}

const HANDLE = 28;
const SHADE = "rgba(0,0,0,0.55)";
const CORNERS: Corner[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"];

type Responders = Record<"body" | Corner, ReturnType<typeof PanResponder.create>>;

const sameRect = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;

// Crop a photo: it starts as the whole picture, and the person can keep it as taken or drag the
// frame (and its corners) to crop it. All the geometry is in services/crop.ts.
export function CropScreen({ uri, image, busy, onUse, onCancel }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const box = useMemo<Size>(() => {
    const width = windowWidth - 48;
    return { width, height: Math.min(Math.round(width * 1.2), 440) };
  }, [windowWidth]);
  const shown = useMemo(() => fitImage(image, box), [image, box]);

  const [frame, setFrame] = useState<Rect>(() => fullFrame(shown));
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const startRef = useRef(frame);

  // One responder for dragging the whole frame and one per corner. Each remembers where the frame
  // was when the finger went down and applies the total drag so far to that.
  const responders = useRef<Responders | null>(null);
  if (!responders.current) {
    const make = (apply: (start: Rect, dx: number, dy: number) => Rect) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Keep the drag even though the screen behind scrolls.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          startRef.current = frameRef.current;
        },
        onPanResponderMove: (_, g) => setFrame(apply(startRef.current, g.dx, g.dy)),
      });
    responders.current = {
      body: make((start, dx, dy) => moveFrame(start, dx, dy, shownRef.current)),
      topLeft: make((start, dx, dy) => resizeFrame(start, "topLeft", dx, dy, shownRef.current)),
      topRight: make((start, dx, dy) => resizeFrame(start, "topRight", dx, dy, shownRef.current)),
      bottomLeft: make((start, dx, dy) => resizeFrame(start, "bottomLeft", dx, dy, shownRef.current)),
      bottomRight: make((start, dx, dy) => resizeFrame(start, "bottomRight", dx, dy, shownRef.current)),
    };
  }
  const pan = responders.current;

  const region = toImageRegion(frame, shown, image);
  const whole = isFullImage(region, image);
  const isSquare = sameRect(frame, squareFrame(shown));

  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const handlePosition = (corner: Corner) => ({
    left: (corner === "topLeft" || corner === "bottomLeft" ? frame.x : right) - HANDLE / 2,
    top: (corner === "topLeft" || corner === "topRight" ? frame.y : bottom) - HANDLE / 2,
  });

  return (
    <Screen top={20}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onCancel} disabled={busy} hitSlop={8} style={styles.back}>
          <Icon name="back" size={24} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          Crop photo
        </Text>
        <View style={styles.back} />
      </View>

      <Text style={type.body}>Use the whole photo, or crop it: drag the frame to move it and drag a corner to resize it.</Text>

      <View style={[styles.box, { width: box.width, height: box.height }]}>
        <Image source={{ uri }} accessibilityLabel="Your photo" style={styles.fill} resizeMode="contain" />
        {/* Dim everything outside the frame. */}
        <View pointerEvents="none" style={[styles.shade, { left: 0, top: 0, width: box.width, height: frame.y }]} />
        <View pointerEvents="none" style={[styles.shade, { left: 0, top: bottom, width: box.width, height: box.height - bottom }]} />
        <View pointerEvents="none" style={[styles.shade, { left: 0, top: frame.y, width: frame.x, height: frame.height }]} />
        <View pointerEvents="none" style={[styles.shade, { left: right, top: frame.y, width: box.width - right, height: frame.height }]} />
        <View
          {...pan.body.panHandlers}
          accessibilityLabel="Crop frame"
          style={[styles.frame, { left: frame.x, top: frame.y, width: frame.width, height: frame.height }]}
        >
          <View pointerEvents="none" style={styles.frameInner} />
        </View>
        {CORNERS.map((corner) => (
          <View key={corner} {...pan[corner].panHandlers} accessibilityLabel={`Resize ${corner}`} style={[styles.handle, handlePosition(corner)]} />
        ))}
      </View>

      <View style={styles.chips}>
        <Chip role="radio" label="Full photo" selected={whole} onPress={() => setFrame(fullFrame(shown))} />
        <Chip role="radio" label="Square" selected={isSquare} onPress={() => setFrame(squareFrame(shown))} />
      </View>

      <View style={styles.actions}>
        <Button label={whole ? "Use full photo" : "Use cropped photo"} onPress={() => onUse(whole ? null : region)} busy={busy} />
        <Button label="Choose another photo" variant="secondary" onPress={onCancel} disabled={busy} />
        {busy && (
          <View style={styles.working}>
            <ActivityIndicator color={colors.ink} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { flexDirection: "row", alignItems: "center", minWidth: 84, minHeight: 44 },
  backText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  box: { alignSelf: "center", backgroundColor: "#f2f2f2", borderRadius: 12, overflow: "hidden" },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  shade: { position: "absolute", backgroundColor: SHADE },
  frame: { position: "absolute", borderWidth: 2, borderColor: "#ffffff" },
  frameInner: { flex: 1, borderWidth: 1, borderColor: "#000000" },
  handle: {
    position: "absolute",
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#000000",
  },
  chips: { flexDirection: "row", gap: 8 },
  actions: { marginTop: "auto", gap: 10 },
  working: { alignItems: "center" },
});
