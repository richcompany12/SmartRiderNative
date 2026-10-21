// signalSync.js
// ★ 사거리 신호 순서 (10-20) — 코틀린 서비스에 사거리 목록을 넘긴다
// 전달은 이 함수 하나로만 (syncSignalsToService). 복사본 금지 — CLAUDE.md 절대 규칙 5와 같은 이유
// 내 주변 15km 안 것만 넘긴다 (단속카메라와 같게). 위치 비교는 전부 폰 안에서
import { NativeModules } from 'react-native';
import { getAllSignals } from './firebaseDB';
import { getCenter, distanceKm, ALERT_RADIUS_KM } from './alertSync';

const { ProximityOverlayModule } = NativeModules;

// 앱 시작·앱 복귀·신호 저장/삭제 직후에 부른다
export const syncSignalsToService = async (reason = '') => {
  try {
    if (!ProximityOverlayModule?.setSignals) return;

    const [signals, center] = await Promise.all([getAllSignals(), getCenter()]);

    let list = (signals || []).filter(sg =>
      sg && sg.center && !isNaN(parseFloat(sg.center.lat)) && !isNaN(parseFloat(sg.center.lng)) &&
      Array.isArray(sg.approaches) && sg.approaches.length >= 2 &&
      Array.isArray(sg.phases) && sg.phases.length > 0
    );
    const total = list.length;
    if (center) {
      list = list.filter(sg =>
        distanceKm(center.lat, center.lng, parseFloat(sg.center.lat), parseFloat(sg.center.lng)) <= ALERT_RADIUS_KM
      );
    }

    const slim = list.map(sg => ({
      id: String(sg.id),
      name: sg.name || '사거리',
      lat: parseFloat(sg.center.lat),
      lng: parseFloat(sg.center.lng),
      approaches: sg.approaches.map(a => ({
        key: String(a.key), name: a.name || '', lat: parseFloat(a.lat), lng: parseFloat(a.lng),
        radius: Number(a.radius) || 20,
      })),
      phases: sg.phases.map(p => (p && p.moves) ? p.moves : {}),
    }));

    await ProximityOverlayModule.setSignals(JSON.stringify({ signals: slim }));
    console.log(`[PROX] 사거리 신호 ${slim.length}개 전달 (전체 ${total}개 중 ${center ? ALERT_RADIUS_KM + 'km' : '위치없음→전체'}) ${reason}`);
  } catch (e) {
    console.log('[PROX] 사거리 신호 전달 실패', e?.message || e);
  }
};
