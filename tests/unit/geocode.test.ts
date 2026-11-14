import { afterEach, describe, expect, it, vi } from 'vitest';

const baga = {
  status: 'OK',
  results: [
    {
      address_components: [
        { long_name: "Tito's Lane", types: ['route'] },
        { long_name: 'Baga', types: ['sublocality', 'political'] },
        { long_name: 'Calangute', types: ['locality', 'political'] },
        { long_name: 'Goa', types: ['administrative_area_level_1', 'political'] },
        { long_name: 'India', types: ['country', 'political'] },
      ],
    },
  ],
};

async function load(key: string) {
  vi.resetModules();
  vi.stubEnv('EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY', key);
  vi.stubEnv('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY', '');
  return import('../../src/lib/googleMaps');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('reverse geocoding with the dedicated Geocoding API key', () => {
  it('calls the Geocoding API with that key and maps the address', async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => baga }));
    vi.stubGlobal('fetch', fetchMock);
    const { reverseGeocodeWeb } = await load('geo-key');
    const place = await reverseGeocodeWeb(15.5553, 73.7517);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('latlng=15.5553,73.7517&key=geo-key');
    expect(place).toEqual({ name: "Tito's Lane", district: 'Baga', city: 'Calangute', region: 'Goa', country: 'India' });
  });

  it('returns null (offline city fallback) when Google refuses or the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ status: 'REQUEST_DENIED' }) })));
    expect(await (await load('geo-key')).reverseGeocodeWeb(1, 2)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await (await load('geo-key')).reverseGeocodeWeb(1, 2)).toBeNull();
  });

  it('does nothing without any key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await (await load('')).reverseGeocodeWeb(1, 2)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
