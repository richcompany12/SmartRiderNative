import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useAuth } from '../AuthContext';
import { countPersonalData } from '../personalDB';
import { reauth, deleteAccount } from '../accountDelete';

/**
 * DeleteAccountScreen.js
 *
 * 회원 탈퇴. 구글 플레이는 로그인이 있는 앱에
 * "앱 안에서 계정을 지우는 경로"를 요구한다. 없으면 반려다.
 *
 * ── 폰 데이터를 선택하게 하는 이유 ───────────────────────
 *  건물 정보는 서버로 가지 않으므로 개인정보 규정상 지울 의무가 없다.
 *  1,000건 가까운 데이터를 탈퇴 버튼 하나로 날리면 사고가 난다.
 *  체크박스를 따로 두고, 기본은 "남김"으로 한다.
 */

export default function DeleteAccountScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { c, font, space, radius, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius, TAP), [c]);
  const { user } = useAuth();

  const [count, setCount] = useState(null);
  const [pw, setPw] = useState('');
  const [wipeLocal, setWipeLocal] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    countPersonalData().then(setCount).catch(() => setCount({ buildings: 0 }));
  }, []);

  const Check = ({ on, label, sub, onPress }) => (
    <TouchableOpacity style={s.checkRow} onPress={onPress} activeOpacity={0.7}>
      <Icon
        name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
        size={22}
        color={on ? c.danger : c.textFaint}
      />
      <View style={{ flex: 1 }}>
        <Text style={s.checkLabel}>{label}</Text>
        {sub ? <Text style={s.checkSub}>{sub}</Text> : null}
      </View>
    </TouchableOpacity>
  );

  const run = async () => {
    if (!pw) { Alert.alert('알림', '비밀번호를 입력해주세요.'); return; }

    Alert.alert(
      '정말 탈퇴하시겠습니까?',
      wipeLocal
        ? `계정과 이 폰의 건물 ${count?.buildings || 0}건이 모두 삭제됩니다.\n되돌릴 수 없습니다.`
        : '계정이 삭제됩니다. 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await reauth(pw);
            } catch (e) {
              setBusy(false);
              const code = e?.code || '';
              if (code.includes('wrong-password') || code.includes('invalid-credential')) {
                Alert.alert('오류', '비밀번호가 맞지 않습니다.');
              } else if (code.includes('too-many-requests')) {
                Alert.alert('오류', '시도가 너무 많습니다. 잠시 후 다시 해주세요.');
              } else {
                Alert.alert('오류', '확인에 실패했습니다.\n' + (e?.message || ''));
              }
              return;
            }

            try {
              await deleteAccount(wipeLocal);
              // 성공하면 onAuthStateChanged가 로그인 화면으로 보낸다
            } catch (e) {
              setBusy(false);
              Alert.alert('오류', '탈퇴에 실패했습니다.\n' + (e?.message || ''));
            }
          },
        },
      ]
    );
  };

  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={c.textSub} />
        </TouchableOpacity>
        <Text style={s.screenTitle}>회원 탈퇴</Text>
      </View>

      <ScrollView contentContainerStyle={{
        paddingHorizontal: space.lg,
        paddingBottom: insets.bottom + 40,
      }}>
        <Text style={s.email}>{user?.email || ''}</Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>삭제되는 것</Text>
          <Text style={s.cardBody}>
            · 로그인 계정{'\n'}
            · 내 프로필 정보{'\n'}
            · 내가 올린 제보와 사진
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>삭제되지 않는 것</Text>
          <Text style={s.cardBody}>
            · 공용 건물 정보{'\n'}
            · 강력알림 지점{'\n'}
            {'\n'}
            다른 회원이 함께 쓰는 자료입니다.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>이 폰에 저장된 내 건물</Text>
          <Text style={s.bigCount}>
            {count === null ? '확인 중...' : `${count.buildings}건`}
          </Text>
          <Check
            on={wipeLocal}
            onPress={() => setWipeLocal(v => !v)}
            label="이 폰의 건물 정보도 함께 삭제"
            sub={
              '체크하지 않으면 폰에 그대로 남아 재가입 후 다시 쓸 수 있습니다.\n' +
              '삭제하면 되돌릴 수 없습니다. 미리 백업해두세요.'
            }
          />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>비밀번호 확인</Text>
          <Text style={s.cardBody}>보안을 위해 다시 한 번 확인합니다.</Text>
          <TextInput
            style={s.input}
            value={pw}
            onChangeText={setPw}
            placeholder="비밀번호"
            placeholderTextColor={c.textFaint}
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <Check
          on={agree}
          onPress={() => setAgree(v => !v)}
          label="위 내용을 확인했으며 탈퇴에 동의합니다"
        />

        <TouchableOpacity
          style={[s.delBtn, !agree && s.delBtnOff]}
          disabled={!agree || busy}
          onPress={run}
        >
          {busy
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.delBtnText}>탈퇴하기</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c, font, space, radius, TAP) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.sm, paddingBottom: space.md,
  },
  backBtn: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { ...font.head, color: c.text, marginLeft: space.xs },

  email: { ...font.sub, color: c.textMuted, marginBottom: space.md },

  card: {
    backgroundColor: c.surface, borderRadius: radius.lg, padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.line,
    marginBottom: space.md,
  },
  cardTitle: { ...font.body, fontWeight: '500', color: c.text, marginBottom: space.sm },
  cardBody: { ...font.sub, color: c.textMuted, lineHeight: 21 },
  bigCount: { ...font.title, color: c.accent, marginBottom: space.md },

  checkRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space.sm,
    paddingVertical: space.md, marginBottom: space.md,
  },
  checkLabel: { ...font.body, fontWeight: '500', color: c.text },
  checkSub: { ...font.tiny, color: c.textMuted, lineHeight: 18, marginTop: 4 },

  input: {
    minHeight: TAP, marginTop: space.md,
    backgroundColor: c.field, borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.fieldBorder,
    paddingHorizontal: space.md, ...font.body, color: c.text,
  },

  delBtn: {
    minHeight: TAP + 4, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.danger, borderRadius: radius.sm, marginTop: space.sm,
  },
  delBtnOff: { opacity: 0.35 },
  delBtnText: { ...font.body, fontWeight: '500', color: '#fff' },
});