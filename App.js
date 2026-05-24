import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import SearchScreen from './screens/SearchScreen';
import RegisterScreen from './screens/RegisterScreen';
import DetailScreen from './screens/DetailScreen';
import MapScreen from './screens/MapScreen';
import ProximityNotifier from './screens/ProximityNotifier';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <ProximityNotifier />
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: '스마트라이더' }} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ title: '건물 조회' }} />
        <Stack.Screen name="Register" component={RegisterScreen} options={{ title: '건물 등록' }} />
        <Stack.Screen name="Detail" component={DetailScreen} options={{ title: '상세 정보' }} />
        <Stack.Screen name="Map" component={MapScreen} options={{ title: '지도' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}