import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import * as Location from 'expo-location';
import { SUGGEST_TYPES, saveSuggestion } from '../suggestionsDB';
import { pickImages, takePhoto, uploadSuggestionImages } from '../imageUpload';

const MAX_PHOTOS = 3;

export default function SuggestScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { c, font, space, radius, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius, TAP), [c]);

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
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={c.textSub} />
        </TouchableOpacity>
        <Text style={s.screenTitle}>제보하기</Text>
      </View>
      <ScrollView
        style={s.container}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
      >
        <Text style={s.lead}>
          도움이 될 정보를 알려주시면 확인 후 반영하겠습니다.
        </Text>

        {/* 종류 */}
        <Text style={s.label}>어떤 내용인가요?</Text>
        <View style={s.typeGrid}>
          {SUGGEST_TYPES.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[s.typeBtn, type === t.key && s.typeBtnOn]}
              onPress={() => setType(t.key)}
            >
              <Text style={[s.typeBtnText, type === t.key && s.typeBtnTextOn]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {current?.hint ? <Text style={s.hint}>{current.hint}</Text> : null}

        {/* 건물 이름 */}
        <Text style={s.label}>건물 이름 (선택)</Text>
        <TextInput
          style={s.input}
          value={buildingName}
          onChangeText={setBuildingName}
          placeholder="예: 동탄 자연앤데시앙 871동"
          placeholderTextColor={c.textFaint}
        />

        {/* 내용 */}
        <Text style={s.label}>내용 *</Text>
        <TextInput
          style={[s.input, s.inputMulti]}
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={5}
          placeholder={'예) 12층은 호수 배치가 다릅니다.\n1201호가 엘리베이터 왼쪽이에요.'}
          placeholderTextColor={c.textFaint}
        />

        {/* 사진 */}
        <Text style={s.label}>사진 ({photos.length}/{MAX_PHOTOS})</Text>
        <Text style={s.hint}>
          현장 사진도 좋고, 지도를 캡처해서 넣어도 됩니다.
        </Text>

        {photos.map((uri, i) => (
          <View key={i} style={s.photoRow}>
            <Image source={{ uri }} style={s.photoThumb} />
            <TouchableOpacity style={s.photoDel} onPress={() => dropPhoto(i)}>
              <Icon name="close" size={16} color={c.danger} />
              <Text style={s.photoDelText}>빼기</Text>
            </TouchableOpacity>
          </View>
        ))}

        {photos.length < MAX_PHOTOS && (
          <View style={s.btnRow}>
            <TouchableOpacity style={s.subBtn} onPress={() => addPhotos(true)}>
              <Icon name="camera-outline" size={18} color={c.accent} />
              <Text style={s.subBtnText}>찍기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.subBtn} onPress={() => addPhotos(false)}>
              <Icon name="image-outline" size={18} color={c.accent} />
              <Text style={s.subBtnText}>앨범에서</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 위치 */}
        <Text style={s.label}>위치 (선택)</Text>
        <View style={s.locBox}>
          {location ? (
            <Text style={s.locOk}>
              {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
            </Text>
          ) : (
            <Text style={s.hint}>
              위치를 넣어주시면 어디인지 훨씬 빨리 찾을 수 있습니다.
            </Text>
          )}
          <TouchableOpacity style={s.subBtn} onPress={useCurrentLocation} disabled={locBusy}>
            {locBusy
              ? <ActivityIndicator color={c.accent} />
              : <>
                  <Icon name="crosshairs-gps" size={18} color={c.accent} />
                  <Text style={s.subBtnText}>지금 여기</Text>
                </>}
          </TouchableOpacity>
        </View>

        {/* 보내기 */}
        <TouchableOpacity
          style={[s.sendBtn, sending && s.sendBtnOff]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending
            ? <View style={s.sendingRow}>
                <ActivityIndicator color={c.onAccent} />
                <Text style={s.sendBtnText}>{progress || '보내는 중...'}</Text>
              </View>
            : <Text style={s.sendBtnText}>제보 보내기</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={s.cancelBtnText}>취소</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c, font, space, radius, TAP) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg, paddingHorizontal: space.lg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.sm, paddingBottom: space.sm,
    backgroundColor: c.bg,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { ...font.title, color: c.text, marginLeft: space.xs },

  lead: { ...font.sub, color: c.textMuted, lineHeight: 20, marginTop: space.xs },
  label: { ...font.sub, color: c.textSub, marginBottom: 6, marginTop: space.xl },
  hint: { ...font.tiny, color: c.textFaint, lineHeight: 18, marginBottom: 6 },

  input: {
    backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.lineStrong, borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.md,
    ...font.body, color: c.text,
  },
  inputMulti: { minHeight: 120, textAlignVertical: 'top' },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  typeBtn: {
    paddingHorizontal: space.lg, minHeight: 44, justifyContent: 'center',
    backgroundColor: c.surface, borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  typeBtnOn: { backgroundColor: c.accent, borderColor: c.accent },
  typeBtnText: { ...font.sub, fontWeight: '500', color: c.textSub },
  typeBtnTextOn: { color: c.onAccent },

  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  photoThumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: c.surfaceSoft },
  photoDel: {
    marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: c.dangerSoft, paddingHorizontal: space.md,
    minHeight: 40, justifyContent: 'center', borderRadius: radius.sm,
  },
  photoDelText: { ...font.sub, fontWeight: '500', color: c.danger },

  btnRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  subBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: TAP, borderRadius: radius.md, backgroundColor: c.accentSoft,
  },
  subBtnText: { ...font.sub, fontWeight: '500', color: c.accent },

  locBox: {
    backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.lineStrong, borderRadius: radius.md, padding: space.md,
  },
  locOk: { ...font.sub, fontWeight: '500', color: c.accent, marginBottom: space.sm },

  sendBtn: {
    minHeight: TAP + 6, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.accent, borderRadius: radius.md, marginTop: space.xxl,
  },
  sendBtnOff: { opacity: 0.7 },
  sendingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sendBtnText: { ...font.head, color: c.onAccent },
  cancelBtn: {
    minHeight: TAP, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.surfaceSoft, borderRadius: radius.md, marginTop: space.sm,
  },
  cancelBtnText: { ...font.body, color: c.textSub },
});