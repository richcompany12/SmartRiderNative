import { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Dimensions, Pressable, Alert, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../AuthContext';
import { roleLabel } from '../roles';

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

        <ScrollView style={{ flex: 1 }}>
          <MenuItem label="홈" onPress={onClose} />
          <MenuItem label="건물 등록" onPress={() => go('Register')} />
          <MenuItem label="건물 조회" onPress={() => go('Search')} />
          <MenuItem label="지도" onPress={() => go('Map')} />
          <MenuItem label="설정" onPress={() => go('Settings')} />

          <View style={styles.divider} />

          <MenuItem label="공지사항" onPress={() => notReady('공지사항')} />
          <MenuItem label="제보하기" onPress={() => notReady('제보하기')} />

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