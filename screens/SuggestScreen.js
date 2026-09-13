import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { SUGGEST_TYPES, saveSuggestion } from '../suggestionsDB';
import { pickImages, takePhoto, uploadSuggestionImages } from '../imageUpload';

const MAX_PHOTOS = 3;

export default function SuggestScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();

  // 건물 상세에서 넘어온 경우 이름이 미리 채워진다
  const [type, setType] = useState(route.params?.type || 'new');
  const [buildingName, setBuildingName] = useState(route.params?.buildingName || '');
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState([]);      // 로컬 경로. 보낼 때 올라간다.
  const [location, setLocation] = useState(null);
  const [locBusy, setLocBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState('');

  const addPhotos = async (fromCamera) => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('사진', `사진은 ${MAX_PHOTOS}장까지 넣을 수 있습니다.`);
      return;
    }
    try {
      const room = MAX_PHOTOS - photos.length;
      const picked = fromCamera
        ? [await takePhoto()].filter(Boolean)
        : await pickImages(room);
      if (picked.length === 0) return;
      setPhotos(p => [...p, ...picked].slice(0, MAX_PHOTOS));
    } catch (e) {
      Alert.alert('오류', e?.message || '사진을 가져오지 못했습니다.');
    }
  };

  const dropPhoto = (idx) => setPhotos(p => p.filter((_, i) => i !== idx));

  const useCurrentLocation = async () => {
    setLocBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '위치 권한을 허용해야 현재 위치를 넣을 수 있습니다.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch (e) {
      Alert.alert('오류', '현재 위치를 가져오지 못했습니다.');
    } finally {
      setLocBusy(false);
    }
  };

  const handleSend = async () => {
    if (!text.trim()) {
      Alert.alert('내용 필요', '어떤 내용인지 적어주세요.');
      return;
    }
    setSending(true);
    try {
      // 사진은 보낼 때 한 번에 올린다.
      // 미리 올려두면 취소했을 때 서버에 파일만 남는다.
      let urls = [];
      if (photos.length > 0) {
        setProgress('사진 올리는 중...');
        urls = await uploadSuggestionImages(photos, (cur, total, pct) => {
          setProgress(`사진 ${cur}/${total} · ${pct}%`);
        });
      }
      setProgress('보내는 중...');
      await saveSuggestion({ type, text, images: urls, location, buildingName });

      setProgress('');
      Alert.alert(
        '제보 완료',
        '보내주셔서 감사합니다.\n확인하고 반영하겠습니다.',
        [{ text: '확인', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      setProgress('');
      Alert.alert('실패', e?.message || '제보를 보내지 못했습니다.');
    } finally {
      setSending(false);
    }
  };

  const current = SUGGEST_TYPES.find(t => t.key === type);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
      >
        <Text style={styles.title}>제보하기</Text>
        <Text style={styles.lead}>
          도움이 될 정보를 알려주시면 확인 후 반영하겠습니다.
        </Text>

        {/* 종류 */}
        <Text style={styles.label}>어떤 내용인가요?</Text>
        <View style={styles.typeGrid}>
          {SUGGEST_TYPES.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.typeBtn, type === t.key && styles.typeBtnOn]}
              onPress={() => setType(t.key)}
            >
              <Text style={[styles.typeBtnText, type === t.key && styles.typeBtnTextOn]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {current?.hint ? <Text style={styles.hint}>{current.hint}</Text> : null}

        {/* 건물 이름 */}
        <Text style={styles.label}>건물 이름 (선택)</Text>
        <TextInput
          style={styles.input}
          value={buildingName}
          onChangeText={setBuildingName}
          placeholder="예: 동탄 자연앤데시앙 871동"
          placeholderTextColor="#94a3b8"
        />

        {/* 내용 */}
        <Text style={styles.label}>내용 *</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={5}
          placeholder={'예) 12층은 호수 배치가 다릅니다.\n1201호가 엘리베이터 왼쪽이에요.'}
          placeholderTextColor="#94a3b8"
        />

        {/* 사진 */}
        <Text style={styles.label}>사진 ({photos.length}/{MAX_PHOTOS})</Text>
        <Text style={styles.hint}>
          현장 사진도 좋고, 지도를 캡처해서 넣어도 됩니다.
        </Text>

        {photos.map((uri, i) => (
          <View key={i} style={styles.photoRow}>
            <Image source={{ uri }} style={styles.photoThumb} />
            <TouchableOpacity style={styles.photoDel} onPress={() => dropPhoto(i)}>
              <Text style={styles.photoDelText}>✕ 빼기</Text>
            </TouchableOpacity>
          </View>
        ))}

        {photos.length < MAX_PHOTOS && (
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.subBtn} onPress={() => addPhotos(true)}>
              <Text style={styles.subBtnText}>📷 찍기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.subBtn} onPress={() => addPhotos(false)}>
              <Text style={styles.subBtnText}>🖼 앨범에서</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 위치 */}
        <Text style={styles.label}>위치 (선택)</Text>
        <View style={styles.locBox}>
          {location ? (
            <Text style={styles.locOk}>
              📍 {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
            </Text>
          ) : (
            <Text style={styles.hint}>
              위치를 넣어주시면 어디인지 훨씬 빨리 찾을 수 있습니다.
            </Text>
          )}
          <TouchableOpacity style={styles.subBtn} onPress={useCurrentLocation} disabled={locBusy}>
            {locBusy
              ? <ActivityIndicator color="#2563eb" />
              : <Text style={styles.subBtnText}>📍 지금 여기</Text>}
          </TouchableOpacity>
        </View>

        {/* 보내기 */}
        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.sendBtnOff]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending
            ? <View style={styles.sendingRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.sendBtnText}>{progress || '보내는 중...'}</Text>
              </View>
            : <Text style={styles.sendBtnText}>제보 보내기</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelBtnText}>취소</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1e3a5f' },
  lead: { fontSize: 13, color: '#64748b', marginTop: 6, lineHeight: 19 },
  label: { fontSize: 15, fontWeight: 'bold', color: '#374151', marginBottom: 6, marginTop: 18 },
  hint: { fontSize: 12, color: '#94a3b8', lineHeight: 18, marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1',
    borderRadius: 8, padding: 12, fontSize: 16, color: '#1e293b',
  },
  inputMulti: { minHeight: 120, textAlignVertical: 'top' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    paddingHorizontal: 14, minHeight: 44, justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8,
  },
  typeBtnOn: { backgroundColor: '#1e3a5f', borderColor: '#1e3a5f' },
  typeBtnText: { fontSize: 14, color: '#475569', fontWeight: 'bold' },
  typeBtnTextOn: { color: '#fff' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  photoThumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#e2e8f0' },
  photoDel: {
    marginLeft: 'auto', backgroundColor: '#fee2e2',
    paddingHorizontal: 12, minHeight: 40, justifyContent: 'center', borderRadius: 8,
  },
  photoDelText: { color: '#dc2626', fontSize: 13, fontWeight: 'bold' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  subBtn: {
    flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8,
  },
  subBtnText: { color: '#2563eb', fontWeight: 'bold', fontSize: 14 },
  locBox: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1',
    borderRadius: 8, padding: 12,
  },
  locOk: { fontSize: 13, color: '#0f766e', fontWeight: 'bold', marginBottom: 10 },
  sendBtn: {
    backgroundColor: '#3b82f6', minHeight: 52, justifyContent: 'center',
    alignItems: 'center', borderRadius: 8, marginTop: 28,
  },
  sendBtnOff: { backgroundColor: '#93c5fd' },
  sendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sendBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cancelBtn: {
    backgroundColor: '#e2e8f0', minHeight: 48, justifyContent: 'center',
    alignItems: 'center', borderRadius: 8, marginTop: 10,
  },
  cancelBtnText: { color: '#374151', fontWeight: 'bold', fontSize: 15 },
});