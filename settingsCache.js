import AsyncStorage from '@react-native-async-storage/async-storage';

const RADIUS_KEY = 'proximity_radius';
const DEFAULT_RADIUS = 30; // 기본값 30m

let _radiusCache = null;

export const getRadius = async () => {
  if (_radiusCache !== null) return _radiusCache;
  try {
    const saved = await AsyncStorage.getItem(RADIUS_KEY);
    _radiusCache = saved ? parseInt(saved, 10) : DEFAULT_RADIUS;
  } catch (e) {
    _radiusCache = DEFAULT_RADIUS;
  }
  return _radiusCache;
};

export const setRadius = async (value) => {
  _radiusCache = value;
  try {
    await AsyncStorage.setItem(RADIUS_KEY, String(value));
  } catch (e) {}
};