import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { AppState, NativeModules, DeviceEventEmitter } from 'react-native';
import { StackActions } from '@react-navigation/native';
import { getCachedBuildings } from '../buildingsCache';
import { getAllAlertPoints } from '../firebaseDB';
import { getRadius, getSettings } from '../settingsCache';
import { navigateTo, navigationRef } from '../navigationRef';

const { ProximityOverlayModule } = NativeModules;

// ─────────────────────────────────────────────────────────
//  위치 감지와 근접 판정은 전부 Kotlin(ProximityOverlayService)이 한다.
//  JS가 하는 일은 두 가지뿐:
//    1) 권한 요청
//    2) 건물 목록과 반경을 Kotlin에 넘겨주기
//
//  expo-location의 백그라운드 태스크(TaskManager)는 쓰지 않는다.
//  안드로이드가 JobScheduler 경로를 조여서 백그라운드에서 죽기 때문.
//  (2026-09-05 검증: Kotlin 포그라운드 서비스는 1시간 무중단, JS는 즉사)
//
//  ⚠️ 이 컴포넌트는 App.js에서 Stack.Navigator '바깥'에 있다.
//     그래서 navigation prop을 받지 못하므로 navigationRef를 쓴다.
//
//  ⚠️ Kotlin은 화면이동 요청을 1.2초 / 2.5초 / 4초에 3번 보낸다.
//     (앱이 뜨는 타이밍을 못 맞추면 navigate가 조용히 무시되기 때문)
//     예전에는 "1초 안에 온 건 무시"로 걸렀는데, 간격이 1초보다 커서
//     3개가 전부 통과 → 지도가 3번 열렸다.
//     지금은 요청마다 붙은 navId를 기억해서 같은 번호면 버린다.
// ─────────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// 컴포넌트가 여러 번 마운트돼도 한 번만 돌게 하는 전역 플래그
let setupDone = false;
let lastSyncAt = 0;

