import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  COLOR_OPTIONS,
  FIELD_LABELS,
  SEASON_LABELS,
  SEASON_OPTIONS,
  TYPE_GROUPS,
  WARMTH_LABELS,
  WARMTH_OPTIONS,
  colorLabel,
  toggleColor,
  toggleSeason,
  typeLabel,
  type GarmentDraft,
  type TagField,
} from "../../services/garment";
import { MAX_COLORS } from "../../../../supabase/functions/_shared/tag-schema";
import type { GarmentTags } from "../../../../supabase/functions/_shared/types";
import { colors, fonts, size, type } from "../../theme";
import { Chip } from "../common/Chip";

interface Props {
  draft: GarmentDraft;
  // Fields the AI was unsure about: shown boxed, with "Check this", until the person settles them.
  attention?: TagField[];
  onChoose: <F extends TagField>(field: F, value: GarmentTags[F]) => void;
  // "Looks right" on a flagged field keeps the suggested value.
  onConfirm?: (field: TagField) => void;
}

function Field({
  field,
  needsCheck,
  hasValue,
  onConfirm,
  children,
}: {
  field: TagField;
  needsCheck: boolean;
  hasValue: boolean;
  onConfirm?: (field: TagField) => void;
  children: ReactNode;
}) {
  return (
    <View style={[styles.field, needsCheck && styles.flagged]}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{FIELD_LABELS[field]}</Text>
        {needsCheck && (
          <View style={styles.check}>
            <Text style={styles.checkText}>{hasValue ? "Check this" : "Choose one"}</Text>
            {hasValue && onConfirm && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${FIELD_LABELS[field]} looks right`}
                onPress={() => onConfirm(field)}
                hitSlop={8}
              >
                <Text style={styles.looksRight}>Looks right</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

// The four tags of a garment (type, colors, seasons, warmth). Used to review what the AI
// suggested (Add) and to edit a saved garment (Closet).
export function GarmentForm({ draft, attention = [], onChoose, onConfirm }: Props) {
  const flag = (field: TagField) => attention.includes(field);
  return (
    <View style={styles.form}>
      <Field field="type" needsCheck={flag("type")} hasValue={draft.type !== null} onConfirm={onConfirm}>
        {TYPE_GROUPS.map((group) => (
          <View key={group.label} style={styles.group}>
            <Text style={type.caption}>{group.label}</Text>
            <View style={styles.chips}>
              {group.types.map((t) => (
                <Chip key={t} role="radio" label={typeLabel(t)} selected={draft.type === t} onPress={() => onChoose("type", t)} />
              ))}
            </View>
          </View>
        ))}
      </Field>

      <Field field="colors" needsCheck={flag("colors")} hasValue={draft.colors !== null} onConfirm={onConfirm}>
        <Text style={type.caption}>
          Pick up to {MAX_COLORS}. The first one you pick is the main color{draft.colors ? ` (${colorLabel(draft.colors[0]!)})` : ""}.
        </Text>
        <View style={styles.chips}>
          {COLOR_OPTIONS.map((c) => (
            <Chip key={c} label={colorLabel(c)} selected={draft.colors?.includes(c) ?? false} onPress={() => onChoose("colors", toggleColor(draft.colors, c))} />
          ))}
        </View>
      </Field>

      <Field field="seasons" needsCheck={flag("seasons")} hasValue={draft.seasons !== null} onConfirm={onConfirm}>
        <Text style={type.caption}>Pick every season it suits, or All seasons.</Text>
        <View style={styles.chips}>
          {SEASON_OPTIONS.map((s) => (
            <Chip key={s} label={SEASON_LABELS[s]} selected={draft.seasons?.includes(s) ?? false} onPress={() => onChoose("seasons", toggleSeason(draft.seasons, s))} />
          ))}
        </View>
      </Field>

      <Field field="warmth" needsCheck={flag("warmth")} hasValue={draft.warmth !== null} onConfirm={onConfirm}>
        <View style={styles.chips}>
          {WARMTH_OPTIONS.map((w) => (
            <Chip key={w} role="radio" label={WARMTH_LABELS[w]} selected={draft.warmth === w} onPress={() => onChoose("warmth", w)} />
          ))}
        </View>
      </Field>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 18 },
  field: { gap: 8, borderRadius: 12, borderWidth: size.border, borderColor: "transparent", padding: 0 },
  // Never color-only: a flagged field gets a heavier border and the words "Check this".
  flagged: { borderWidth: size.borderStrong, borderColor: colors.ink, padding: 12 },
  fieldHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  check: { flexDirection: "row", alignItems: "center", gap: 12 },
  checkText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  looksRight: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, textDecorationLine: "underline" },
  group: { gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
