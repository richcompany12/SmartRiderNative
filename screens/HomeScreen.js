import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert
} from 'react-native';
import { getAllBuildings } from '../firebaseDB';

const ITEMS_PER_PAGE = 8;

function InfoDots({ building }) {
  return (
    <View style={styles.dots}>
      {building.memo && <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />}
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

  const loadBuildings = async () => {
    setLoading(true);
    try {
      const list = await getAllBuildings();
      setBuildings([...list].reverse());
    } catch (e) {
      Alert.alert('오류', '건물 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBuildings(); }, []);

  const handleCopyAndRegister = (building) => {
    navigation.navigate('Register', {
      buildingData: {
        name: building.name,
        memo: building.memo || '',
        note: building.note || '',
        shortcut: building.shortcut || '',
        images: [],
        location: null
      }
    });
  };

  // 페이지네이션
  const totalPages = Math.ceil(buildings.length / ITEMS_PER_PAGE);
  const pagedBuildings = buildings.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => navigation.navigate('Detail', { buildingId: item.id })}
    >
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>스마트 라이더 🏢</Text>

      {/* 상단 버튼 */}
      <View style={styles.topButtons}>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => navigation.navigate('Register', {})}
        >
          <Text style={styles.btnPrimaryText}>+ 건물 등록</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={() => navigation.navigate('Search')}
        >
          <Text style={styles.btnSecondaryText}>🔍 건물 조회</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={() => navigation.navigate('Map')}
        >
          <Text style={styles.btnSecondaryText}>🗺 지도</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>최근 등록된 건물</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
      ) : (
        <>
          <FlatList
            data={pagedBuildings}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            style={styles.list}
          />

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <View style={styles.pagination}>
              <TouchableOpacity
                onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={[styles.pageBtn, currentPage === 1 && styles.pageBtnDisabled]}
              >
                <Text style={styles.pageBtnText}>◀</Text>
              </TouchableOpacity>

              <Text style={styles.pageInfo}>{currentPage} / {totalPages}</Text>

              <TouchableOpacity
                onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={[styles.pageBtn, currentPage === totalPages && styles.pageBtnDisabled]}
              >
                <Text style={styles.pageBtnText}>▶</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* 새로고침 */}
      <TouchableOpacity style={styles.refreshBtn} onPress={loadBuildings}>
        <Text style={styles.refreshBtnText}>🔄 새로고침</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', color: '#1e3a5f', marginBottom: 16 },
  topButtons: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  btnPrimary: { flex: 1, backgroundColor: '#3b82f6', padding: 12, borderRadius: 8, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  btnSecondary: { flex: 1, backgroundColor: '#e2e8f0', padding: 12, borderRadius: 8, alignItems: 'center' },
  btnSecondaryText: { color: '#1e3a5f', fontWeight: 'bold', fontSize: 14 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#334155', marginBottom: 8 },
  list: { flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 6, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
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