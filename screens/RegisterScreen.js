import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { saveBuilding, saveAlertPoint } from '../firebaseDB';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { invalidateBuildingsCache } from '../buildingsCache';
import { useAuth } from '../AuthContext';
import { syncAlertsToService } from '../alertSync';
import { savePersonalBuilding, savePersonalNote, isLocalId, setFavorite, isFavorite } from '../personalDB';
import * as Location from 'expo-location';

const SPECIAL_CHARS_NAME = ['동', '라인', '-', ',', '1,2라인', '3,4라인', '5,6라인', '7,8라인'];
const SK_SHORTCUTS = ['SK뷰', 'SK1차', 'SK2차', 'SK3차'];
const SPECIAL_CHARS_MEMO = ['#', '*', '호출', '입력', '비번', '엔터', '종', '경비', '열쇠'];

// 건물 이름 최대 글자수.
// 기준: "동탄 자연앤데시앙 871동, 1,2,3 라인" + 여유 2글자
const NAME_MAX = 25;

// 알림 종류 — 나중에 설정화면에서 종류별로 끄고 켤 수 있게 지금부터 받아둔다
const ALERT_TYPES = [
  { key: 'rear', label: '후방카메라' },
  { key: 'front', label: '전방카메라' },
  { key: 'parking', label: '주차단속' },
  { key: 'etc', label: '기타' },
];

