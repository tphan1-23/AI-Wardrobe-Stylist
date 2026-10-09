import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../components/common/Button";
import { Chip } from "../components/common/Chip";
import { ErrorLine } from "../components/common/ErrorLine";
import { Screen } from "../components/common/Screen";
import { StepIndicator } from "../components/common/StepIndicator";
import {
  COLOR_GROUPS,
  OCCASION_OPTIONS,
  STYLE_OPTIONS,
  TEMP_OPTIONS,
  emptyQuizDraft,
  saveQuiz,
  setTempComfort,
  toggleAvoidedGroup,
  toggleFavoriteGroup,
  toggleOccasion,
  toggleStyle,
} from "../services/quiz";
import { gateway } from "../services/supabase";
import { colors, fonts, type } from "../theme";

function Question({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.question}>
      <View>
        <Text style={styles.questionTitle}>{title}</Text>
        {hint ? <Text style={type.caption}>{hint}</Text> : null}
      </View>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

// Last onboarding step: seeds the first suggestions before any thumbs up/down exists (D8).
export function QuizScreen({ onDone }: { onDone: () => void }) {
  const [draft, setDraft] = useState(emptyQuizDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setBusy(true);
    setError(null);
    const result = await saveQuiz(gateway, draft);
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error);
  }

  return (
    <Screen title="Your style" subtitle="Pick what fits. This sets your starting preferences.">
      <StepIndicator step={2} total={2} />

      <Question title="How do you usually dress?" hint="Pick at least one">
        {STYLE_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={draft.style_vibes.includes(o.value)}
            onPress={() => setDraft((d) => toggleStyle(d, o.value))}
          />
        ))}
      </Question>

      <Question title="What do you dress for?" hint="Optional">
        {OCCASION_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={draft.occasions.includes(o.value)}
            onPress={() => setDraft((d) => toggleOccasion(d, o.value))}
          />
        ))}
      </Question>

      <Question title="Colors you reach for" hint="Optional">
        {COLOR_GROUPS.map((g) => (
          <Chip
            key={g.id}
            label={g.label}
            selected={draft.favorite_groups.includes(g.id)}
            onPress={() => setDraft((d) => toggleFavoriteGroup(d, g.id))}
          />
        ))}
      </Question>

      <Question title="Colors you avoid" hint="Optional">
        {COLOR_GROUPS.map((g) => (
          <Chip
            key={g.id}
            label={g.label}
            selected={draft.avoided_groups.includes(g.id)}
            onPress={() => setDraft((d) => toggleAvoidedGroup(d, g.id))}
          />
        ))}
      </Question>

      <Question title="Do you run warm or cold?">
        {TEMP_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            role="radio"
            label={o.label}
            selected={draft.temp_comfort === o.value}
            onPress={() => setDraft((d) => setTempComfort(d, o.value))}
          />
        ))}
      </Question>

      <View style={styles.actions}>
        {error && <ErrorLine message={error} />}
        <Button label="Finish" onPress={finish} busy={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  question: { gap: 12 },
  questionTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actions: { marginTop: "auto" },
});
