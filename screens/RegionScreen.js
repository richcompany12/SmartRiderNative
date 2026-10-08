// 활동 지역 화면 (v6, 14번) — 사이드바 "활동 지역"·설정 [바꾸기]에서 연다
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { getRegions, saveRegions, getPartnerOptIn, setPartnerOptIn } from '../statsSync';
import RegionPicker from './RegionPicker';

export default function RegionScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const [init, setInit] = useState(null);

  useEffect(() => {
    (async () => {
      setInit({ regions: await getRegions(), partner: (await getPartnerOptIn()).on });
    })();
  }, []);

  if (!init) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ActivityIndicator style={{ marginTop: 60 }} color={c.accent} />
      </View>
    );
  }

  const save = async (regions, partner) => {
    await saveRegions(regions);
    if (partner !== init.partner) await setPartnerOptIn(partner);
    Alert.alert('저장했어요', regions.join(', '));
    navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <RegionPicker
        initialRegions={init.regions}
        initialPartner={init.partner}
        onSave={save}
        bottomInset={insets.bottom}
      />
    </View>
  );
}
