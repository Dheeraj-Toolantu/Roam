import { Ionicons } from '@expo/vector-icons';
import { Linking, Platform, Text, View } from 'react-native';

import { useBackgroundLocation } from '../hooks/useBackgroundLocation';
import { colors, type } from '../theme';
import { Button, Card, Row, Toggle } from './ui';

/**
 * Explains and controls background recording. Permission is requested only
 * after the user opts in, with a clear explanation (BRD §5.4: explicit, visible).
 */
export function BackgroundLocationCard({ compact }: { compact?: boolean }) {
  const { status, setPreferred, requestPermission } = useBackgroundLocation();
  if (!status) return null;

  if (!status.supported) {
    return (
      <Card style={{ marginBottom: 14 }} testID="bg-unsupported">
        <Row>
          <Ionicons name="phone-portrait-outline" size={20} color={colors.textMuted} />
          <Text style={[type.small, { flex: 1 }]}>
            {Platform.OS === 'web'
              ? 'In the browser, ROAM records while this tab is open. Use the iOS or Android app to keep recording in the background.'
              : 'Background recording is not available in this app build. ROAM records while the app is open.'}
          </Text>
        </Row>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 14 }} testID="bg-card">
      <Toggle
        testID="toggle-background"
        label="Keep recording in the background"
        hint={
          compact
            ? undefined
            : 'Record your route and keep crew live sharing on when ROAM is in the background or closed. A notification (Android) or the location indicator (iOS) shows while recording.'
        }
        value={status.preferred}
        onChange={(v) => void setPreferred(v)}
      />
      {status.preferred && status.permission !== 'granted' && (
        <View style={{ gap: 8, marginTop: 4 }}>
          <Row gap={6}>
            <Ionicons name="alert-circle" size={16} color={colors.yellow} />
            <Text style={[type.small, { flex: 1 }]}>
              {status.permission === 'denied'
                ? 'Location is set to “While using the app”. Choose “Allow all the time” in Settings to record in the background.'
                : 'ROAM needs “Allow all the time” location access to record in the background.'}
            </Text>
          </Row>
          {status.permission === 'denied' ? (
            <Button small variant="secondary" icon="settings-outline" title="Open Settings" onPress={() => Linking.openSettings()} />
          ) : (
            <Button small testID="grant-background" icon="navigate" title="Allow background location" onPress={() => void requestPermission()} />
          )}
        </View>
      )}
      {status.active && (
        <Row gap={6} style={{ marginTop: 4 }}>
          <Ionicons name="checkmark-circle" size={16} color={colors.green} />
          <Text style={type.small}>Background recording is ready.</Text>
        </Row>
      )}
    </Card>
  );
}
