import { useEffect, useRef, useState, useCallback } from 'react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { getAllBuildings } from '../firebaseDB';
import ProximityToastOverlay from './ProximityToastOverlay';

const TASK_NAME = 'PROXIMITY_TASK';
const RADIUS = 30;
const COOLDOWN = 300000;
const MAX_TOASTS = 3;
const AUTO_DISMISS = 15000;

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

// 백그라운드 태스크 (시스템 알림)
TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data;
  const { latitude: myLat, longitude: myLng } = locations[0].coords;
  const now = Date.now();
  try {
    const buildings = await getAllBuildings();
    for (const b of buildings) {
      if (!b.location?.lat || !b.location?.lng) continue;
      const dist = getDistance(myLat, myLng, b.location.lat, b.location.lng);
      const lastTime = cooldownMap[b.id] || 0;
      if (dist <= RADIUS && now - lastTime > COOLDOWN) {
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

  const addToast = useCallback((building) => {
    console.log('🔔 addToast 호출됨:', building.name);   // ← 이 줄만 추가
    const now = Date.now();
    const lastToast = toastCooldown.current[building.id] || 0;
    if (now - lastToast < COOLDOWN) return;
    toastCooldown.current[building.id] = now;

    const id = `${building.id}_${now}`;
    setToasts(prev => {
      if (prev.some(t => t.buildingId === building.id)) return prev;
      const next = [{ id, buildingId: building.id, name: building.name, memo: building.memo || '' }, ...prev];
      if (next.length > MAX_TOASTS) {
        const removed = next.pop();
        clearTimeout(timerRefs.current[removed.id]);
        delete timerRefs.current[removed.id];
      }
      return next;
    });
    timerRefs.current[id] = setTimeout(() => dismiss(id), AUTO_DISMISS);
  }, [dismiss]);

  useEffect(() => {
    setup();
    return () => cleanup();
  }, []);

  const setup = async () => {
    console.log('✅ ProximityNotifier 시작');
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

    // 포그라운드 감지 (토스트용)
    startForegroundWatch();
  };

  const startForegroundWatch = async () => {
    const buildings = await getAllBuildings();
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 15000 },
async (loc) => {
  console.log('📍 포그라운드 위치 업데이트');  // ← 추가
  if (appState.current !== 'active') return;
        const { latitude: myLat, longitude: myLng } = loc.coords;
        const now = Date.now();
        for (const b of buildings) {
          if (!b.location?.lat || !b.location?.lng) continue;
          const dist = getDistance(myLat, myLng, b.location.lat, b.location.lng);
          const lastTime = cooldownMap[b.id] || 0;
          if (dist <= RADIUS && now - lastTime > COOLDOWN) {
            cooldownMap[b.id] = now;
            addToast(b);
          }
        }
      }
    );

    // 앱 상태 감지
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
      navigation={navigation}
    />
  );
}