import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { getAlertPoint, updateAlertPoint, deleteAlertPoint } from '../firebaseDB';
import { syncAlertsToService } from '../alertSync';
import { useAuth } from '../AuthContext';

const ALERT_TYPES = [
  { key: 'rear', label: '후방카메라' },
  { key: 'front', label: '전방카메라' },
  { key: 'parking', label: '주차단속' },
  { key: 'etc', label: '기타' },
];

const typeLabel = (key) =>
  ALERT_TYPES.find(t => t.key === key)?.label || '알림구역';

export default function AlertDetailScreen({ navigation, route }) {
  const { alertId } = route.params;
  const [point, setPoint] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [locationChanged, setLocationChanged] = useState(false);

  const { isAdmin } = useAuth();

  useEffect(() => {
    getAlertPoint(alertId).then(data => {
      if (!data) {
        Alert.alert('없는 지점', '이미 삭제된 알림지점입니다.');
        navigation.goBack();
        return;
      }
      if (data.location) {
        data.location = {
          lat: parseFloat(String(data.location.lat)),
          lng: parseFloat(String(data.location.lng))
        };
      }
      setPoint(data);
    });
  }, [alertId]);

  const handleSave = async () => {
    if (!point.name?.trim()) {
      Alert.alert('오류', '이름을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      await updateAlertPoint({ ...point, name: point.name.trim() });
      // 저장 즉시 Kotlin에 반영 (앱을 껐다 켜지 않아도 되게)
      syncAlertsToService();
      setEditMode(false);
      setLocationChanged(false);
      setSaveMsg('저장 완료!');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch (e) {
      Alert.alert('오류', '저장 실패: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      '알림지점 삭제',
      `"${point.name}"을(를) 삭제합니다.\n카메라가 없어졌거나 잘못 등록한 경우에만 삭제해주세요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제', style: 'destructive',
          onPress: async () => {
            try {
              await deleteAlertPoint(alertId);
              syncAlertsToService();
              navigation.goBack();
            } catch (e) {
              Alert.alert('오류', '삭제 실패: ' + e.message);
            }
          }
        }
      ]
    );
  };

  const openLocationPicker = () => {
    navigation.navigate('LocationPicker', {
      initialLocation: point.location || null,
      onPicked: (loc) => {
        setPoint(prev => ({ ...prev, location: loc }));
        setLocationChanged(true);
      }
    });
  };

  if (!point) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#ef4444" />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 340 }}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>🚨 {typeLabel(point.alertType)}</Text>
      </View>

      {saveMsg ? (
        <View style={styles.saveMsg}>
          <Text style={styles.saveMsgText}>{saveMsg}</Text>
        </View>
      ) : null}

      {editMode ? (
        <>
          <Text style={styles.label}>이름</Text>
          <TextInput
            style={styles.input}
            value={point.name}
            onChangeText={v => setPoint(p => ({ ...p, name: v }))}
          />

          <Text style={styles.label}>알림 종류</Text>
          <View style={styles.typeGrid}>
            {ALERT_TYPES.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.typeBtn, point.alertType === t.key && styles.typeBtnActive]}
                onPress={() => setPoint(p => ({ ...p, alertType: t.key }))}
              >
                <Text style={[styles.typeBtnText, point.alertType === t.key && styles.typeBtnTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>메모</Text>
          <TextInput
            style={styles.input}
            value={point.memo || ''}
            onChangeText={v => setPoint(p => ({ ...p, memo: v }))}
            placeholder="예: 삼거리 신호등 옆"
            placeholderTextColor="#94a3b8"
          />

          <TouchableOpacity style={styles.btnLocation} onPress={openLocationPicker}>
            <Text style={styles.btnLocationText}>📍 위치 옮기기</Text>
          </TouchableOpacity>
          {point.location && (
            <Text style={styles.coordText}>
              위도: {point.location.lat?.toFixed(6)}, 경도: {point.location.lng?.toFixed(6)}
            </Text>
          )}
          {locationChanged && (
            <View style={styles.locChangedBox}>
              <Text style={styles.locChangedText}>위치가 변경되었습니다. 저장을 눌러 완료하세요.</Text>
            </View>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btnSave} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnSaveText}>저장</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnCancel}
              onPress={() => { setEditMode(false); setLocationChanged(false); }}
            >
              <Text style={styles.btnCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>이름</Text>
            <Text style={styles.infoValue}>{point.name}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>메모</Text>
            <Text style={styles.infoValue}>{point.memo || '없음'}</Text>
          </View>
          {point.location && (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>위치</Text>
              <Text style={styles.infoValue}>
                위도: {point.location.lat?.toFixed(6)}{'\n'}경도: {point.location.lng?.toFixed(6)}
              </Text>
            </View>
          )}

          {isAdmin ? (
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btnEdit} onPress={() => setEditMode(true)}>
                <Text style={styles.btnEditText}>수정</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnDelete} onPress={handleDelete}>
                <Text style={styles.btnDeleteText}>삭제</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.readonly}>알림지점 수정은 관리자만 할 수 있습니다.</Text>
          )}
        </>
      )}

      <TouchableOpacity style={styles.btnBack} onPress={() => navigation.goBack()}>
        <Text style={styles.btnBackText}>← 뒤로</Text>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  banner: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5', borderRadius: 10, padding: 14, marginBottom: 14 },
  bannerText: { color: '#b91c1c', fontWeight: 'bold', fontSize: 18 },
  saveMsg: { backgroundColor: '#dcfce7', padding: 10, borderRadius: 8, marginBottom: 12 },
  saveMsgText: { color: '#166534', textAlign: 'center' },
  label: { fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 4, marginTop: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, fontSize: 16, color: '#1e293b' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  typeBtn: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 14, minHeight: 48, justifyContent: 'center', borderRadius: 8 },
  typeBtnActive: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  typeBtnText: { fontSize: 14, color: '#475569', fontWeight: 'bold' },
  typeBtnTextActive: { color: '#fff' },
  infoBox: { backgroundColor: '#fff', borderRadius: 8, padding: 14, marginBottom: 8, elevation: 1 },
  infoLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 4 },
  infoValue: { fontSize: 17, color: '#1e293b', fontWeight: '500' },
  btnLocation: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  btnLocationText: { color: '#2563eb', fontWeight: 'bold', fontSize: 15 },
  coordText: { fontSize: 13, color: '#475569', marginTop: 8 },
  locChangedBox: { backgroundColor: '#f1f5f9', padding: 10, borderRadius: 8, marginTop: 8 },
  locChangedText: { fontSize: 13, color: '#64748b' },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btnSave: { flex: 1, backgroundColor: '#3b82f6', minHeight: 48, justifyContent: 'center', borderRadius: 8, alignItems: 'center' },
  btnSaveText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnCancel: { flex: 1, backgroundColor: '#e2e8f0', minHeight: 48, justifyContent: 'center', borderRadius: 8, alignItems: 'center' },
  btnCancelText: { color: '#374151', fontWeight: 'bold', fontSize: 16 },
  btnEdit: { flex: 1, backgroundColor: '#e2e8f0', minHeight: 48, justifyContent: 'center', borderRadius: 8, alignItems: 'center' },
  btnEditText: { color: '#374151', fontWeight: 'bold', fontSize: 16 },
  btnDelete: { flex: 1, backgroundColor: '#fee2e2', minHeight: 48, justifyContent: 'center', borderRadius: 8, alignItems: 'center' },
  btnDeleteText: { color: '#dc2626', fontWeight: 'bold', fontSize: 16 },
  readonly: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 16 },
  btnBack: { backgroundColor: '#f1f5f9', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 16, marginBottom: 40 },
  btnBackText: { color: '#475569', fontSize: 15 },
});