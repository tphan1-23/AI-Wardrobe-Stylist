import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../components/common/Button";
import { ErrorLine } from "../components/common/ErrorLine";
import { Icon, type IconName } from "../components/common/Icon";
import { Screen } from "../components/common/Screen";
import { GarmentForm } from "../components/closet/GarmentForm";
import { addPhoto, confirmTag, discardPhoto, saveGarment, setTag, unconfirmedFields, type ReviewState } from "../services/add";
import { draftFromTags } from "../services/garment";
import { newPhotoId } from "../services/photoId";
import { addGateway } from "../services/supabase";
import { colors, fonts, radius, size, type } from "../theme";

type Step =
  | { kind: "choose" }
  | { kind: "working" }
  | { kind: "review"; uri: string; review: ReviewState };

// `allowsEditing` opens the system crop screen after the photo is taken or chosen, so the person can
// trim the photo to just the garment. Quality 0.7 is smaller than a full-resolution photo, still sharp enough for the AI to read. With a quality
// below 1 the picker hands back a JPEG, which is what the upload is told it is.
const PICKER_OPTIONS = { quality: 0.7, base64: true, allowsEditing: true } as const;

function OptionCard({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.option}>
      <Icon name={icon} size={32} />
      <View style={styles.optionText}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={type.caption}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

// Add a garment (decisions D4 and D18): photo, the AI suggests tags, the person confirms, save.
// The steps (upload, ask the AI, review rules, save) are in services/add.ts; this screen picks
// the photo and shows the review.
export function AddScreen({ userId }: { userId: string }) {
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handlePicked(result: ImagePicker.ImagePickerResult) {
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      setError("Could not read that photo. Try another one.");
      return;
    }
    setError(null);
    setSaved(false);
    setStep({ kind: "working" });
    const added = await addPhoto(addGateway, userId, { data: decode(asset.base64), extension: "jpg" }, newPhotoId);
    if (!added.ok) {
      setStep({ kind: "choose" });
      setError(added.error);
      return;
    }
    setStep({ kind: "review", uri: asset.uri, review: added.value });
  }

  async function takePhoto() {
    setError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError("Allow camera access in Settings to take a photo, or choose one from your library.");
        return;
      }
      await handlePicked(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
    } catch {
      setError("Could not open the camera. Choose a photo from your library instead.");
    }
  }

  async function chooseFromLibrary() {
    setError(null);
    try {
      await handlePicked(await ImagePicker.launchImageLibraryAsync({ ...PICKER_OPTIONS, mediaTypes: ["images"] }));
    } catch {
      setError("Could not open your photo library. Please try again.");
    }
  }

  async function retake(review: ReviewState) {
    setBusy(true);
    await discardPhoto(addGateway, review);
    setBusy(false);
    setError(null);
    setStep({ kind: "choose" });
  }

  async function save(review: ReviewState) {
    setBusy(true);
    setError(null);
    const result = await saveGarment(addGateway, userId, review);
    setBusy(false);
    if (result.ok) {
      setSaved(true);
      setStep({ kind: "choose" });
    } else {
      setError(result.error);
    }
  }

  if (step.kind === "working") {
    return (
      <Screen key="working" top={20}>
        <View style={styles.working}>
          <ActivityIndicator color={colors.ink} />
          <Text style={type.body}>Uploading and reading your photo…</Text>
        </View>
      </Screen>
    );
  }

  if (step.kind === "review") {
    const { uri, review } = step;
    const update = (next: ReviewState) => setStep({ kind: "review", uri, review: next });
    const notice = review.warnings.join(" ");
    return (
      <Screen key="review" top={20}>
        <View style={styles.reviewHeader}>
          <Pressable accessibilityRole="button" onPress={() => retake(review)} disabled={busy} hitSlop={8} style={styles.retake}>
            <Icon name="back" size={24} />
            <Text style={styles.retakeText}>Retake</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.reviewTitle}>
            Review tags
          </Text>
          <View style={styles.retake} />
        </View>
        <Image source={{ uri }} accessibilityLabel="Your photo" style={styles.photo} resizeMode="cover" />
        {notice !== "" && <Text style={styles.notice}>{notice}</Text>}
        <Text style={type.body}>
          {review.manual
            ? "Choose the tags for this garment."
            : "Tags are filled in for you. Check them and fix anything that is off before saving."}
        </Text>
        <GarmentForm
          draft={draftFromTags(review.tags)}
          attention={unconfirmedFields(review)}
          onChoose={(field, value) => update(setTag(review, field, value))}
          onConfirm={(field) => update(confirmTag(review, field))}
        />
        <View style={styles.actions}>
          {error && <ErrorLine message={error} />}
          <Button label="Confirm and save" onPress={() => save(review)} busy={busy} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      key="choose"
      top={20}
      titleStyle="title"
      title="Add a garment"
      subtitle="Take a photo of one item. We will suggest tags and you confirm them."
    >
      {saved && (
        <View style={styles.savedRow}>
          <Icon name="check" />
          <Text style={styles.savedText}>Saved to your closet.</Text>
        </View>
      )}
      {error && <ErrorLine message={error} />}
      <OptionCard icon="camera" title="Take a photo" subtitle="Open the camera" onPress={takePhoto} />
      <OptionCard icon="image" title="Choose from library" subtitle="Pick an existing photo" onPress={chooseFromLibrary} />
      <View style={styles.tip}>
        <Text style={styles.tipText}>
          <Text style={styles.tipLabel}>Tip: </Text>
          lay the item flat on a plain surface in good light, one item per photo.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: "row", alignItems: "center", gap: 16, borderWidth: size.border, borderColor: colors.ink, borderRadius: radius.card, padding: 20 },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  tip: { backgroundColor: "#f2f2f2", borderWidth: 1, borderColor: colors.line, borderRadius: radius.small, padding: 16 },
  tipText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.ink },
  tipLabel: { fontFamily: fonts.bold },
  working: { alignItems: "center", gap: 16, paddingVertical: 64 },
  reviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  retake: { flexDirection: "row", alignItems: "center", minWidth: 84, minHeight: 44 },
  retakeText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  reviewTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  photo: { height: 150, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, backgroundColor: "#f2f2f2" },
  notice: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.ink },
  actions: { marginTop: "auto", gap: 8 },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  savedText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
});
