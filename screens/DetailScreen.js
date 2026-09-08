import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, ActivityIndicator, Share, Image,
  Modal, Animated, PanResponder, Dimensions, StatusBar
} from 'react-native';
import { getBuilding, updateBuilding, deleteBuilding } from '../firebaseDB';
import { ADMIN_UIDS } from '../constants';
import { auth } from '../firebase';
import { invalidateBuildingsCache } from '../buildingsCache'; 

const SCREEN = Dimensions.get('window');

// ─────────────────────────────────────────────
//  이미지 전체보기 (핀치 확대 / 드래그 이동 / 더블탭 리셋)
//  추가 라이브러리 없이 PanResponder로 직접 구현
// ─────────────────────────────────────────────
function ImageViewer({ visible, images, startIndex, onClose }) {
  const [index, setIndex] = useState(startIndex || 0);

  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;

  // 제스처 중 기준값들
  const lastScale = useRef(1);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const startDist = useRef(0);
  const startScale = useRef(1);
  const lastTapAt = useRef(0);

  useEffect(() => {
    if (visible) {
      setIndex(startIndex || 0);
      reset();
    }
  }, [visible, startIndex]);

  const reset = () => {
    lastScale.current = 1;
    lastX.current = 0;
    lastY.current = 0;
    scale.setValue(1);
    tx.setValue(0);
    ty.setValue(0);
  };

  const distanceOf = (touches) => {
    const [a, b] = touches;
    const dx = a.pageX - b.pageX;
    const dy = a.pageY - b.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const panResponder = useRef(
    PanResponder.create({
      // capture까지 잡아야 부모(ScrollView 등)에게 터치를 뺏기지 않는다
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          startDist.current = distanceOf(touches);
          startScale.current = lastScale.current;
        } else {
          // 더블탭이면 확대 상태를 초기화
          const now = Date.now();
          if (now - lastTapAt.current < 300) {
            reset();
            lastTapAt.current = 0;
          } else {
            lastTapAt.current = now;
          }
        }
      },

      onPanResponderMove: (evt, gesture) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length === 2) {
          // 두 손가락 → 확대/축소
          // ⚠️ onPanResponderGrant는 첫 손가락에서만 불리므로
          //    두 번째 손가락이 닿는 순간 여기서 기준값을 잡아야 한다
          if (startDist.current === 0) {
            startDist.current = distanceOf(touches);
            startScale.current = lastScale.current;
            console.log('[VIEWER] 핀치 시작');
            return;
          }
          const d = distanceOf(touches);
          if (startDist.current > 0) {
            let next = startScale.current * (d / startDist.current);
            if (next < 1) next = 1;
            if (next > 6) next = 6;
            scale.setValue(next);
            lastScale.current = next;
          }
        } else if (touches.length === 1) {
          // 한 손가락 → 이동 (확대된 상태에서만)
          if (lastScale.current > 1.02) {
            tx.setValue(lastX.current + gesture.dx);
            ty.setValue(lastY.current + gesture.dy);
          }
        }
      },

      onPanResponderRelease: () => {
        startDist.current = 0;
        lastX.current = tx._value;
        lastY.current = ty._value;

        // 원래 크기로 돌아오면 위치도 가운데로
        if (lastScale.current <= 1.02) {
          Animated.parallel([
            Animated.spring(tx, { toValue: 0, useNativeDriver: false }),
            Animated.spring(ty, { toValue: 0, useNativeDriver: false }),
          ]).start(() => { lastX.current = 0; lastY.current = 0; });
        }
      },
    })
  ).current;

  if (!visible || !images || images.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <StatusBar hidden />
      <View style={viewerStyles.backdrop}>
        <View style={viewerStyles.imageArea} {...panResponder.panHandlers}>
          <Animated.Image
            source={{ uri: images[index] }}
            style={[
              viewerStyles.image,
              { transform: [{ scale }, { translateX: tx }, { translateY: ty }] },
            ]}
            resizeMode="contain"
          />
        </View>

        {/* 여러 장일 때 좌우 이동 */}
        {images.length > 1 && (
          <View style={viewerStyles.navRow}>
            <TouchableOpacity
              style={viewerStyles.navBtn}
              onPress={() => { setIndex(i => (i - 1 + images.length) % images.length); reset(); }}
            >
              <Text style={viewerStyles.navText}>‹</Text>
            </TouchableOpacity>
            <Text style={viewerStyles.counter}>{index + 1} / {images.length}</Text>
            <TouchableOpacity
              style={viewerStyles.navBtn}
              onPress={() => { setIndex(i => (i + 1) % images.length); reset(); }}
            >
              <Text style={viewerStyles.navText}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={viewerStyles.hint}>두 손가락으로 확대 · 확대 후 드래그로 이동 · 더블탭으로 원래대로</Text>

        <TouchableOpacity style={viewerStyles.closeBtn} onPress={onClose}>
          <Text style={viewerStyles.closeText}>✕ 닫기</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function DetailScreen({ navigation, route }) {
  const { buildingId } = route.params;
  const [building, setBuilding] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [locationChanged, setLocationChanged] = useState(false);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

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
      invalidateBuildingsCache(); 
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
          invalidateBuildingsCache();   // ← 추가
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
    <View style={{ flex: 1 }}>
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
            <Text style={styles.label}>출입 정보 2 (백업)</Text>
          <TextInput
            style={styles.input}
            value={building.memo2 || ''}
            onChangeText={v => setBuilding(p => ({ ...p, memo2: v }))}
            keyboardType="numeric"
            placeholder="비번이 바뀔 때를 대비한 예비 (선택)"
            placeholderTextColor="#94a3b8"
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
            {!!building.memo2 && (
              <>
                <Text style={[styles.infoLabel, { marginTop: 10 }]}>출입 정보 2 (백업)</Text>
                <Text style={[styles.infoValue, { color: '#9a3412' }]}>{building.memo2}</Text>
              </>
            )}
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

          {/* 이미지 — 잘리지 않게 전체를 보여주고, 누르면 확대 가능한 전체보기 */}
          {building.images?.length > 0 && (
            <View style={styles.imageSection}>
              <Text style={styles.infoLabel}>사진 · 배치도 ({building.images.length})</Text>
              {building.images.map((img, i) => (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.85}
                  onPress={() => { setViewerIndex(i); setViewerOpen(true); }}
                >
                  <Image source={{ uri: img }} style={styles.image} resizeMode="contain" />
                  <View style={styles.imageBadge}>
                    <Text style={styles.imageBadgeText}>🔍 크게 보기</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

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

    {/* Modal은 ScrollView 밖에 둬야 터치(핀치)를 뺏기지 않는다 */}
    <ImageViewer
      visible={viewerOpen}
      images={building.images || []}
      startIndex={viewerIndex}
      onClose={() => setViewerOpen(false)}
    />
    </View>
  );
}

const viewerStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000' },
  imageArea: { flex: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  image: { width: SCREEN.width, height: SCREEN.height * 0.75 },
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, gap: 24,
  },
  navBtn: { paddingHorizontal: 24, paddingVertical: 6 },
  navText: { color: '#fff', fontSize: 34, lineHeight: 38 },
  counter: { color: '#e2e8f0', fontSize: 15, minWidth: 60, textAlign: 'center' },
  hint: { color: '#94a3b8', fontSize: 12, textAlign: 'center', marginBottom: 8 },
  closeBtn: {
    alignSelf: 'center', marginBottom: 28,
    paddingHorizontal: 28, paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10,
  },
  closeText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

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

  imageSection: { backgroundColor: '#fff', borderRadius: 8, padding: 14, marginBottom: 8, elevation: 1 },
  image: {
    width: '100%', height: 320, borderRadius: 8, marginTop: 8,
    backgroundColor: '#f1f5f9',
  },
  imageBadge: {
    position: 'absolute', right: 10, bottom: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 6,
  },
  imageBadgeText: { color: '#fff', fontSize: 12 },

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