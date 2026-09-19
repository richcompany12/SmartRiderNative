import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { saveBuilding, saveAlertPoint } from '../firebaseDB';
import { invalidateBuildingsCache } from '../buildingsCache';
import { useAuth } from '../AuthContext';
import { syncAlertsToService } from '../alertSync';
import {
  savePersonalBuilding, savePersonalNote, isLocalId, setFavorite, isFavorite,
} from '../personalDB';
import { useTheme } from '../theme';
import { maybeShowInterstitial } from '../adManager';       

const SPECIAL_CHARS_NAME = ['동', '라인', '-', ',', '1,2라인', '3,4라인', '5,6라인', '7,8라인'];
const SK_SHORTCUTS = ['SK뷰', 'SK1차', 'SK2차', 'SK3차'];
const SPECIAL_CHARS_MEMO = ['#', '*', '호출', '입력', '비번', '엔터', '종', '경비', '열쇠'];

// 건물 이름 최대 글자수.
// 기준: "동탄 자연앤데시앙 871동, 1,2,3 라인" + 여유 2글자
const NAME_MAX = 25;

const ALERT_TYPES = [
  { key: 'rear', label: '후방카메라' },
  { key: 'front', label: '전방카메라' },
  { key: 'parking', label: '주차단속' },
  { key: 'etc', label: '기타' },
];

