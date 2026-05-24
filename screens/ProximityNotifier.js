import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { getAllBuildings } from '../firebaseDB';

const TASK_NAME = 'PROXIMITY_TASK';
const RADIUS = 30;
const COOLDOWN = 300000; // 5분

// 알림 설정
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

// 백그라운드 태스크
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
  } catch (e) {
    console.error('근접 알림 오류:', e);
  }
});

export default function ProximityNotifier() {
  const watchRef = useRef(null);

  useEffect(() => {
    setup();
    return () => cleanup();
  }, []);

 const setup = async () => {
    console.log('✅ ProximityNotifier 시작');
    // 알림 권한
    const { status: notifStatus } = await Notifications.requestPermissionsAsync();
    console.log('알림 권한:', notifStatus);
    if (notifStatus !== 'granted') {
      console.warn('알림 권한 거부됨');
      return;
    }

    // 위치 권한
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      console.warn('위치 권한 거부됨');
      return;
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();

    if (bgStatus === 'granted') {
      // 백그라운드 위치 추적
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
        console.log('✅ 백그라운드 위치 추적 시작');
      }
    } else {
      // 백그라운드 권한 없으면 포그라운드만
      startForegroundWatch();
    }
  };

  const startForegroundWatch = async () => {
    const buildings = await getAllBuildings();
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 15000 },
      async (loc) => {
        const { latitude: myLat, longitude: myLng } = loc.coords;
        const now = Date.now();
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
      }
    );
  };

  const cleanup = async () => {
    if (watchRef.current) watchRef.current.remove();
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (isRegistered) await Location.stopLocationUpdatesAsync(TASK_NAME);
  };

  return null;
}