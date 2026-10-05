// 약관 동의 확인 (v6)
// Firebase 데이터 meta/termsVersion 숫자보다 이 폰에 저장된 동의 숫자가 작으면
// "약관이 새로 생기거나 바뀌었어요" 창을 띄운다. [동의]를 누르면 폰에만 숫자를 저장한다.
// 서버로는 아무것도 안 보낸다. (제보를 보낼 때만 제보 문서에 동의 숫자가 같이 붙는다)
//
// 약관이 바뀌면 콘솔에서 meta/termsVersion 숫자만 올리면 된다 (앱 업데이트 필요 없음).
// 인터넷이 안 되면 DEFAULT_TERMS_VERSION 기준으로 판단한다.

import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { getDatabase, ref, get } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_VERSION_CODE } from './UpdateGate';

export const TERMS_URL = 'https://richcanopy.kr/smartrider/terms/';
export const PRIVACY_URL = 'https://richcanopy.kr/smartrider/privacy/';

const KEY_AGREED = 'terms_agreed_version';
const DEFAULT_TERMS_VERSION = 1;

// 4초 안에 답이 없으면 포기
const withTimeout = (p, ms) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);

// 이 폰에서 동의한 약관 숫자. 동의한 적 없으면 0
export const getAgreedTermsVersion = async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY_AGREED);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
};

const readMeta = async (key) => {
  const snap = await withTimeout(get(ref(getDatabase(), `meta/${key}`)), 4000);
  return snap.val();
};

export default function TermsGate() {
  const [need, setNeed] = useState(false);
  const [required, setRequired] = useState(DEFAULT_TERMS_VERSION);

  useEffect(() => {
    (async () => {
      let req = DEFAULT_TERMS_VERSION;
      try {
        // 업데이트가 필요한 폰이면 업데이트 창(UpdateGate)이 먼저다. 약관 창은 안 띄운다.
        const min = await readMeta('minVersionCode');
        if (typeof min === 'number' && APP_VERSION_CODE < min) return;
        const v = await readMeta('termsVersion');
        if (typeof v === 'number') req = v;
      } catch (e) {
        console.log('[TermsGate] 서버 확인 실패 → 기본값', e?.message);
      }
      const agreed = await getAgreedTermsVersion();
      setRequired(req);
      if (agreed < req) setNeed(true);
    })();
  }, []);

  const agree = async () => {
    try {
      await AsyncStorage.setItem(KEY_AGREED, String(required));
    } catch (e) {
      console.log('[TermsGate] 저장 실패', e?.message);
    }
    setNeed(false);
  };

  const open = (url) => Linking.openURL(url).catch(() => {});

  return (
    <Modal
      visible={need}
      transparent
      animationType="fade"
      onRequestClose={() => {}}   // 뒤로가기로 못 닫게
    >
      <View style={s.overlay}>
        <View style={s.box}>
          <Text style={s.title}>약관 안내</Text>
          <Text style={s.desc}>
            이용약관과 개인정보처리방침이 새로 생기거나 바뀌었어요.{'\n'}
            내용을 확인하고 동의해 주세요.
          </Text>
          <TouchableOpacity style={s.link} onPress={() => open(TERMS_URL)}>
            <Text style={s.linkText}>이용약관 보기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.link} onPress={() => open(PRIVACY_URL)}>
            <Text style={s.linkText}>개인정보처리방침 보기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btn} onPress={agree}>
            <Text style={s.btnText}>동의</Text>
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
  desc: { fontSize: 16, color: '#444', lineHeight: 24, marginBottom: 16 },
  link: { paddingVertical: 10 },
  linkText: { fontSize: 16, color: '#075B4B', fontWeight: 'bold', textDecorationLine: 'underline' },
  btn: {
    backgroundColor: '#075B4B', borderRadius: 12, height: 52, marginTop: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});
