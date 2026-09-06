import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { AppState, NativeModules, DeviceEventEmitter } from 'react-native';
import { getCachedBuildings } from '../buildingsCache';
import { getRadius } from '../settingsCache';

const { ProximityOverlayModule } = NativeModules;

// 컴포넌트가 여러 번 마운트돼도 한 번만 돌게 하는 전역 플래그
let setupDone = false;
let lastSyncAt = 0;
// ─────────────────────────────────────────────────────────
//  위치 감지와 근접 판정은 전부 Kotlin(ProximityOverlayService)이 한다.
//  JS가 하는 일은 두 가지뿐:
//    1) 권한 요청
//    2) 건물 목록과 반경을 Kotlin에 넘겨주기
//
//  expo-location의 백그라운드 태스크(TaskManager)는 쓰지 않는다.
//  안드로이드가 JobScheduler 경로를 조여서 백그라운드에서 죽기 때문.
//  (2026-09-05 검증: Kotlin 포그라운드 서비스는 1시간 무중단, JS는 즉사)
// ─────────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function ProximityNotifier({ navigation }) {
  const lastDetail = useRef({ id: '', at: 0 });
 
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
          lat: b.location.lat,
          lng: b.location.lng,
        }));

      await ProximityOverlayModule.setBuildings(JSON.stringify({ radius, buildings: slim }));
      lastSyncAt.current = Date.now();
      console.log(`[PROX] 건물 ${slim.length}개 Kotlin에 전달 (${reason}), 반경 ${radius}m`);
    } catch (e) {
      console.log('[PROX] 건물 전달 실패', e?.message || e);
    }
  };

  const setup = async () => {
    // 알림 권한
    const { status: notifStatus } = await Notifications.requestPermissionsAsync();
    console.log('[PROX] 알림권한', notifStatus);

    // 위치 권한 (전경 → 배경 순서)
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    console.log('[PROX] 전경위치권한', fgStatus);
    if (fgStatus !== 'granted') return;

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    console.log('[PROX] 배경위치권한', bgStatus);

    // 오버레이 권한 확인 후 서비스 시작
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
  };

  useEffect(() => {
    setup();

    // 오버레이 토스트 더블탭 → 해당 건물 상세페이지
    const sub = DeviceEventEmitter.addListener('ProximityToastDetailRequested', (buildingId) => {
      if (!buildingId) return;
      const now = Date.now();
 // 재시도가 막히지 않도록 짧게. 같은 건물이라도 1초 지나면 다시 이동 허용
      if (lastDetail.current.id === buildingId && now - lastDetail.current.at < 1000) return;
      lastDetail.current = { id: buildingId, at: now };
      console.log('[PROX] 상세페이지 이동', buildingId);
      navigation?.navigate('Detail', { buildingId });
    });

    // 앱으로 돌아올 때마다 건물 목록 갱신 (너무 잦으면 건너뜀)
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      if (Date.now() - lastSyncAt.current < 30000) return;
      syncBuildings('앱 복귀');
    });

    return () => {
      sub.remove();
      appStateSub.remove();
    };
  }, []);

  // 화면에 그릴 것 없음 — 토스트는 Kotlin 오버레이가 그린다
  return null;
}