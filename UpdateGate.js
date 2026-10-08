// 최소 버전 스위치
// Firebase 데이터 meta/minVersionCode 숫자보다 이 앱 버전이 낮으면
// "업데이트 해주세요" 창을 띄우고 닫을 수 없게 한다.
// 숫자가 없거나 인터넷이 안 되면 그냥 통과한다 (라이더 일을 막지 않는다).

import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { getDatabase, ref, get } from 'firebase/database';

// ⚠️ 빌드할 때마다 android\app\build.gradle 의 versionCode 와 똑같이 맞출 것
export const APP_VERSION_CODE = 6;   // ★ 5 → 6 (v6)

const PKG = 'com.richcompany.smartridernative3';
const STORE_APP = `market://details?id=${PKG}`;
const STORE_WEB = `https://play.google.com/store/apps/details?id=${PKG}`;

// 4초 안에 답이 없으면 포기하고 통과
const withTimeout = (p, ms) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);

export default function UpdateGate() {
  const [need, setNeed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await withTimeout(get(ref(getDatabase(), 'meta/minVersionCode')), 4000);
        const min = snap.val();
        if (typeof min === 'number' && APP_VERSION_CODE < min) setNeed(true);
      } catch (e) {
        console.log('[UpdateGate] 확인 실패 → 통과', e?.message);
      }
    })();
  }, []);

  const openStore = () => {
    Linking.openURL(STORE_APP).catch(() => Linking.openURL(STORE_WEB));
  };

  return (
    <Modal
      visible={need}
      transparent
      animationType="fade"
      onRequestClose={() => {}}   // 뒤로가기로 못 닫게
    >
      <View style={s.overlay}>
        <View style={s.box}>
          <Text style={s.title}>새 버전이 나왔어요</Text>
          <Text style={s.desc}>
            더 정확한 알림을 위해 업데이트가 필요합니다.{'\n'}
            플레이스토어에서 업데이트한 뒤 다시 열어주세요.
          </Text>
          <TouchableOpacity style={s.btn} onPress={openStore}>
            <Text style={s.btnText}>업데이트 하러 가기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', padding: 24,
  },
  box: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 12 },
  desc: { fontSize: 16, color: '#444', lineHeight: 24, marginBottom: 20 },
  btn: {
    backgroundColor: '#075B4B', borderRadius: 12, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});