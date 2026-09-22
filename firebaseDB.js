/**
 * firebaseDB.js
 * IndexedDB + 암호화 동기화를 제거하고 Firebase Realtime DB 직접 사용
 *
 * ── 버전 캐시 (2026-09-22 추가) ──────────────────────────
 *  공용 건물·강력알림은 목록 전체를 폰(AsyncStorage)에 저장해두고,
 *  서버의 meta/{종류}Version 숫자 하나만 확인해서 바뀌었을 때만 다시 받는다.
 *    - 데이터 사용량 : 안 바뀌었으면 다운로드 0
 *    - 오프라인      : 폰에 저장된 목록으로 동작 (토스트·경고음 유지)
 *  저장·수정·삭제를 하면 버전 숫자도 같이 바꾼다.
 *
 *  ⚠️ 콘솔이나 파이썬 스크립트로 데이터를 직접 넣을 때는
 *     meta/alertsVersion 또는 meta/buildingsVersion 도 반드시 바꿀 것.
 *     안 바꾸면 라이더 폰은 옛날 목록을 계속 쓴다. (서울청 자료 입력 때 주의)
 *
 *  ⚠️ 버전은 "크기"가 아니라 "같은지"만 본다.
 *     어드민 폰 시계가 틀려도 숫자만 바뀌면 새로 받는다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';   // ★ 새 줄
import { db } from './firebase';
import { ref, get, set, update, remove, push, onValue, off } from 'firebase/database';

const BUILDINGS_PATH = 'buildings';
const ALERTS_PATH = 'alerts';
const META_PATH = 'meta';                                               // ★ 새 줄

// 서버가 대답이 없으면 정해진 시간 뒤 포기 (비행기모드·지하 무한 로딩 방지)
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(label + ' 응답 없음')), ms)
    ),
  ]);

// ─────────────────────────────────────────────────────────
//  ★ 새 블록 — 버전 캐시
// ─────────────────────────────────────────────────────────

// 서버 데이터 → 목록
const toList = (val) =>
  Object.entries(val || {})
    .filter(([_, data]) => data !== null)
    .map(([id, data]) => ({ id, ...data }));

// 폰에 저장된 목록 읽기. 없거나 깨졌으면 null
const readSaved = async (dataKey) => {
  try {
    const raw = await AsyncStorage.getItem(dataKey);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

// 쓰기 직후 버전 숫자를 바꾼다. 실패해도 저장 자체는 막지 않는다.
// migration.js의 일괄 삭제처럼 이 파일 밖에서 직접 쓰는 곳도 이걸 부른다.
export const bumpVersion = async (kind) => {
  try {
    await set(ref(db, `${META_PATH}/${kind}Version`), Date.now());
  } catch (e) {
    console.log(`[CACHE] ${kind} 버전 갱신 실패 (보안 규칙 확인):`, e?.message);
  }
};

// kind: 'buildings' | 'alerts'
const loadVersioned = async (kind, path) => {
  const versionKey = `cache_${kind}_version`;
  const dataKey = `cache_${kind}_data`;

  // ① 서버 버전 숫자만 확인 (4초 제한)
  let serverV = null;
  try {
    const snap = await withTimeout(
      get(ref(db, `${META_PATH}/${kind}Version`)), 4000, `${kind} 버전`
    );
    serverV = snap.exists() ? String(snap.val()) : null;
  } catch (e) {
    // 인터넷 없음 → 폰에 저장된 목록으로
    const saved = await readSaved(dataKey);
    if (saved) {
      console.log(`[CACHE] ${kind} 오프라인 → 저장된 ${saved.length}개 사용`);
      return saved;
    }
    throw e;
  }

  // ② 버전이 같으면 폰에 저장된 목록 그대로 (다운로드 0)
  if (serverV) {
    let localV = null;
    try { localV = await AsyncStorage.getItem(versionKey); } catch (e) {}
    if (localV === serverV) {
      const saved = await readSaved(dataKey);
      if (saved) {
        console.log(`[CACHE] ${kind} 버전 같음 → 저장된 ${saved.length}개 사용`);
        return saved;
      }
    }
  }

  // ③ 버전이 다르거나 처음 → 전체 받아서 폰에 저장 (6초 제한)
  try {
    const snap = await withTimeout(get(ref(db, path)), 6000, kind);
    const list = snap.exists() ? toList(snap.val()) : [];
    try {
      // 목록 먼저, 버전은 나중에 — 중간에 끊겨도 다음에 다시 받게 된다
      await AsyncStorage.setItem(dataKey, JSON.stringify(list));
      if (serverV) await AsyncStorage.setItem(versionKey, serverV);
      else await AsyncStorage.removeItem(versionKey);
    } catch (e) {
      console.log(`[CACHE] ${kind} 폰 저장 실패`, e?.message);
    }
    console.log(`[CACHE] ${kind} 새로 받음 ${list.length}개 (버전 ${serverV || '없음'})`);
    return list;
  } catch (e) {
    const saved = await readSaved(dataKey);
    if (saved) {
      console.log(`[CACHE] ${kind} 받기 실패 → 저장된 ${saved.length}개 사용`);
      return saved;
    }
    throw e;
  }
};
// ★ 새 블록 끝

// ── 건물 목록 전체 가져오기 ──
// ★ 바뀐 부분 — 버전 캐시를 거친다. 부르는 쪽은 고칠 필요 없음
export const getAllBuildings = async () => {
  return await loadVersioned('buildings', BUILDINGS_PATH);
};

// ── 건물 단건 가져오기 ──
export const getBuilding = async (id) => {
  const snapshot = await get(ref(db, `${BUILDINGS_PATH}/${id}`));
  if (!snapshot.exists()) return null;
  return { id, ...snapshot.val() };
};

// ── 건물 저장 (신규) ──
export const saveBuilding = async (building) => {
  const { id, ...data } = building;
  if (id) {
    // id가 이미 있으면 해당 경로에 저장
    await set(ref(db, `${BUILDINGS_PATH}/${id}`), {
      ...data,
      timestamp: data.timestamp || Date.now()
    });
    await bumpVersion('buildings');                                     // ★ 새 줄
    return id;
  } else {
    // 신규 등록: Firebase push로 id 자동 생성
    const newRef = push(ref(db, BUILDINGS_PATH));
    await set(newRef, {
      ...data,
      timestamp: Date.now()
    });
    await bumpVersion('buildings');                                     // ★ 새 줄
    return newRef.key;
  }
};

// ── 건물 수정 ──
export const updateBuilding = async (building) => {
  const { id, ...data } = building;
  await update(ref(db, `${BUILDINGS_PATH}/${id}`), {
    ...data,
    timestamp: Date.now()
  });
  await bumpVersion('buildings');                                       // ★ 새 줄
};

// ── 건물 삭제 ──
export const deleteBuilding = async (id) => {
  await remove(ref(db, `${BUILDINGS_PATH}/${id}`));
  await bumpVersion('buildings');                                       // ★ 새 줄
};

// ── 실시간 구독 (onValue) ──
export const subscribeToBuildingsRef = (callback) => {
  const buildingsRef = ref(db, BUILDINGS_PATH);
  onValue(buildingsRef, (snapshot) => {
    if (!snapshot.exists()) { callback([]); return; }
    const list = Object.entries(snapshot.val())
      .filter(([_, data]) => data !== null)
      .map(([id, data]) => ({ id, ...data }));
    callback(list);
  });
  // 구독 해제 함수 반환
  return () => off(buildingsRef);
};

// ── 하위 호환성: 기존 코드에서 쓰는 함수들 (no-op) ──
export const syncData = async () => {};
export const initializeSync = () => {};
export const resetLocalData = async () => {};
export const resetAndSyncFromFirebase = async () => {};
export const forceCloudSync = async () => {};
export const deleteFromAllStorages = async (id) => deleteBuilding(id);
export const recoverDataFromFirebase = async () => {};

// ─────────────────────────────────────────────────────────
//  강력 알림 지점 (후방카메라 / 주차단속 등)
//
//  구조: alerts/{id} = { name, alertType, location:{lat,lng}, memo, timestamp }
//  alertType: 'rear'(후방카메라) | 'front'(전방카메라) | 'parking'(주차단속) | 'etc'
// ─────────────────────────────────────────────────────────

// ★ 바뀐 부분 — 버전 캐시를 거친다. 홈·지도·설정·토스트 전달 전부 자동 적용
export const getAllAlertPoints = async () => {
  return await loadVersioned('alerts', ALERTS_PATH);
};

export const getAlertPoint = async (id) => {
  const snapshot = await get(ref(db, `${ALERTS_PATH}/${id}`));
  if (!snapshot.exists()) return null;
  return { id, ...snapshot.val() };
};

export const saveAlertPoint = async (point) => {
  const { id, ...data } = point;
  if (id) {
    await set(ref(db, `${ALERTS_PATH}/${id}`), {
      ...data,
      timestamp: data.timestamp || Date.now()
    });
    await bumpVersion('alerts');                                        // ★ 새 줄
    return id;
  }
  const newRef = push(ref(db, ALERTS_PATH));
  await set(newRef, { ...data, timestamp: Date.now() });
  await bumpVersion('alerts');                                          // ★ 새 줄
  return newRef.key;
};

export const updateAlertPoint = async (point) => {
  const { id, ...data } = point;
  await update(ref(db, `${ALERTS_PATH}/${id}`), {
    ...data,
    timestamp: Date.now()
  });
  await bumpVersion('alerts');                                          // ★ 새 줄
};

export const deleteAlertPoint = async (id) => {
  await remove(ref(db, `${ALERTS_PATH}/${id}`));
  await bumpVersion('alerts');                                          // ★ 새 줄
};