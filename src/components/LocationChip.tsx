import { Ionicons } from '@expo/vector-icons';
import { Linking, Platform, Pressable, Text, View } from 'react-native';

import { useLiveLocation, liveLocation } from '../services/location';
import { colors, radius } from '../theme';

/** "📍 Baga, Goa, India · Live" – auto-detected current location with refresh / enable. */
export function LocationChip({ onPress }: { onPress?: () => void }) {
  const loc = useLiveLocation();
  const denied = loc.permission === 'denied';
  const label = loc.place?.label ?? (loc.fix ? `${loc.fix.lat.toFixed(4)}, ${loc.fix.lng.toFixed(4)}` : null);

  return (
    <Pressable
      testID="location-chip"
      accessibilityRole="button"
      accessibilityLabel={label ? `Current location ${label}` : 'Detect my location'}
      onPress={() => {
        if (denied && Platform.OS !== 'web') return void Linking.openSettings();
        if (!loc.fix) return void liveLocation.detect();
        onPress?.();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: denied ? colors.red + '1A' : colors.cyan + '14',
        borderWidth: 1,
        borderColor: denied ? colors.red + '55' : colors.cyan + '40',
        opacity: pressed ? 0.8 : 1,
        marginBottom: 14,
        maxWidth: '100%',
      })}>
      <Ionicons name={denied ? 'location-outline' : 'location'} size={16} color={denied ? colors.red : colors.cyan} />
      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13, flexShrink: 1 }} numberOfLines={1} testID="location-label">
        {denied
          ? Platform.OS === 'web'
            ? 'Location blocked — allow it in your browser'
            : 'Location off — tap to enable'
          : loc.detecting && !label
            ? 'Detecting your location…'
            : (label ?? 'Tap to detect your location')}
      </Text>
      {!!label && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green }} />
          <Text style={{ color: colors.green, fontSize: 11, fontWeight: '800' }}>LIVE</Text>
        </View>
      )}
    </Pressable>
  );
}
