import { useRef, useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Dimensions, Pressable, Alert, ScrollView,
  BackHandler, ActivityIndicator
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useAuth } from '../AuthContext';
import { roleLabel } from '../roles';
import { shareBackup, pickBackupFile, restoreFromData } from '../backup';
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
  // 메뉴만 닫고 끝낸다.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;   // true = 여기서 처리했으니 앱을 끄지 마라
    });
    return () => sub.remove();
  }, [visible]);

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

  // ── 백업하기 ───────────────────────────────────────────
  const handleBackup = () => {
    Alert.alert(
      '백업하기',
      '내 폰에 저장된 건물·메모·즐겨찾기를 파일 하나로 만들어 내보냅니다.\n\n' +
      '⚠️ 파일에는 출입 비밀번호가 그대로 들어있습니다.\n' +
      '카카오톡 나에게 보내기, 이메일, 보안 폴더처럼 나만 볼 수 있는 곳에 보관하세요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '만들기',
          onPress: async () => {
            setBusy('백업 파일을 만드는 중...');
            try {
              const r = await shareBackup();
              setBusy('');
              setTimeout(() => Alert.alert(
                '백업 완료',
                `건물 ${r.counts.buildings}건\n` +
                `메모 ${r.counts.notes}건\n` +
                `즐겨찾기 ${r.counts.favorites}건`
              ), 400);
            } catch (e) {
              setBusy('');
              Alert.alert('실패', e?.message || '백업에 실패했습니다.');
            }
          }
        }
      ]
    );
  };

  // ── 복원하기 ───────────────────────────────────────────
  // 파일을 먼저 읽어서 내용을 보여주고, 그다음에 방식을 고르게 한다.
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
          <Text style={s.hint}>
            내 폰에만 있는 데이터입니다. 폰을 바꾸기 전에 꼭 백업하세요.
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
        </View>
      </Animated.View>
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
});