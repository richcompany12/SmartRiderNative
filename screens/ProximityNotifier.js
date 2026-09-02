import { useEffect, useRef, useState, useCallback } from 'react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { getCachedBuildings } from '../buildingsCache';
import { getRadius } from '../settingsCache';
import ProximityToastOverlay from './ProximityToastOverlay';

const TASK_NAME = 'PROXIMITY_TASK';
const COOLDOWN = 300000;
const MAX_TOASTS = 3;
const AUTO_DISMISS = 15000;

// ── 오탐지 방지용 상수 ──
const SPEED_THRESHOLD = 2.5; // m/s (약 시속 9km) 미만이어야 "서행/정지"로 인정
const DWELL_TIME = 3000;     // 반경 안에 3초 이상 머물러야 "도착"으로 인정
const MAX_CANDIDATES = 3;    // 후보 목록 최대 개수

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const getDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

const cooldownMap = {};
const dwellMap = {}; // 건물별 "반경 안에 처음 들어온 시각" 기록

// 반경 안 + 속도 낮음 + 체류시간 충족한 건물들을 가까운 순으로 반환
const getArrivedCandidates = (myLat, myLng, buildings, speed, now, radius) => {
  const candidates = [];
  for (const b of buildings) {
    if (!b.location?.lat || !b.location?.lng) continue;
    const dist = getDistance(myLat, myLng, b.location.lat, b.location.lng);

    if (dist <= radius) {
      if (!dwellMap[b.id]) dwellMap[b.id] = now;
      const dwell = now - dwellMap[b.id];
      if (speed < SPEED_THRESHOLD && dwell > DWELL_TIME) {
        candidates.push({ ...b, dist });
      }
    } else {
      delete dwellMap[b.id]; // 반경 벗어나면 체류시간 초기화
    }
  }
  return candidates.sort((a, b) => a.dist - b.dist).slice(0, MAX_CANDIDATES);
};

// 백그라운드 태스크 (시스템 알림)
TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data;
  const { latitude: myLat, longitude: myLng, speed } = locations[0].coords;
  const now = Date.now();
  try {
    const [buildings, radius] = await Promise.all([getCachedBuildings(), getRadius()]);
    const candidates = getArrivedCandidates(myLat, myLng, buildings, speed || 0, now, radius);

    for (const b of candidates) {
      const lastTime = cooldownMap[b.id] || 0;
      if (now - lastTime > COOLDOWN) {
        cooldownMap[b.id] = now;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🏢 ' + b.name,
            body: b.memo ? `출입정보: ${b.memo}` : '근처에 등록된 건물이 있습니다',
            sound: true,
          },
          trigger: null,
        });
      }
    }
  } catch (e) {}
});

export default function ProximityNotifier({ navigation }) {
  const watchRef = useRef(null);
  const appState = useRef(AppState.currentState);
  const [toasts, setToasts] = useState([]);
  const timerRefs = useRef({});
  const toastCooldown = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timerRefs.current[id]);
    delete timerRefs.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleTouched = useCallback((id) => {
    clearTimeout(timerRefs.current[id]);
    delete timerRefs.current[id];
  }, []);

  const addToast = useCallback((candidates) => {
    const now = Date.now();
    const fresh = candidates.filter(b => now - (toastCooldown.current[b.id] || 0) > COOLDOWN);
    if (fresh.length === 0) return;
    fresh.forEach(b => { toastCooldown.current[b.id] = now; });

    const id = `toast_${now}`;
    const toast = fresh.length === 1
      ? { id, type: 'single', buildingId: fresh[0].id, name: fresh[0].name, memo: fresh[0].memo || '' }
      : { id, type: 'cluster', candidates: fresh.map(b => ({ buildingId: b.id, name: b.name, memo: b.memo || '' })) };

    setToasts(prev => {
      const next = [toast, ...prev];
      if (next.length > MAX_TOASTS) {
        const removed = next.pop();
        clearTimeout(timerRefs.current[removed.id]);
        delete timerRefs.current[removed.id];
      }
      return next;
    });
    timerRefs.current[id] = setTimeout(() => dismiss(id), AUTO_DISMISS);
  }, [dismiss]);

  const selectFromCluster = useCallback((toastId, candidate) => {
    clearTimeout(timerRefs.current[toastId]);
    delete timerRefs.current[toastId];
    setToasts(prev => prev.map(t => t.id === toastId
      ? { id: toastId, type: 'single', buildingId: candidate.buildingId, name: candidate.name, memo: candidate.memo }
      : t
    ));
  }, []);

  useEffect(() => {
    setup();
    return () => cleanup();
  }, []);

  const setup = async () => {
    const { status: notifStatus } = await Notifications.requestPermissionsAsync();
    if (notifStatus !== 'granted') return;

    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return;

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();

    if (bgStatus === 'granted') {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
      if (!isRegistered) {
        await Location.startLocationUpdatesAsync(TASK_NAME, {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
          timeInterval: 15000,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: '스마트라이더',
            notificationBody: '위치 감지 중...',
            notificationColor: '#3b82f6',
          },
        });
      }
    }

    startForegroundWatch();
  };

  const startForegroundWatch = async () => {
    const buildings = await getCachedBuildings();
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 15000 },
      async (loc) => {
        if (appState.current !== 'active') return;
        const { latitude: myLat, longitude: myLng, speed } = loc.coords;
        const now = Date.now();
        const radius = await getRadius();
        const candidates = getArrivedCandidates(myLat, myLng, buildings, speed || 0, now, radius);
        if (candidates.length > 0) {
          addToast(candidates);
        }
      }
    );

    AppState.addEventListener('change', nextState => {
      appState.current = nextState;
    });
  };

  const cleanup = async () => {
    if (watchRef.current) watchRef.current.remove();
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (isRegistered) await Location.stopLocationUpdatesAsync(TASK_NAME);
  };

  return (
    <ProximityToastOverlay
      toasts={toasts}
      onDismiss={dismiss}
      onTouched={handleTouched}
      onSelect={selectFromCluster}
      navigation={navigation}
    />
  );
}