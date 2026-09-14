import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, ActivityIndicator, Share, Image,
  Modal, Animated, PanResponder, Dimensions, StatusBar,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { getBuilding, updateBuilding, deleteBuilding } from '../firebaseDB';
import { invalidateBuildingsCache } from '../buildingsCache';
import { useAuth } from '../AuthContext';
import {
  isLocalId, getPersonalBuilding, savePersonalBuilding,
  deletePersonalBuilding, getPersonalNote, savePersonalNote,
  isFavorite, toggleFavorite, setFavorite,
} from '../personalDB';
import { promoteToPublic } from '../migration';
import { pickImages, takePhoto, uploadBuildingImages, deleteImageByUrl } from '../imageUpload';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { copyBuildingMemo } from '../copyUtil';
import { useTheme } from '../theme';

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
  const insets = useSafeAreaInsets();
  const { c, font, space, radius, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius, TAP), [c]);

  const { isAdmin } = useAuth();

  const [building, setBuilding] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [locationChanged, setLocationChanged] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // local_ 로 시작하면 내 폰에 있는 건물이다.
  const isMine = isLocalId(buildingId);

  // 즐겨찾기 — 내 폰에만 저장된다
  const [fav, setFav] = useState(false);
  useEffect(() => { isFavorite(buildingId).then(setFav); }, [buildingId]);

  const onToggleFav = async () => {
    const next = await toggleFavorite(buildingId);
    setFav(next);
    invalidateBuildingsCache();
  };

  useEffect(() => {
    const load = async () => {
      try {
        let data;
        if (isMine) {
          data = await getPersonalBuilding(buildingId);
        } else {
          data = await getBuilding(buildingId);
          if (data) {
            const note = await getPersonalNote(buildingId);
            if (note) {
              data.publicMemo = data.memo || '';
              data.publicMemo2 = data.memo2 || '';
              data.memo = note.memo || data.memo || '';
              data.memo2 = note.memo2 || data.memo2 || '';
              data.hasPersonalNote = true;
            }
          }
        }

        if (!data) {
          Alert.alert('건물 없음', '이 건물을 찾을 수 없습니다.');
          navigation.goBack();
          return;
        }

        if (data.location) {
          data.location = {
            lat: parseFloat(String(data.location.lat)),
            lng: parseFloat(String(data.location.lng))
          };
        }
        setBuilding(data);
      } catch (e) {
        console.log('[DETAIL] 불러오기 실패:', e?.message);
        Alert.alert('오류', '건물 정보를 불러오지 못했습니다.');
        navigation.goBack();
      }
    };
    load();
  }, [buildingId]);

  // ── 사진 (공용 건물 + 어드민만) ────────────────────────
  // 업로드는 [저장]을 누를 때 한 번에 한다.
  // 고르자마자 올려버리면, 취소하고 나갔을 때 서버에만 파일이 남는다.
  const canEditPhotos = !isMine && isAdmin;
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [removedPhotos, setRemovedPhotos] = useState([]);

  const shownImages = (building?.images || []).filter(u => !removedPhotos.includes(u));

  const addPhotos = async (fromCamera) => {
    try {
      const picked = fromCamera
        ? [await takePhoto()].filter(Boolean)
        : await pickImages(5);
      if (picked.length === 0) return;
      setPendingPhotos(p => [...p, ...picked]);
    } catch (e) {
      Alert.alert('오류', e?.message || '사진을 가져오지 못했습니다.');
    }
  };

  const markRemove = (url) => setRemovedPhotos(p => [...p, url]);
  const undoRemove = (url) => setRemovedPhotos(p => p.filter(u => u !== url));
  const dropPending = (idx) => setPendingPhotos(p => p.filter((_, i) => i !== idx));
  const resetPhotoEdits = () => { setPendingPhotos([]); setRemovedPhotos([]); };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 사진 먼저 처리한다. 업로드가 실패하면 글자도 저장하지 않는다.
      let nextImages = building.images || [];
      if (canEditPhotos && (pendingPhotos.length > 0 || removedPhotos.length > 0)) {
        let uploaded = [];
        if (pendingPhotos.length > 0) {
          setSaveMsg('사진 올리는 중...');
          uploaded = await uploadBuildingImages(
            buildingId, pendingPhotos,
            (cur, total, pct) => setSaveMsg(`사진 ${cur}/${total} · ${pct}%`)
          );
        }
        nextImages = [...shownImages, ...uploaded];
      }

      // Firebase는 undefined를 저장하지 못한다.
      // 한 번도 입력한 적 없는 칸은 값이 아예 없으므로 빈 문자열로 채운다.
      const payload = {
        ...building,
        name: building.name || '',
        memo: building.memo || '',
        memo2: building.memo2 || '',
        note: building.note || '',
        shortcut: building.shortcut || '',
        images: nextImages,
        timestamp: Date.now(),
      };

      if (isMine) {
        await savePersonalBuilding(payload);
      } else if (isAdmin) {
        await updateBuilding(payload);
      } else {
        // 일반 사용자가 공용 건물을 수정 → 출입 정보만 내 폰에 붙인다.
        await savePersonalNote(buildingId, {
          memo: building.memo, memo2: building.memo2,
        });
      }

      // DB 반영이 끝난 뒤에 Storage 파일을 지운다.
      for (const url of removedPhotos) {
        await deleteImageByUrl(url);
      }

      setBuilding(p => ({ ...p, images: nextImages }));
      resetPhotoEdits();
      invalidateBuildingsCache();
      setEditMode(false);
      setLocationChanged(false);
      setSaveMsg('저장 완료');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch (e) {
      Alert.alert('오류', '저장 실패: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    const photoCount = building?.images?.length || 0;
    const msg = isMine
      ? '내 폰에서 삭제합니다.'
      : '공용 데이터에서 삭제합니다. 모든 사용자에게 영향이 갑니다.'
        + (photoCount > 0 ? `\n사진 ${photoCount}장도 함께 삭제됩니다.` : '');

    Alert.alert('삭제 확인', msg, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          try {
            if (isMine) {
              await deletePersonalBuilding(buildingId);
            } else {
              for (const url of (building.images || [])) {
                await deleteImageByUrl(url);
              }
              await deleteBuilding(buildingId);
            }
            invalidateBuildingsCache();
            navigation.goBack();
          } catch (e) {
            Alert.alert('오류', '삭제 실패: ' + e.message);
          }
        }
      }
    ]);
  };

  // 내 건물을 공용으로 올린다. 출입 정보는 빼고 올라간다.
  const handlePromote = () => {
    Alert.alert(
      '공용으로 올리기',
      `"${building.name}"을(를) 모든 사용자가 볼 수 있게 올립니다.\n\n` +
      '출입 정보(비밀번호)는 올라가지 않고 내 폰에만 남습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '올리기',
          onPress: async () => {
            setSaving(true);
            try {
              const newId = await promoteToPublic({ ...building, id: buildingId });
              if (fav) {
                await setFavorite(buildingId, false);
                await setFavorite(newId, true);
              }
              invalidateBuildingsCache();
              Alert.alert('완료', `공용 데이터로 올렸습니다.\n\n새 번호: ${newId}`);
              navigation.goBack();
            } catch (e) {
              Alert.alert('오류', '올리기 실패: ' + e.message);
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  const handleShare = () => {
    const lines = [building.name];
    if (building.memo) lines.push(`출입: ${building.memo}`);
    if (building.memo2) lines.push(`백업: ${building.memo2}`);
    if (building.shortcut) lines.push(`샛길: ${building.shortcut}`);
    if (building.note) lines.push(`특이사항: ${building.note}`);
    Share.share({ message: lines.join('\n') }).catch(() => {});
  };

  const copyMemo = () => copyBuildingMemo(building);

  if (!building) {
    return (
      <View style={s.screen}>
        <ActivityIndicator size="large" color={c.accent} style={{ marginTop: 60 }} />
      </View>
    );
  }

  const set = (k, v) => setBuilding(p => ({ ...p, [k]: v }));

  return (
    <>
      <View style={s.screen}>
        {/* 헤더 */}
        <View style={[s.header, { paddingTop: insets.top + space.sm }]}>
          <TouchableOpacity style={s.iconBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={24} color={c.textSub} />
          </TouchableOpacity>
          <View style={s.headerMid}>
            <Icon
              name={isMine ? 'lock-outline' : 'web'}
              size={15}
              color={isMine ? c.accent : c.publicColor}
            />
            <Text style={s.headerScope}>
              {isMine ? '내 폰에만 저장됨' : '공용 데이터'}
              {building.hasPersonalNote ? ' · 내 메모' : ''}
            </Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={onToggleFav}>
            <Icon
              name={fav ? 'star' : 'star-outline'}
              size={24}
              color={fav ? c.star : c.textSub}
            />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 40 }}
            keyboardShouldPersistTaps="handled"
          >

            {editMode ? (
              <>
                {!isMine && isAdmin && (
                  <View style={s.warnBox}>
                    <Text style={s.warnText}>
                      공용 데이터를 수정합니다. 출입 정보를 넣으면 모든 사용자에게 공개됩니다.
                    </Text>
                  </View>
                )}
                {!isMine && !isAdmin && (
                  <View style={s.noteBox}>
                    <Text style={s.noteText}>
                      출입 정보만 내 폰에 저장됩니다. 다른 항목은 바뀌지 않습니다.
                    </Text>
                  </View>
                )}

                <Text style={s.label}>건물 이름</Text>
                <TextInput
                  style={s.input}
                  value={building.name}
                  onChangeText={v => set('name', v.slice(0, 25))}
                  maxLength={25}
                  placeholderTextColor={c.textFaint}
                />

                <Text style={s.label}>출입 정보</Text>
                <TextInput
                  style={[s.input, s.inputMono]}
                  value={building.memo}
                  onChangeText={v => set('memo', v)}
                  placeholder="비밀번호 등"
                  placeholderTextColor={c.textFaint}
                  multiline
                />

                <Text style={s.label}>출입 정보 2 (백업)</Text>
                <TextInput
                  style={[s.input, s.inputMono]}
                  value={building.memo2}
                  onChangeText={v => set('memo2', v)}
                  placeholder="비번이 바뀔 때를 대비한 예비"
                  placeholderTextColor={c.textFaint}
                  multiline
                />

                <Text style={s.label}>샛길 정보</Text>
                <TextInput
                  style={[s.input, s.inputMulti]}
                  value={building.shortcut}
                  onChangeText={v => set('shortcut', v)}
                  multiline
                  placeholderTextColor={c.textFaint}
                />

                <Text style={s.label}>특이사항</Text>
                <TextInput
                  style={[s.input, s.inputMulti]}
                  value={building.note}
                  onChangeText={v => set('note', v)}
                  multiline
                  placeholderTextColor={c.textFaint}
                />

                {/* 사진 — 공용 건물 + 어드민만 */}
                {canEditPhotos && (
                  <>
                    <Text style={s.label}>
                      사진 · 배치도 ({shownImages.length + pendingPhotos.length})
                    </Text>

                    {(building.images || []).map((url, i) => {
                      const marked = removedPhotos.includes(url);
                      return (
                        <View key={'old' + i} style={s.photoRow}>
                          <Image
                            source={{ uri: url }}
                            style={[s.photoThumb, marked && s.photoThumbOff]}
                          />
                          {marked ? (
                            <TouchableOpacity style={s.photoUndo} onPress={() => undoRemove(url)}>
                              <Text style={s.photoUndoText}>되돌리기</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity style={s.photoDel} onPress={() => markRemove(url)}>
                              <Icon name="close" size={16} color={c.danger} />
                              <Text style={s.photoDelText}>삭제</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}

                    {pendingPhotos.map((uri, i) => (
                      <View key={'new' + i} style={s.photoRow}>
                        <Image source={{ uri }} style={s.photoThumb} />
                        <View style={s.newTag}><Text style={s.newTagText}>새 사진</Text></View>
                        <TouchableOpacity style={s.photoDel} onPress={() => dropPending(i)}>
                          <Icon name="close" size={16} color={c.danger} />
                          <Text style={s.photoDelText}>빼기</Text>
                        </TouchableOpacity>
                      </View>
                    ))}

                    <View style={s.btnRow}>
                      <TouchableOpacity style={s.btnSub} onPress={() => addPhotos(true)}>
                        <Icon name="camera-outline" size={18} color={c.accent} />
                        <Text style={s.btnSubText}>찍기</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.btnSub} onPress={() => addPhotos(false)}>
                        <Icon name="image-outline" size={18} color={c.accent} />
                        <Text style={s.btnSubText}>앨범에서</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {/* 위치 */}
                <Text style={s.label}>위치</Text>
                <View style={s.locBox}>
                  {building.location ? (
                    <Text style={s.locOk}>
                      {Number(building.location.lat).toFixed(6)}, {Number(building.location.lng).toFixed(6)}
                      {locationChanged ? '  (변경됨)' : ''}
                    </Text>
                  ) : (
                    <Text style={s.locNone}>
                      위치가 없습니다. 넣어야 근처에 갔을 때 알림이 뜹니다.
                    </Text>
                  )}
                  <TouchableOpacity
                    style={s.btnSub}
                    onPress={() => navigation.navigate('LocationPicker', {
                      initialLocation: building.location,
                      onPicked: (loc) => { set('location', loc); setLocationChanged(true); },
                    })}
                  >
                    <Icon name="map-marker-outline" size={18} color={c.accent} />
                    <Text style={s.btnSubText}>지도에서 위치 지정</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[s.btnPrimary, saving && s.btnOff]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving
                    ? <View style={s.savingRow}>
                        <ActivityIndicator color={c.onAccent} />
                        <Text style={s.btnPrimaryText}>{saveMsg || '저장 중...'}</Text>
                      </View>
                    : <Text style={s.btnPrimaryText}>저장</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.btnPlain}
                  onPress={() => {
                    setEditMode(false); setLocationChanged(false); resetPhotoEdits();
                  }}
                >
                  <Text style={s.btnPlainText}>취소</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.name}>{building.name}</Text>

                {/* 비번 — 라이더가 제일 급하게 보는 것이라 크게 보여준다 */}
                <TouchableOpacity style={s.memoCard} onPress={copyMemo} activeOpacity={0.8}>
                  <View style={s.memoHead}>
                    <Text style={s.memoLabel}>출입 정보</Text>
                    <Icon name="content-copy" size={18} color={c.textSub} />
                  </View>
                  <Text style={s.memoValue}>{building.memo || '없음'}</Text>
                  {!!building.memo2 && (
                    <>
                      <Text style={[s.memoLabel, { marginTop: 12 }]}>백업</Text>
                      <Text style={s.memoBackup}>{building.memo2}</Text>
                    </>
                  )}
                </TouchableOpacity>

                {!!building.shortcut && (
                  <View style={s.infoBox}>
                    <Text style={s.infoLabel}>샛길 정보</Text>
                    <Text style={s.infoValue}>{building.shortcut}</Text>
                  </View>
                )}
                {!!building.note && (
                  <View style={s.infoBox}>
                    <Text style={s.infoLabel}>특이사항</Text>
                    <Text style={s.infoValue}>{building.note}</Text>
                  </View>
                )}
                {building.location && (
                  <View style={s.infoBox}>
                    <Text style={s.infoLabel}>위치</Text>
                    <Text style={s.infoValue}>
                      {building.location.lat?.toFixed(6)}, {building.location.lng?.toFixed(6)}
                    </Text>
                  </View>
                )}

                {/* 사진 */}
                {building.images?.length > 0 && (
                  <View style={s.imageSection}>
                    <Text style={s.infoLabel}>사진 · 배치도 ({building.images.length})</Text>
                    {building.images.map((img, i) => (
                      <TouchableOpacity
                        key={i}
                        activeOpacity={0.85}
                        onPress={() => { setViewerIndex(i); setViewerOpen(true); }}
                      >
                        <Image source={{ uri: img }} style={s.image} resizeMode="contain" />
                        <View style={s.imageBadge}>
                          <Icon name="magnify-plus-outline" size={14} color="#fff" />
                          <Text style={s.imageBadgeText}>크게 보기</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {isMine && (
                  <View style={s.noteBox}>
                    <Text style={s.noteText}>
                      사진은 공용 건물에만 등록됩니다.{'\n'}
                      다른 라이더에게도 도움이 될 정보라면 제보하기로 보내주세요.
                    </Text>
                  </View>
                )}

                {/* 버튼들 */}
                <View style={s.btnRow}>
                  <TouchableOpacity style={s.btnSub} onPress={handleShare}>
                    <Icon name="share-variant-outline" size={18} color={c.accent} />
                    <Text style={s.btnSubText}>공유</Text>
                  </TouchableOpacity>
                  {(isMine || isAdmin) && (
                    <TouchableOpacity style={s.btnSub} onPress={() => setEditMode(true)}>
                      <Icon name="pencil-outline" size={18} color={c.accent} />
                      <Text style={s.btnSubText}>수정</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {!isMine && !isAdmin && (
                  <TouchableOpacity style={s.btnPrimary} onPress={() => setEditMode(true)}>
                    <Text style={s.btnPrimaryText}>내 출입정보 입력</Text>
                  </TouchableOpacity>
                )}

                {isMine && isAdmin && (
                  <TouchableOpacity style={s.btnPromote} onPress={handlePromote} disabled={saving}>
                    <Icon name="web" size={18} color={c.warn} />
                    <Text style={s.btnPromoteText}>공용으로 올리기</Text>
                  </TouchableOpacity>
                )}

                {(isMine || isAdmin) && (
                  <TouchableOpacity style={s.btnDelete} onPress={handleDelete}>
                    <Text style={s.btnDeleteText}>삭제</Text>
                  </TouchableOpacity>
                )}

                {!!saveMsg && <Text style={s.savedMsg}>{saveMsg}</Text>}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* Modal은 ScrollView 밖에 둬야 터치(핀치)를 뺏기지 않는다 */}
      <ImageViewer
        visible={viewerOpen}
        images={building.images || []}
        startIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />
    </>
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

const makeStyles = (c, font, space, radius, TAP) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.sm, paddingBottom: space.sm,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerMid: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  headerScope: { ...font.sub, color: c.textSub },

  name: { ...font.title, color: c.text, marginBottom: space.lg },

  // 출입 정보 — 라이더가 제일 급하게 보는 것이라 가장 크게
  memoCard: {
    backgroundColor: c.surface, borderRadius: radius.lg,
    padding: space.lg, marginBottom: space.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  memoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memoLabel: { ...font.sub, color: c.textMuted },
  memoValue: {
    fontSize: 30, fontWeight: '500', color: c.text, marginTop: 6,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
  },
  memoBackup: {
    fontSize: 20, fontWeight: '400', color: c.warn, marginTop: 4,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
  },

  infoBox: {
    backgroundColor: c.surface, borderRadius: radius.md,
    padding: space.md + 2, marginBottom: space.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.line,
  },
  infoLabel: { ...font.sub, color: c.textMuted, marginBottom: 4 },
  infoValue: { ...font.body, color: c.text, lineHeight: 22 },

  imageSection: { marginTop: space.md },
  image: {
    width: '100%', height: 260, borderRadius: radius.md,
    backgroundColor: c.surfaceSoft, marginTop: space.sm,
  },
  imageBadge: {
    position: 'absolute', right: space.sm, bottom: space.sm,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: space.sm + 2, paddingVertical: 5, borderRadius: radius.pill,
  },
  imageBadgeText: { color: '#fff', ...font.tiny },

  label: { ...font.sub, color: c.textSub, marginTop: space.lg, marginBottom: 6 },
  input: {
    backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.lineStrong, borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.md,
    ...font.body, color: c.text,
  },
  inputMono: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', fontSize: 18 },
  inputMulti: { minHeight: 84, textAlignVertical: 'top' },

  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  photoThumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: c.surfaceSoft },
  photoThumbOff: { opacity: 0.3 },
  newTag: {
    backgroundColor: c.accentSoft, paddingHorizontal: space.sm, paddingVertical: 3,
    borderRadius: radius.pill,
  },
  newTagText: { ...font.tiny, fontWeight: '500', color: c.accent },
  photoDel: {
    marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: c.dangerSoft, paddingHorizontal: space.md,
    minHeight: 40, justifyContent: 'center', borderRadius: radius.sm,
  },
  photoDelText: { ...font.sub, fontWeight: '500', color: c.danger },
  photoUndo: {
    marginLeft: 'auto', backgroundColor: c.surfaceSoft,
    paddingHorizontal: space.md, minHeight: 40, justifyContent: 'center', borderRadius: radius.sm,
  },
  photoUndoText: { ...font.sub, fontWeight: '500', color: c.textSub },

  locBox: {
    backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.lineStrong, borderRadius: radius.md, padding: space.md,
  },
  locOk: { ...font.sub, color: c.accent, fontWeight: '500', marginBottom: space.sm },
  locNone: { ...font.sub, color: c.warn, lineHeight: 19, marginBottom: space.sm },

  warnBox: {
    backgroundColor: c.dangerSoft, borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.danger, borderRadius: radius.md, padding: space.md,
  },
  warnText: { ...font.sub, color: c.danger, lineHeight: 20 },
  noteBox: {
    backgroundColor: c.accentSoft, borderRadius: radius.md,
    padding: space.md, marginTop: space.md,
  },
  noteText: { ...font.sub, color: c.accent, lineHeight: 20 },

  btnRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  btnSub: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: TAP, borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  btnSubText: { ...font.body, fontWeight: '500', color: c.accent },

  btnPrimary: {
    minHeight: TAP + 4, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.accent, borderRadius: radius.md, marginTop: space.lg,
  },
  btnOff: { opacity: 0.7 },
  btnPrimaryText: { ...font.body, fontWeight: '500', color: c.onAccent },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },

  btnPlain: {
    minHeight: TAP, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.surfaceSoft, borderRadius: radius.md, marginTop: space.sm,
  },
  btnPlainText: { ...font.body, color: c.textSub },

  btnPromote: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: TAP, borderRadius: radius.md, marginTop: space.md,
    backgroundColor: c.warnSoft,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.warn,
  },
  btnPromoteText: { ...font.body, fontWeight: '500', color: c.warn },

  btnDelete: {
    minHeight: TAP, justifyContent: 'center', alignItems: 'center',
    borderRadius: radius.md, marginTop: space.xl,
  },
  btnDeleteText: { ...font.sub, color: c.danger },

  savedMsg: { ...font.sub, color: c.accent, textAlign: 'center', marginTop: space.md },
});