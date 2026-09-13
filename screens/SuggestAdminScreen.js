import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, TouchableOpacity, ScrollView, Image, FlatList,
  StyleSheet, Alert, ActivityIndicator, Linking, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getAllSuggestions, setSuggestionDone, deleteSuggestion, typeLabel,
} from '../suggestionsDB';

// "3분 전", "2시간 전" 처럼 보여준다. 목록에서 시각보다 이게 읽기 쉽다.
const timeAgo = (ms) => {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  return new Date(ms).toLocaleDateString('ko-KR');
};

export default function SuggestAdminScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('unread');   // 'unread' | 'all'
  const [openId, setOpenId] = useState(null); // 펼쳐진 제보

  const load = async () => {
    setLoading(true);
    try {
      setList(await getAllSuggestions());
    } catch (e) {
      Alert.alert('오류', '제보를 불러오지 못했습니다.\n권한을 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const unreadCount = list.filter(s => !s.done).length;
  const shown = tab === 'unread' ? list.filter(s => !s.done) : list;

  const toggleDone = async (item) => {
    try {
      await setSuggestionDone(item.id, !item.done);
      setList(p => p.map(s => s.id === item.id ? { ...s, done: !s.done } : s));
    } catch (e) {
      Alert.alert('오류', '상태를 바꾸지 못했습니다.');
    }
  };

  const handleDelete = (item) => {
    Alert.alert('제보 삭제', '이 제보를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          try {
            await deleteSuggestion(item.id);
            setList(p => p.filter(s => s.id !== item.id));
          } catch (e) {
            Alert.alert('오류', '삭제하지 못했습니다.');
          }
        }
      }
    ]);
  };

  // 지도 앱으로 열기. 현장에 가보거나 위치를 확인할 때 쓴다.
  const openInMap = (loc) => {
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?ll=${loc.lat},${loc.lng}`
      : `geo:${loc.lat},${loc.lng}?q=${loc.lat},${loc.lng}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('오류', '지도 앱을 열지 못했습니다.');
    });
  };

  const renderItem = ({ item }) => {
    const open = openId === item.id;
    return (
      <TouchableOpacity
        style={[styles.card, !item.done && styles.cardUnread]}
        activeOpacity={0.9}
        onPress={() => setOpenId(open ? null : item.id)}
      >
        <View style={styles.cardHead}>
          {!item.done && <View style={styles.dot} />}
          <Text style={styles.cardType}>{typeLabel(item.type)}</Text>
          {item.buildingName ? (
            <Text style={styles.cardBuilding} numberOfLines={1}>· {item.buildingName}</Text>
          ) : null}
        </View>

        <Text style={styles.cardText} numberOfLines={open ? undefined : 2}>
          {item.text}
        </Text>

        <View style={styles.cardMeta}>
          {item.images?.length > 0 && (
            <Text style={styles.metaTag}>📷 {item.images.length}</Text>
          )}
          {item.location && <Text style={styles.metaTag}>📍</Text>}
          <Text style={styles.metaEmail} numberOfLines={1}>{item.email}</Text>
          <Text style={styles.metaTime}>{timeAgo(item.createdAt)}</Text>
        </View>

        {/* 펼쳤을 때 */}
        {open && (
          <View style={styles.detail}>
            {item.images?.map((url, i) => (
              <Image key={i} source={{ uri: url }} style={styles.detailImage} resizeMode="contain" />
            ))}

            <View style={styles.actionRow}>
              {item.location && (
                <TouchableOpacity style={styles.actBtn} onPress={() => openInMap(item.location)}>
                  <Text style={styles.actBtnText}>🗺 지도에서 보기</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actBtn, item.done ? styles.actBtnUndo : styles.actBtnDone]}
                onPress={() => toggleDone(item)}
              >
                <Text style={[styles.actBtnText, !item.done && styles.actBtnTextOn]}>
                  {item.done ? '↩ 안 읽음으로' : '✓ 처리 완료'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(item)}>
              <Text style={styles.delBtnText}>제보 삭제</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>제보 확인</Text>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'unread' && styles.tabOn]}
          onPress={() => setTab('unread')}
        >
          <Text style={[styles.tabText, tab === 'unread' && styles.tabTextOn]}>
            안 읽음 {unreadCount}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'all' && styles.tabOn]}
          onPress={() => setTab('all')}
        >
          <Text style={[styles.tabText, tab === 'all' && styles.tabTextOn]}>
            전체 {list.length}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === 'unread' ? '안 읽은 제보가 없습니다.' : '제보가 없습니다.'}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1e3a5f', marginBottom: 12 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: {
    flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8,
  },
  tabOn: { backgroundColor: '#1e3a5f', borderColor: '#1e3a5f' },
  tabText: { fontSize: 14, color: '#475569', fontWeight: 'bold' },
  tabTextOn: { color: '#fff' },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 14 },

  card: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    borderLeftWidth: 4, borderLeftColor: '#e2e8f0', elevation: 1,
  },
  cardUnread: { borderLeftColor: '#ef4444' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  cardType: { fontSize: 13, fontWeight: 'bold', color: '#1e3a5f' },
  cardBuilding: { flex: 1, fontSize: 13, color: '#64748b' },
  cardText: { fontSize: 15, color: '#1e293b', lineHeight: 22 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  metaTag: { fontSize: 12, color: '#475569' },
  metaEmail: { flex: 1, fontSize: 12, color: '#94a3b8' },
  metaTime: { fontSize: 12, color: '#94a3b8' },

  detail: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 12 },
  detailImage: {
    width: '100%', height: 240, borderRadius: 8,
    backgroundColor: '#f1f5f9', marginBottom: 8,
  },
  actionRow: { flexDirection: 'row', gap: 8 },
  actBtn: {
    flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#f1f5f9', borderRadius: 8,
  },
  actBtnDone: { backgroundColor: '#16a34a' },
  actBtnUndo: { backgroundColor: '#f1f5f9' },
  actBtnText: { fontSize: 14, fontWeight: 'bold', color: '#475569' },
  actBtnTextOn: { color: '#fff' },
  delBtn: { marginTop: 10, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  delBtnText: { color: '#dc2626', fontSize: 13 },
});