import { useEffect, useRef, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { getAllAlertPoints } from '../firebaseDB';
import { getCachedBuildings } from '../buildingsCache';

const KAKAO_API_KEY = '7d65ade73c1b3e7d64687306911f7ce7';

export default function MapScreen({ navigation }) {
  const webViewRef = useRef(null);
  const [buildings, setBuildings] = useState([]);
  const [alertPoints, setAlertPoints] = useState([]);
  const [myLocation, setMyLocation] = useState(null);

  // 팝업이 이미 떠 있으면 두 번째 요청을 무시하기 위한 잠금장치
  const alertOpenRef = useRef(false);

  const refreshMyLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
    const newLoc = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    setMyLocation(newLoc);
    webViewRef.current?.postMessage(JSON.stringify({ type: 'UPDATE_MY_LOCATION', myLocation: newLoc }));
  };

  const loadData = async () => {
    const bList = await getCachedBuildings();
    const aList = await getAllAlertPoints();
    setBuildings(bList);
    setAlertPoints(aList);
  };

  useEffect(() => {
    (async () => {
      await refreshMyLocation();
      await loadData();
    })();
  }, []);

  // 지도 탭에 다시 들어올 때마다 현재위치 + 목록 갱신
  // (등록 화면에서 캐시를 무효화했으면 여기서 새 건물이 바로 반영된다)
  useFocusEffect(
    useCallback(() => {
      refreshMyLocation();
      loadData();
    }, [])
  );

  // 데이터 준비되면 WebView로 전송
  useEffect(() => {
    if (!myLocation) return;
    sendToMap();
  }, [myLocation, buildings, alertPoints]);

  const sendToMap = () => {
    const msg = JSON.stringify({
      type: 'INIT',
      myLocation,
      buildings: buildings.filter(b => b.location),
      alertPoints: alertPoints.filter(a => a.location),
    });
    webViewRef.current?.postMessage(msg);
  };

  const moveToMyLocation = async () => {
    await refreshMyLocation();
  };

  // 팝업을 닫은 뒤 시간차를 두고 이동한다.
  // 팝업이 떠 있는 상태에서 navigate를 부르면 에러 없이 조용히 무시되는 경우가 있다.
  const goRegister = (params) => {
    alertOpenRef.current = false;
    setTimeout(() => navigation.navigate('Register', params), 250);
  };

  // WebView → RN 메시지 처리
  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'JS_ERROR') { alert('지도 에러: ' + data.msg); return; }

      if (data.type === 'MARKER_CLICK') {
        navigation.navigate('Detail', { buildingId: data.id });
        return;
      }

      if (data.type === 'LONG_PRESS') {
        // 이미 팝업이 떠 있으면 무시 (창이 겹쳐 뜨는 것을 막는다)
        if (alertOpenRef.current) return;
        alertOpenRef.current = true;

        const { lat, lng, nearest } = data;

        if (nearest) {
          Alert.alert(
            '근처 건물 발견',
            `📍 근처에 "${nearest.name}" 이(가) 있습니다.\n\n복사해서 등록하시겠습니까?`,
            [
              {
                text: '복사 등록',
                onPress: () => goRegister({
                  buildingData: {
                    name: nearest.name,
                    memo: nearest.memo || '',
                    memo2: nearest.memo2 || '',
                    note: nearest.note || '',
                    shortcut: nearest.shortcut || '',
                    images: []
                  },
                  location: { lat, lng }
                })
              },
              {
                text: '새로 등록',
                onPress: () => goRegister({ location: { lat, lng } })
              },
              {
                text: '취소',
                style: 'cancel',
                // 취소는 잠금만 풀고 아무 일도 하지 않는다
                onPress: () => { alertOpenRef.current = false; }
              }
            ],
            {
              cancelable: true,
              // 바깥을 눌러 닫았을 때도 잠금 해제
              onDismiss: () => { alertOpenRef.current = false; }
            }
          );
        } else {
          goRegister({ location: { lat, lng } });
        }
      }
    } catch (e) {}
  };

  const mapHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    * {
      margin: 0; padding: 0; box-sizing: border-box;
      /* 길게 눌러도 글자가 선택되거나 복사 메뉴가 뜨지 않게 */
      -webkit-user-select: none; user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
    }
    body { width: 100vw; height: 100vh; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .overlay {
      background: #fff; border-radius: 10px; padding: 10px 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      font-family: sans-serif; max-width: 220px; position: relative;
      border-left: 4px solid #3b82f6;
    }
    .overlay-name { font-weight: bold; font-size: 13px; color: #1e3a5f; margin-bottom: 4px; padding-right: 18px; }
    .overlay-memo { font-size: 12px; color: #374151; background: #f0f4ff; padding: 4px 6px; border-radius: 6px; font-family: monospace; word-break: break-all; }
    .overlay-memo2 { margin-top: 4px; background: #fff7ed; color: #9a3412; }
    .overlay-hint { font-size: 10px; color: #9ca3af; margin-top: 6px; text-align: center; }
    .overlay-close { position: absolute; top: 2px; right: 6px; cursor: pointer; font-size: 18px; line-height: 18px; color: #9ca3af; padding: 2px 4px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_API_KEY}&autoload=false"></script>
  <script>
    window.onerror = function(msg, src, line) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type:'JS_ERROR', msg: msg + ' @' + line }));
      return true;
    };
    if (typeof kakao === 'undefined') {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type:'JS_ERROR', msg: 'kakao SDK 로드 실패 (네트워크/도메인)' }));
    }

    var map, myMarker, currentOverlay;

    // ★ INIT이 여러 번 와도 리스너가 쌓이지 않도록 데이터는 전역에 보관한다
    var mapBuildings = [];
    var placedMarkers = [];   // 다시 그릴 때 지우기 위해 보관

    kakao.maps.load(function() {
      map = new kakao.maps.Map(document.getElementById('map'), {
        center: new kakao.maps.LatLng(37.5665, 126.9780),
        level: 3
      });

      // ★ 롱프레스 리스너는 여기서 딱 한 번만 등록한다.
      //    initMap 안에 두면 INIT이 올 때마다 리스너가 쌓여서
      //    한 번 눌렀는데 팝업이 여러 장 뜬다. (이번 버그의 원인)
      setupLongPress();

      document.addEventListener('message', handleRNMessage);
      window.addEventListener('message', handleRNMessage);
    });

    function handleRNMessage(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'INIT') {
          initMap(data);
        } else if (data.type === 'MOVE_TO_MY_LOCATION') {
          if (myMarker) map.setCenter(myMarker.getPosition());
        } else if (data.type === 'UPDATE_MY_LOCATION') {
          var newPos = new kakao.maps.LatLng(data.myLocation.lat, data.myLocation.lng);
          if (myMarker) myMarker.setPosition(newPos);
          map.setCenter(newPos);
        }
      } catch(err) {}
    }

    function calcDistance(lat1, lng1, lat2, lng2) {
      var R = 6371000;
      var dLat = (lat2 - lat1) * Math.PI / 180;
      var dLng = (lng2 - lng1) * Math.PI / 180;
      var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
              Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
              Math.sin(dLng/2)*Math.sin(dLng/2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function findNearest(lat, lng) {
      var nearest = null, minDist = Infinity;
      mapBuildings.forEach(function(b) {
        if (!b.location) return;
        var d = calcDistance(lat, lng, b.location.lat, b.location.lng);
        if (d < minDist) { minDist = d; nearest = b; }
      });
      return minDist < 500 ? nearest : null;
    }

    function clearMarkers() {
      placedMarkers.forEach(function(m) { m.setMap(null); });
      placedMarkers = [];
    }

    function initMap(data) {
      mapBuildings = data.buildings || [];

      var myLat = data.myLocation.lat;
      var myLng = data.myLocation.lng;
      var myPos = new kakao.maps.LatLng(myLat, myLng);
      map.setCenter(myPos);

      // 내 위치 마커
      if (myMarker) myMarker.setMap(null);
      myMarker = new kakao.maps.Marker({
        position: myPos, map: map,
        image: new kakao.maps.MarkerImage(
          'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png',
          new kakao.maps.Size(24, 35)
        )
      });

      // ★ 기존 마커를 지우고 다시 그린다 (안 지우면 핀이 겹겹이 쌓인다)
      clearMarkers();

      // 건물 마커
      mapBuildings.forEach(function(b) {
        var marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(b.location.lat, b.location.lng),
          map: map, title: b.name
        });
        kakao.maps.event.addListener(marker, 'click', function() {
          showOverlay(b, false);
        });
        placedMarkers.push(marker);
      });

      // 알림 마커
      (data.alertPoints || []).forEach(function(a) {
        var marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(a.location.lat, a.location.lng),
          map: map,
          image: new kakao.maps.MarkerImage(
            'https://cdn-icons-png.flaticon.com/512/564/564619.png',
            new kakao.maps.Size(35, 35)
          ),
          title: a.name
        });
        kakao.maps.event.addListener(marker, 'click', function() {
          showOverlay(a, true);
        });
        placedMarkers.push(marker);
      });
    }

    function setupLongPress() {
      var el = document.getElementById('map');
      var touchTimer = null, touchLatLng = null;

      el.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;
        if (!map) return;
        // ★ 메모창 위에서 시작한 터치는 지도의 롱프레스로 치지 않는다.
        //   (메모창이 지도 안에 들어있는 DOM이라 그냥 두면 둘 다 발동한다)
        if (e.target && e.target.closest && e.target.closest('.overlay')) return;
        var touch = e.touches[0];
        var rect = el.getBoundingClientRect();
        var proj = map.getProjection();
        var point = new kakao.maps.Point(touch.clientX - rect.left, touch.clientY - rect.top);
        touchLatLng = proj.coordsFromContainerPoint(point);

        clearTimeout(touchTimer);
        touchTimer = setTimeout(function() {
          if (!touchLatLng) return;
          var lat = touchLatLng.getLat();
          var lng = touchLatLng.getLng();
          var nearest = findNearest(lat, lng);
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'LONG_PRESS', lat: lat, lng: lng,
            nearest: nearest ? {
              id: nearest.id, name: nearest.name,
              memo: nearest.memo || '', memo2: nearest.memo2 || '',
              note: nearest.note || '', shortcut: nearest.shortcut || ''
            } : null
          }));
        }, 800);
      }, { passive: true });

      el.addEventListener('touchend', function() { clearTimeout(touchTimer); });
      el.addEventListener('touchmove', function() { clearTimeout(touchTimer); });
      el.addEventListener('touchcancel', function() { clearTimeout(touchTimer); });
    }

    function showOverlay(item, isAlert) {
      if (currentOverlay) { currentOverlay.setMap(null); currentOverlay = null; }
      var content = '<div class="overlay" id="ov_' + item.id + '">' +
        '<div class="overlay-close" onclick="closeOverlay()">×</div>' +
        '<div class="overlay-name">' + item.name + '</div>' +
        (item.memo ? '<div class="overlay-memo">' + item.memo + '</div>' : '') +
        (item.memo2 ? '<div class="overlay-memo overlay-memo2">' + item.memo2 + '</div>' : '') +
        '<div class="overlay-hint">👆 빠르게 두 번 탭 → 상세보기</div>' +
        '</div>';
      var overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(item.location.lat, item.location.lng),
        content: content, yAnchor: 2.2, map: map
      });
      currentOverlay = overlay;

      setTimeout(function() {
        var el = document.getElementById('ov_' + item.id);
        if (!el) return;

        var lastTapAt = 0;

        // 닫기(×) 버튼인지 확인
        function isCloseBtn(t) {
          return t && t.className && String(t.className).indexOf('overlay-close') > -1;
        }

        el.addEventListener('touchstart', function(e) {
          // 지도로 터치가 새어나가지 않게 막는다 (지도 확대/이동 방지)
          e.stopPropagation();
          if (isCloseBtn(e.target)) return;
          e.preventDefault();
        }, { passive: false });

        el.addEventListener('touchend', function(e) {
          e.stopPropagation();

          if (isCloseBtn(e.target)) { closeOverlay(); return; }

          // ── 빠르게 두 번 탭하면 상세보기 ──
          var now = Date.now();
          if (now - lastTapAt < 400) {
            lastTapAt = 0;
            overlay.setMap(null);
            currentOverlay = null;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MARKER_CLICK', id: item.id }));
          } else {
            lastTapAt = now;
          }
        }, { passive: false });
      }, 100);
    }

    function closeOverlay() {
      if (currentOverlay) { currentOverlay.setMap(null); currentOverlay = null; }
    }
  </script>
</body>
</html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml }}
        style={styles.map}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
      />
      {/* 내 위치 버튼 */}
      <TouchableOpacity style={styles.myLocBtn} onPress={moveToMyLocation}>
        <Text style={styles.myLocBtnText}>📍</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  myLocBtn: {
    position: 'absolute', bottom: 30, right: 16,
    backgroundColor: '#fff', borderRadius: 30, width: 52, height: 52,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 6
  },
  myLocBtnText: { fontSize: 24 },
});