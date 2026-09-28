import { NativeModules } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAllAlertPoints } from './firebaseDB';
import { getSettings } from './settingsCache';

const { ProximityOverlayModule } = NativeModules;

// ── 내 주변 몇 km 안의 강력알림만 코틀린에 넘길지 ──────────
// 전국 목록은 폰에 그대로 두고, 코틀린에는 주변만 넘긴다.
// (코틀린 전달은 약 1MB 제한이 있어서 경기청 수천 개를 통째로 못 넘긴다)
export const ALERT_RADIUS_KM = 15;
const KEY_LAST_CENTER = 'alert_last_center';

// 두 좌표 사이 거리 (km)
export const distanceKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// 지금 내 위치. 못 구하면 지난번 위치, 그것도 없으면 null
export const getCenter = async () => { 
  try {
    // 1) 폰이 최근에 알던 위치 (빠름, 10분 이내 것만)
    let pos = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 });

    // 2) 없으면 새로 잡기 (지하 등에서 무한 대기 방지로 5초 제한)
    if (!pos) {
      pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise(resolve => setTimeout(() => resolve(null), 5000)),
      ]);
    }

    if (pos?.coords) {
      const center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      AsyncStorage.setItem(KEY_LAST_CENTER, JSON.stringify(center)).catch(() => {});
      return center;
    }
  } catch (e) {
    console.log('[PROX] 위치 못 구함', e?.message);
  }

  // 3) 지난번에 쓴 위치
  try {
    const raw = await AsyncStorage.getItem(KEY_LAST_CENTER);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

// 알림지점을 Kotlin 서비스에 넘긴다.
// 앱 시작·앱 복귀·등록/수정 직후에 부른다.
export const syncAlertsToService = async (reason = '') => {
  try {
    if (!ProximityOverlayModule?.setAlertPoints) return;

    const [points, settings, center] = await Promise.all([
      getAllAlertPoints(), getSettings(), getCenter(),
    ]);

    let list = (points || [])
      .filter(a => a.location?.lat && a.location?.lng)
      // 설정에서 꺼둔 종류는 아예 넘기지 않는다
      .filter(a => settings.alertTypes[a.alertType || 'etc'] !== false);

    const total = list.length;

    // 내 위치를 알면 주변만. 모르면 전체 (위치를 한 번이라도 잡으면 그 뒤론 주변만)
    if (center) {
      list = list.filter(a =>
        distanceKm(center.lat, center.lng, a.location.lat, a.location.lng) <= ALERT_RADIUS_KM
      );
    }

    const slim = list.map(a => ({
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
    console.log(`[PROX] 알림지점 ${slim.length}개 전달 (전체 ${total}개 중 ${center ? ALERT_RADIUS_KM + 'km' : '위치없음→전체'}) ${reason}`);
  } catch (e) {
    console.log('[PROX] 알림지점 전달 실패', e?.message || e);
  }
};