export default function ProximityNotifier() {
  // 이미 처리한 요청번호. 같은 번호가 또 오면 무시한다.
  const doneNav = useRef({ detail: '', map: '', home: '' });

  // 건물 목록 + 반경을 Kotlin 서비스에 전달
  const syncBuildings = async (reason) => {
    try {
      if (!ProximityOverlayModule) return;

      const [buildings, radius] = await Promise.all([getCachedBuildings(), getRadius()]);
      if (!buildings || buildings.length === 0) {
        console.log('[PROX] 건물 캐시가 비어 있어 전달 보류');
        return;
      }

      // Kotlin이 쓰기 좋은 납작한 형태로 변환
      const slim = buildings
        .filter(b => b.location?.lat && b.location?.lng)
        .map(b => ({
          id: String(b.id),
          name: b.name || '',
          memo: b.memo || '',
          memo2: b.memo2 || '',   // 백업 출입정보
          lat: b.location.lat,
          lng: b.location.lng,
        }));

      await ProximityOverlayModule.setBuildings(JSON.stringify({ radius, buildings: slim }));
      lastSyncAt = Date.now();
      console.log(`[PROX] 건물 ${slim.length}개 Kotlin에 전달 (${reason}), 반경 ${radius}m`);
    } catch (e) {
      console.log('[PROX] 건물 전달 실패', e?.message || e);
    }
  };

  // 강력 알림 지점을 Kotlin 서비스에 전달
  // (판정도, "안 볼래" 기록도 전부 Kotlin이 한다. 앱이 꺼져 있어도 동작해야 하므로)
  const syncAlerts = async (reason) => {
    try {
      if (!ProximityOverlayModule?.setAlertPoints) return;

      const [points, settings] = await Promise.all([getAllAlertPoints(), getSettings()]);
      const slim = (points || [])
        .filter(a => a.location?.lat && a.location?.lng)
        // 설정에서 꺼둔 종류는 아예 넘기지 않는다
        .filter(a => settings.alertTypes[a.alertType || 'etc'] !== false)
        .map(a => ({
          id: String(a.id),
          name: a.name || '',
          type: a.alertType || 'etc',
          lat: a.location.lat,
          lng: a.location.lng,
        }));

      await ProximityOverlayModule.setAlertPoints(JSON.stringify({
        enterRadius: settings.alertDistance,
        exitRadius: settings.alertDistance * 2,
        sound: settings.alertSound,
        points: slim,
      }));
      console.log(`[PROX] 알림지점 ${slim.length}개 Kotlin에 전달 (${reason})`);
    } catch (e) {
      console.log('[PROX] 알림지점 전달 실패', e?.message || e);
    }
  };

  const setup = async () => {
    // ★ 여기서는 권한을 "요청"하지 않고 "확인"만 한다.
    //   요청은 PermissionScreen이 전담한다.
    //   구글 백그라운드 위치 심사는 "설명이 요청보다 먼저"를 요구하는데,
    //   여기서 팝업을 띄우면 안내 화면보다 먼저 떠서 순서가 뒤집힌다.
    const fg = await Location.getForegroundPermissionsAsync();          // ★ 새 줄
    console.log('[PROX] 전경위치권한(확인)', fg.status);                 // ★ 새 줄
    if (!fg.granted) {                                                  // ★ 새 줄
      console.log('[PROX] 위치권한 없음 - 서비스 시작 보류');            // ★ 새 줄
      return;                                                           // ★ 새 줄
    }                                                                   // ★ 새 줄

    try {
      const has = await ProximityOverlayModule?.hasPermission();
      console.log('[PROX] 오버레이권한', has);
      if (has) {
        await ProximityOverlayModule.startService();
        console.log('[PROX] Kotlin 서비스 시작 요청');
      }
    } catch (e) {
      console.log('[PROX] 서비스 시작 실패', e?.message || e);
    }

    // 서비스가 뜨는 데 잠깐 걸리므로 조금 기다렸다 건물 전달
    setTimeout(() => syncBuildings('최초'), 1500);
    setTimeout(() => syncAlerts('최초'), 1800);
  };

  // 네비게이터가 아직 준비 안 됐을 수 있으므로 몇 번 재시도한다.
  // 성공하면 그 navId를 기록해서 뒤이어 오는 같은 요청은 버린다.
  const runNav = (kind, navId, label, doNavigate) => {
    if (navId && doneNav.current[kind] === navId) {
      console.log(`[PROX] 이미 처리한 요청이라 건너뜀 (${label})`);
      return;
    }

    let tries = 0;
    const go = () => {
      tries++;
      // 재시도 도중에 다른 경로로 이미 처리됐으면 중단
      if (navId && doneNav.current[kind] === navId) return;

      if (doNavigate()) {
        if (navId) doneNav.current[kind] = navId;
        console.log(`[PROX] ${label} 이동 성공`);
        return;
      }
      if (tries < 8) setTimeout(go, 700);
      else console.log(`[PROX] ${label} 이동 실패 — 네비게이터 준비 안 됨`);
    };
    go();
  };

  useEffect(() => {
    if (!setupDone) {
      setupDone = true;
      setup();
    }

    // 토스트/패널 더블탭 → 해당 건물 상세페이지
    const sub = DeviceEventEmitter.addListener('ProximityToastDetailRequested', (payload) => {
      // 예전 버전은 문자열만 보냈으므로 둘 다 받아준다
      const buildingId = typeof payload === 'string' ? payload : payload?.buildingId;
      const navId = typeof payload === 'string' ? '' : (payload?.navId || '');
      console.log('[PROX] 상세 요청 받음', buildingId);
      if (!buildingId) return;

      runNav('detail', navId, '상세페이지', () => navigateTo('Detail', { buildingId }));
    });

    // 미니패널 "지도 열기" → 지도 화면
    // MapScreen이 useFocusEffect로 알아서 현재 위치를 잡고 주변 핀을 그려준다
    const mapSub = DeviceEventEmitter.addListener('ProximityOpenMap', (payload) => {
      const navId = payload?.navId || '';
      runNav('map', navId, '지도', () => navigateTo('Map'));
    });

    // 미니패널 "앱 열기" → 홈(첫 화면)으로
    // 화면 이름을 몰라도 되도록 스택 맨 앞으로 되돌리는 방식을 쓴다
    const homeSub = DeviceEventEmitter.addListener('ProximityOpenHome', (payload) => {
      const navId = payload?.navId || '';
      runNav('home', navId, '홈', () => {
        if (!navigationRef.isReady()) return false;
        try {
          navigationRef.dispatch(StackActions.popToTop());
        } catch (e) {
          // 이미 홈이면 아무 일도 안 일어난다
        }
        return true;
      });
    });

    // 앱으로 돌아올 때마다 건물 목록 갱신 (너무 잦으면 건너뜀)
    const appStateSub = AppState.addEventListener('change', async (nextState) => {   // ★ async 추가
      if (nextState !== 'active') return;
      if (Date.now() - lastSyncAt < 30000) return;

      // ★ 여기부터 새 블록
      // 권한이 없으면 Kotlin 서비스가 뜰 수 없다.
      // 그래도 인텐트를 쏘면 서비스가 startForeground 없이 살아나 죽는다.
      try {
        const fg = await Location.getForegroundPermissionsAsync();
        if (!fg.granted) return;
      } catch (e) { return; }
      // ★ 새 블록 끝

      syncBuildings('앱 복귀');
      syncAlerts('앱 복귀');
    });

    return () => {
      sub.remove();
      mapSub.remove();
      homeSub.remove();
      appStateSub.remove();
    };
  }, []);

  // 화면에 그릴 것 없음 — 토스트와 플로팅 버튼은 Kotlin 오버레이가 그린다
  return null;
}