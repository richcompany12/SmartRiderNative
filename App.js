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

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { user } = useAuth();

  return (
    <>
      <Stack.Navigator>
        {user ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: '스마트라이더' }} />
            <Stack.Screen name="Search" component={SearchScreen} options={{ title: '건물 조회' }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: '건물 등록' }} />
            <Stack.Screen name="Detail" component={DetailScreen} options={{ title: '상세 정보' }} />
            <Stack.Screen name="Map" component={MapScreen} options={{ title: '지도' }} />
            <Stack.Screen name="LocationPicker" component={LocationPickerScreen} options={{ title: '위치 선택' }} />
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
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}