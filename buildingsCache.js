import { getAllBuildings } from './firebaseDB';

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 3 * 60 * 60 * 1000; // 3시간

export const getCachedBuildings = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && _cache && (now - _cacheTime < CACHE_TTL)) {
    return _cache;
  }
  const list = await getAllBuildings();
  _cache = list;
  _cacheTime = now;
  return list;
};