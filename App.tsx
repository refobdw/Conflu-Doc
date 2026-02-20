import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import { NewDocumentScreen } from './src/screens/NewDocument';
import { EditDocumentScreen } from './src/screens/EditDocument';
import { DailyMeetingScreen } from './src/screens/DailyMeeting';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <Tab.Navigator
          screenOptions={{
            tabBarActiveTintColor: '#0052CC',
            tabBarInactiveTintColor: '#888',
            headerStyle: { backgroundColor: '#0052CC' },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: 'bold' },
          }}
        >
          <Tab.Screen
            name="새 문서"
            component={NewDocumentScreen}
            options={{ tabBarIcon: () => <Text>📝</Text> }}
          />
          <Tab.Screen
            name="문서 수정"
            component={EditDocumentScreen}
            options={{ tabBarIcon: () => <Text>✏️</Text> }}
          />
          <Tab.Screen
            name="회의록"
            component={DailyMeetingScreen}
            options={{ tabBarIcon: () => <Text>📋</Text> }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
