/** Travel Passport achievements (BRD §13). Pure so it can be unit tested. */

export interface JourneySummaryForBadges {
  status: 'active' | 'paused' | 'completed';
  type: 'solo' | 'group';
  startedAt: number;
  endedAt?: number | null;
  countries: string[];
  cities: string[];
  continents?: string[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  colors: [string, string];
  unlocked: boolean;
  progress: number; // 0..1
  progressLabel: string;
}

export interface PassportStats {
  journeys: number;
  countries: string[];
  cities: string[];
  continents: string[];
}

export function passportStats(journeys: JourneySummaryForBadges[]): PassportStats {
  const done = journeys.filter((j) => j.status === 'completed');
  const countries = new Set<string>();
  const cities = new Set<string>();
  const continents = new Set<string>();
  for (const j of journeys) {
    j.countries.forEach((c) => countries.add(c));
    j.cities.forEach((c) => cities.add(c));
    j.continents?.forEach((c) => continents.add(c));
  }
  return { journeys: done.length, countries: [...countries], cities: [...cities], continents: [...continents] };
}

function isWeekendTrip(j: JourneySummaryForBadges) {
  if (j.status !== 'completed' || !j.endedAt) return false;
  const day = new Date(j.startedAt).getDay();
  const durDays = (j.endedAt - j.startedAt) / 86_400_000;
  return (day === 5 || day === 6 || day === 0) && durDays <= 3;
}

export function computeAchievements(journeys: JourneySummaryForBadges[], homeCountry = 'India'): Achievement[] {
  const s = passportStats(journeys);
  const completed = journeys.filter((j) => j.status === 'completed');
  const intl = completed.some((j) => j.countries.some((c) => c !== homeCountry));
  const weekend = completed.some(isWeekendTrip);
  const crew = completed.some((j) => j.type === 'group');

  const ratio = (n: number, target: number) => Math.min(1, n / target);
  const mk = (
    id: string, title: string, description: string, icon: string, colors: [string, string],
    n: number, target: number, unit: string,
  ): Achievement => ({
    id, title, description, icon, colors,
    unlocked: n >= target,
    progress: ratio(n, target),
    progressLabel: `${Math.min(n, target)}/${target} ${unit}`,
  });

  return [
    mk('first-journey', 'First Journey', 'Complete your first journey', 'flag', ['#22D3EE', '#3B82F6'], s.journeys, 1, 'journey'),
    mk('first-international', 'First International Trip', `Travel outside ${homeCountry}`, 'airplane', ['#8B5CF6', '#EC4899'], intl ? 1 : 0, 1, 'trip'),
    mk('ten-cities', '10 Cities Club', 'Visit 10 different cities', 'business', ['#F97316', '#EF4444'], s.cities.length, 10, 'cities'),
    mk('ten-countries', '10 Countries Club', 'Visit 10 different countries', 'earth', ['#10B981', '#0EA5E9'], s.countries.length, 10, 'countries'),
    mk('world-explorer', 'World Explorer', 'Visit 3 continents', 'globe', ['#F59E0B', '#8B5CF6'], s.continents.length, 3, 'continents'),
    mk('weekend-explorer', 'Weekend Explorer', 'Complete a weekend getaway (≤3 days)', 'sunny', ['#EAB308', '#F97316'], weekend ? 1 : 0, 1, 'trip'),
    mk('crew-traveller', 'Crew Traveller', 'Complete a group journey with your crew', 'people', ['#EC4899', '#8B5CF6'], crew ? 1 : 0, 1, 'trip'),
  ];
}
