import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, TouchableOpacity, ScrollView, Image, FlatList,
  StyleSheet, Alert, ActivityIndicator, Linking, Platform
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
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
  const { c, font, space, radius, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius, TAP), [c]);
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
        style={[s.card, !item.done && s.cardUnread]}
        activeOpacity={0.9}
        onPress={() => setOpenId(open ? null : item.id)}
      >
        <View style={s.cardHead}>
          {!item.done && <View style={s.dot} />}
          <Text style={s.cardType}>{typeLabel(item.type)}</Text>
          {item.buildingName ? (
            <Text style={s.cardBuilding} numberOfLines={1}>· {item.buildingName}</Text>
          ) : null}
        </View>

        <Text style={s.cardText} numberOfLines={open ? undefined : 2}>
          {item.text}
        </Text>

        <View style={s.cardMeta}>
          {item.images?.length > 0 && (
            <View style={s.metaTag}>
              <Icon name="image-outline" size={13} color={c.textSub} />
              <Text style={s.metaTagText}>{item.images.length}</Text>
            </View>
          )}
          {item.location && (
            <Icon name="map-marker-outline" size={14} color={c.textSub} />
          )}
          <Text style={s.metaEmail} numberOfLines={1}>{item.email}</Text>
          <Text style={s.metaTime}>{timeAgo(item.createdAt)}</Text>
        </View>

        {/* 펼쳤을 때 */}
        {open && (
          <View style={s.detail}>
            {item.images?.map((url, i) => (
              <Image key={i} source={{ uri: url }} style={s.detailImage} resizeMode="contain" />
            ))}

            <View style={s.actionRow}>
              {item.location && (
                <TouchableOpacity style={s.actBtn} onPress={() => openInMap(item.location)}>
                  <Icon name="map-outline" size={18} color={c.accent} />
                  <Text style={s.actBtnText}>지도에서 보기</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.actBtn, item.done ? s.actBtnUndo : s.actBtnDone]}
                onPress={() => toggleDone(item)}
              >
                <Icon
                  name={item.done ? 'undo-variant' : 'check'}
                  size={18}
                  color={item.done ? c.textSub : '#fff'}
                />
                <Text style={[s.actBtnText, !item.done && s.actBtnTextOn]}>
                  {item.done ? '안 읽음으로' : '처리 완료'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.delBtn} onPress={() => handleDelete(item)}>
              <Text style={s.delBtnText}>제보 삭제</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={c.textSub} />
        </TouchableOpacity>
        <Text style={s.screenTitle}>제보 확인</Text>
      </View>

      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tab, tab === 'unread' && s.tabOn]}
          onPress={() => setTab('unread')}
        >
          <Text style={[s.tabText, tab === 'unread' && s.tabTextOn]}>
            안 읽음 {unreadCount}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === 'all' && s.tabOn]}
          onPress={() => setTab('all')}
        >
          <Text style={[s.tabText, tab === 'all' && s.tabTextOn]}>
            전체 {list.length}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          ListEmptyComponent={
            <Text style={s.empty}>
              {tab === 'unread' ? '안 읽은 제보가 없습니다.' : '제보가 없습니다.'}
            </Text>
          }
        />
      )}
    </View>
  );
}

const makeStyles = (c, font, space, radius, TAP) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg, paddingHorizontal: space.lg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: -space.sm, paddingBottom: space.sm,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { ...font.title, color: c.text, marginLeft: space.xs },

  tabRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  tab: {
    flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.surface, borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  tabOn: { backgroundColor: c.accent, borderColor: c.accent },
  tabText: { ...font.sub, fontWeight: '500', color: c.textSub },
  tabTextOn: { color: c.onAccent },
  empty: { textAlign: 'center', color: c.textFaint, ...font.body, marginTop: 48 },

  card: {
    backgroundColor: c.surface, borderRadius: radius.lg, padding: space.md + 2,
    marginBottom: space.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.line,
  },
  cardUnread: { borderColor: c.danger },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger },
  cardType: { ...font.sub, fontWeight: '500', color: c.accent },
  cardBuilding: { flex: 1, ...font.sub, color: c.textMuted },
  cardText: { ...font.body, color: c.text, lineHeight: 22 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm + 2 },
  metaTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaTagText: { ...font.tiny, color: c.textSub },
  metaEmail: { flex: 1, ...font.tiny, color: c.textFaint },
  metaTime: { ...font.tiny, color: c.textFaint },

  detail: {
    marginTop: space.md, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.line, paddingTop: space.md,
  },
  detailImage: {
    width: '100%', height: 240, borderRadius: radius.md,
    backgroundColor: c.surfaceSoft, marginBottom: space.sm,
  },
  actionRow: { flexDirection: 'row', gap: space.sm },
  actBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: TAP, backgroundColor: c.surfaceSoft, borderRadius: radius.md,
  },
  actBtnDone: { backgroundColor: c.accent },
  actBtnUndo: { backgroundColor: c.surfaceSoft },
  actBtnText: { ...font.sub, fontWeight: '500', color: c.accent },
  actBtnTextOn: { color: '#fff' },
  delBtn: { marginTop: space.sm + 2, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  delBtnText: { ...font.sub, color: c.danger },
});