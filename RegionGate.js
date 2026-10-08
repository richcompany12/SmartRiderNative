// 활동 지역 첫 실행 창 (v6, 14번)
// 순서: 업데이트 창 → 약관 창 → 이 창. 활동 지역을 한 번도 안 고른 폰에서만 뜬다.
// [나중에]를 3번 누르면 더는 안 띄운다 (사이드바·설정에서 고를 수 있음)

import { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// 이 창은 화면 목록(Stack) 밖이라 SafeAreaProvider가 없음 → useSafeAreaInsets 쓰면 앱이 죽는다. 시작 때 잰 값을 쓴다
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { useTheme } from './theme';
import { onTermsDone } from './TermsGate';
import { getRegions, saveRegions, setPartnerOptIn } from './statsSync';
import RegionPicker from './screens/RegionPicker';

const KEY_SKIPS = 'region_gate_skips';
const MAX_SKIPS = 3;

export default function RegionGate() {
  const [show, setShow] = useState(false);
  const insets = initialWindowMetrics?.insets || { top: 0, bottom: 0 };
  const { c, font, space } = useTheme();

  useEffect(() => {
    let alive = true;
    const off = onTermsDone(async () => {
      try {
        if ((await getRegions()).length > 0) return;
        const skips = Number(await AsyncStorage.getItem(KEY_SKIPS)) || 0;
        if (skips >= MAX_SKIPS) return;
        if (alive) setShow(true);
      } catch (e) {}
    });
    return () => { alive = false; off(); };
  }, []);

  const later = async () => {
    try {
      const skips = Number(await AsyncStorage.getItem(KEY_SKIPS)) || 0;
      await AsyncStorage.setItem(KEY_SKIPS, String(skips + 1));
    } catch (e) {}
    setShow(false);
  };

  const save = async (regions, partner) => {
    await saveRegions(regions);
    if (partner) await setPartnerOptIn(true);
    setShow(false);
  };

  return (
    <Modal visible={show} animationType="slide" onRequestClose={later} statusBarTranslucent navigationBarTranslucent>
      <View style={[s.screen, { backgroundColor: c.bg, paddingTop: insets.top + space.md }]}>
        <Text style={[s.title, font.title, { color: c.text, paddingHorizontal: space.lg }]}>활동 지역</Text>
        <RegionPicker onSave={save} onLater={later} bottomInset={insets.bottom} />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  title: { fontWeight: 'bold' },
});
