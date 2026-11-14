import { type City } from '../data/cities';

export interface PlanDay {
  day: number;
  title: string;
  items: { time: string; name: string; kind: string }[];
}

const SLOTS = ['09:00 AM', '12:30 PM', '04:00 PM', '07:30 PM'];
const PREF: Record<string, string[]> = {
  relaxed: ['beach', 'nature', 'restaurant', 'culture'],
  culture: ['culture', 'attraction', 'restaurant', 'culture'],
  adventure: ['nature', 'attraction', 'restaurant', 'nightlife'],
  food: ['restaurant', 'attraction', 'restaurant', 'nightlife'],
};

/**
 * Smart Trip Planner (rule-based). Builds a day-by-day itinerary from the
 * curated highlights of a destination, ordered by the chosen travel style.
 * A full AI assistant is a Phase 5 / future item in the BRD.
 */
export function planTrip(city: City, days: number, style: keyof typeof PREF = 'relaxed'): PlanDay[] {
  const d = Math.max(1, Math.min(10, Math.floor(days)));
  const order = PREF[style] ?? PREF.relaxed;
  const pool = [...city.highlights];
  const used = new Map<string, number>();
  const pick = (kind: string) => {
    const sorted = [...pool].sort((a, b) => {
      const ka = a.kind === kind ? 0 : 1;
      const kb = b.kind === kind ? 0 : 1;
      return ka - kb || (used.get(a.name) ?? 0) - (used.get(b.name) ?? 0);
    });
    const choice = sorted[0];
    used.set(choice.name, (used.get(choice.name) ?? 0) + 1);
    return choice;
  };
  const plan: PlanDay[] = [];
  for (let i = 0; i < d; i++) {
    const items = SLOTS.map((time, s) => {
      const h = pick(order[(s + i) % order.length]);
      return { time, name: h.name, kind: h.kind };
    });
    plan.push({ day: i + 1, title: i === 0 ? `Arrive in ${city.name}` : i === d - 1 ? 'Last day & goodbyes' : `Explore ${city.name}`, items });
  }
  return plan;
}
