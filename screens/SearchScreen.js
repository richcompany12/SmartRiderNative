import { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, FlatList,
  TouchableOpacity, StyleSheet
} from 'react-native';
import { getAllBuildings } from '../firebaseDB';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SK_SHORTCUTS = ['SK뷰', 'SK1차', 'SK2차', 'SK3차'];

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

const getInitials = (str) => {
  const consonants = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  return str.split('').map(c => {
    const code = c.charCodeAt(0) - 44032;
    if (code > -1 && code < 11172) return consonants[Math.floor(code / 588)];
    return c;
  }).join('');
};

const clean = (str) => str.replace(/[\s{}[\]/?.,;:|)*~`!^\-_+<>@#$%&\\=('"]/g, '').toLowerCase();
const nums = (str) => str.replace(/[^0-9]/g, '');

export default function SearchScreen({ navigation }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [buildings, setBuildings] = useState([]);
  const [showAll, setShowAll] = useState(false);
const [isNumericMode, setIsNumericMode] = useState(true); // 기본 숫자패드
const insets = useSafeAreaInsets();
const inputRef = useRef(null);
 
  useEffect(() => {
    getAllBuildings().then(list => setBuildings([...list].reverse()));
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const results = searchTerm.length > 0
    ? buildings.filter(b => {
        if (!b?.name) return false;
        const name = clean(b.name);
        const term = clean(searchTerm);
        if (name.includes(term)) return true;
        if (getInitials(name).includes(getInitials(term))) return true;
        if (nums(term).length > 0 && nums(name).includes(nums(term))) return true;
        return false;
      })
    : [];

  const displayList = searchTerm.length > 0
    ? results
    : showAll ? buildings : buildings.slice(0, 5);
  
  const toggleKeyboard = () => {
  inputRef.current?.blur();
  setIsNumericMode(prev => !prev);
  setTimeout(() => inputRef.current?.focus(), 50);
};

  const handleCopy = (building) => {
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

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => navigation.navigate('Detail', { buildingId: item.id })}
    >
      <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
      <View style={styles.itemRight}>
        <InfoDots building={item} />
        <TouchableOpacity style={styles.copyBtn} onPress={() => handleCopy(item)}>
          <Text style={styles.copyBtnText}>복사</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>건물 조회</Text>

      {/* 검색창 */}
      <TextInput
  ref={inputRef}
  style={styles.input}
  value={searchTerm}
  onChangeText={setSearchTerm}
  placeholder="건물 이름 검색 (초성, 텍스트, 숫자)"
  placeholderTextColor="#94a3b8"
  inputMode={isNumericMode ? 'numeric' : 'text'}
/>

      {/* SK 단축키 */}
      <View style={styles.shortcuts}>
        {SK_SHORTCUTS.map(sk => (
          <TouchableOpacity
            key={sk}
            style={styles.shortcutBtn}
            onPress={() => setSearchTerm(sk)}
          >
            <Text style={styles.shortcutText}>{sk}</Text>
          </TouchableOpacity>
        ))}
        {searchTerm.length > 0 && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => setSearchTerm('')}
          >
            <Text style={styles.clearText}>✕ 초기화</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 헤더 */}
      <View style={styles.listHeader}>
  <Text style={styles.listTitle}>
    {searchTerm.length > 0
      ? `검색 결과 ${results.length}개`
      : showAll ? '모든 건물' : '최근 등록된 건물'}
  </Text>
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <TouchableOpacity
      onPress={toggleKeyboard}
      style={{
        backgroundColor: isNumericMode ? '#1e40af' : '#f3f4f6',
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12
      }}
    >
      <Text style={{ color: isNumericMode ? '#fff' : '#374151', fontWeight: 'bold', fontSize: 12 }}>
        {isNumericMode ? '123' : '가나다'}
      </Text>
    </TouchableOpacity>
    {searchTerm.length === 0 && (
      <TouchableOpacity onPress={() => setShowAll(p => !p)}>
        <Text style={styles.toggleText}>
          {showAll ? '최근만 보기' : '모두 보기'}
        </Text>
      </TouchableOpacity>
    )}
  </View>
</View>

      <FlatList
        data={displayList}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
      />

      {/* 등록 버튼 */}
      <TouchableOpacity
  style={[styles.registerBtn, { marginBottom: insets.bottom + 8 }]}
  onPress={() => navigation.navigate('Register', {})}
>
        <Text style={styles.registerBtnText}>+ 건물 등록</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1e3a5f', marginBottom: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 8, color: '#1e293b' },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  shortcutBtn: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  shortcutText: { color: '#c2410c', fontSize: 13 },
  clearBtn: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  clearText: { color: '#64748b', fontSize: 13 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  listTitle: { fontSize: 16, fontWeight: 'bold', color: '#334155' },
  toggleText: { color: '#3b82f6', fontSize: 14 },
  list: { flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 6, elevation: 2 },
  itemName: { flex: 1, fontSize: 16, color: '#1e293b' },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dots: { flexDirection: 'column', alignItems: 'center', gap: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  copyBtn: { backgroundColor: '#e2e8f0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  copyBtnText: { fontSize: 12, color: '#475569' },
  registerBtn: { backgroundColor: '#3b82f6', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  registerBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});