/**
 * Curated destination catalogue. Used for:
 *  - offline, privacy-preserving reverse geocoding (nearest city, city-level only)
 *  - Explore / trending destinations / City Hub
 *  - the cinematic video globe + country scenes
 *  - the Smart Trip Planner
 */
export interface City {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  continent: 'Asia' | 'Europe' | 'Africa' | 'North America' | 'South America' | 'Oceania';
  lat: number;
  lng: number;
  emoji: string;
  tagline: string;
  colors: [string, string];
  highlights: { name: string; kind: 'attraction' | 'restaurant' | 'beach' | 'nature' | 'culture' | 'nightlife' }[];
}

export const CITIES: City[] = [
  {
    id: 'goa', name: 'Goa', country: 'India', countryCode: 'IN', continent: 'Asia', lat: 15.4909, lng: 73.8278, emoji: '🏖️',
    tagline: 'Sun, sand and sunsets', colors: ['#F97316', '#DB2777'],
    highlights: [
      { name: 'Baga Beach', kind: 'beach' }, { name: 'Fort Aguada', kind: 'attraction' },
      { name: 'Thalassa', kind: 'restaurant' }, { name: 'Dudhsagar Falls', kind: 'nature' },
      { name: 'Anjuna Flea Market', kind: 'culture' }, { name: 'Candolim Beach', kind: 'beach' },
      { name: 'Basilica of Bom Jesus', kind: 'culture' }, { name: 'Tito\'s Lane', kind: 'nightlife' },
    ],
  },
  {
    id: 'mumbai', name: 'Mumbai', country: 'India', countryCode: 'IN', continent: 'Asia', lat: 19.076, lng: 72.8777, emoji: '🌆',
    tagline: 'The city that never sleeps', colors: ['#0EA5E9', '#6366F1'],
    highlights: [
      { name: 'Gateway of India', kind: 'attraction' }, { name: 'Marine Drive', kind: 'nature' },
      { name: 'Leopold Cafe', kind: 'restaurant' }, { name: 'Elephanta Caves', kind: 'culture' },
      { name: 'Juhu Beach', kind: 'beach' }, { name: 'Bandra Bandstand', kind: 'attraction' },
    ],
  },
  {
    id: 'delhi', name: 'New Delhi', country: 'India', countryCode: 'IN', continent: 'Asia', lat: 28.6139, lng: 77.209, emoji: '🕌',
    tagline: 'History on every corner', colors: ['#EAB308', '#DC2626'],
    highlights: [
      { name: 'India Gate', kind: 'attraction' }, { name: 'Qutub Minar', kind: 'culture' },
      { name: 'Chandni Chowk', kind: 'restaurant' }, { name: 'Humayun\'s Tomb', kind: 'culture' },
      { name: 'Lodhi Garden', kind: 'nature' }, { name: 'Hauz Khas Village', kind: 'nightlife' },
    ],
  },
  {
    id: 'jaipur', name: 'Jaipur', country: 'India', countryCode: 'IN', continent: 'Asia', lat: 26.9124, lng: 75.7873, emoji: '🏰',
    tagline: 'The Pink City', colors: ['#EC4899', '#F59E0B'],
    highlights: [
      { name: 'Amber Fort', kind: 'attraction' }, { name: 'Hawa Mahal', kind: 'culture' },
      { name: 'Nahargarh Fort', kind: 'nature' }, { name: 'Laxmi Mishthan Bhandar', kind: 'restaurant' },
      { name: 'City Palace', kind: 'culture' },
    ],
  },
  {
    id: 'manali', name: 'Manali', country: 'India', countryCode: 'IN', continent: 'Asia', lat: 32.2432, lng: 77.1892, emoji: '🏔️',
    tagline: 'Snow peaks & pine forests', colors: ['#22D3EE', '#3B82F6'],
    highlights: [
      { name: 'Rohtang Pass', kind: 'nature' }, { name: 'Solang Valley', kind: 'nature' },
      { name: 'Old Manali Cafes', kind: 'restaurant' }, { name: 'Hadimba Temple', kind: 'culture' },
    ],
  },
  {
    id: 'bengaluru', name: 'Bengaluru', country: 'India', countryCode: 'IN', continent: 'Asia', lat: 12.9716, lng: 77.5946, emoji: '🌳',
    tagline: 'Garden city, startup soul', colors: ['#10B981', '#0EA5E9'],
    highlights: [
      { name: 'Lalbagh', kind: 'nature' }, { name: 'Cubbon Park', kind: 'nature' },
      { name: 'MTR', kind: 'restaurant' }, { name: 'Bangalore Palace', kind: 'culture' },
      { name: 'Church Street', kind: 'nightlife' },
    ],
  },
  {
    id: 'kerala', name: 'Kochi', country: 'India', countryCode: 'IN', continent: 'Asia', lat: 9.9312, lng: 76.2673, emoji: '🛶',
    tagline: 'Backwaters & spice routes', colors: ['#16A34A', '#0D9488'],
    highlights: [
      { name: 'Fort Kochi', kind: 'culture' }, { name: 'Chinese Fishing Nets', kind: 'attraction' },
      { name: 'Alleppey Backwaters', kind: 'nature' }, { name: 'Kashi Art Cafe', kind: 'restaurant' },
    ],
  },
  {
    id: 'dubai', name: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', continent: 'Asia', lat: 25.2048, lng: 55.2708, emoji: '🏙️',
    tagline: 'Skylines in the desert', colors: ['#F59E0B', '#8B5CF6'],
    highlights: [
      { name: 'Burj Khalifa', kind: 'attraction' }, { name: 'Dubai Mall', kind: 'attraction' },
      { name: 'Desert Safari', kind: 'nature' }, { name: 'Dubai Marina', kind: 'nightlife' },
      { name: 'Al Fahidi', kind: 'culture' }, { name: 'Jumeirah Beach', kind: 'beach' },
      { name: 'Ravi Restaurant', kind: 'restaurant' },
    ],
  },
  {
    id: 'bali', name: 'Bali', country: 'Indonesia', countryCode: 'ID', continent: 'Asia', lat: -8.3405, lng: 115.092, emoji: '🌴',
    tagline: 'Island of the gods', colors: ['#14B8A6', '#22C55E'],
    highlights: [
      { name: 'Uluwatu Temple', kind: 'culture' }, { name: 'Tegallalang Rice Terraces', kind: 'nature' },
      { name: 'Seminyak Beach', kind: 'beach' }, { name: 'Ubud Monkey Forest', kind: 'nature' },
      { name: 'Locavore', kind: 'restaurant' },
    ],
  },
  {
    id: 'tokyo', name: 'Tokyo', country: 'Japan', countryCode: 'JP', continent: 'Asia', lat: 35.6762, lng: 139.6503, emoji: '🗼',
    tagline: 'Neon, temples & ramen', colors: ['#EF4444', '#A855F7'],
    highlights: [
      { name: 'Shibuya Crossing', kind: 'attraction' }, { name: 'Senso-ji', kind: 'culture' },
      { name: 'Tsukiji Outer Market', kind: 'restaurant' }, { name: 'Shinjuku Gyoen', kind: 'nature' },
      { name: 'Golden Gai', kind: 'nightlife' }, { name: 'teamLab Planets', kind: 'attraction' },
    ],
  },
  {
    id: 'singapore', name: 'Singapore', country: 'Singapore', countryCode: 'SG', continent: 'Asia', lat: 1.3521, lng: 103.8198, emoji: '🦁',
    tagline: 'Garden city of the future', colors: ['#06B6D4', '#EC4899'],
    highlights: [
      { name: 'Marina Bay Sands', kind: 'attraction' }, { name: 'Gardens by the Bay', kind: 'nature' },
      { name: 'Lau Pa Sat', kind: 'restaurant' }, { name: 'Sentosa', kind: 'beach' },
    ],
  },
  {
    id: 'bangkok', name: 'Bangkok', country: 'Thailand', countryCode: 'TH', continent: 'Asia', lat: 13.7563, lng: 100.5018, emoji: '🛕',
    tagline: 'Street food capital', colors: ['#F97316', '#EAB308'],
    highlights: [
      { name: 'Grand Palace', kind: 'culture' }, { name: 'Wat Arun', kind: 'culture' },
      { name: 'Chatuchak Market', kind: 'attraction' }, { name: 'Khao San Road', kind: 'nightlife' },
      { name: 'Jay Fai', kind: 'restaurant' },
    ],
  },
  {
    id: 'kathmandu', name: 'Kathmandu', country: 'Nepal', countryCode: 'NP', continent: 'Asia', lat: 27.7172, lng: 85.324, emoji: '⛰️',
    tagline: 'Gateway to the Himalaya', colors: ['#6366F1', '#22D3EE'],
    highlights: [
      { name: 'Boudhanath Stupa', kind: 'culture' }, { name: 'Thamel', kind: 'nightlife' },
      { name: 'Swayambhunath', kind: 'culture' }, { name: 'Garden of Dreams', kind: 'nature' },
    ],
  },
  {
    id: 'paris', name: 'Paris', country: 'France', countryCode: 'FR', continent: 'Europe', lat: 48.8566, lng: 2.3522, emoji: '🗼',
    tagline: 'City of light', colors: ['#6366F1', '#EC4899'],
    highlights: [
      { name: 'Eiffel Tower', kind: 'attraction' }, { name: 'Louvre', kind: 'culture' },
      { name: 'Montmartre', kind: 'culture' }, { name: 'Le Comptoir', kind: 'restaurant' },
      { name: 'Seine River Cruise', kind: 'nature' },
    ],
  },
  {
    id: 'london', name: 'London', country: 'United Kingdom', countryCode: 'GB', continent: 'Europe', lat: 51.5074, lng: -0.1278, emoji: '🎡',
    tagline: 'Royal, rainy, remarkable', colors: ['#3B82F6', '#EF4444'],
    highlights: [
      { name: 'London Eye', kind: 'attraction' }, { name: 'British Museum', kind: 'culture' },
      { name: 'Borough Market', kind: 'restaurant' }, { name: 'Hyde Park', kind: 'nature' },
      { name: 'Soho', kind: 'nightlife' },
    ],
  },
  {
    id: 'rome', name: 'Rome', country: 'Italy', countryCode: 'IT', continent: 'Europe', lat: 41.9028, lng: 12.4964, emoji: '🏛️',
    tagline: 'The eternal city', colors: ['#F59E0B', '#B91C1C'],
    highlights: [
      { name: 'Colosseum', kind: 'culture' }, { name: 'Trevi Fountain', kind: 'attraction' },
      { name: 'Trastevere', kind: 'restaurant' }, { name: 'Vatican Museums', kind: 'culture' },
    ],
  },
  {
    id: 'santorini', name: 'Santorini', country: 'Greece', countryCode: 'GR', continent: 'Europe', lat: 36.3932, lng: 25.4615, emoji: '🏝️',
    tagline: 'Blue domes, white walls', colors: ['#0EA5E9', '#F8FAFC'],
    highlights: [
      { name: 'Oia Sunset', kind: 'nature' }, { name: 'Red Beach', kind: 'beach' },
      { name: 'Fira', kind: 'culture' }, { name: 'Ammoudi Bay', kind: 'restaurant' },
    ],
  },
  {
    id: 'barcelona', name: 'Barcelona', country: 'Spain', countryCode: 'ES', continent: 'Europe', lat: 41.3874, lng: 2.1686, emoji: '⛪',
    tagline: 'Gaudí, tapas & beaches', colors: ['#EF4444', '#F59E0B'],
    highlights: [
      { name: 'Sagrada Família', kind: 'culture' }, { name: 'Park Güell', kind: 'attraction' },
      { name: 'La Boqueria', kind: 'restaurant' }, { name: 'Barceloneta', kind: 'beach' },
    ],
  },
  {
    id: 'istanbul', name: 'Istanbul', country: 'Türkiye', countryCode: 'TR', continent: 'Europe', lat: 41.0082, lng: 28.9784, emoji: '🕌',
    tagline: 'Where continents meet', colors: ['#DC2626', '#0EA5E9'],
    highlights: [
      { name: 'Hagia Sophia', kind: 'culture' }, { name: 'Grand Bazaar', kind: 'attraction' },
      { name: 'Bosphorus Cruise', kind: 'nature' }, { name: 'Karaköy Güllüoğlu', kind: 'restaurant' },
    ],
  },
  {
    id: 'cairo', name: 'Cairo', country: 'Egypt', countryCode: 'EG', continent: 'Africa', lat: 30.0444, lng: 31.2357, emoji: '🐫',
    tagline: 'Pyramids & the Nile', colors: ['#EAB308', '#B45309'],
    highlights: [
      { name: 'Pyramids of Giza', kind: 'culture' }, { name: 'Egyptian Museum', kind: 'culture' },
      { name: 'Khan el-Khalili', kind: 'attraction' }, { name: 'Nile Felucca Ride', kind: 'nature' },
    ],
  },
  {
    id: 'capetown', name: 'Cape Town', country: 'South Africa', countryCode: 'ZA', continent: 'Africa', lat: -33.9249, lng: 18.4241, emoji: '🌊',
    tagline: 'Mountains meet the ocean', colors: ['#0EA5E9', '#10B981'],
    highlights: [
      { name: 'Table Mountain', kind: 'nature' }, { name: 'Boulders Beach', kind: 'beach' },
      { name: 'V&A Waterfront', kind: 'attraction' }, { name: 'Bo-Kaap', kind: 'culture' },
    ],
  },
  {
    id: 'newyork', name: 'New York', country: 'United States', countryCode: 'US', continent: 'North America', lat: 40.7128, lng: -74.006, emoji: '🗽',
    tagline: 'The big apple', colors: ['#6366F1', '#F59E0B'],
    highlights: [
      { name: 'Central Park', kind: 'nature' }, { name: 'Times Square', kind: 'attraction' },
      { name: 'The Met', kind: 'culture' }, { name: 'Katz\'s Deli', kind: 'restaurant' },
      { name: 'Brooklyn Bridge', kind: 'attraction' },
    ],
  },
  {
    id: 'sanfrancisco', name: 'San Francisco', country: 'United States', countryCode: 'US', continent: 'North America', lat: 37.7749, lng: -122.4194, emoji: '🌉',
    tagline: 'Fog, hills & cable cars', colors: ['#F97316', '#3B82F6'],
    highlights: [
      { name: 'Golden Gate Bridge', kind: 'attraction' }, { name: 'Alcatraz', kind: 'culture' },
      { name: 'Ferry Building', kind: 'restaurant' }, { name: 'Muir Woods', kind: 'nature' },
    ],
  },
  {
    id: 'cancun', name: 'Cancún', country: 'Mexico', countryCode: 'MX', continent: 'North America', lat: 21.1619, lng: -86.8515, emoji: '🌺',
    tagline: 'Caribbean blues', colors: ['#06B6D4', '#22C55E'],
    highlights: [
      { name: 'Chichén Itzá', kind: 'culture' }, { name: 'Playa Delfines', kind: 'beach' },
      { name: 'Isla Mujeres', kind: 'nature' }, { name: 'Cenote Ik Kil', kind: 'nature' },
    ],
  },
  {
    id: 'rio', name: 'Rio de Janeiro', country: 'Brazil', countryCode: 'BR', continent: 'South America', lat: -22.9068, lng: -43.1729, emoji: '🎭',
    tagline: 'Samba by the sea', colors: ['#22C55E', '#EAB308'],
    highlights: [
      { name: 'Christ the Redeemer', kind: 'attraction' }, { name: 'Copacabana', kind: 'beach' },
      { name: 'Sugarloaf Mountain', kind: 'nature' }, { name: 'Lapa', kind: 'nightlife' },
    ],
  },
  {
    id: 'cusco', name: 'Cusco', country: 'Peru', countryCode: 'PE', continent: 'South America', lat: -13.5319, lng: -71.9675, emoji: '🦙',
    tagline: 'Gateway to Machu Picchu', colors: ['#A855F7', '#F97316'],
    highlights: [
      { name: 'Machu Picchu', kind: 'culture' }, { name: 'Rainbow Mountain', kind: 'nature' },
      { name: 'San Pedro Market', kind: 'restaurant' }, { name: 'Sacsayhuamán', kind: 'culture' },
    ],
  },
  {
    id: 'sydney', name: 'Sydney', country: 'Australia', countryCode: 'AU', continent: 'Oceania', lat: -33.8688, lng: 151.2093, emoji: '🦘',
    tagline: 'Harbour city', colors: ['#0EA5E9', '#F59E0B'],
    highlights: [
      { name: 'Sydney Opera House', kind: 'culture' }, { name: 'Bondi Beach', kind: 'beach' },
      { name: 'Harbour Bridge Climb', kind: 'attraction' }, { name: 'Blue Mountains', kind: 'nature' },
    ],
  },
  {
    id: 'queenstown', name: 'Queenstown', country: 'New Zealand', countryCode: 'NZ', continent: 'Oceania', lat: -45.0312, lng: 168.6626, emoji: '🪂',
    tagline: 'Adventure capital', colors: ['#10B981', '#6366F1'],
    highlights: [
      { name: 'Milford Sound', kind: 'nature' }, { name: 'Skyline Gondola', kind: 'attraction' },
      { name: 'Fergburger', kind: 'restaurant' }, { name: 'Kawarau Bungy', kind: 'attraction' },
    ],
  },
];

export const CITY_BY_ID: Record<string, City> = Object.fromEntries(CITIES.map((c) => [c.id, c]));

export function findCityByName(name?: string | null): City | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return CITIES.find((c) => c.name.toLowerCase() === n || c.id === n);
}
