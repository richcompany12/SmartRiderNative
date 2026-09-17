import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './AuthContext';
import HomeScreen from './screens/HomeScreen';
import SearchScreen from './screens/SearchScreen';
import RegisterScreen from './screens/RegisterScreen';
import DetailScreen from './screens/DetailScreen';
import MapScreen from './screens/MapScreen';
import LoginScreen from './screens/LoginScreen';
import ProximityNotifier from './screens/ProximityNotifier';
import LocationPickerScreen from './screens/LocationPickerScreen';
import SettingsScreen from './screens/SettingsScreen';
import AlertDetailScreen from './screens/AlertDetailScreen';
import SuggestScreen from './screens/SuggestScreen';
import SuggestAdminScreen from './screens/SuggestAdminScreen';
import PermissionScreen from './screens/PermissionScreen'; 
import DeleteAccountScreen from './screens/DeleteAccountScreen';    // ★ 새 줄 
import { navigationRef } from './navigationRef';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { user } = useAuth();

  return (
    <>
      <Stack.Navigator>
        {user ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Search" component={SearchScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Detail" component={DetailScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Map" component={MapScreen} options={{ title: '지도' }} />
            <Stack.Screen name="LocationPicker" component={LocationPickerScreen} options={{ title: '위치 선택' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AlertDetail" component={AlertDetailScreen} options={{ title: '강력 알림 지점' }} />
            <Stack.Screen name="Suggest" component={SuggestScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SuggestAdmin" component={SuggestAdminScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Permission" component={PermissionScreen} options={{ headerShown: false }} />
            <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ headerShown: false }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
      {user && <ProximityNotifier />}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      {/* ref를 달아야 ProximityNotifier가 네비게이터 밖에서도 화면을 이동시킬 수 있다 */}
      <NavigationContainer ref={navigationRef}>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}