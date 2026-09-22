import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from './firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRole, ensureUserProfile, ROLE, isAdmin as checkAdmin, isSuper as checkSuper } from './roles';

// ★ 새 줄 — 서버가 대답이 없으면 정해진 시간 뒤 포기 (비행기모드·지하에서 빈 화면 방지)
const withTimeout = (promise, ms, label) =>                             // ★ 새 줄
  Promise.race([                                                        // ★ 새 줄
    promise,                                                            // ★ 새 줄
    new Promise((_, reject) =>                                          // ★ 새 줄
      setTimeout(() => reject(new Error(label + ' 응답 없음')), ms)      // ★ 새 줄
    ),                                                                  // ★ 새 줄
  ]);                                                                   // ★ 새 줄

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(ROLE.USER);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try { await AsyncStorage.setItem('uid', firebaseUser.uid); } catch (e) {}   // ★ 바뀐 줄

        // ★ 새 줄 — ① 폰에 저장해둔 역할로 먼저 화면을 연다 (서버 안 기다림)
        const roleKey = 'role_' + firebaseUser.uid;                                // ★ 새 줄
        try {                                                                      // ★ 새 줄
          const cached = await AsyncStorage.getItem(roleKey);                      // ★ 새 줄
          if (cached) setRole(cached);                                             // ★ 새 줄
        } catch (e) {}                                                             // ★ 새 줄
        setLoading(false);                                                         // ★ 새 줄

        // ★ 새 줄 — ② 서버에서 최신 역할 확인. 대답 없으면 저장된 역할 그대로 쓴다
        try {                                                                      // ★ 새 줄
          await withTimeout(ensureUserProfile(firebaseUser), 6000, '프로필');       // ★ 새 줄
          const r = await withTimeout(getRole(firebaseUser.uid), 6000, '역할');     // ★ 새 줄
          if (r) {                                                                 // ★ 새 줄
            setRole(r);                                                            // ★ 새 줄
            await AsyncStorage.setItem(roleKey, String(r));                        // ★ 새 줄
          }                                                                        // ★ 새 줄
          console.log('[ROLE] 현재 역할:', r);
        } catch (e) {                                                              // ★ 새 줄
          console.log('[ROLE] 서버 확인 실패, 저장된 역할 사용:', e?.message);        // ★ 새 줄
        }                                                                          // ★ 새 줄
      } else {
        try { await AsyncStorage.removeItem('uid'); } catch (e) {}                 // ★ 바뀐 줄
        setRole(ROLE.USER);
        setLoading(false);                                                         // ★ 새 줄
      }
    });
    return unsubscribe;
  }, []);

  const signInWithEmail = async (email, password) => {
    return await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpWithEmail = async (email, password) => {
    return await createUserWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value = {
    user,
    role,
    // 화면에서는 이 두 값만 보면 된다
    isAdmin: checkAdmin(role),
    isSuper: checkSuper(role),
    signInWithEmail,
    signUpWithEmail,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}