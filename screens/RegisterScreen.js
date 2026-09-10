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

const SPECIAL_CHARS_NAME = ['동', '라인', '-', ',', '1,2라인', '3,4라인', '5,6라인', '7,8라인'];
const SK_SHORTCUTS = ['SK뷰', 'SK1차', 'SK2차', 'SK3차'];
const SPECIAL_CHARS_MEMO = ['#', '*', '호출', '입력', '비번', '엔터', '종', '경비', '열쇠'];

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

  const [regMode, setRegMode] = useState('building');
  const [alertType, setAlertType] = useState(buildingData?.alertType || 'rear');
  const [name, setName] = useState(buildingData?.name || '');
  const [memo, setMemo] = useState(buildingData?.memo || '');
  const [memo2, setMemo2] = useState(buildingData?.memo2 || '');
  const [note, setNote] = useState(buildingData?.note || '');
  const [shortcut, setShortcut] = useState(buildingData?.shortcut || '');

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

  const insertChar = (char) => {
    if (activeField === 'name') {
      setName(prev => prev + char);
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

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('오류', '이름을 입력해주세요.');
      return;
    }
    setIsSaving(true);
    try {
      const data = {
        name: name.trim(),
        memo: memo.trim(),
        memo2: memo2.trim(),   // 백업 출입정보 (없으면 빈 문자열)
        note, shortcut,
        images: [],
        timestamp: Date.now(),
        id: buildingData?.id || Date.now().toString()
      };
      // 지도에서 넘어온 위치정보가 있을 때만 저장 (리스트 복사등록은 위치 없이 새로 선택하게 둠)
      if (route.params?.location) {
        data.location = route.params.location;
      }
      if (regMode === 'alert') {
        // 알림지점은 위치가 없으면 판정 자체를 못 한다
        if (!data.location) {
          Alert.alert('위치 필요', '알림지점은 지도에서 위치를 길게 눌러 등록해주세요.');
          setIsSaving(false);
          return;
        }
        await saveAlertPoint({
          id: data.id,
          name: data.name,
          alertType,
          memo: data.memo,
          location: data.location,
          timestamp: data.timestamp,
        });
        // 저장 즉시 Kotlin에 반영 (앱을 껐다 켜지 않아도 되게)
        syncAlertsToService();
      } else {
        await saveBuilding(data);
        invalidateBuildingsCache();
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('오류', '저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
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

      {/* 건물 이름 */}
      <Text style={styles.label}>{regMode === 'building' ? '건물 이름 *' : '알림 지역 명칭 *'}</Text>
      <TextInput
        ref={nameRef}
        style={styles.input}
        value={name}
        onChangeText={setName}
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
            {!route.params?.location && (
              <Text style={styles.alertWarn}>
                📍 위치가 없습니다. 지도에서 해당 지점을 길게 눌러 등록해주세요.
              </Text>
            )}
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
  tabRow: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabAlert: { backgroundColor: '#ef4444' },
  tabText: { fontWeight: 'bold', color: '#94a3b8' },
  tabTextActive: { color: '#3b82f6' },
  tabTextAlert: { color: '#fff' },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
});