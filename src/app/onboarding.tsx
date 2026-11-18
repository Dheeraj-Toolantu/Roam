import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Globe } from '@/components/maps';
import { Appear, IconBadge, Pop, PressScale } from '@/components/motion';
import { Button, Logo, Row } from '@/components/ui';
import { ONBOARDING_KEY } from '@/lib/constants';
import { colors, gradients, type } from '@/theme';

const STICKERS = [
  ['🌴', '📸', '✈️'],
  ['🫶', '🎉', '🏝️'],
  ['🔒', '✨', '🗺️'],
];
const STICKER_POS = [
  { top: '12%', left: '8%' },
  { top: '6%', right: '10%' },
  { bottom: '12%', right: '14%' },
] as const;

const SLIDES = [
  {
    title: 'Turn Your Trips\ninto Cinematic Stories',
    points: ['Auto track your journey', 'Capture & share moments', 'Travel with your crew', 'Split expenses easily'],
    art: 'globe',
  },
  {
    title: 'Travel Together\nwith ROAM CREW',
    points: ['Create group trips', 'Invite friends with a link', 'Shared timeline & albums', 'One combined group video'],
    art: 'crew',
  },
  {
    title: 'Private by Default,\nShared by Choice',
    points: ['Precise location stays private', 'Choose who sees each post', 'Pause tracking any time', 'Delete your history anytime'],
    art: 'lock',
  },
] as const;

export default function Onboarding() {
  const [i, setI] = useState(0);
  const s = SLIDES[i];
  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {});
    router.replace('/signup');
  };
  return (
    <LinearGradient colors={gradients.screen} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, padding: 24, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Logo size={34} />
          <Pressable onPress={finish} testID="onboarding-skip">
            <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Skip</Text>
          </Pressable>
        </Row>
        <View key={`art-${i}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Pop>
            {s.art === 'globe' ? (
              <Globe size={220} markers={[{ lat: 48.85, lng: 2.35, color: colors.pink }, { lat: 15.49, lng: 73.82, color: colors.cyan }, { lat: 36.39, lng: 25.46, color: colors.yellow }]} />
            ) : (
              <IconBadge icon={s.art === 'crew' ? 'people' : 'shield-checkmark'} gradient={s.art === 'crew' ? 'sunset' : 'ocean'} size={190} rounded="circle" float />
            )}
          </Pop>
          {/* floating stickers */}
          {STICKERS[i].map((e, k) => (
            <Appear key={e} delay={250 + k * 120} style={[{ position: 'absolute' }, STICKER_POS[k]]}>
              <Text style={{ fontSize: 30 }}>{e}</Text>
            </Appear>
          ))}
        </View>
        <Appear key={`title-${i}`}>
          <Text style={[type.h1, { textAlign: 'center', marginBottom: 20 }]}>{s.title}</Text>
        </Appear>
        <View style={{ gap: 12, marginBottom: 28, alignSelf: 'center' }}>
          {s.points.map((p, k) => (
            <Appear key={`${i}-${p}`} index={k} delay={120}>
              <Row gap={12}>
                <Ionicons name="checkmark-circle" size={22} color={colors.green} />
                <Text style={type.body}>{p}</Text>
              </Row>
            </Appear>
          ))}
        </View>
        <Row style={{ justifyContent: 'center', marginBottom: 18 }} gap={6}>
          {SLIDES.map((_, k) => (
            <PressScale key={k} onPress={() => setI(k)} accessibilityLabel={`Slide ${k + 1}`}>
              <View style={{ width: k === i ? 26 : 8, height: 8, borderRadius: 4, backgroundColor: k === i ? colors.cyan : colors.cardAlt }} />
            </PressScale>
          ))}
        </Row>
        <Button
          testID="onboarding-next"
          title={i === SLIDES.length - 1 ? 'Get Started' : 'Next'}
          iconRight="arrow-forward"
          onPress={() => (i === SLIDES.length - 1 ? finish() : setI(i + 1))}
        />
        <Pressable
          onPress={async () => {
            await AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {});
            router.replace('/login');
          }}
          style={{ marginTop: 14, alignItems: 'center' }}>
          <Text style={type.small}>
            Already have an account? <Text style={{ color: colors.cyan, fontWeight: '700' }}>Login</Text>
          </Text>
        </Pressable>
      </SafeAreaView>
    </LinearGradient>
  );
}