export default function RegisterScreen({ navigation, route }) {
  const buildingData = route.params?.buildingData || null;
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();
  const { c, font, space, radius, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius, TAP), [c]);

  // 이 건물이 원래 어느 쪽 데이터였는지. 신규 등록이면 null.
  const editingId = buildingData?.id || null;
  const editingScope =
    buildingData?.scope
    || (editingId ? (isLocalId(editingId) ? 'personal' : 'public') : null);

  const [regMode, setRegMode] = useState('building');

  // 공용 / 개인. 기본은 개인.
  // 일반 사용자는 선택 자체가 없고 항상 개인이다.
  const [saveScope, setSaveScope] = useState(
    editingScope === 'public' ? 'public' : 'personal'
  );

  const [alertType, setAlertType] = useState(buildingData?.alertType || 'rear');
  const [name, setName] = useState(buildingData?.name || '');
  const [memo, setMemo] = useState(buildingData?.memo || '');
  const [memo2, setMemo2] = useState(buildingData?.memo2 || '');
  const [note, setNote] = useState(buildingData?.note || '');
  const [shortcut, setShortcut] = useState(buildingData?.shortcut || '');

  // 위치. 위치가 없으면 근접 토스트가 뜨지 않는다.
  const [location, setLocationState] = useState(
    route.params?.location || buildingData?.location || null
  );
  const [locBusy, setLocBusy] = useState(false);
  const [favorite, setFavoriteState] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [activeField, setActiveField] = useState('name');
  const [memoNumeric, setMemoNumeric] = useState(true);

  const nameRef = useRef(null);
  const memoRef = useRef(null);
  const memo2Ref = useRef(null);

  useEffect(() => {
    if (buildingData) {
      setName(buildingData.name || '');
      setMemo(buildingData.memo || '');
      setMemo2(buildingData.memo2 || '');
      setNote(buildingData.note || '');
      setShortcut(buildingData.shortcut || '');
    }
  }, [route.params?.buildingData]);

  useEffect(() => {
    if (editingId) isFavorite(editingId).then(setFavoriteState);
  }, [editingId]);

  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  const insertChar = (ch) => {
    if (activeField === 'name') setName(p => (p + ch).slice(0, NAME_MAX));
    else if (activeField === 'memo') setMemo(p => p + ch);
    else if (activeField === 'memo2') setMemo2(p => p + ch);
  };

  const toggleMemoKeyboard = () => {
    const target = activeField === 'memo2' ? memo2Ref : memoRef;
    target.current?.blur();
    setMemoNumeric(p => !p);
    setTimeout(() => target.current?.focus(), 50);
  };

  // 지금 서 있는 곳을 건물 위치로 잡는다.
  // 라이더는 그 건물 앞에서 등록하므로 지도를 여는 것보다 빠를 때가 많다.
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

  // 공용에 비밀번호를 올리려 할 때 한 번 더 물어본다.
  const confirmPublicMemo = () => new Promise((resolve) => {
    if (!memo.trim() && !memo2.trim()) { resolve(true); return; }
    Alert.alert(
      '공용으로 저장합니다',
      '출입 정보가 모든 사용자에게 공개됩니다.\n현관 비밀번호는 "내 폰에만"으로 저장하세요.',
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
        memo2: memo2.trim(),
        note, shortcut,
        images: buildingData?.images || [],
        timestamp: Date.now(),
      };
      if (location) data.location = location;

      let savedId = editingId;

      if (regMode === 'alert') {
        if (!data.location) {
          Alert.alert('위치 필요', '아래에서 위치를 먼저 지정해주세요.');
          setIsSaving(false);
          return;
        }
        savedId = editingId || Date.now().toString();
        await saveAlertPoint({
          id: savedId, name: data.name, alertType,
          memo: data.memo, location: data.location, timestamp: data.timestamp,
        });
        syncAlertsToService();

      } else if (scope === 'public') {
        savedId = editingId || Date.now().toString();
        await saveBuilding({ ...data, id: savedId });
        invalidateBuildingsCache();

      } else if (editingScope === 'public' && editingId) {
        // 공용 건물에 내 메모만 덧씌운다. 공용 데이터는 안 바뀐다.
        await savePersonalNote(editingId, { memo: data.memo, memo2: data.memo2 });
        invalidateBuildingsCache();

      } else {
        savedId = await savePersonalBuilding({
          ...data,
          id: isLocalId(editingId) ? editingId : undefined,
        });
      }

      if (regMode === 'building' && savedId) {
        await setFavorite(savedId, favorite);
        invalidateBuildingsCache();
      }

      if (!editingId && regMode === 'building' && scope === 'public') {       // ★ 새 줄
        navigation.replace('Detail', { buildingId: savedId, startEdit: true }); // ★ 새 줄
        return;                                                               // ★ 새 줄
      }                                                                        // ★ 새 줄
      navigation.goBack();
      if (!editingId && regMode === 'building') maybeShowInterstitial();   // ★ 새 줄
    } catch (e) {
      console.log('[REGISTER] 저장 실패:', e?.message);
      Alert.alert('오류', '저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const LocationBox = ({ required }) => (
    <View style={s.locBox}>
      {location ? (
        <Text style={s.locOk}>
          {Number(location.lat).toFixed(6)}, {Number(location.lng).toFixed(6)}
        </Text>
      ) : (
        <Text style={s.locNone}>
          {required
            ? '위치가 없으면 알림 판정을 할 수 없습니다.'
            : '위치를 넣어야 근처에 갔을 때 알림이 뜹니다.'}
        </Text>
      )}
      <View style={s.btnRow}>
        <TouchableOpacity style={s.btnSub} onPress={useCurrentLocation} disabled={locBusy}>
          {locBusy
            ? <ActivityIndicator color={c.accent} />
            : <>
                <Icon name="crosshairs-gps" size={18} color={c.accent} />
                <Text style={s.btnSubText}>지금 여기</Text>
              </>}
        </TouchableOpacity>
        <TouchableOpacity style={s.btnSub} onPress={pickOnMap}>
          <Icon name="map-marker-outline" size={18} color={c.accent} />
          <Text style={s.btnSubText}>지도에서</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={s.screen}>
      {/* 헤더 */}
      <View style={[s.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={c.textSub} />
        </TouchableOpacity>
        <Text style={s.screenTitle}>
          {editingId ? '건물 수정' : '건물 등록'}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 320 }}
        >
          {/* 탭 — 어드민만 알림지점 등록 가능 */}
          {isAdmin && (
            <View style={s.tabRow}>
              <TouchableOpacity
                style={[s.tab, regMode === 'building' && s.tabOn]}
                onPress={() => setRegMode('building')}
              >
                <Text style={[s.tabText, regMode === 'building' && s.tabTextOn]}>
                  일반 건물
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tab, regMode === 'alert' && s.tabAlert]}
                onPress={() => setRegMode('alert')}
              >
                <Text style={[s.tabText, regMode === 'alert' && s.tabTextAlert]}>
                  강력 알림
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 저장 위치 */}
          {regMode === 'building' && (
            isAdmin ? (
              <View style={s.scopeRow}>
                <TouchableOpacity
                  style={[s.scopeBtn, saveScope === 'personal' && s.scopeBtnMine]}
                  onPress={() => setSaveScope('personal')}
                >
                  <Icon
                    name="lock-outline" size={17}
                    color={saveScope === 'personal' ? c.onAccent : c.textSub}
                  />
                  <Text style={[s.scopeText, saveScope === 'personal' && s.scopeTextOn]}>
                    내 폰에만
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.scopeBtn, saveScope === 'public' && s.scopeBtnPublic]}
                  onPress={() => setSaveScope('public')}
                >
                  <Icon
                    name="web" size={17}
                    color={saveScope === 'public' ? '#fff' : c.textSub}
                  />
                  <Text style={[s.scopeText, saveScope === 'public' && s.scopeTextPublic]}>
                    공용 (전체 공개)
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.privacyBox}>
                <Icon name="lock-outline" size={16} color={c.accent} />
                <Text style={s.privacyText}>이 정보는 내 폰에만 저장됩니다</Text>
              </View>
            )
          )}

          {regMode === 'building' && editingScope === 'public' && saveScope === 'personal' && (
            <View style={s.noteBox}>
              <Text style={s.noteText}>
                공용 건물입니다. 출입 정보만 내 폰에 따로 저장되고,
                이름·샛길·특이사항은 바뀌지 않습니다.
              </Text>
            </View>
          )}

          {/* 이름 */}
          <View style={s.labelRow}>
            <Text style={s.label}>
              {regMode === 'building' ? '건물 이름' : '알림 지역 명칭'}
            </Text>
            <Text style={s.counter}>{name.length}/{NAME_MAX}</Text>
          </View>
          <TextInput
            ref={nameRef}
            style={s.input}
            value={name}
            onChangeText={setName}
            maxLength={NAME_MAX}
            onFocus={() => setActiveField('name')}
            placeholder={regMode === 'building' ? '예: 푸른마을 포스코' : '예: 주차단속 지역'}
            placeholderTextColor={c.textFaint}
          />

          <View style={s.keyGrid}>
            {SPECIAL_CHARS_NAME.map(ch => (
              <TouchableOpacity key={ch} style={s.key} onPress={() => insertChar(ch)}>
                <Text style={s.keyText}>{ch}</Text>
              </TouchableOpacity>
            ))}
            {SK_SHORTCUTS.map(ch => (
              <TouchableOpacity key={ch} style={[s.key, s.keySK]} onPress={() => insertChar(ch)}>
                <Text style={s.keyText}>{ch}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {regMode === 'building' ? (
            <>
              {/* 출입 정보 */}
              <View style={s.labelRow}>
                <Text style={s.label}>출입 정보</Text>
                <TouchableOpacity
                  onPress={toggleMemoKeyboard}
                  style={[s.kbBtn, memoNumeric && s.kbBtnOn]}
                >
                  <Text style={[s.kbText, memoNumeric && s.kbTextOn]}>
                    {memoNumeric ? '123' : '가나다'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                ref={memoRef}
                style={[s.input, s.inputMono]}
                value={memo}
                onChangeText={setMemo}
                onFocus={() => setActiveField('memo')}
                placeholder="비밀번호 등"
                placeholderTextColor={c.textFaint}
                inputMode={memoNumeric ? 'numeric' : 'text'}
                multiline
              />

              <Text style={s.label}>출입 정보 2 (백업)</Text>
              <TextInput
                ref={memo2Ref}
                style={[s.input, s.inputMono]}
                value={memo2}
                onChangeText={setMemo2}
                onFocus={() => setActiveField('memo2')}
                placeholder="비번이 바뀔 때를 대비한 예비"
                placeholderTextColor={c.textFaint}
                inputMode={memoNumeric ? 'numeric' : 'text'}
                multiline
              />

              <View style={s.keyGrid}>
                {SPECIAL_CHARS_MEMO.map(ch => (
                  <TouchableOpacity key={ch} style={s.key} onPress={() => insertChar(ch)}>
                    <Text style={s.keyText}>{ch}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>위치</Text>
              <LocationBox />

              <TouchableOpacity
                style={[s.favBtn, favorite && s.favBtnOn]}
                onPress={() => setFavoriteState(v => !v)}
              >
                <Icon
                  name={favorite ? 'star' : 'star-outline'}
                  size={19}
                  color={favorite ? c.star : c.textSub}
                />
                <Text style={[s.favText, favorite && s.favTextOn]}>
                  {favorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'}
                </Text>
              </TouchableOpacity>

              <Text style={s.label}>샛길 정보</Text>
              <TextInput
                style={[s.input, s.inputMulti]}
                value={shortcut}
                onChangeText={setShortcut}
                multiline
                placeholderTextColor={c.textFaint}
              />

              <Text style={s.label}>특이사항</Text>
              <TextInput
                style={[s.input, s.inputMulti]}
                value={note}
                onChangeText={setNote}
                multiline
                placeholderTextColor={c.textFaint}
              />
            </>
          ) : (
            <>
              <Text style={s.label}>알림 종류</Text>
              <View style={s.keyGrid}>
                {ALERT_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[s.typeBtn, alertType === t.key && s.typeBtnOn]}
                    onPress={() => setAlertType(t.key)}
                  >
                    <Text style={[s.typeText, alertType === t.key && s.typeTextOn]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>메모</Text>
              <TextInput
                style={s.input}
                value={memo}
                onChangeText={setMemo}
                onFocus={() => setActiveField('memo')}
                placeholder="예: 삼거리 신호등 옆"
                placeholderTextColor={c.textFaint}
              />

              <View style={s.alertBox}>
                <Text style={s.alertText}>
                  이 지점 100m 안으로 들어오면 소리와 빨간 알림이 뜹니다.
                </Text>
                <Text style={s.alertSub}>
                  200m 밖으로 나가야 다시 울립니다.
                  알림을 탭하면 "오늘은 그만 / 앞으로 안 봄"을 고를 수 있습니다.
                </Text>
              </View>

              <Text style={s.label}>위치</Text>
              <LocationBox required />
            </>
          )}

          <TouchableOpacity
            style={[s.btnPrimary, isSaving && s.btnOff]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving
              ? <ActivityIndicator color={c.onAccent} />
              : <Text style={s.btnPrimaryText}>
                  {editingId ? '수정 완료' : '등록 완료'}
                </Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.btnPlain} onPress={() => navigation.goBack()}>
            <Text style={s.btnPlainText}>취소</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (c, font, space, radius, TAP) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.sm, paddingBottom: space.sm,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { ...font.title, color: c.text, marginLeft: space.xs },

  tabRow: {
    flexDirection: 'row', gap: space.sm, marginBottom: space.md,
  },
  tab: {
    flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center',
    borderRadius: radius.md, backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  tabOn: { backgroundColor: c.accent, borderColor: c.accent },
  tabAlert: { backgroundColor: c.danger, borderColor: c.danger },
  tabText: { ...font.body, fontWeight: '500', color: c.textSub },
  tabTextOn: { color: c.onAccent },
  tabTextAlert: { color: '#fff' },

  scopeRow: { flexDirection: 'row', gap: space.sm },
  scopeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    minHeight: TAP, borderRadius: radius.md, backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  scopeBtnMine: { backgroundColor: c.accent, borderColor: c.accent },
  scopeBtnPublic: { backgroundColor: c.publicColor, borderColor: c.publicColor },
  scopeText: { ...font.sub, fontWeight: '500', color: c.textSub },
  scopeTextOn: { color: c.onAccent },
  scopeTextPublic: { color: '#fff' },

  privacyBox: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: c.accentSoft, borderRadius: radius.md, padding: space.md,
  },
  privacyText: { ...font.sub, fontWeight: '500', color: c.accent },

  noteBox: {
    backgroundColor: c.surfaceSoft, borderRadius: radius.md,
    padding: space.md, marginTop: space.sm,
  },
  noteText: { ...font.sub, color: c.textSub, lineHeight: 20 },

  labelRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    marginTop: space.lg, marginBottom: 6,
  },
  // 라벨이 흐리면 어느 칸의 설명인지 헷갈린다. 진하게, 살짝 굵게.
  label: {
    ...font.sub, fontWeight: '500', color: c.fieldLabel,
    marginTop: space.lg, marginBottom: 6,
  },
  counter: { ...font.tiny, color: c.textFaint, marginBottom: 7 },

  // hairlineWidth(약 0.33px)는 기기에 따라 아예 렌더링되지 않는다.
  // 배경도 화면과 거의 같았던 탓에 입력칸이라는 단서가 하나도 없었다.
  // 배경 + 1px 테두리 둘 다로 칸을 만든다.
  input: {
    backgroundColor: c.field, borderWidth: 1.5,
    borderColor: c.fieldBorder, borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.md,
    ...font.body, color: c.text,
  },
  inputMono: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', fontSize: 18 },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },

  kbBtn: {
    paddingHorizontal: space.sm + 2, paddingVertical: 5,
    borderRadius: radius.pill, backgroundColor: c.surfaceSoft, marginBottom: 4,
  },
  kbBtnOn: { backgroundColor: c.accent },
  kbText: { ...font.tiny, fontWeight: '500', color: c.textSub },
  kbTextOn: { color: c.onAccent },

  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm },
  key: {
    minHeight: 38, justifyContent: 'center', paddingHorizontal: space.md,
    backgroundColor: c.surfaceSoft, borderRadius: radius.sm,
  },
  keySK: { backgroundColor: c.warnSoft },
  keyText: { ...font.sub, color: c.text },

  typeBtn: {
    minHeight: TAP, justifyContent: 'center', paddingHorizontal: space.lg,
    backgroundColor: c.surface, borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  typeBtnOn: { backgroundColor: c.danger, borderColor: c.danger },
  typeText: { ...font.body, fontWeight: '500', color: c.textSub },
  typeTextOn: { color: '#fff' },

  locBox: {
    backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.lineStrong, borderRadius: radius.md, padding: space.md,
  },
  locOk: { ...font.sub, fontWeight: '500', color: c.accent },
  locNone: { ...font.sub, color: c.warn, lineHeight: 19 },

  btnRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm + 2 },
  btnSub: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: TAP, borderRadius: radius.md, backgroundColor: c.accentSoft,
  },
  btnSubText: { ...font.sub, fontWeight: '500', color: c.accent },

  favBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    minHeight: TAP, borderRadius: radius.md, marginTop: space.lg,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  favBtnOn: { backgroundColor: c.warnSoft, borderColor: c.star },
  favText: { ...font.body, fontWeight: '500', color: c.textSub },
  favTextOn: { color: c.warn },

  alertBox: {
    backgroundColor: c.dangerSoft, borderRadius: radius.md,
    padding: space.md + 2, marginTop: space.lg,
  },
  alertText: { ...font.sub, fontWeight: '500', color: c.danger },
  alertSub: { ...font.sub, color: c.textSub, marginTop: 5, lineHeight: 19 },

  btnPrimary: {
    minHeight: TAP + 6, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.accent, borderRadius: radius.md, marginTop: space.xxl,
  },
  btnOff: { opacity: 0.7 },
  btnPrimaryText: { ...font.head, color: c.onAccent },
  btnPlain: {
    minHeight: TAP, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.surfaceSoft, borderRadius: radius.md, marginTop: space.sm,
  },
  btnPlainText: { ...font.body, color: c.textSub },
});