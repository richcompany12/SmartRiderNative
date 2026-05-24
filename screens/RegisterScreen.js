import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, ActivityIndicator
} from 'react-native';
import { saveBuilding, saveAlertPoint } from '../firebaseDB';

const SPECIAL_CHARS_NAME = ['동', '라인', '-', ',', '1,2라인', '3,4라인', '5,6라인', '7,8라인'];
const SK_SHORTCUTS = ['SK뷰', 'SK1차', 'SK2차', 'SK3차'];
const SPECIAL_CHARS_MEMO = ['#', '*', '호출', '입력', '비번', '엔터', '종', '경비', '열쇠'];

export default function RegisterScreen({ navigation, route }) {
  const buildingData = route.params?.buildingData || null;

  const [regMode, setRegMode] = useState('building');
  const [name, setName] = useState(buildingData?.name || '');
  const [memo, setMemo] = useState(buildingData?.memo || '');
  const [note, setNote] = useState(buildingData?.note || '');
  const [shortcut, setShortcut] = useState(buildingData?.shortcut || '');
  const [isSaving, setIsSaving] = useState(false);
  const [activeField, setActiveField] = useState('name'); // 'name' or 'memo'

  const nameRef = useRef(null);
  const memoRef = useRef(null);

  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 300);
  }, []);

  const insertChar = (char) => {
    if (activeField === 'name') {
      setName(prev => prev + char);
    } else if (activeField === 'memo') {
      setMemo(prev => prev + char);
    }
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
        memo, note, shortcut,
        images: [],
        timestamp: Date.now(),
        id: buildingData?.id || Date.now().toString()
      };
      if (regMode === 'alert') {
        await saveAlertPoint(data);
      } else {
        await saveBuilding(data);
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('오류', '저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">

      {/* 탭 */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, regMode === 'building' && styles.tabActive]}
          onPress={() => setRegMode('building')}
        >
          <Text style={[styles.tabText, regMode === 'building' && styles.tabTextActive]}>일반 건물</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, regMode === 'alert' && styles.tabAlert]}
          onPress={() => setRegMode('alert')}
        >
          <Text style={[styles.tabText, regMode === 'alert' && styles.tabTextAlert]}>⚠️ 강력 알림</Text>
        </TouchableOpacity>
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
          {/* 출입 정보 */}
          <Text style={styles.label}>출입 정보</Text>
          <TextInput
            ref={memoRef}
            style={styles.input}
            value={memo}
            onChangeText={setMemo}
            onFocus={() => setActiveField('memo')}
            placeholder="비밀번호 등"
            placeholderTextColor="#94a3b8"
            keyboardType="numeric"
            multiline
          />
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
        <View style={styles.alertBox}>
          <Text style={styles.alertText}>⚠️ 이 지역 100m 이내 진입 시 강력한 경고 알림이 울립니다.</Text>
          <Text style={styles.alertSubText}>주차 단속, 고정식 카메라 등 잊지 말아야 할 장소를 등록하세요.</Text>
        </View>
      )}

      {/* 저장/취소 */}
      <View style={styles.bottomRow}>
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
  bottomRow: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 40 },
  btnSave: { flex: 1, backgroundColor: '#3b82f6', padding: 16, borderRadius: 8, alignItems: 'center' },
  btnSaveText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnCancel: { flex: 1, backgroundColor: '#e2e8f0', padding: 16, borderRadius: 8, alignItems: 'center' },
  btnCancelText: { color: '#374151', fontWeight: 'bold', fontSize: 16 },
});