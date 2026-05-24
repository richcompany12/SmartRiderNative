/**
 * firebaseDB.js
 * IndexedDB + 암호화 동기화를 제거하고 Firebase Realtime DB 직접 사용
 */

import { db } from './firebase';
import { ref, get, set, update, remove, push, onValue, off } from 'firebase/database';

const BUILDINGS_PATH = 'buildings';

// ── 건물 목록 전체 가져오기 ──
export const getAllBuildings = async () => {
  const snapshot = await get(ref(db, BUILDINGS_PATH));
  if (!snapshot.exists()) return [];
  return Object.entries(snapshot.val())
    .filter(([_, data]) => data !== null)
    .map(([id, data]) => ({ id, ...data }));
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
    return id;
  } else {
    // 신규 등록: Firebase push로 id 자동 생성
    const newRef = push(ref(db, BUILDINGS_PATH));
    await set(newRef, {
      ...data,
      timestamp: Date.now()
    });
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
};

// ── 건물 삭제 ──
export const deleteBuilding = async (id) => {
  await remove(ref(db, `${BUILDINGS_PATH}/${id}`));
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

// ── 알림 지점 (alerts) — 일단 메모리에만 보관 ──
let _alertPoints = [];
export const saveAlertPoint = async (data) => {
  _alertPoints = _alertPoints.filter(a => a.id !== data.id);
  _alertPoints.push(data);
};
export const getAllAlertPoints = async () => _alertPoints;
export const deleteAlertPoint = async (id) => {
  _alertPoints = _alertPoints.filter(a => a.id !== id);
};
