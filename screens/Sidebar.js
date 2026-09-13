import { useRef, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Dimensions, Pressable, Alert, ScrollView,
  BackHandler, ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../AuthContext';
import { roleLabel } from '../roles';
import { shareBackup, pickBackupFile, restoreFromData } from '../backup';
import { invalidateBuildingsCache } from '../buildingsCache';

const { width: SCREEN_W } = Dimensions.get('window');
const PANEL_W = Math.min(300, SCREEN_W * 0.8);

// 메뉴 한 줄. 터치 영역 48 이상.
function MenuItem({ label, onPress, badge, danger }) {
  return (
    <TouchableOpacity style={styles.item} onPress={onPress}>
      <Text style={[styles.itemText, danger && styles.itemDanger]}>{label}</Text>
      {badge ? <View style={styles.badge} /> : null}
    </TouchableOpacity>
  );
}

export default function Sidebar({ visible, onClose, navigation }) {
  const insets = useSafeAreaInsets();
  const { user, role, isAdmin, isSuper, logout } = useAuth();
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
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          { paddingTop: insets.top + 16, transform: [{ translateX: slide }] }
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>메뉴</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {busy ? (
          <View style={styles.busyBox}>
            <ActivityIndicator color="#93c5fd" />
            <Text style={styles.busyText}>{busy}</Text>
          </View>
        ) : null}

        <ScrollView style={{ flex: 1 }}>
          <MenuItem label="홈" onPress={onClose} />
          <MenuItem label="건물 등록" onPress={() => go('Register')} />
          <MenuItem label="건물 조회" onPress={() => go('Search')} />
          <MenuItem label="지도" onPress={() => go('Map')} />
          <MenuItem label="설정" onPress={() => go('Settings')} />

          <View style={styles.divider} />

          <MenuItem label="공지사항" onPress={() => notReady('공지사항')} />
          <MenuItem label="제보하기" onPress={() => notReady('제보하기')} />

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>내 데이터</Text>
          <MenuItem label="💾 백업하기" onPress={handleBackup} />
          <MenuItem label="📥 복원하기" onPress={handleRestore} />
          <Text style={styles.hint}>
            내 폰에만 있는 데이터입니다. 폰을 바꾸기 전에 꼭 백업하세요.
          </Text>

          {isAdmin && (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>관리자 메뉴</Text>
              <MenuItem label="제보 확인" onPress={() => notReady('제보 확인')} />
              {isSuper && (
                <MenuItem label="어드민 관리" onPress={() => notReady('어드민 관리')} />
              )}
            </>
          )}
        </ScrollView>

        {/* 계정 — 지금 어떤 역할로 로그인돼 있는지 항상 보이게 */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.email} numberOfLines={1}>{user?.email || ''}</Text>
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>{roleLabel(role)}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: PANEL_W,
    backgroundColor: '#1e293b', paddingHorizontal: 20,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 24, fontWeight: 'bold' },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#94a3b8', fontSize: 20 },
  item: { minHeight: 48, flexDirection: 'row', alignItems: 'center' },
  itemText: { color: '#e2e8f0', fontSize: 16 },
  itemDanger: { color: '#f87171' },
  badge: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444', marginLeft: 8 },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 14 },
  sectionTitle: { color: '#94a3b8', fontSize: 13, fontWeight: 'bold', marginBottom: 6 },
  hint: { color: '#64748b', fontSize: 12, lineHeight: 17, marginTop: 6 },
  busyBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  busyText: { color: '#cbd5e1', fontSize: 13 },
  footer: { borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 14 },
  email: { color: '#cbd5e1', fontSize: 13 },
  roleChip: {
    alignSelf: 'flex-start', backgroundColor: '#334155',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 6,
  },
  roleChipText: { color: '#93c5fd', fontSize: 12, fontWeight: 'bold' },
  logoutBtn: {
    backgroundColor: '#dc2626', minHeight: 48, justifyContent: 'center',
    alignItems: 'center', borderRadius: 8, marginTop: 14,
  },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});