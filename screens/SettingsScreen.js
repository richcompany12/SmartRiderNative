import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Alert, NativeModules, DeviceEventEmitter, Linking, Platform,
  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getSettings, setRadius, setFloating,
  setAlertDistance, setAlertSound, setAlertType,
} from '../settingsCache';
import { getCachedBuildings, invalidateBuildingsCache } from '../buildingsCache';
import { getAllAlertPoints } from '../firebaseDB';
import { useAuth } from '../AuthContext';
import { countPersonalData } from '../personalDB';
import {
  getMigrationState, importServerToPersonal, deleteOriginalsFromServer,
} from '../migration';

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
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState(null);
  const [muteCount, setMuteCount] = useState(null);

  // 내 데이터 건수
  const [myCount, setMyCount] = useState({ buildings: 0, notes: 0 });

  // 데이터 이전 상태
  const [migState, setMigState] = useState(null);
  const [migBusy, setMigBusy] = useState(false);
  const [migMsg, setMigMsg] = useState('');

  const reloadCounts = async () => {
    setMyCount(await countPersonalData());
    setMigState(await getMigrationState());
  };

  useEffect(() => {
    getSettings().then(s => setSettings({ ...s }));
    reloadCounts();

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

  // ── 데이터 이전 (어드민 전용) ──────────────────────────

  const onImport = () => {
    Alert.alert(
      '서버 데이터 가져오기',
      '서버의 공용 건물을 내 폰으로 복사합니다.\n서버 데이터는 그대로 남아 있습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '가져오기',
          onPress: async () => {
            setMigBusy(true);
            setMigMsg('가져오는 중...');
            try {
              const r = await importServerToPersonal();
              invalidateBuildingsCache();
              await reloadCounts();
              setMigMsg('');
              Alert.alert(
                '완료',
                `새로 가져옴: ${r.added}건\n이미 있던 것: ${r.skipped}건\n서버 전체: ${r.total}건`
              );
            } catch (e) {
              setMigMsg('');
              Alert.alert('실패', e?.message || '가져오기에 실패했습니다.');
            } finally {
              setMigBusy(false);
            }
          }
        }
      ]
    );
  };

  // 되돌릴 수 없는 작업이라 두 번 물어본다.
  const onDeleteOriginals = () => {
    const n = Object.keys(migState?.idMap || {}).length;
    if (n === 0) {
      Alert.alert('안내', '가져온 기록이 없습니다. 먼저 "서버 데이터 가져오기"를 하세요.');
      return;
    }
    Alert.alert(
      '서버 원본 삭제',
      `서버에서 ${n}건을 지웁니다.\n\n` +
      '공용으로 다시 올린 건물은 새 번호라서 지워지지 않습니다.\n' +
      '백업 파일을 먼저 만들어 두셨나요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '다음',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '정말 삭제합니다',
              '이 작업은 되돌릴 수 없습니다.',
              [
                { text: '취소', style: 'cancel' },
                {
                  text: '삭제',
                  style: 'destructive',
                  onPress: async () => {
                    setMigBusy(true);
                    try {
                      const r = await deleteOriginalsFromServer((cur, total) => {
                        setMigMsg(`삭제 중 ${cur}/${total}`);
                      });
                      invalidateBuildingsCache();
                      await reloadCounts();
                      setMigMsg('');
                      Alert.alert('완료', `삭제: ${r.done}건 / 실패: ${r.failed}건`);
                    } catch (e) {
                      setMigMsg('');
                      Alert.alert('실패', e?.message || '삭제에 실패했습니다.');
                    } finally {
                      setMigBusy(false);
                    }
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const migCount = Object.keys(migState?.idMap || {}).length;

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

      {/* 내 데이터 */}
      <Text style={styles.section}>내 데이터</Text>
      <View style={styles.card}>
        <Text style={styles.muteCount}>{myCount.buildings}건</Text>
        <Text style={styles.rowHint}>
          내가 등록한 건물입니다. 이 폰 안에만 저장되며 서버로 전송되지 않습니다.
          {myCount.notes > 0 ? `\n공용 건물에 붙여둔 내 메모: ${myCount.notes}건` : ''}
        </Text>
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

      {/* 데이터 이전 — 어드민만 */}
      {isAdmin && (
        <>
          <Text style={styles.section}>데이터 이전 (관리자)</Text>
          <View style={styles.card}>
            <Text style={styles.rowHint}>
              서버의 공용 건물을 내 폰으로 회수한 뒤, 검증된 것만 다시 공용으로 올리는 작업입니다.
              순서대로 진행하세요.
            </Text>

            {migBusy ? (
              <View style={styles.busyBox}>
                <ActivityIndicator color="#3b82f6" />
                <Text style={styles.busyText}>{migMsg || '처리 중...'}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.stepBtn, migBusy && styles.stepBtnOff]}
              onPress={onImport}
              disabled={migBusy}
            >
              <Text style={styles.stepBtnText}>① 서버 데이터를 내 폰으로 가져오기</Text>
            </TouchableOpacity>

            {migCount > 0 && (
              <Text style={styles.migInfo}>
                가져온 원본: {migCount}건
                {migState?.deletedAt ? ` · 서버에서 삭제 완료` : ''}
              </Text>
            )}

            <TouchableOpacity
              style={[styles.dangerBtn, (migBusy || migCount === 0) && styles.dangerBtnOff]}
              onPress={onDeleteOriginals}
              disabled={migBusy || migCount === 0}
            >
              <Text style={styles.dangerBtnText}>③ 서버의 옛날 데이터 삭제</Text>
            </TouchableOpacity>

            <Text style={styles.warnText}>
              ③은 분류 작업이 완전히 끝난 뒤에만 누르세요. 되돌릴 수 없습니다.
            </Text>
          </View>
        </>
      )}

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

  // 데이터 이전
  stepBtn: {
    marginTop: 14, minHeight: 48, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#e0f2fe', borderRadius: 8,
  },
  stepBtnOff: { backgroundColor: '#f1f5f9' },
  stepBtnText: { color: '#0369a1', fontWeight: 'bold', fontSize: 15 },
  migInfo: { fontSize: 13, color: '#475569', marginTop: 10, fontWeight: 'bold' },
  warnText: { fontSize: 12, color: '#b45309', marginTop: 10, lineHeight: 17 },
  busyBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  busyText: { fontSize: 14, color: '#475569' },
});