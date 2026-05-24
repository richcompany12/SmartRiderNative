import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { useAuth } from '../AuthContext';

export default function LoginScreen({ navigation }) {
  const { signInWithEmail, signUpWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async () => {
    if (!email || !password) { setError('이메일과 비밀번호를 입력해주세요.'); return; }
    setLoading(true); setError('');
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      // 로그인 성공 시 AuthContext가 자동으로 user 업데이트 → App.js에서 화면 전환
    } catch (err) {
      if (err.code === 'auth/user-not-found') setError('등록되지 않은 이메일이에요.');
      else if (err.code === 'auth/wrong-password') setError('비밀번호가 틀렸어요.');
      else if (err.code === 'auth/invalid-credential') setError('이메일 또는 비밀번호가 틀렸어요.');
      else if (err.code === 'auth/email-already-in-use') setError('이미 사용 중인 이메일이에요.');
      else if (err.code === 'auth/weak-password') setError('비밀번호는 6자 이상이어야 해요.');
      else if (err.code === 'auth/invalid-email') setError('이메일 형식이 올바르지 않아요.');
      else setError('로그인에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>스마트 라이더 🏢</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="이메일"
          placeholderTextColor="#94a3b8"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="비밀번호"
          placeholderTextColor="#94a3b8"
          secureTextEntry
          onSubmitEditing={handleEmailLogin}
        />

        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={handleEmailLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnPrimaryText}>
                {isSignUp ? '회원가입' : '이메일로 로그인'}
              </Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { setIsSignUp(p => !p); setError(''); }}>
          <Text style={styles.toggleText}>
            {isSignUp ? '이미 계정이 있어요 → 로그인' : '계정이 없어요 → 회원가입'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9', padding: 24 },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 16, padding: 28, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', color: '#1e3a5f', marginBottom: 24 },
  error: { color: '#ef4444', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, fontSize: 16, color: '#1e293b', marginBottom: 12 },
  btnPrimary: { backgroundColor: '#3b82f6', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  btnPrimaryText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  toggleText: { color: '#64748b', fontSize: 13, textAlign: 'center', textDecorationLine: 'underline' },
});