export default function RegisterScreen({ navigation, route }) {
  const buildingData = route.params?.buildingData || null;

  const { isAdmin } = useAuth();

  // ── 이 건물이 원래 어느 쪽 데이터였는지 판별 ───────────
  // 신규 등록이면 null.
  const editingId = buildingData?.id || null;
  const editingScope =
    buildingData?.scope
    || (editingId ? (isLocalId(editingId) ? 'personal' : 'public') : null);

  const [regMode, setRegMode] = useState('building');

  // ── 공용 / 개인 선택 ───────────────────────────────────
  // 기본값은 '개인'. 일반 사용자는 선택 자체가 없고 항상 개인이다.
  // 공용 건물을 수정하러 들어온 경우에만 '공용'으로 시작한다.
  const [saveScope, setSaveScope] = useState(
    editingScope === 'public' ? 'public' : 'personal'
  );

  const [alertType, setAlertType] = useState(buildingData?.alertType || 'rear');
  const [name, setName] = useState(buildingData?.name || '');
  const [memo, setMemo] = useState(buildingData?.memo || '');
  const [memo2, setMemo2] = useState(buildingData?.memo2 || '');
  const [note, setNote] = useState(buildingData?.note || '');
  const [shortcut, setShortcut] = useState(buildingData?.shortcut || '');

  // ── 위치 ────────────────────────────────────────────────
  // 예전에는 지도에서 넘어온 값만 썼다. 그래서 홈이나 목록에서 등록하면
  // 위치가 없는 건물이 만들어졌고, 그런 건물은 근접 토스트가 뜨지 않는다.
  // 이 앱의 핵심 기능이 죽는 것이라 등록 화면에서 직접 지정할 수 있게 했다.
  const [location, setLocationState] = useState(
    route.params?.location || buildingData?.location || null
  );
  const [locBusy, setLocBusy] = useState(false);

  // ── 즐겨찾기 ────────────────────────────────────────────
  const [favorite, setFavoriteState] = useState(false);

  useEffect(() => {
    if (editingId) isFavorite(editingId).then(setFavoriteState);
  }, [editingId]);

  // 화면이 재사용되는 경우에도 새 buildingData로 폼을 다시 채움
  useEffect(() => {
    if (buildingData) {
      setName(buildingData.name || '');
      setMemo(buildingData.memo || '');
      setMemo2(buildingData.memo2 || '');
      setNote(buildingData.note || '');
      setShortcut(buildingData.shortcut || '');
    }
  }, [route.params?.buildingData]);

  const [isSaving, setIsSaving] = useState(false);
  const [activeField, setActiveField] = useState('name'); // 'name' | 'memo' | 'memo2'
  const insets = useSafeAreaInsets();
  const [memoKeyboardMode, setMemoKeyboardMode] = useState('numeric'); // 기본 숫자패드

  const nameRef = useRef(null);
  const memoRef = useRef(null);
  const memo2Ref = useRef(null);

  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 300);
  }, []);

  // 단축키로 넣을 때도 25자를 넘지 않게 자른다.
  const insertChar = (char) => {
    if (activeField === 'name') {
      setName(prev => (prev + char).slice(0, NAME_MAX));
    } else if (activeField === 'memo') {
      setMemo(prev => prev + char);
    } else if (activeField === 'memo2') {
      setMemo2(prev => prev + char);
    }
  };

  const toggleMemoKeyboard = () => {
    const next = memoKeyboardMode === 'numeric' ? 'text' : 'numeric';
    // 지금 쓰고 있는 칸을 기준으로 다시 포커스를 준다
    const targetRef = activeField === 'memo2' ? memo2Ref : memoRef;
    targetRef.current?.blur();
    setMemoKeyboardMode(next);
    setTimeout(() => targetRef.current?.focus(), 50);
  };

  // 공용에 비밀번호를 올리려 할 때 한 번 더 물어본다.
  // 서버에 현관 비번이 쌓이면 유출 시 주거침입 범죄에 직결된다.
  const confirmPublicMemo = () => new Promise((resolve) => {
    if (!memo.trim() && !memo2.trim()) { resolve(true); return; }
    Alert.alert(
      '공용으로 저장합니다',
      '출입 정보가 모든 사용자에게 공개됩니다.\n현관 비밀번호는 "개인"으로 저장하세요.',
      [
        { text: '개인으로 바꾸기', style: 'cancel', onPress: () => resolve(false) },
        { text: '그대로 공용 저장', style: 'destructive', onPress: () => resolve(true) },
      ]
    );
  });

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('오류', '이름을 입력해주세요.');
      return;
    }

    // 공용 저장은 어드민만. 일반 사용자는 UI에도 안 보이지만 한 번 더 막는다.
    const scope = (isAdmin && saveScope === 'public') ? 'public' : 'personal';

    if (regMode === 'building' && scope === 'public') {
      const ok = await confirmPublicMemo();
      if (!ok) { setSaveScope('personal'); return; }
    }

    setIsSaving(true);
    try {
      const data = {
        name: name.trim().slice(0, NAME_MAX),
        memo: memo.trim(),
        memo2: memo2.trim(),   // 백업 출입정보 (없으면 빈 문자열)
        note, shortcut,
        images: buildingData?.images || [],
        timestamp: Date.now(),
      };

      // 위치: 화면에서 지정한 값을 쓴다.
      if (location) {
        data.location = location;
      }

      let savedId = editingId;

      // ── 1) 강력 알림 지점 (어드민 전용, 항상 공용) ──────
      if (regMode === 'alert') {
        if (!data.location) {
          Alert.alert('위치 필요', '아래에서 위치를 먼저 지정해주세요.');
          setIsSaving(false);
          return;
        }
        savedId = editingId || Date.now().toString();
        await saveAlertPoint({
          id: savedId,
          name: data.name,
          alertType,
          memo: data.memo,
          location: data.location,
          timestamp: data.timestamp,
        });
        // 저장 즉시 Kotlin에 반영 (앱을 껐다 켜지 않아도 되게)
        syncAlertsToService();

      // ── 2) 공용 건물 (Firebase) ────────────────────────
      } else if (scope === 'public') {
        savedId = editingId || Date.now().toString();
        await saveBuilding({ ...data, id: savedId });
        invalidateBuildingsCache();

      // ── 3) 공용 건물에 내 메모만 덧씌우기 ──────────────
      // 이미 있는 공용 건물을 열어서 개인으로 저장하는 경우.
      // 공용 데이터는 건드리지 않고, 내 폰에만 메모를 붙인다.
      } else if (editingScope === 'public' && editingId) {
        await savePersonalNote(editingId, {
          memo: data.memo,
          memo2: data.memo2,
        });
        invalidateBuildingsCache();

      // ── 4) 개인 건물 (폰 안에만) ───────────────────────
      } else {
        savedId = await savePersonalBuilding({
          ...data,
          id: isLocalId(editingId) ? editingId : undefined,
        });
      }

      // 즐겨찾기는 저장이 끝난 뒤 실제 id에 붙인다
      if (regMode === 'building' && savedId) {
        await setFavorite(savedId, favorite);
        invalidateBuildingsCache();
      }

      navigation.goBack();
    } catch (e) {
      console.log('[REGISTER] 저장 실패:', e?.message);
      Alert.alert('오류', '저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // 지금 서 있는 곳을 건물 위치로 잡는다.
  // 라이더는 그 건물 앞에서 등록하므로 지도를 여는 것보다 이게 빠르다.
  const useCurrentLocation = async () => {
    setLocBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '위치 권한을 허용해야 현재 위치를 쓸 수 있습니다.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      setLocationState({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch (e) {
      Alert.alert('오류', '현재 위치를 가져오지 못했습니다.');
    } finally {
      setLocBusy(false);
    }
  };

  const pickOnMap = () => {
    navigation.navigate('LocationPicker', {
      initialLocation: location,
      onPicked: (loc) => setLocationState(loc),
    });
  };

  // 출입정보 칸 위에 붙는 123 / 가나다 전환 버튼
  const KeyboardToggle = () => (
    <TouchableOpacity
      onPress={toggleMemoKeyboard}
      style={{
        backgroundColor: memoKeyboardMode === 'numeric' ? '#1e40af' : '#f3f4f6',
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12
      }}
    >
      <Text style={{ color: memoKeyboardMode === 'numeric' ? '#fff' : '#374151', fontWeight: 'bold', fontSize: 12 }}>
        {memoKeyboardMode === 'numeric' ? '123' : '가나다'}
      </Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      // 키보드가 올라와도 아래쪽 입력칸이 가려지지 않게 여백을 넉넉히 준다
      contentContainerStyle={{ paddingBottom: 340 }}
    >

      {/* 탭 */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, regMode === 'building' && styles.tabActive]}
          onPress={() => setRegMode('building')}
        >
          <Text style={[styles.tabText, regMode === 'building' && styles.tabTextActive]}>일반 건물</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity
            style={[styles.tab, regMode === 'alert' && styles.tabAlert]}
            onPress={() => setRegMode('alert')}
          >
            <Text style={[styles.tabText, regMode === 'alert' && styles.tabTextAlert]}>⚠️ 강력 알림</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 저장 위치 선택 ─────────────────────────────── */}
      {regMode === 'building' && (
        isAdmin ? (
          <View style={styles.scopeRow}>
            <TouchableOpacity
              style={[styles.scopeBtn, saveScope === 'personal' && styles.scopeBtnMine]}
              onPress={() => setSaveScope('personal')}
            >
              <Text style={[styles.scopeText, saveScope === 'personal' && styles.scopeTextOn]}>
                🔒 내 폰에만
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.scopeBtn, saveScope === 'public' && styles.scopeBtnPublic]}
              onPress={() => setSaveScope('public')}
            >
              <Text style={[styles.scopeText, saveScope === 'public' && styles.scopeTextOn]}>
                🌐 공용 (전체 공개)
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.privacyBox}>
            <Text style={styles.privacyText}>🔒 이 정보는 내 폰에만 저장됩니다</Text>
          </View>
        )
      )}

      {/* 공용 건물에 개인 메모를 붙이는 상황이면 알려준다 */}
      {regMode === 'building' && editingScope === 'public' && saveScope === 'personal' && (
        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            공용 건물입니다. 출입 정보만 내 폰에 따로 저장되고, 이름·샛길·특이사항은 바뀌지 않습니다.
          </Text>
        </View>
      )}

      {/* 건물 이름 */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>{regMode === 'building' ? '건물 이름 *' : '알림 지역 명칭 *'}</Text>
        <Text style={styles.counter}>{name.length}/{NAME_MAX}</Text>
      </View>
      <TextInput
        ref={nameRef}
        style={styles.input}
        value={name}
        onChangeText={setName}
        maxLength={NAME_MAX}
        onFocus={() => setActiveField('name')}
        placeholder={regMode === 'building' ? '예: 푸른마을 포스코' : '예: 주차단속 지역'}
        placeholderTextColor="#94a3b8"
      />

      {/* 이름 단축키 */}
      <View style={styles.btnGrid}>
        {SPECIAL_CHARS_NAME.map(c => (
          <TouchableOpacity key={c} style={styles.shortBtn} onPress={() => insertChar(c)}>
            <Text style={styles.shortBtnText}>{c}</Text>
          </TouchableOpacity>
        ))}
        {SK_SHORTCUTS.map(c => (
          <TouchableOpacity key={c} style={[styles.shortBtn, styles.shortBtnSK]} onPress={() => insertChar(c)}>
            <Text style={styles.shortBtnText}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {regMode === 'building' ? (
        <>
          {/* 출입 정보 1 */}
          <View style={styles.labelRow}>
            <Text style={styles.label}>출입 정보</Text>
            <KeyboardToggle />
          </View>
          <TextInput
            ref={memoRef}
            style={styles.input}
            value={memo}
            onChangeText={setMemo}
            onFocus={() => setActiveField('memo')}
            placeholder="비밀번호 등"
            placeholderTextColor="#94a3b8"
            inputMode={memoKeyboardMode}
            multiline
          />

          {/* 출입 정보 2 (백업) */}
          <View style={styles.labelRow}>
            <Text style={styles.label}>출입 정보 2 (백업)</Text>
          </View>
          <TextInput
            ref={memo2Ref}
            style={styles.input}
            value={memo2}
            onChangeText={setMemo2}
            onFocus={() => setActiveField('memo2')}
            placeholder="비번이 바뀔 때를 대비한 예비 (선택)"
            placeholderTextColor="#94a3b8"
            inputMode={memoKeyboardMode}
            multiline
          />

          {/* 출입정보 단축키 — 지금 쓰고 있는 칸에 입력된다 */}
          <View style={styles.btnGrid}>
            {SPECIAL_CHARS_MEMO.map(c => (
              <TouchableOpacity key={c} style={styles.shortBtn} onPress={() => insertChar(c)}>
                <Text style={styles.shortBtnText}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 위치 */}
          <Text style={styles.label}>위치</Text>
          <View style={styles.locBox}>
            {location ? (
              <Text style={styles.locOk}>
                📍 {Number(location.lat).toFixed(6)}, {Number(location.lng).toFixed(6)}
              </Text>
            ) : (
              <Text style={styles.locNone}>
                위치가 없습니다. 위치를 넣어야 근처에 갔을 때 알림이 뜹니다.
              </Text>
            )}
            <View style={styles.locBtnRow}>
              <TouchableOpacity style={styles.locBtn} onPress={useCurrentLocation} disabled={locBusy}>
                {locBusy
                  ? <ActivityIndicator color="#2563eb" />
                  : <Text style={styles.locBtnText}>📍 지금 여기</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.locBtn} onPress={pickOnMap}>
                <Text style={styles.locBtnText}>🗺️ 지도에서</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 즐겨찾기 */}
          <TouchableOpacity
            style={[styles.favBtn, favorite && styles.favBtnOn]}
            onPress={() => setFavoriteState(v => !v)}
          >
            <Text style={[styles.favBtnText, favorite && styles.favBtnTextOn]}>
              {favorite ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기에 추가'}
            </Text>
          </TouchableOpacity>

          {/* 샛길 정보 */}
          <Text style={styles.label}>샛길 정보</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={shortcut}
            onChangeText={setShortcut}
            multiline
            numberOfLines={3}
            placeholderTextColor="#94a3b8"
          />

          {/* 특이사항 */}
          <Text style={styles.label}>특이사항</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            placeholderTextColor="#94a3b8"
          />
        </>
      ) : (
        <>
          <Text style={styles.label}>알림 종류 *</Text>
          <View style={styles.btnGrid}>
            {ALERT_TYPES.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.typeBtn, alertType === t.key && styles.typeBtnActive]}
                onPress={() => setAlertType(t.key)}
              >
                <Text style={[styles.typeBtnText, alertType === t.key && styles.typeBtnTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>메모</Text>
          <TextInput
            style={styles.input}
            value={memo}
            onChangeText={setMemo}
            onFocus={() => setActiveField('memo')}
            placeholder="예: 삼거리 신호등 옆 (선택)"
            placeholderTextColor="#94a3b8"
          />

          <View style={styles.alertBox}>
            <Text style={styles.alertText}>⚠️ 이 지점 100m 안으로 들어오면 소리와 빨간 알림이 뜹니다.</Text>
            <Text style={styles.alertSubText}>
              200m 밖으로 나가야 다시 울립니다. 알림을 탭하면 "오늘은 그만 / 앞으로 안 봄"을 고를 수 있습니다.
            </Text>
          </View>

          <Text style={styles.label}>위치 *</Text>
          <View style={styles.locBox}>
            {location ? (
              <Text style={styles.locOk}>
                📍 {Number(location.lat).toFixed(6)}, {Number(location.lng).toFixed(6)}
              </Text>
            ) : (
              <Text style={styles.locNone}>위치가 없으면 알림 판정을 할 수 없습니다.</Text>
            )}
            <View style={styles.locBtnRow}>
              <TouchableOpacity style={styles.locBtn} onPress={useCurrentLocation} disabled={locBusy}>
                {locBusy
                  ? <ActivityIndicator color="#2563eb" />
                  : <Text style={styles.locBtnText}>📍 지금 여기</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.locBtn} onPress={pickOnMap}>
                <Text style={styles.locBtnText}>🗺️ 지도에서</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* 저장/취소 */}
      <View style={[styles.bottomRow, { marginBottom: insets.bottom + 8 }]}>
        <TouchableOpacity style={styles.btnSave} onPress={handleSave} disabled={isSaving}>
          {isSaving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnSaveText}>등록 완료</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnCancel} onPress={() => navigation.goBack()}>
          <Text style={styles.btnCancelText}>취소</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  tabRow: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabAlert: { backgroundColor: '#ef4444' },
  tabText: { fontWeight: 'bold', color: '#94a3b8' },
  tabTextActive: { color: '#3b82f6' },
  tabTextAlert: { color: '#fff' },

  // 공용/개인 선택
  scopeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  scopeBtn: {
    flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center',
    borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff',
  },
  scopeBtnMine: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  scopeBtnPublic: { backgroundColor: '#b45309', borderColor: '#b45309' },
  scopeText: { fontSize: 14, fontWeight: 'bold', color: '#475569' },
  scopeTextOn: { color: '#fff' },

  privacyBox: {
    backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#6ee7b7',
    borderRadius: 8, padding: 12, marginBottom: 8,
  },
  privacyText: { color: '#065f46', fontSize: 14, fontWeight: 'bold' },

  noteBox: {
    backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#93c5fd',
    borderRadius: 8, padding: 12, marginBottom: 4,
  },
  noteText: { color: '#1e40af', fontSize: 13, lineHeight: 19 },

  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  counter: { fontSize: 12, color: '#94a3b8', marginTop: 12 },
  label: { fontSize: 15, fontWeight: 'bold', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, fontSize: 16, color: '#1e293b' },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  btnGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  shortBtn: { backgroundColor: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  shortBtnSK: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74' },
  shortBtnText: { fontSize: 13, color: '#374151' },
  alertBox: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5', borderRadius: 8, padding: 16, marginTop: 12 },
  alertText: { color: '#b91c1c', fontWeight: 'bold', fontSize: 14 },
  alertSubText: { color: '#6b7280', fontSize: 12, marginTop: 4 },
  alertWarn: { color: '#b91c1c', fontSize: 12, marginTop: 10, fontWeight: 'bold' },
  typeBtn: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8 },
  typeBtnActive: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  typeBtnText: { fontSize: 14, color: '#475569', fontWeight: 'bold' },
  typeBtnTextActive: { color: '#fff' },
  bottomRow: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 40 },
  btnSave: { flex: 1, backgroundColor: '#3b82f6', padding: 16, borderRadius: 8, alignItems: 'center' },
  btnSaveText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnCancel: { flex: 1, backgroundColor: '#e2e8f0', padding: 16, borderRadius: 8, alignItems: 'center' },
  btnCancelText: { color: '#374151', fontWeight: 'bold', fontSize: 16 },

  locBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12 },
  locOk: { fontSize: 13, color: '#0f766e', fontWeight: 'bold' },
  locNone: { fontSize: 13, color: '#b45309', lineHeight: 19 },
  locBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  locBtn: {
    flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8,
  },
  locBtnText: { color: '#2563eb', fontWeight: 'bold', fontSize: 14 },

  favBtn: {
    minHeight: 48, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1',
    borderRadius: 8, marginTop: 16,
  },
  favBtnOn: { backgroundColor: '#fef9c3', borderColor: '#facc15' },
  favBtnText: { color: '#64748b', fontWeight: 'bold', fontSize: 15 },
  favBtnTextOn: { color: '#a16207' },
});