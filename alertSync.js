import { NativeModules } from 'react-native';
import { getAllAlertPoints } from './firebaseDB';
import { getSettings } from './settingsCache';

const { ProximityOverlayModule } = NativeModules;

// 알림지점을 Kotlin 서비스에 넘긴다.
// 등록/수정 직후에 부르면 앱을 껐다 켜지 않아도 바로 반영된다.
export const syncAlertsToService = async () => {
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
    console.log(`[PROX] 알림지점 ${slim.length}개 전달`);
  } catch (e) {
    console.log('[PROX] 알림지점 전달 실패', e?.message || e);
  }
};