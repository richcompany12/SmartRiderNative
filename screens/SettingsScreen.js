import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Alert, NativeModules, DeviceEventEmitter, Linking, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getSettings, setRadius, setFloating,
  setAlertDistance, setAlertSound, setAlertType,
} from '../settingsCache';
import { getCachedBuildings } from '../buildingsCache';
import { getAllAlertPoints } from '../firebaseDB';

const { ProximityOverlayModule } = NativeModules;

const RADIUS_OPTIONS = [20, 30, 50];
const ALERT_DISTANCE_OPTIONS = [50, 100, 200];

const ALERT_TYPE_LIST = [
  { key: 'rear', label: '후방카메라', hint: '이륜차가 주로 걸리는 쪽' },
  { key: 'front', label: '전방카메라', hint: '이륜차는 앞번호판이 없어 잘 안 걸림' },
  { key: 'parking', label: '주차단속', hint: null },
  { key: 'etc', label: '기타', hint: null },
];

// 값 여러 개 중 하나를 고르는 줄
function ChoiceRow({ label, hint, options, value, suffix, onSelect }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      <View style={styles.choiceGroup}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.choice, value === opt && styles.choiceActive]}
            onPress={() => onSelect(opt)}
          >
            <Text style={[styles.choiceText, value === opt && styles.choiceTextActive]}>
              {opt}{suffix}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// 켜기/끄기 두 칸짜리 줄
