import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Linking   
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../AuthContext';
import { useTheme } from '../theme';

export default function LoginScreen() {
  const { signInWithEmail, signUpWithEmail } = useAuth();
  const insets = useSafeAreaInsets();
  const { c, font, space, radius, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius, TAP), [c]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력해주세요.');
      return;
    }
    setLoading(true); setError('');
    try {
      if (isSignUp) await signUpWithEmail(email.trim(), password);
      else await signInWithEmail(email.trim(), password);
      // 성공하면 AuthContext가 user를 채우고 App.js가 화면을 바꾼다
    } catch (err) {
      // 에러 코드를 그대로 보여주면 무슨 말인지 모른다. 사람 말로 바꾼다.
      if (err.code === 'auth/user-not-found') setError('등록되지 않은 이메일이에요.');
      else if (err.code === 'auth/wrong-password') setError('비밀번호가 틀렸어요.');
      else if (err.code === 'auth/invalid-credential') setError('이메일 또는 비밀번호가 틀렸어요.');
      else if (err.code === 'auth/email-already-in-use') setError('이미 사용 중인 이메일이에요.');
      else if (err.code === 'auth/weak-password') setError('비밀번호는 6자 이상이어야 해요.');
      else if (err.code === 'auth/invalid-email') setError('이메일 형식이 올바르지 않아요.');
      else if (err.code === 'auth/network-request-failed') setError('인터넷 연결을 확인해주세요.');
      else if (err.code === 'auth/too-many-requests') setError('시도가 너무 많아요. 잠시 후 다시 해주세요.');
      else setError('로그인에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          s.scroll,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 로고 */}
        <Image
          source={require('../assets/logo.png')}
          style={s.logo}
          resizeMode="contain"
        />
        <Text style={s.brand}>스마트라이더</Text>
        <Text style={s.tagline}>
          건물이 먼저 알려주는{'\n'}라이더를 위한 스마트한 정보
        </Text>

        {/* 입력 */}
        <View style={s.form}>
          <Text style={s.label}>이메일</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={v => { setEmail(v); setError(''); }}
            placeholder="example@email.com"
            placeholderTextColor={c.textFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={s.label}>비밀번호</Text>
          <View style={s.pwWrap}>
            <TextInput
              style={s.pwInput}
              value={password}
              onChangeText={v => { setPassword(v); setError(''); }}
              placeholder="6자 이상"
              placeholderTextColor={c.textFaint}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              onSubmitEditing={handleSubmit}
            />
            <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPw(p => !p)}>
              <Icon
                name={showPw ? 'eye-off-outline' : 'eye-outline'}
                size={21}
                color={c.textMuted}
              />
            </TouchableOpacity>
          </View>

          {/* 오류는 입력칸 아래에 둔다. 위에 두면 화면이 밀려서 눈에 덜 띈다. */}
          {!!error && (
            <View style={s.errorBox}>
              <Icon name="alert-circle-outline" size={16} color={c.danger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.btnPrimary, loading && s.btnOff]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={c.onAccent} />
              : <Text style={s.btnPrimaryText}>
                  {isSignUp ? '가입하고 시작하기' : '로그인'}
                </Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.toggleBtn}
            onPress={() => { setIsSignUp(p => !p); setError(''); }}
          >
            <Text style={s.toggleText}>
              {isSignUp ? '이미 계정이 있어요' : '계정이 없어요 · 회원가입'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 개인정보 안내 — 심사에도 필요하고 라이더 신뢰에도 도움이 된다 */}
        <View style={s.privacyBox}>
          <Icon name="lock-outline" size={15} color={c.accent} />
          <Text style={s.privacyText}>
            등록하신 출입 정보는 이 폰에만 저장되며 서버로 전송되지 않습니다.
          </Text>
        </View>

        <TouchableOpacity                                                       
          style={s.policyLink}                                                   
          onPress={() => Linking.openURL('https://richcanopy.kr/smartrider/privacy/')}               
        >                                                                        
          <Text style={s.policyText}>개인정보처리방침</Text>                    
        </TouchableOpacity>                                                    
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c, font, space, radius, TAP) => StyleSheet.create({
  scroll: {
    flexGrow: 1, justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },

  logo: { width: 88, height: 88, alignSelf: 'center' },
  brand: {
    ...font.title, fontSize: 26, color: c.accent,
    textAlign: 'center', marginTop: space.md,
  },
  tagline: {
    ...font.sub, color: c.textMuted, textAlign: 'center',
    lineHeight: 21, marginTop: space.sm, marginBottom: space.xxl + 8,
  },

  form: { width: '100%' },
  label: { ...font.sub, fontWeight: '500', color: c.fieldLabel, marginBottom: 6, marginTop: space.md },
  input: {
    backgroundColor: c.field, borderWidth: 1.5,
    borderColor: c.fieldBorder, borderRadius: radius.md,
    paddingHorizontal: space.md, minHeight: TAP + 4,
    ...font.body, color: c.text,
  },
  pwWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.field, borderWidth: 1.5,
    borderColor: c.fieldBorder, borderRadius: radius.md,
    paddingLeft: space.md, minHeight: TAP + 4,
  },
  pwInput: { flex: 1, ...font.body, color: c.text, paddingVertical: space.md },
  eyeBtn: { width: 46, height: TAP, alignItems: 'center', justifyContent: 'center' },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.dangerSoft, borderRadius: radius.sm,
    paddingHorizontal: space.md, paddingVertical: space.sm + 2,
    marginTop: space.md,
  },
  errorText: { flex: 1, ...font.sub, color: c.danger },

  btnPrimary: {
    minHeight: TAP + 6, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.accent, borderRadius: radius.md, marginTop: space.xl,
  },
  btnOff: { opacity: 0.7 },
  btnPrimaryText: { ...font.head, color: c.onAccent },

  toggleBtn: { minHeight: TAP, justifyContent: 'center', alignItems: 'center', marginTop: space.xs },
  toggleText: { ...font.sub, color: c.textSub },

  privacyBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space.sm,
    backgroundColor: c.accentSoft, borderRadius: radius.md,
    padding: space.md, marginTop: space.xxl,
  },
  privacyText: { flex: 1, ...font.tiny, color: c.accent, lineHeight: 18 },
  policyLink: { minHeight: TAP, justifyContent: 'center', alignItems: 'center', marginTop: space.sm },   // ★ 새 줄
  policyText: { ...font.tiny, color: c.textSub, textDecorationLine: 'underline' },                       // ★ 새 줄
});