import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, ActivityIndicator, Share, Image
} from 'react-native';
import { getBuilding, updateBuilding, deleteBuilding } from '../firebaseDB';
import { ADMIN_UIDS } from '../constants';
import { auth } from '../firebase';

export default function DetailScreen({ navigation, route }) {
  const { buildingId } = route.params;
  const [building, setBuilding] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [locationChanged, setLocationChanged] = useState(false);

  const isAdmin = auth.currentUser && ADMIN_UIDS.includes(auth.currentUser.uid);

  useEffect(() => {
    getBuilding(buildingId).then(data => {
      if (!data) { navigation.goBack(); return; }
      if (data.location) {
        data.location = {
          lat: parseFloat(String(data.location.lat)),
          lng: parseFloat(String(data.location.lng))
        };
      }
      setBuilding(data);
    });
  }, [buildingId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateBuilding({ ...building, timestamp: Date.now() });
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
    Alert.alert('삭제 확인', '정말 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          await deleteBuilding(buildingId);
          navigation.goBack();
        }
      }
    ]);
  };

  const handleShare = () => {
    Share.share({
      message: `[스마트 라이더]\n건물명: ${building.name}\n출입정보: ${building.memo || '없음'}`
    });
  };

  // 지도 위치 수정 화면으로 이동
  const openLocationPicker = () => {
    navigation.navigate('LocationPicker', {
      initialLocation: building.location || null,
      onPicked: (loc) => {
        setBuilding(prev => ({ ...prev, location: loc }));
        setLocationChanged(true);
      }
    });
  };

  if (!building) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#3b82f6" />
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>건물 상세 정보</Text>

      {saveMsg ? (
        <View style={styles.saveMsg}>
          <Text style={styles.saveMsgText}>{saveMsg}</Text>
        </View>
      ) : null}

      {editMode ? (
        <>
          <Text style={styles.label}>건물 이름</Text>
          <TextInput
            style={styles.input}
            value={building.name}
            onChangeText={v => setBuilding(p => ({ ...p, name: v }))}
          />
          <Text style={styles.label}>출입 정보</Text>
          <TextInput
            style={styles.input}
            value={building.memo || ''}
            onChangeText={v => setBuilding(p => ({ ...p, memo: v }))}
            keyboardType="numeric"
          />
          <Text style={styles.label}>특이사항</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={building.note || ''}
            onChangeText={v => setBuilding(p => ({ ...p, note: v }))}
            multiline
          />
          <Text style={styles.label}>샛길 정보</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={building.shortcut || ''}
            onChangeText={v => setBuilding(p => ({ ...p, shortcut: v }))}
            multiline
          />

          {/* 지도 위치 수정 */}
          <TouchableOpacity style={styles.btnLocation} onPress={openLocationPicker}>
            <Text style={styles.btnLocationText}>📍 지도 위치 수정</Text>
          </TouchableOpacity>
          {building.location && (
            <Text style={styles.coordText}>
              위도: {building.location.lat?.toFixed(6)}, 경도: {building.location.lng?.toFixed(6)}
            </Text>
          )}
          {locationChanged && (
            <View style={styles.locChangedBox}>
              <Text style={styles.locChangedText}>위치 정보가 변경되었습니다. 저장 버튼을 눌러 완료하세요.</Text>
            </View>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btnSave} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnSaveText}>저장</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnCancel} onPress={() => { setEditMode(false); setLocationChanged(false); }}>
              <Text style={styles.btnCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>이름</Text>
            <Text style={styles.infoValue}>{building.name}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>출입 정보</Text>
            <Text style={styles.infoValue}>{building.memo || '없음'}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>특이사항</Text>
            <Text style={styles.infoValue}>{building.note || '없음'}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>샛길 정보</Text>
            <Text style={styles.infoValue}>{building.shortcut || '없음'}</Text>
          </View>
          {building.location && (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>위치 정보</Text>
              <Text style={styles.infoValue}>
                위도: {building.location.lat?.toFixed(6)}{'\n'}경도: {building.location.lng?.toFixed(6)}
              </Text>
            </View>
          )}

          {building.images?.map((img, i) => (
            <Image key={i} source={{ uri: img }} style={styles.image} resizeMode="cover" />
          ))}

          <TouchableOpacity style={styles.btnShare} onPress={handleShare}>
            <Text style={styles.btnShareText}>공유</Text>
          </TouchableOpacity>

          {isAdmin && (
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btnEdit} onPress={() => setEditMode(true)}>
                <Text style={styles.btnEditText}>수정</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnDelete} onPress={handleDelete}>
                <Text style={styles.btnDeleteText}>삭제</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      <TouchableOpacity style={styles.btnBack} onPress={() => navigation.goBack()}>
        <Text style={styles.btnBackText}>← 뒤로</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', color: '#1e3a5f', marginBottom: 16 },
  saveMsg: { backgroundColor: '#dcfce7', padding: 10, borderRadius: 8, marginBottom: 12 },
  saveMsgText: { color: '#166534', textAlign: 'center' },
  label: { fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 4, marginTop: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, fontSize: 16, color: '#1e293b' },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  infoBox: { backgroundColor: '#fff', borderRadius: 8, padding: 14, marginBottom: 8, elevation: 1 },
  infoLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 4 },
  infoValue: { fontSize: 17, color: '#1e293b', fontWeight: '500' },
  image: { width: '100%', height: 200, borderRadius: 8, marginBottom: 12 },
  btnLocation: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  btnLocationText: { color: '#2563eb', fontWeight: 'bold', fontSize: 15 },
  coordText: { fontSize: 13, color: '#475569', marginTop: 8 },
  locChangedBox: { backgroundColor: '#f1f5f9', padding: 10, borderRadius: 8, marginTop: 8 },
  locChangedText: { fontSize: 13, color: '#64748b' },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btnSave: { flex: 1, backgroundColor: '#3b82f6', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnSaveText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnCancel: { flex: 1, backgroundColor: '#e2e8f0', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnCancelText: { color: '#374151', fontWeight: 'bold', fontSize: 16 },
  btnShare: { backgroundColor: '#e2e8f0', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  btnShareText: { color: '#374151', fontWeight: 'bold', fontSize: 16 },
  btnEdit: { flex: 1, backgroundColor: '#e2e8f0', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnEditText: { color: '#374151', fontWeight: 'bold' },
  btnDelete: { flex: 1, backgroundColor: '#fee2e2', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnDeleteText: { color: '#dc2626', fontWeight: 'bold' },
  btnBack: { backgroundColor: '#f1f5f9', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 16, marginBottom: 40 },
  btnBackText: { color: '#475569', fontSize: 15 },
});