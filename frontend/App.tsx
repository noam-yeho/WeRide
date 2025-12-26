import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import MapScreen from './src/screens/MapScreen';
import SignupScreen from './src/screens/SignupScreen';

const Stack = createNativeStackNavigator();

import * as Linking from 'expo-linking';

const prefix = Linking.createURL('/');

export default function App() {
  const linking = {
    prefixes: [prefix, 'weride://'],
    config: {
      screens: {
        Map: 'convoy/join',
        Login: 'login',
        Signup: 'signup',
        Dashboard: 'dashboard',
      },
    },
  };

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator initialRouteName="Map">
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Map" component={MapScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}