function ToggleRow({ label, hint, value, onChange }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      <View style={styles.choiceGroup}>
        <TouchableOpacity
          style={[styles.choice, !value && styles.choiceOff]}
          onPress={() => onChange(false)}
        >
          <Text style={[styles.choiceText, !value && styles.choiceTextActive]}>끔</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.choice, value && styles.choiceActive]}
          onPress={() => onChange(true)}
        >
          <Text style={[styles.choiceText, value && styles.choiceTextActive]}>켬</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState(null);
  const [muteCount, setMuteCount] = useState(null);

  useEffect(() => {
    getSettings().then(s => setSettings({ ...s }));

    // 안 보기로 한 지점 개수는 Kotlin이 들고 있으므로 물어본다
    const sub = DeviceEventEmitter.addListener('ProximityMuteCount', (p) => {
      setMuteCount(p?.count ?? 0);
    });
    ProximityOverlayModule?.requestMuteCount?.().catch(() => {});

    return () => sub.remove();
  }, []);

  // 설정이 바뀔 때마다 Kotlin 서비스에 다시 넘긴다.
  // 안 넘기면 앱에서만 바뀌고 실제 판정은 예전 값으로 돈다.
  const pushBuildings = async (next) => {
    try {
      const buildings = await getCachedBuildings();
      const slim = (buildings || [])
        .filter(b => b.location?.lat && b.location?.lng)
        .map(b => ({
          id: String(b.id), name: b.name || '',
          memo: b.memo || '', memo2: b.memo2 || '',
          lat: b.location.lat, lng: b.location.lng,
        }));
      await ProximityOverlayModule?.setBuildings(
        JSON.stringify({ radius: next.radius, buildings: slim })
      );
    } catch (e) {}
  };

  const pushAlerts = async (next) => {
    try {
      const points = await getAllAlertPoints();
      const slim = (points || [])
        .filter(a => a.location?.lat && a.location?.lng)
        // 꺼둔 종류는 아예 Kotlin에 넘기지 않는다 (판정 자체를 안 하게)
        .filter(a => next.alertTypes[a.alertType || 'etc'] !== false)
        .map(a => ({
          id: String(a.id), name: a.name || '',
          type: a.alertType || 'etc',
          lat: a.location.lat, lng: a.location.lng,
        }));
      await ProximityOverlayModule?.setAlertPoints(JSON.stringify({
        enterRadius: next.alertDistance,
        exitRadius: next.alertDistance * 2,
        sound: next.alertSound,
        points: slim,
      }));
    } catch (e) {}
  };

  if (!settings) return <View style={styles.container} />;

  const update = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    return next;
  };

  const onRadius = async (v) => {
    const next = update({ radius: v });
    await setRadius(v);
    pushBuildings(next);
  };

  const onFloating = async (on) => {
    update({ floating: on });
    await setFloating(on);
    ProximityOverlayModule?.setFloatingButton?.(on).catch(() => {});
  };

  const onAlertDistance = async (v) => {
    const next = update({ alertDistance: v });
    await setAlertDistance(v);
    pushAlerts(next);
  };

  const onAlertSound = async (on) => {
    const next = update({ alertSound: on });
    await setAlertSound(on);
    pushAlerts(next);
  };

  const onAlertType = async (key, on) => {
    const next = update({ alertTypes: { ...settings.alertTypes, [key]: on } });
    await setAlertType(key, on);
    pushAlerts(next);
  };

  const onClearMutes = () => {
    Alert.alert(
      '알림 되살리기',
      '"오늘은 그만"과 "앞으로 안 봄"으로 꺼둔 지점을 전부 되살립니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '전체 해제',
          onPress: () => {
            ProximityOverlayModule?.clearAlertMutes?.().catch(() => {});
            setMuteCount(0);
          }
        }
      ]
    );
  };

  const onBatteryOptimization = () => {
    Alert.alert(
      '배터리 최적화 예외',
      '일부 기종(샤오미·화웨이 등)은 배터리 절약 기능이 위치 감지를 멈출 수 있습니다.\n\n' +
      '설정 화면에서 스마트라이더를 찾아 "제한 없음"으로 바꿔주세요.',
      [
        { text: '닫기', style: 'cancel' },
        {
          text: '설정 열기',
          onPress: () => {
            if (Platform.OS === 'android') {
              Linking.openSettings().catch(() => {});
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>

      {/* 근접 알림 */}
      <Text style={styles.section}>근접 알림</Text>
      <View style={styles.card}>
        <ChoiceRow
          label="건물 감지 반경"
          hint="이 거리 안에 들어오면 건물 정보가 뜹니다"
          options={RADIUS_OPTIONS}
          value={settings.radius}
          suffix="m"
          onSelect={onRadius}
        />
        <ToggleRow
          label="플로팅 버튼"
          hint="화면 위에 떠 있는 동그란 버튼"
          value={settings.floating}
          onChange={onFloating}
        />
      </View>

      {/* 강력 알림 */}
      <Text style={styles.section}>강력 알림</Text>
      <View style={styles.card}>
        <ChoiceRow
          label="알림 거리"
          hint="이 거리의 2배만큼 벗어나야 다시 울립니다"
          options={ALERT_DISTANCE_OPTIONS}
          value={settings.alertDistance}
          suffix="m"
          onSelect={onAlertDistance}
        />
        <ToggleRow
          label="알림음"
          hint="끄면 화면에만 표시됩니다"
          value={settings.alertSound}
          onChange={onAlertSound}
        />

        <View style={styles.divider} />

        {ALERT_TYPE_LIST.map(t => (
          <ToggleRow
            key={t.key}
            label={t.label}
            hint={t.hint}
            value={settings.alertTypes[t.key] !== false}
            onChange={(on) => onAlertType(t.key, on)}
          />
        ))}
      </View>

      {/* 꺼둔 지점 */}
      <Text style={styles.section}>안 보기로 한 지점</Text>
      <View style={styles.card}>
        <Text style={styles.muteCount}>
          {muteCount === null ? '확인 중...' : `${muteCount}곳`}
        </Text>
        <Text style={styles.rowHint}>
          알림을 탭해서 "오늘은 그만" 또는 "앞으로 안 봄"을 고른 지점입니다.
          오늘만 꺼둔 것은 날짜가 바뀌면 저절로 되살아납니다.
        </Text>
        <TouchableOpacity
          style={[styles.dangerBtn, !muteCount && styles.dangerBtnOff]}
          onPress={onClearMutes}
          disabled={!muteCount}
        >
          <Text style={styles.dangerBtnText}>전체 해제</Text>
        </TouchableOpacity>
      </View>

      {/* 기타 */}
      <Text style={styles.section}>기타</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.plainBtn} onPress={onBatteryOptimization}>
          <Text style={styles.plainBtnText}>🔋 배터리 최적화 예외 설정</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  section: { fontSize: 15, fontWeight: 'bold', color: '#64748b', marginTop: 16, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1 },
  row: { marginBottom: 18 },
  rowLabel: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
  rowHint: { fontSize: 12, color: '#94a3b8', marginTop: 3, lineHeight: 17 },
  choiceGroup: { flexDirection: 'row', gap: 8, marginTop: 10 },
  // 장갑 끼고도 눌리게 최소 48
  choice: {
    flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#f1f5f9', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0',
  },
  choiceActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  choiceOff: { backgroundColor: '#94a3b8', borderColor: '#94a3b8' },
  choiceText: { fontSize: 15, fontWeight: 'bold', color: '#475569' },
  choiceTextActive: { color: '#fff' },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginBottom: 18 },
  muteCount: { fontSize: 22, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
  dangerBtn: {
    marginTop: 14, minHeight: 48, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#fee2e2', borderRadius: 8,
  },
  dangerBtnOff: { backgroundColor: '#f1f5f9' },
  dangerBtnText: { color: '#dc2626', fontWeight: 'bold', fontSize: 15 },
  plainBtn: { minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 8 },
  plainBtnText: { color: '#475569', fontWeight: 'bold', fontSize: 15 },
});