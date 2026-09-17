import { useRef, useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Dimensions, Pressable, Alert, ScrollView,
  BackHandler, ActivityIndicator, Modal, TextInput
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useAuth } from '../AuthContext';
import { roleLabel } from '../roles';
import {
  shareBackup,
  pickBackupFile,
  decryptBackup,
  restoreFromData,
  validatePassword,
  getSavedPassword,
} from '../backup';
import { invalidateBuildingsCache } from '../buildingsCache';

const { width: SCREEN_W } = Dimensions.get('window');
const PANEL_W = Math.min(300, SCREEN_W * 0.8);

// 메뉴 한 줄. 터치 영역 48 이상.
function MenuItem({ icon, label, onPress, badge, danger, s, c }) {
  return (
    <TouchableOpacity style={s.item} onPress={onPress}>
      <Icon name={icon} size={20} color={danger ? c.danger : c.textSub} />
      <Text style={[s.itemText, danger && s.itemDanger]}>{label}</Text>
      {badge ? <View style={s.badge} /> : null}
    </TouchableOpacity>
  );
}

export default function Sidebar({ visible, onClose, navigation }) {
  const insets = useSafeAreaInsets();
  const { user, role, isAdmin, isSuper, logout } = useAuth();
  const { c, font, space, radius, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius, TAP), [c]);
  const slide = useRef(new Animated.Value(-PANEL_W)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [busy, setBusy] = useState('');

  // ── 비밀번호 창 상태 ─────────────────────────────────
  // pwMode: null(닫힘) | 'backup'(새로 만들기) | 'restore'(풀기) | 'view'(다시 보기)
  const [pwMode, setPwMode] = useState(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState(null); // 복원 대기 중인 암호화 파일
  const [savedPw, setSavedPw] = useState('');

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, {
        toValue: visible ? 0 : -PANEL_W,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: visible ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  // 메뉴가 열려 있을 때 뒤로가기를 누르면 앱이 꺼지던 문제.
  // 메뉴만 닫고 끝낸다. 비밀번호 창이 떠 있으면 그것부터 닫는다.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pwMode) { closePw(); return true; }
      onClose();
      return true;   // true = 여기서 처리했으니 앱을 끄지 마라
    });
    return () => sub.remove();
  }, [visible, pwMode]);

  if (!visible) return null;

  // 메뉴를 닫은 뒤에 이동한다.
  // 열린 상태에서 바로 navigate하면 화면 전환이 씹히는 경우가 있다.
  const go = (screen, params) => {
    onClose();
    setTimeout(() => navigation.navigate(screen, params || {}), 220);
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          onClose();
          await logout();
        }
      }
    ]);
  };

  const notReady = (name) => {
    onClose();
    setTimeout(() => Alert.alert(name, '아직 준비 중인 기능입니다.'), 220);
  };

  // ── 비밀번호 창 열고 닫기 ─────────────────────────────
  const closePw = () => {
    setPwMode(null);
    setPw('');
    setPw2('');
    setPwErr('');
    setPwBusy(false);
    setPendingFile(null);
    setSavedPw('');
  };

  // ── 백업하기 ───────────────────────────────────────────
  // 비밀번호 창부터 연다. 경고 문구는 창 안에 들어있다.
  const handleBackup = () => {
    setPw('');
    setPw2('');
    setPwErr('');
    setPwMode('backup');
  };

  const doBackup = async () => {
    const bad = validatePassword(pw);
    if (bad) { setPwErr(bad); return; }
    if (pw !== pw2) { setPwErr('두 번 입력한 비밀번호가 다릅니다.'); return; }

    setPwBusy(true);
    try {
      const r = await shareBackup(pw);
      closePw();
      // 공유 시트가 닫히는 시간을 주고 결과를 띄운다.
      setTimeout(() => Alert.alert(
        '백업 완료',
        `건물 ${r.counts.buildings}건\n` +
        `메모 ${r.counts.notes}건\n` +
        `즐겨찾기 ${r.counts.favorites}건\n\n` +
        '비밀번호는 메뉴 → 백업 비밀번호 다시 보기에서 확인할 수 있습니다.'
      ), 400);
    } catch (e) {
      setPwErr(e?.message || '백업에 실패했습니다.');
      setPwBusy(false);
    }
  };

  // ── 복원하기 ───────────────────────────────────────────
  // 파일을 먼저 읽는다.
  // 암호화된 파일이면 비밀번호를 받고, 옛 평문 파일이면 바로 진행한다.
  const handleRestore = async () => {
    setBusy('파일을 여는 중...');
    let picked;
    try {
      picked = await pickBackupFile();
    } catch (e) {
      setBusy('');
      Alert.alert('실패', e?.message || '파일을 읽지 못했습니다.');
      return;
    }
    setBusy('');
    if (!picked) return;   // 사용자가 취소함

    if (picked.encrypted) {
      setPendingFile(picked);
      setPw('');
      setPw2('');
      setPwErr('');
      setPwMode('restore');
    } else {
      askRestoreMode(picked);
    }
  };

  // 암호 풀기
  const doDecrypt = async () => {
    if (!pw) { setPwErr('비밀번호를 입력해주세요.'); return; }

    setPwBusy(true);
    try {
      const data = await decryptBackup(pendingFile.file, pw);
      const picked = pendingFile;
      closePw();
      setTimeout(() => askRestoreMode({ ...picked, data }), 300);
    } catch (e) {
      setPwErr(e?.message || '비밀번호가 맞지 않습니다.');
      setPwBusy(false);
    }
  };

  // 합치기 / 덮어쓰기 고르기
  const askRestoreMode = (picked) => {
    const when = picked.exportedAt
      ? new Date(picked.exportedAt).toLocaleString('ko-KR')
      : '알 수 없음';

    Alert.alert(
      '복원하기',
      `${picked.name}\n만든 날짜: ${when}\n\n` +
      `건물 ${picked.counts.buildings}건\n` +
      `메모 ${picked.counts.notes}건\n` +
      `즐겨찾기 ${picked.counts.favorites}건\n\n` +
      '어떻게 넣을까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '합치기',
          onPress: () => doRestore(picked.data, 'merge')
        },
        {
          text: '덮어쓰기',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '덮어쓰기',
              '지금 폰에 있는 내 데이터가 전부 지워지고 백업 파일 내용으로 바뀝니다.\n되돌릴 수 없습니다.',
              [
                { text: '취소', style: 'cancel' },
                { text: '덮어쓰기', style: 'destructive', onPress: () => doRestore(picked.data, 'replace') }
              ]
            );
          }
        }
      ]
    );
  };

  const doRestore = async (data, mode) => {
    setBusy('복원하는 중...');
    try {
      const r = await restoreFromData(data, mode);
      invalidateBuildingsCache();
      setBusy('');
      Alert.alert(
        '복원 완료',
        `건물 ${r.buildings}건\n메모 ${r.notes}건\n즐겨찾기 ${r.favorites}건`
      );
    } catch (e) {
      setBusy('');
      Alert.alert('실패', e?.message || '복원에 실패했습니다.');
    }
  };

  // ── 백업 비밀번호 다시 보기 ────────────────────────────
  // 이 폰이 살아있는 동안에는 언제든 확인할 수 있게 한다.
  // 폰을 바꾸기 전날 여기서 확인해 적어두면 된다.
  const handleViewPassword = async () => {
    const saved = await getSavedPassword();
    if (!saved) {
      onClose();
      setTimeout(() => Alert.alert(
        '저장된 비밀번호 없음',
        '아직 이 폰에서 백업을 만든 적이 없습니다.'
      ), 220);
      return;
    }
    setSavedPw(saved);
    setPwMode('view');
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* 어두운 배경 — 누르면 닫힘 */}
      <Animated.View style={[s.backdrop, { opacity: fade }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          s.panel,
          { paddingTop: insets.top + 16, transform: [{ translateX: slide }] }
        ]}
      >
        <View style={s.header}>
          <Text style={s.headerTitle}>메뉴</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={s.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {busy ? (
          <View style={s.busyBox}>
            <ActivityIndicator color={c.accent} />
            <Text style={s.busyText}>{busy}</Text>
          </View>
        ) : null}

        <ScrollView style={{ flex: 1 }}>
          <MenuItem s={s} c={c} icon="home-outline" label="홈" onPress={onClose} />
          <MenuItem s={s} c={c} icon="plus-box-outline" label="건물 등록" onPress={() => go('Register')} />
          <MenuItem s={s} c={c} icon="magnify" label="건물 조회" onPress={() => go('Search')} />
          <MenuItem s={s} c={c} icon="map-outline" label="지도" onPress={() => go('Map')} />
          <MenuItem s={s} c={c} icon="cog-outline" label="설정" onPress={() => go('Settings')} />

          <View style={s.divider} />

          <MenuItem s={s} c={c} icon="bullhorn-outline" label="공지사항" onPress={() => notReady('공지사항')} />
          <MenuItem s={s} c={c} icon="message-alert-outline" label="제보하기" onPress={() => go('Suggest')} />

          <View style={s.divider} />

          <Text style={s.sectionTitle}>내 데이터</Text>
          <MenuItem s={s} c={c} icon="cloud-upload-outline" label="백업하기" onPress={handleBackup} />
          <MenuItem s={s} c={c} icon="cloud-download-outline" label="복원하기" onPress={handleRestore} />
          <MenuItem s={s} c={c} icon="key-outline" label="백업 비밀번호 다시 보기" onPress={handleViewPassword} />
          <Text style={s.hint}>
            내 폰에만 있는 데이터입니다. 백업 파일은 비밀번호로 잠기므로
            카톡·메일로 보내도 남이 열 수 없습니다.
          </Text>

          {isAdmin && (
            <>
              <View style={s.divider} />
              <Text style={s.sectionTitle}>관리자 메뉴</Text>
              <MenuItem s={s} c={c} icon="inbox-arrow-down-outline" label="제보 확인" onPress={() => go('SuggestAdmin')} />
              {isSuper && (
                <MenuItem s={s} c={c} icon="account-cog-outline" label="어드민 관리" onPress={() => notReady('어드민 관리')} />
              )}
            </>
          )}
        </ScrollView>

        {/* 계정 — 지금 어떤 역할로 로그인돼 있는지 항상 보이게 */}
        <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={s.email} numberOfLines={1}>{user?.email || ''}</Text>
          <View style={s.roleChip}>
            <Text style={s.roleChipText}>{roleLabel(role)}</Text>
          </View>
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
            <Text style={s.logoutText}>로그아웃</Text>
          </TouchableOpacity>

          {/* ★ 여기부터 새 블록 */}
          <TouchableOpacity
            style={s.quitBtn}
            onPress={() => { onClose(); navigation.navigate('DeleteAccount'); }}
          >
            <Text style={s.quitText}>회원 탈퇴</Text>
          </TouchableOpacity>
          {/* ★ 새 블록 끝 */}
        </View>
      </Animated.View>

      {/* ── 비밀번호 창 ─────────────────────────────────── */}
      <Modal visible={!!pwMode} transparent animationType="fade" onRequestClose={closePw}>
        <View style={s.modalBg}>
          <View style={s.modalBox}>

            {/* ① 백업 — 새 비밀번호 정하기 */}
            {pwMode === 'backup' && (
              <>
                <Text style={s.modalTitle}>백업 비밀번호를 정해주세요</Text>
                <Text style={s.modalDesc}>
                  이 파일에는 출입 비밀번호가 들어 있습니다.{'\n'}
                  카톡이나 메일로 보내도 안전하도록 잠급니다.
                </Text>

                <TextInput
                  style={s.input}
                  value={pw}
                  onChangeText={(t) => { setPw(t); setPwErr(''); }}
                  placeholder="영문+숫자 8자 이상"
                  placeholderTextColor={c.textFaint}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!pwBusy}
                />
                <TextInput
                  style={s.input}
                  value={pw2}
                  onChangeText={(t) => { setPw2(t); setPwErr(''); }}
                  placeholder="한 번 더"
                  placeholderTextColor={c.textFaint}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!pwBusy}
                />

                {!!pwErr && <Text style={s.errText}>{pwErr}</Text>}

                <View style={s.warnBox}>
                  <Text style={s.warnText}>
                    비밀번호를 잊으면 복원할 수 없습니다.{'\n'}
                    만든 사람도 열 수 없습니다.
                  </Text>
                </View>

                {pwBusy ? (
                  <View style={s.pwBusy}>
                    <ActivityIndicator color={c.accent} />
                    <Text style={s.pwBusyText}>암호를 거는 중입니다…</Text>
                  </View>
                ) : (
                  <View style={s.btnRow}>
                    <TouchableOpacity style={s.btnGhost} onPress={closePw}>
                      <Text style={s.btnGhostText}>취소</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.btnMain} onPress={doBackup}>
                      <Text style={s.btnMainText}>백업 만들기</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {/* ② 복원 — 비밀번호 풀기 */}
            {pwMode === 'restore' && (
              <>
                <Text style={s.modalTitle}>백업 비밀번호를 입력해주세요</Text>
                <Text style={s.modalDesc}>
                  {pendingFile?.name}{'\n'}
                  건물 {pendingFile?.counts?.buildings ?? 0}건
                  {pendingFile?.exportedAt
                    ? ' · ' + new Date(pendingFile.exportedAt).toLocaleDateString('ko-KR')
                    : ''}
                </Text>

                <TextInput
                  style={s.input}
                  value={pw}
                  onChangeText={(t) => { setPw(t); setPwErr(''); }}
                  placeholder="백업할 때 정한 비밀번호"
                  placeholderTextColor={c.textFaint}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!pwBusy}
                />

                {!!pwErr && <Text style={s.errText}>{pwErr}</Text>}

                {pwBusy ? (
                  <View style={s.pwBusy}>
                    <ActivityIndicator color={c.accent} />
                    <Text style={s.pwBusyText}>암호를 푸는 중입니다…</Text>
                  </View>
                ) : (
                  <View style={s.btnRow}>
                    <TouchableOpacity style={s.btnGhost} onPress={closePw}>
                      <Text style={s.btnGhostText}>취소</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.btnMain} onPress={doDecrypt}>
                      <Text style={s.btnMainText}>열기</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {/* ③ 다시 보기 */}
            {pwMode === 'view' && (
              <>
                <Text style={s.modalTitle}>백업 비밀번호</Text>
                <Text style={s.modalDesc}>
                  이 폰에서 마지막으로 만든 백업의 비밀번호입니다.
                </Text>

                <View style={s.savedBox}>
                  <Text style={s.savedText} selectable>{savedPw}</Text>
                </View>

                <View style={s.warnBox}>
                  <Text style={s.warnText}>
                    폰을 바꾸기 전에 적어두세요.{'\n'}
                    폰이 고장나면 이 화면도 함께 사라집니다.
                  </Text>
                </View>

                <View style={s.btnRow}>
                  <TouchableOpacity style={s.btnMain} onPress={closePw}>
                    <Text style={s.btnMainText}>닫기</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c, font, space, radius, TAP) => StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: PANEL_W,
    backgroundColor: c.surface, paddingHorizontal: space.lg,
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: c.line,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg },
  headerTitle: { flex: 1, ...font.title, color: c.text },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: c.textSub, fontSize: 20 },

  item: { minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: space.md },
  itemText: { ...font.body, color: c.text },
  itemDanger: { color: c.danger },
  badge: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger, marginLeft: space.sm },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginVertical: space.md + 2 },
  sectionTitle: { ...font.sub, fontWeight: '500', color: c.textMuted, marginBottom: 6 },
  hint: { ...font.tiny, color: c.textFaint, lineHeight: 18, marginTop: 6 },

  busyBox: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  busyText: { ...font.sub, color: c.textSub },

  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: space.md + 2 },
  email: { ...font.sub, color: c.textSub },
  roleChip: {
    alignSelf: 'flex-start', backgroundColor: c.accentSoft,
    paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill, marginTop: 6,
  },
  roleChipText: { ...font.tiny, fontWeight: '500', color: c.accent },
  logoutBtn: {
    minHeight: TAP, justifyContent: 'center', alignItems: 'center',
    borderRadius: radius.md, marginTop: space.md + 2,
    backgroundColor: c.surfaceSoft,
  },
  logoutText: { ...font.body, fontWeight: '500', color: c.danger },
  quitBtn: { alignItems: 'center', paddingVertical: space.sm, marginTop: space.xs },   // ★ 새 줄
  quitText: { ...font.tiny, color: c.textFaint },                                      // ★ 새 줄

  // ── 비밀번호 창 ─────────────────────────────────────
  modalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', padding: space.lg,
  },
  modalBox: {
    backgroundColor: c.surface, borderRadius: radius.lg,
    padding: space.lg,
  },
  modalTitle: { ...font.head, color: c.text },
  modalDesc: { ...font.sub, color: c.textSub, marginTop: space.sm, lineHeight: 20 },

  input: {
    minHeight: TAP,
    borderWidth: 1, borderColor: c.lineStrong, borderRadius: radius.md,
    paddingHorizontal: space.md, marginTop: space.md,
    color: c.text, backgroundColor: c.bg,
    ...font.body,
  },
  errText: { ...font.sub, color: c.danger, marginTop: space.sm },

  warnBox: {
    backgroundColor: c.warnSoft, borderRadius: radius.md,
    padding: space.md, marginTop: space.md,
  },
  warnText: { ...font.tiny, color: c.warn, lineHeight: 18 },

  savedBox: {
    backgroundColor: c.bg, borderWidth: 1, borderColor: c.lineStrong,
    borderRadius: radius.md, paddingVertical: space.md,
    alignItems: 'center', marginTop: space.md,
  },
  savedText: {
    fontFamily: 'monospace', fontSize: 22, letterSpacing: 1,
    color: c.accent,
  },

  btnRow: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  btnGhost: {
    flex: 1, minHeight: TAP, borderRadius: radius.md,
    borderWidth: 1, borderColor: c.lineStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  btnGhostText: { ...font.body, color: c.textSub },
  btnMain: {
    flex: 2, minHeight: TAP, borderRadius: radius.md,
    backgroundColor: c.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  btnMainText: { ...font.body, fontWeight: '500', color: c.onAccent },

  pwBusy: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: space.sm, minHeight: TAP, marginTop: space.lg,
  },
  pwBusyText: { ...font.sub, color: c.textSub },
});