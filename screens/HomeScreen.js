import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Sidebar from './Sidebar';
import {
  View, Text, FlatList, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert
} from 'react-native';
import { getCachedBuildings } from '../buildingsCache';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ITEMS_PER_PAGE = 8;

// ── 탭 ───────────────────────────────────────────────────
//  최근   : 전부, 최신순
//  즐겨찾기: 내가 별을 단 건물
//  공용   : 서버에 올라가 있는 건물
//  사진   : 배치도가 들어있는 건물 — 공용으로 올릴 후보 목록
const TABS = [
  { key: 'recent', label: '최근' },
  { key: 'fav', label: '⭐ 즐겨찾기' },
  { key: 'public', label: '🌐 공용' },
  { key: 'photo', label: '📷 사진' },
];

function InfoDots({ building }) {
  return (
    <View style={styles.dots}>
      {(building.memo || building.memo2) && <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />}
      {building.note && <View style={[styles.dot, { backgroundColor: '#000' }]} />}
      {building.shortcut && <View style={[styles.dot, { backgroundColor: '#ec4899' }]} />}
      {building.images?.length > 0 && <View style={[styles.dot, { backgroundColor: '#92400e' }]} />}
      {building.location && <View style={[styles.dot, { backgroundColor: '#38bdf8' }]} />}
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [tab, setTab] = useState('recent');
  const [menuOpen, setMenuOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const loadBuildings = async () => {
    setLoading(true);
    try {
      const list = await getCachedBuildings();
      // 최신순. 예전에는 reverse()만 했는데, 공용과 개인을 합치면서
      // 순서가 "공용 전부 → 개인 전부"가 되어버려 최신순이 아니게 됐다.
      const sorted = [...list].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setBuildings(sorted);
    } catch (e) {
      Alert.alert('오류', '건물 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // ★ 화면에 돌아올 때마다 다시 읽는다.
  //   예전에는 처음 한 번만 읽어서, 등록하거나 공용으로 올린 뒤
  //   돌아와도 목록이 그대로였다. "저장이 안 된 것처럼" 보이는 원인.
  useFocusEffect(
    useCallback(() => { loadBuildings(); }, [])
  );

  const handleCopyAndRegister = (building) => {
    navigation.navigate('Register', {
      buildingData: {
        name: building.name,
        memo: building.memo || '',
        memo2: building.memo2 || '',
        note: building.note || '',
        shortcut: building.shortcut || '',
        images: [],
        location: null
      }
    });
  };

  // ── 탭별 목록 ──────────────────────────────────────────
  const filtered = buildings.filter(b => {
    if (tab === 'fav') return b.isFav;
    if (tab === 'public') return b.scope !== 'personal';
    if (tab === 'photo') return b.images?.length > 0;
    return true;
  });

  const counts = {
    recent: buildings.length,
    fav: buildings.filter(b => b.isFav).length,
    public: buildings.filter(b => b.scope !== 'personal').length,
    photo: buildings.filter(b => b.images?.length > 0).length,
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const pagedBuildings = filtered.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  const changeTab = (key) => { setTab(key); setCurrentPage(1); };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => navigation.navigate('Detail', { buildingId: item.id })}
    >
      <View style={styles.itemLeft}>
        <Text style={styles.scopeIcon}>
          {item.scope === 'personal' ? '🔒' : '🌐'}
        </Text>
        {item.isFav ? <Text style={styles.starIcon}>★</Text> : null}
      </View>
      <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
      <View style={styles.itemRight}>
        <InfoDots building={item} />
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={() => handleCopyAndRegister(item)}
        >
          <Text style={styles.copyBtnText}>복사</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const emptyText = {
    recent: '등록된 건물이 없습니다.',
    fav: '즐겨찾기한 건물이 없습니다.\n건물 상세에서 ★ 를 눌러 추가하세요.',
    public: '공용 건물이 없습니다.',
    photo: '사진이 있는 건물이 없습니다.',
  }[tab];

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <TouchableOpacity style={styles.hamburger} onPress={() => setMenuOpen(true)}>
          <Text style={styles.hamburgerText}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.title}>스마트 라이더 🏢</Text>
        {/* 제목을 가운데 두기 위한 빈 자리 */}
        <View style={styles.hamburger} />
      </View>

      {/* 상단 버튼 */}
      <View style={styles.topButtons}>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => navigation.navigate('Register', {})}
        >
          <Text style={styles.btnPrimaryText} numberOfLines={1}>+ 등록</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={() => navigation.navigate('Search')}
        >
          <Text style={styles.btnSecondaryText} numberOfLines={1}>🔍 조회</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={() => navigation.navigate('Map')}
        >
          <Text style={styles.btnSecondaryText} numberOfLines={1}>🗺 지도</Text>
        </TouchableOpacity>
      </View>

      {/* 탭 — 개수가 같이 보이므로 분류 진행상황을 바로 알 수 있다 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabRow}
      >
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabChip, tab === t.key && styles.tabChipOn]}
            onPress={() => changeTab(t.key)}
          >
            <Text style={[styles.tabChipText, tab === t.key && styles.tabChipTextOn]}>
              {t.label} {counts[t.key]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
      ) : (
        <>
          <FlatList
            data={pagedBuildings}
            keyExtractor={item => String(item.id)}
            renderItem={renderItem}
            style={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>{emptyText}</Text>
            }
          />

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <View style={styles.pagination}>
              <TouchableOpacity
                onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
              >
                <Text style={styles.pageBtnText}>◀</Text>
              </TouchableOpacity>

              <Text style={styles.pageInfo}>{page} / {totalPages}</Text>

              <TouchableOpacity
                onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}
              >
                <Text style={styles.pageBtnText}>▶</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* 새로고침 */}
      <TouchableOpacity style={[styles.refreshBtn, { marginBottom: insets.bottom + 8 }]} onPress={loadBuildings}>
        <Text style={styles.refreshBtnText}>🔄 새로고침</Text>
      </TouchableOpacity>

      <Sidebar
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        navigation={navigation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  title: { flex: 1, fontSize: 24, fontWeight: 'bold', textAlign: 'center', color: '#1e3a5f' },
  hamburger: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hamburgerText: { fontSize: 24, color: '#1e3a5f' },
  topButtons: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  // 글자가 두 줄로 깨지지 않게 좌우 여백을 줄이고 글씨도 조금 작게
  btnPrimary: { flex: 1, backgroundColor: '#3b82f6', paddingVertical: 13, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnSecondary: { flex: 1, backgroundColor: '#e2e8f0', paddingVertical: 13, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { color: '#1e3a5f', fontWeight: 'bold', fontSize: 15 },

  tabScroll: { flexGrow: 0, marginBottom: 10 },
  tabRow: { gap: 8, paddingRight: 8 },
  tabChip: {
    minHeight: 40, justifyContent: 'center',
    paddingHorizontal: 14, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1',
  },
  tabChipOn: { backgroundColor: '#1e3a5f', borderColor: '#1e3a5f' },
  tabChipText: { fontSize: 14, color: '#475569', fontWeight: 'bold' },
  tabChipTextOn: { color: '#fff' },

  list: { flex: 1 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 14, lineHeight: 21 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 6, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  itemLeft: { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  scopeIcon: { fontSize: 13 },
  starIcon: { fontSize: 13, color: '#eab308', marginLeft: 2 },
  itemName: { flex: 1, fontSize: 16, color: '#1e293b' },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dots: { flexDirection: 'column', alignItems: 'center', gap: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  copyBtn: { backgroundColor: '#e2e8f0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  copyBtnText: { fontSize: 12, color: '#475569' },
  pagination: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, paddingVertical: 12 },
  pageBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  pageBtnDisabled: { backgroundColor: '#cbd5e1' },
  pageBtnText: { color: '#fff', fontWeight: 'bold' },
  pageInfo: { fontSize: 16, color: '#475569' },
  refreshBtn: { backgroundColor: '#f1f5f9', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  refreshBtnText: { color: '#475569', fontSize: 14 },
});