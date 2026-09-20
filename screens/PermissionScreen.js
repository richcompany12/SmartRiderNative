import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Linking, AppState, NativeModules,     // ★ NativeModules 추가
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useTheme } from '../theme';

/**
 * PermissionScreen.js
 *
 * 설치 직후 권한 3종을 잡아주는 화면.
 * 이게 없으면 라이더는 설정 메뉴를 세 번 파고들어야 하고,
 * 대부분은 "설치했는데 아무것도 안 뜨네"로 끝난다.
 *
 * 위치 안내 문구는 플레이스토어 백그라운드 위치 심사의
 * "명시적 공개 대화상자" 역할도 겸한다. 문구를 함부로 줄이지 말 것.
 *
 * 오버레이(다른 앱 위에 표시)는 상태를 확인할 방법이 아직 없다.
 * 코틀린에 hasOverlayPermission()을 추가하면 그때 체크가 붙는다.
 */

const { ProximityOverlayModule } = NativeModules;     // ★ 새 줄

export const PERMISSION_SEEN_KEY = 'permission_intro_seen';

export default function PermissionScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { c, font, space, radius, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius, TAP), [c]);

  // 설정에서 다시 열었을 때는 "시작하기" 대신 "닫기"가 맞다
  const fromSettings = route?.params?.fromSettings === true;

  const [loc, setLoc] = useState('unknown');    // 'ok' | 'partial' | 'no'
  const [noti, setNoti] = useState('unknown');  // 'ok' | 'no'
  const [ovl, setOvl] = useState('unknown');    // ★ 새 줄 — 오버레이

  const check = async () => {
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      const bg = await Location.getBackgroundPermissionsAsync();
      if (bg.granted) setLoc('ok');
      else if (fg.granted) setLoc('partial');   // "앱 사용 중에만" — 토스트가 안 뜬다
      else setLoc('no');
    } catch (e) { setLoc('no'); }

    try {
      const n = await Notifications.getPermissionsAsync();
      setNoti(n.granted ? 'ok' : 'no');
    } catch (e) { setNoti('no'); }

    // ★ 여기부터 새 블록
    try {
      const ok = await ProximityOverlayModule.hasPermission();
      setOvl(ok ? 'ok' : 'no');
    } catch (e) { setOvl('no'); }
    // ★ 새 블록 끝
  };

  // 설정 앱에 다녀오면 상태가 바뀌어 있다. 돌아올 때마다 다시 본다.
  useFocusEffect(useCallback(() => {
    check();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') check();
    });
    return () => sub.remove();
  }, []));

  // ── 각 항목 누르면 ───────────────────────────────────
  const askLocation = async () => {
    // 앞단(앱 사용 중)을 먼저 받아야 뒷단(항상 허용)을 물어볼 수 있다
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) { Linking.openSettings().catch(() => {}); return; }

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (!bg.granted) {
      // 안드로이드 11부터는 이 창이 아예 안 뜨고 설정으로 보내야 한다
      Linking.openSettings().catch(() => {});
    }
    check();
  };

  const askNoti = async () => {
    const r = await Notifications.requestPermissionsAsync();
    if (!r.granted) Linking.openSettings().catch(() => {});
    check();
  };

    // 앱 정보 화면이 아니라 "다른 앱 위에 표시" 화면으로 바로 보낸다.
  // 돌아오면 AppState 리스너가 알아서 다시 검사한다.
  const openOverlay = async () => {
    try {
      await ProximityOverlayModule.requestPermission();
    } catch (e) {
      Linking.openSettings().catch(() => {});   // 실패 시 예전 방식으로 폴백
    }
  };

  const done = async () => {
    try { await AsyncStorage.setItem(PERMISSION_SEEN_KEY, '1'); } catch (e) {}

    // ★ 여기서부터 새 블록
    // 권한을 방금 받았으니 Kotlin 서비스를 켠다.
    // ProximityNotifier의 setup()은 앱 실행당 1회라 다시 돌지 않는다.
    try {
      if (loc !== 'no' && ovl === 'ok') {
        await ProximityOverlayModule.startService();
      }
    } catch (e) {}
    // ★ 새 블록 끝

    if (fromSettings) navigation.goBack();
    else navigation.replace('Home');
  };

  // ── 한 항목 ──────────────────────────────────────────
  const Item = ({ icon, title, desc, state, btnText, onPress }) => {
    const okColor = c.accent;
    const isOk = state === 'ok';
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <Icon name={icon} size={20} color={isOk ? okColor : c.textSub} />
          <Text style={s.cardTitle}>{title}</Text>
          {isOk && <Icon name="check-circle" size={20} color={okColor} />}
        </View>
        <Text style={s.cardDesc}>{desc}</Text>

        {state === 'partial' && (
          <Text style={s.warnText}>
            지금은 "앱 사용 중에만" 입니다. 이 상태로는 알림이 뜨지 않습니다.
          </Text>
        )}

        {!isOk && (
          <TouchableOpacity style={s.btn} onPress={onPress}>
            <Text style={s.btnText}>{btnText}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.xl,
          paddingHorizontal: space.lg,
          paddingBottom: insets.bottom + 120,
        }}
      >
        <Text style={s.title}>권한 3개가 필요해요</Text>
        <Text style={s.lead}>
          건물 근처에 갔을 때 내 메모를 자동으로 띄워드리려면{'\n'}
          아래 3가지를 허용해야 합니다.
        </Text>

        <Item
          icon="map-marker-radius"
          title="위치 — 항상 허용"
          desc={
            '스마트라이더는 앱을 닫거나 화면이 꺼져 있을 때도 위치를 확인합니다. ' +
            '등록한 건물 근처에 도착하면 내가 적어둔 메모를 띄우고, 단속 구역에 들어가면 경고하기 위해서입니다. ' +
            '위치 정보는 서버로 전송되지 않고 폰 안에서만 쓰입니다.'
          }
          state={loc}
          btnText={loc === 'partial' ? '"항상 허용"으로 바꾸기' : '위치 허용하기'}
          onPress={askLocation}
        />

        <Item
          icon="window-restore"
          title="다른 앱 위에 표시"
          desc={
            '배달 앱을 보는 중에도 건물 정보가 위에 뜨려면 필요합니다. ' +
            '설정 화면에서 "다른 앱 위에 표시"를 찾아 켜주세요.'
          }
          state={ovl}
          btnText="설정 열기"
          onPress={openOverlay}
        />

        <Item
          icon="bell-ring-outline"
          title="알림"
          desc="위치 확인이 켜져 있다는 표시와 경고음을 위해 필요합니다."
          state={noti}
          btnText="알림 허용하기"
          onPress={askNoti}
        />

         {ovl !== 'ok' && (
          <Text style={s.hint}>
            이 권한만 팝업으로 물어볼 수 없어 설정 화면으로 이동합니다.
            목록에서 스마트라이더를 찾아 켜주세요.
          </Text>
        )}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <TouchableOpacity style={s.doneBtn} onPress={done}>
          <Text style={s.doneBtnText}>{fromSettings ? '닫기' : '시작하기'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (c, font, space, radius, TAP) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  title: { ...font.title, color: c.text, marginBottom: space.sm },
  lead: { ...font.sub, color: c.textMuted, lineHeight: 21, marginBottom: space.xl },

  card: {
    backgroundColor: c.surface, borderRadius: radius.lg, padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.line,
    marginBottom: space.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { ...font.body, fontWeight: '500', color: c.text, flex: 1 },
  cardDesc: { ...font.sub, color: c.textMuted, lineHeight: 20, marginTop: space.sm },

  warnText: {
    ...font.sub, color: c.warn, lineHeight: 20,
    backgroundColor: c.warnSoft, borderRadius: radius.sm,
    padding: space.md, marginTop: space.md,
  },

  btn: {
    minHeight: TAP, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.surfaceSoft, borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
    marginTop: space.md,
  },
  btnText: { ...font.body, fontWeight: '500', color: c.accent },

  hint: { ...font.tiny, color: c.textFaint, lineHeight: 18, marginTop: space.sm },

  footer: {
    paddingHorizontal: space.lg, paddingTop: space.md,
    backgroundColor: c.bg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line,
  },
  doneBtn: {
    minHeight: TAP + 4, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.accent, borderRadius: radius.sm,
  },
  doneBtnText: { ...font.body, fontWeight: '500', color: c.onAccent },
});