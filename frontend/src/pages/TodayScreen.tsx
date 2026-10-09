import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../components/common/Button";
import { ErrorLine } from "../components/common/ErrorLine";
import { Icon } from "../components/common/Icon";
import { Screen } from "../components/common/Screen";
import { MissingCard, OutfitCard } from "../components/outfit/OutfitCard";
import {
  formatToday,
  loadToday,
  rejectOutfit,
  todayString,
  wearOutfit,
  type OutfitView,
  type TodayState,
} from "../services/today";
import { todayGateway } from "../services/supabase";
import { colors, fonts, type } from "../theme";

const BUTTON = 64;

function Why({ text }: { text: string }) {
  return (
    <Text style={styles.why}>
      <Text style={styles.whyLabel}>Why: </Text>
      {text}
    </Text>
  );
}

function AnswerButton({
  label,
  icon,
  filled,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  icon: "close" | "check";
  filled: boolean;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.answer, filled ? styles.answerFilled : styles.answerPlain, disabled && !busy && styles.dim]}
    >
      {busy ? (
        <ActivityIndicator color={filled ? colors.paper : colors.ink} />
      ) : (
        <Icon name={icon} size={28} stroke={2} color={filled ? colors.paper : colors.ink} />
      )}
    </Pressable>
  );
}

// The daily suggestion (decisions D2, D3, D9): wear it, or ask for another.
export function TodayScreen({ location }: { location: string | null }) {
  const [now] = useState(() => new Date());
  const date = todayString(now);
  const [state, setState] = useState<TodayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<"yes" | "no" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadToday(todayGateway, date);
    if (result.ok) setState(result.value);
    else setError(result.error);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  async function wear(outfit: OutfitView) {
    setActing("yes");
    setError(null);
    const result = await wearOutfit(todayGateway, outfit.suggestionId);
    setActing(null);
    if (result.ok) setState({ kind: "outfit", outfit: { ...outfit, accepted: true } });
    else setError(result.error);
  }

  async function another(outfit: OutfitView) {
    setActing("no");
    setError(null);
    const result = await rejectOutfit(todayGateway, date, outfit.suggestionId);
    setActing(null);
    if (result.ok) setState(result.value);
    else setError(result.error);
  }

  function body() {
    if (loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ink} />
        </View>
      );
    }
    if (!state) {
      return (
        <View style={styles.gap}>
          {error && <ErrorLine message={error} />}
          <Button label="Try again" onPress={load} />
        </View>
      );
    }
    if (state.kind === "incomplete") {
      return (
        <View style={styles.gap}>
          <MissingCard missing={state.missing} />
          <Why text={state.reasoning} />
          {error && <ErrorLine message={error} />}
          <Button label="Check again" variant="secondary" onPress={load} />
        </View>
      );
    }
    if (state.kind === "exhausted") {
      return (
        <View style={styles.gap}>
          <Text style={type.cardTitle}>That is every outfit for today</Text>
          <Text style={type.body}>{state.reasoning} Add more clothes to your closet for more options.</Text>
        </View>
      );
    }

    const { outfit } = state;
    return (
      <View style={styles.gap}>
        <OutfitCard items={outfit.items} />
        {outfit.reasoning && <Why text={outfit.reasoning} />}
        {error && <ErrorLine message={error} />}
        {outfit.accepted ? (
          <View style={styles.worn}>
            <Icon name="check" />
            <Text style={styles.wornText}>You are wearing this today. Marked as worn.</Text>
          </View>
        ) : (
          <View style={styles.answers}>
            <AnswerButton
              label="No, show another outfit"
              icon="close"
              filled={false}
              busy={acting === "no"}
              disabled={acting !== null}
              onPress={() => another(outfit)}
            />
            <Text style={styles.hint}>Tap ✕ for another outfit, ✓ to wear this</Text>
            <AnswerButton
              label="Yes, wear this"
              icon="check"
              filled
              busy={acting === "yes"}
              disabled={acting !== null}
              onPress={() => wear(outfit)}
            />
          </View>
        )}
      </View>
    );
  }

  return (
    <Screen top={20}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={type.title}>
          Today
        </Text>
        <Text style={styles.date}>{formatToday(now)}</Text>
      </View>
      {location ? (
        <View style={styles.weather}>
          <Icon name="cloud" size={22} />
          <Text style={styles.weatherText}>{location}</Text>
        </View>
      ) : null}
      {body()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  date: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  weather: { flexDirection: "row", alignItems: "center", gap: 8 },
  weatherText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  center: { paddingVertical: 48, alignItems: "center" },
  gap: { gap: 16 },
  why: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.ink },
  whyLabel: { fontFamily: fonts.bold },
  answers: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  answer: { width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, borderWidth: 1.5, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
  answerPlain: { backgroundColor: colors.paper },
  answerFilled: { backgroundColor: colors.ink },
  dim: { opacity: 0.5 },
  hint: { flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted, textAlign: "center", paddingHorizontal: 12 },
  worn: { flexDirection: "row", alignItems: "center", gap: 8 },
  wornText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
});
