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
        await AsyncStorage.setItem('uid', firebaseUser.uid);
        // 프로필이 없으면 만들고, 역할을 읽어온다
        await ensureUserProfile(firebaseUser);
        const r = await getRole(firebaseUser.uid);
        setRole(r);
        console.log('[ROLE] 현재 역할:', r);
      } else {
        await AsyncStorage.removeItem('uid');
        setRole(ROLE.USER);
      }
      setLoading(false);
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