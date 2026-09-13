/**
 * imageUpload.js  (신규)
 *
 * 사진 고르기 → 크기 줄이기 → Firebase Storage 업로드 까지를 한곳에 모았다.
 * 건물 사진 등록과 제보하기가 같은 부품을 쓴다.
 *
 * ── 왜 압축하는가 ───────────────────────────────────────
 *  요즘 폰 사진은 한 장에 4MB가 넘는다.
 *  1280px로 줄이고 품질 0.7로 저장하면 200KB 정도가 된다. 20배 차이다.
 *  라이더의 데이터 요금과 Storage 비용이 둘 다 20분의 1이 된다.
 *  배치도나 입구 사진은 이 정도 해상도면 충분히 알아본다.
 *
 * ── 저장 경로 ───────────────────────────────────────────
 *  images/{buildingId}/...        공용 건물 사진 (어드민만)
 *  suggestions/{uid}/...          제보 사진 (본인만)
 *  경로 규칙이 Storage 보안규칙과 짝을 이룬다. 함부로 바꾸면 업로드가 막힌다.
 */

import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, auth } from './firebase';

const MAX_WIDTH = 1280;
const QUALITY = 0.7;

// ── 권한 ─────────────────────────────────────────────────
const ensureLibraryPermission = async () => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') throw new Error('사진 접근 권한이 필요합니다.');
};

const ensureCameraPermission = async () => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') throw new Error('카메라 권한이 필요합니다.');
};

// ── 압축 ─────────────────────────────────────────────────
// expo-image-manipulator는 버전에 따라 함수 이름이 다르다.
// 압축에 실패해도 앱이 멈추면 안 되므로 원본 그대로 넘긴다.
const shrink = async (uri) => {
  try {
    if (typeof ImageManipulator.manipulateAsync === 'function') {
      const out = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_WIDTH } }],
        { compress: QUALITY, format: ImageManipulator.SaveFormat.JPEG }
      );
      return out.uri;
    }
  } catch (e) {
    console.log('[IMG] 압축 실패, 원본 사용:', e?.message);
  }
  return uri;
};

// ── 고르기 ───────────────────────────────────────────────
// max장까지 한 번에 고를 수 있다. 결과는 압축된 로컬 경로 배열.
export const pickImages = async (max = 3) => {
  await ensureLibraryPermission();

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: max > 1,
    selectionLimit: max,
    quality: 1,          // 여기서 줄이지 않는다. shrink가 더 잘 줄인다.
  });

  if (res.canceled) return [];

  const picked = (res.assets || []).slice(0, max);
  const out = [];
  for (const a of picked) {
    out.push(await shrink(a.uri));
  }
  return out;
};

// ── 찍기 ─────────────────────────────────────────────────
export const takePhoto = async () => {
  await ensureCameraPermission();

  const res = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (res.canceled) return null;

  const a = res.assets && res.assets[0];
  if (!a?.uri) return null;
  return await shrink(a.uri);
};

// ── 업로드 한 장 ─────────────────────────────────────────
// onProgress(0~100) 로 진행률을 알려준다.
const uploadOne = async (localUri, storagePath, onProgress) => {
  const resp = await fetch(localUri);
  const blob = await resp.blob();

  const fileRef = ref(storage, storagePath);
  const task = uploadBytesResumable(fileRef, blob, { contentType: 'image/jpeg' });

  await new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        if (onProgress && snap.totalBytes > 0) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      reject,
      resolve
    );
  });

  return await getDownloadURL(fileRef);
};

// ── 건물 사진 업로드 (공용, 어드민) ──────────────────────
// onProgress(현재장수, 전체장수, 이번장의 퍼센트)
export const uploadBuildingImages = async (buildingId, localUris, onProgress) => {
  const urls = [];
  const stamp = Date.now();

  for (let i = 0; i < localUris.length; i++) {
    const path = `images/${buildingId}/${stamp}_${i}.jpg`;
    const url = await uploadOne(localUris[i], path, (pct) => {
      onProgress?.(i + 1, localUris.length, pct);
    });
    urls.push(url);
  }
  return urls;
};

// ── 제보 사진 업로드 (본인 폴더) ─────────────────────────
export const uploadSuggestionImages = async (localUris, onProgress) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('로그인이 필요합니다.');

  const urls = [];
  const stamp = Date.now();

  for (let i = 0; i < localUris.length; i++) {
    const path = `suggestions/${uid}/${stamp}_${i}.jpg`;
    const url = await uploadOne(localUris[i], path, (pct) => {
      onProgress?.(i + 1, localUris.length, pct);
    });
    urls.push(url);
  }
  return urls;
};

// ── 삭제 ─────────────────────────────────────────────────
// 다운로드 주소를 그대로 넘기면 된다.
// 이미 없는 파일이어도 조용히 넘어간다 — 목록에서 빼는 게 더 중요하다.
export const deleteImageByUrl = async (url) => {
  try {
    await deleteObject(ref(storage, url));
    return true;
  } catch (e) {
    console.log('[IMG] 삭제 실패:', e?.message);
    return false;
  }
};