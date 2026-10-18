// "Your judgement": a deck of outfit ideas to swipe through. Swipe right to like an idea, left to
// dislike it; either way the AI learns from it (a thumbs-up or thumbs-down through update-preferences,
// once per idea). The ideas are not today's outfit: they are saved as kind = 'explore'. Pure
// TypeScript with an injected gateway so it is unit-tested without React Native or a network
// (see tests/judgement.test.ts).
//
// Choosing the ideas and learning from the swipes is the AI core's job (owned by Manuel + Claude);
// this file only asks for the next idea, sends the answer, and keeps the next one ready.
import type { FeedbackValue, ISODate, WeatherSnapshot } from "../../../supabase/functions/_shared/types.ts";
import type { Result } from "./household.ts";
import { judgeIdea, nextIdea, type OutfitSlot, type OutfitView, type TodayGateway, type TodayState } from "./today.ts";

export type Swipe = "like" | "dislike";

// A card is swiped away after being dragged past this share of the screen width, or flicked fast.
export const SWIPE_DISTANCE_FRACTION = 0.3;
export const SWIPE_FLICK_SPEED = 0.8;
// A flick still needs a little drag, so a tap with a twitch is not a swipe.
const MIN_FLICK_DISTANCE = 20;

export function decideSwipe(dx: number, vx: number, width: number): Swipe | null {
  if (dx > width * SWIPE_DISTANCE_FRACTION || (vx > SWIPE_FLICK_SPEED && dx > MIN_FLICK_DISTANCE)) return "like";
  if (dx < -width * SWIPE_DISTANCE_FRACTION || (vx < -SWIPE_FLICK_SPEED && dx < -MIN_FLICK_DISTANCE)) return "dislike";
  return null;
}

export const feedbackFor = (swipe: Swipe): FeedbackValue => (swipe === "like" ? "up" : "down");

// ---- The deck ---------------------------------------------------------------

// Why there is no card to show.
export interface DeckEnd {
  kind: "exhausted" | "incomplete";
  reasoning: string;
  missing: OutfitSlot[];
}

export interface DeckState {
  current: OutfitView | null;
  weather: WeatherSnapshot | null;
  end: DeckEnd | null;
  // How many ideas have been swiped so far.
  judged: number;
  // Set when the last swipe could not be saved (the deck still moves on).
  warning: string | null;
}

export interface Deck {
  // Shows the first idea (or, after an error, the next one): safe to call again to retry.
  load(): Promise<Result<DeckState>>;
  // Sends the answer for the current idea, then moves to the next one.
  swipe(direction: Swipe): Promise<Result<DeckState>>;
}

export function createDeck(gateway: TodayGateway, date: ISODate): Deck {
  // Every idea fetched so far, shown or not yet shown: the server never offers one of these again.
  const seen: string[] = [];
  let current: OutfitView | null = null;
  let judged = 0;
  // The idea after the current one, being fetched while the person decides on the current one.
  let ahead: Promise<Result<TodayState>> | null = null;

  async function load(): Promise<Result<DeckState>> {
    const result = await (ahead ?? nextIdea(gateway, date, [...seen]));
    ahead = null;
    if (!result.ok) return result;

    const state = result.value;
    if (state.kind === "outfit") {
      current = state.outfit;
      seen.push(state.outfit.suggestionId);
      ahead = nextIdea(gateway, date, [...seen]);
      return { ok: true, value: { current, weather: state.weather, end: null, judged, warning: null } };
    }
    current = null;
    const end: DeckEnd = {
      kind: state.kind,
      reasoning: state.reasoning,
      missing: state.kind === "incomplete" ? state.missing : [],
    };
    return { ok: true, value: { current: null, weather: state.weather, end, judged, warning: null } };
  }

  async function swipe(direction: Swipe): Promise<Result<DeckState>> {
    if (!current) return { ok: false, error: "There is no outfit idea to judge right now." };
    const id = current.suggestionId;
    current = null;
    judged += 1;
    // The answer and the next idea are fetched together; a failed answer does not stop the deck.
    const [answer, next] = await Promise.all([judgeIdea(gateway, id, feedbackFor(direction)), load()]);
    if (!next.ok) return next;
    return { ok: true, value: { ...next.value, warning: answer.ok ? null : answer.error } };
  }

  return { load, swipe };
}
