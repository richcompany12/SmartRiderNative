/**
 * firebase.js  (교체)
 *
 * ★ 09-13 수정: 로그인 세션 유지
 *
 *   기존에는 getAuth(app) 만 썼다. 이러면 앱을 완전히 종료할 때마다
 *   로그인 상태가 사라져서 켤 때마다 다시 로그인해야 한다.
 *   (웹 브라우저는 알아서 기억해주지만, 앱에는 그 저장소가 없다.)
 *
 *   initializeAuth + getReactNativePersistence(AsyncStorage) 로 바꾸면
 *   Firebase가 로그인 토큰을 폰에 저장해두고 다음에 자동으로 불러온다.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// firebase 버전에 따라 함수 위치가 조금씩 달라서 통째로 가져온다.
import * as firebaseAuth from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDBINhRyBEzIkDc5dK9GUdHE74q3TnaPyo",
  authDomain: "building-access-project.firebaseapp.com",
  databaseURL: "https://building-access-project-default-rtdb.firebaseio.com",
  projectId: "building-access-project",
  storageBucket: "building-access-project.appspot.com",
  messagingSenderId: "187177864249",
  appId: "1:187177864249:web:3c45f591793521643051e8"
};

// 이미 초기화돼 있으면 그걸 쓴다 (Fast Refresh 대비)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = getDatabase(app);
export const storage = getStorage(app);

// ── 로그인 저장소 설정 ───────────────────────────────────
function createAuth() {
  const rnPersistence = firebaseAuth.getReactNativePersistence;

  if (typeof rnPersistence === 'function') {
    try {
      const a = firebaseAuth.initializeAuth(app, {
        persistence: rnPersistence(AsyncStorage),
      });
      console.log('[AUTH] 로그인 유지 켜짐');
      return a;
    } catch (e) {
      // 이미 initializeAuth가 한 번 불린 경우 여기로 온다. 정상 상황.
      console.log('[AUTH] 이미 초기화됨, 기존 것 사용');
    }
  } else {
    // 이게 뜨면 firebase 버전 문제다. 로그인이 유지되지 않는다.
    console.warn('[AUTH] getReactNativePersistence 없음 — firebase 버전 확인 필요');
  }

  return firebaseAuth.getAuth(app);
}

export const auth = createAuth();

// ── 기존 함수 그대로 유지 ────────────────────────────────
export const getFirebaseBuildings = async () => {
  try {
    const buildingsRef = ref(db, 'buildings');
    const snapshot = await get(buildingsRef);
    if (snapshot.exists()) {
      return Object.entries(snapshot.val())
        .filter(([_, data]) => data !== null)
        .map(([id, data]) => ({ id, ...data }));
    }
  } catch (error) {
    console.error('Firebase data fetch failed:', error);
  }
  return [];
};