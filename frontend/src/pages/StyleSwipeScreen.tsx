import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Button } from "../components/common/Button";
import { ErrorLine } from "../components/common/ErrorLine";
import { Icon } from "../components/common/Icon";
import { Screen } from "../components/common/Screen";
import { OutfitCard } from "../components/outfit/OutfitCard";
import { setOutfitFavorite } from "../services/history";
import { SWIPE_DISTANCE_FRACTION, createDeck, decideSwipe, type DeckState, type Swipe } from "../services/styleSwipe";
import { historyGateway, todayGateway } from "../services/supabase";
import { todayString, weatherLine } from "../services/today";
import { colors, fonts, radius, size, type } from "../theme";

const BUTTON = 64;
const FLY_MS = 220;

function Stamp({ label, side, opacity }: { label: string; side: "left" | "right"; opacity: Animated.AnimatedInterpolation<number> }) {
  return (
    <Animated.View pointerEvents="none" style={[styles.stamp, side === "left" ? styles.stampLeft : styles.stampRight, { opacity }]}>
      <Text style={styles.stampText}>{label}</Text>
    </Animated.View>
  );
}

// "Style Swipe": swipe through outfit ideas. Right = like, left = dislike; the AI learns from
// each swipe. The ideas are not today's outfit and are not saved to history.
export function StyleSwipeScreen({ location, onBack }: { location: string | null; onBack: () => void }) {
  const { width } = useWindowDimensions();
  const deck = useMemo(() => createDeck(todayGateway, todayString()), []);
  const [state, setState] = useState<DeckState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  // Ideas the person hearted, by suggestion id. A hearted idea shows up in History, Favorites.
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [savingFavorite, setSavingFavorite] = useState(false);

  const pan = useRef(new Animated.ValueXY()).current;
  const busy = useRef(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await deck.load();
    if (result.ok) setState(result.value);
    else setError(result.error);
    setLoading(false);
  }, [deck]);

  useEffect(() => {
    start();
  }, [start]);

  // Sends the answer for the current idea and shows the next one.
  async function commit(direction: Swipe) {
    setAdvancing(true);
    setError(null);
    const result = await deck.swipe(direction);
    pan.setValue({ x: 0, y: 0 });
    if (result.ok) setState(result.value);
    else {
      setState((current) => (current ? { ...current, current: null } : current));
      setError(result.error);
    }
    setAdvancing(false);
    busy.current = false;
  }

  // Adds the outfit being shown to the favorites, or takes it out again. Separate from the swipe.
  async function toggleFavorite(id: string) {
    setSavingFavorite(true);
    setError(null);
    const next = !favorites[id];
    const result = await setOutfitFavorite(historyGateway, id, next);
    setSavingFavorite(false);
    if (result.ok) setFavorites((current) => ({ ...current, [id]: next }));
    else setError(result.error);
  }

  // Slides the card off the screen, then commits the answer.
  function fly(direction: Swipe, dy = 0) {
    if (busy.current) return;
    busy.current = true;
    Animated.timing(pan, {
      toValue: { x: (direction === "like" ? 1 : -1) * widthRef.current * 1.3, y: dy },
      duration: FLY_MS,
      useNativeDriver: false,
    }).start(() => commit(direction));
  }

  const flyRef = useRef(fly);
  flyRef.current = fly;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => !busy.current && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => pan.setValue({ x: g.dx, y: g.dy * 0.3 }),
      onPanResponderRelease: (_, g) => {
        const swipe = decideSwipe(g.dx, g.vx, widthRef.current);
        if (swipe) flyRef.current(swipe, g.dy * 0.3);
        else Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    }),
  ).current;

  const distance = width * SWIPE_DISTANCE_FRACTION;
  const rotate = pan.x.interpolate({ inputRange: [-width / 2, 0, width / 2], outputRange: ["-12deg", "0deg", "12deg"], extrapolate: "clamp" });
  const likeOpacity = pan.x.interpolate({ inputRange: [0, distance], outputRange: [0, 1], extrapolate: "clamp" });
  const nopeOpacity = pan.x.interpolate({ inputRange: [-distance, 0], outputRange: [1, 0], extrapolate: "clamp" });

  function body() {
    if (loading && !state) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ink} />
          <Text style={type.body}>Finding outfit ideas…</Text>
        </View>
      );
    }

    if (!state?.current && !state?.end) {
      return (
        <View style={styles.gap}>
          {error && <ErrorLine message={error} />}
          <Button label="Try again" onPress={start} />
        </View>
      );
    }

    if (state.end) {
      return (
        <View style={styles.gap}>
          <Text style={type.cardTitle}>
            {state.end.kind === "exhausted" ? "That is every idea for now" : "Add a few more clothes first"}
          </Text>
          <Text style={type.body}>
            {state.end.kind === "exhausted"
              ? `You judged ${state.judged} ${state.judged === 1 ? "outfit" : "outfits"}. Add more clothes for more ideas.`
              : state.end.reasoning}
          </Text>
          <Button label="Back to Today" onPress={onBack} />
        </View>
      );
    }

    const { current } = state;
    if (!current) return null;
    return (
      <View style={styles.gap}>
        <View style={styles.stage}>
          <Animated.View
            {...responder.panHandlers}
            style={[styles.card, { opacity: advancing ? 0 : 1, transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]}
          >
            <OutfitCard items={current.items} />
            <Stamp label="LIKE" side="left" opacity={likeOpacity} />
            <Stamp label="NOPE" side="right" opacity={nopeOpacity} />
          </Animated.View>
          {advancing && (
            <View style={styles.advancing} pointerEvents="none">
              <ActivityIndicator color={colors.ink} />
            </View>
          )}
        </View>
        {current.reasoning ? (
          <Text style={styles.why}>
            <Text style={styles.whyLabel}>Why: </Text>
            {current.reasoning}
          </Text>
        ) : null}
        {state.warning && <ErrorLine message={`Your last swipe could not be saved. ${state.warning}`} />}
        {error && <ErrorLine message={error} />}
        <View style={styles.answers}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dislike this outfit"
            disabled={advancing}
            onPress={() => fly("dislike")}
            style={[styles.answer, styles.answerPlain, advancing && styles.dim]}
          >
            <Icon name="close" size={28} stroke={2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favorites[current.suggestionId] ? "Remove outfit from favorites" : "Add outfit to favorites"}
            accessibilityState={{ selected: !!favorites[current.suggestionId], busy: savingFavorite }}
            disabled={advancing || savingFavorite}
            onPress={() => toggleFavorite(current.suggestionId)}
            style={[styles.answer, styles.answerPlain, (advancing || savingFavorite) && styles.dim]}
          >
            <Icon name="heart" size={28} filled={!!favorites[current.suggestionId]} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Like this outfit"
            disabled={advancing}
            onPress={() => fly("like")}
            style={[styles.answer, styles.answerFilled, advancing && styles.dim]}
          >
            <Icon name="check" size={28} stroke={2} color={colors.paper} />
          </Pressable>
        </View>
      </View>
    );
  }

  const weather = weatherLine(location, state?.weather ?? null);
  return (
    <Screen top={20}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8} style={styles.back}>
          <Icon name="back" size={24} />
          <Text style={styles.backText}>Today</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          Style Swipe
        </Text>
        <Text style={styles.count}>{state ? `${state.judged} judged` : ""}</Text>
      </View>
      <Text style={type.body}>
        Swipe right on outfits you like and left on ones you do not. The AI learns your taste from every swipe. Tap the heart to
        save an outfit to your favorites.
      </Text>
      {weather !== "" && (
        <View style={styles.weather}>
          <Icon name="cloud" size={22} />
          <Text style={styles.weatherText}>{weather}</Text>
        </View>
      )}
      {body()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { flexDirection: "row", alignItems: "center", minWidth: 84, minHeight: 44 },
  backText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  count: { minWidth: 84, textAlign: "right", fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  weather: { flexDirection: "row", alignItems: "center", gap: 8 },
  weatherText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  center: { paddingVertical: 48, alignItems: "center", gap: 12 },
  gap: { gap: 16 },
  stage: { minHeight: 380 },
  card: { backgroundColor: colors.paper, borderRadius: 20 },
  advancing: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  stamp: {
    position: "absolute",
    top: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: radius.small,
    backgroundColor: colors.paper,
  },
  stampLeft: { left: 16, transform: [{ rotate: "-12deg" }] },
  stampRight: { right: 16, transform: [{ rotate: "12deg" }] },
  stampText: { fontFamily: fonts.bold, fontSize: 22, letterSpacing: 2, color: colors.ink },
  why: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.ink },
  whyLabel: { fontFamily: fonts.bold },
  answers: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  answer: { width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, borderWidth: size.border, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
  answerPlain: { backgroundColor: colors.paper },
  answerFilled: { backgroundColor: colors.ink },
  dim: { opacity: 0.5 },
  hint: { flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted, textAlign: "center", paddingHorizontal: 12 },
});
