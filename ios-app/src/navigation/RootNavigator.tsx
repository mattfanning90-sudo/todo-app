import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Icon } from '@/components/Icon';
import {
  NavigationContainer, DarkTheme, DefaultTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/theme';

// ── Type imports from the canonical types file ───────────────────────────────
import type {
  TodayStackParams,
  BoardStackParams,
  ProfileStackParams,
  RootStackParamList,
} from '@/navigation/types';

// Re-export so existing code that imports from RootNavigator still works.
export type { TodayStackParams, BoardStackParams, ProfileStackParams } from '@/navigation/types';
export type { RootStackParamList, Nav } from '@/navigation/types';

// Navigation ref — attach to <NavigationContainer ref={navigationRef}> so that
// code outside the React tree (e.g. App-level notification listeners) can call
// navigationRef.navigate() after the container is ready.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// ── Screen imports ──────────────────────────────────────────────────────────
import { LoginScreen } from '@/screens/LoginScreen';
import { TodayScreen } from '@/screens/TodayScreen';
import { BoardScreen } from '@/screens/BoardScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { TaskDetailScreen } from '@/screens/TaskDetailScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { NotificationsScreen } from '@/screens/NotificationsScreen';
import { ArchivedScreen } from '@/screens/ArchivedScreen';
import { BoardMembersScreen } from '@/screens/BoardMembersScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { AppearanceScreen } from '@/screens/AppearanceScreen';
import { BoardListScreen } from '@/screens/BoardListScreen';
import { ImportScreen } from '@/screens/ImportScreen';

// ── Stack / tab navigator instances ─────────────────────────────────────────
const TodayStack = createNativeStackNavigator<TodayStackParams>();
const BoardStack = createNativeStackNavigator<BoardStackParams>();
const ProfileStack = createNativeStackNavigator<ProfileStackParams>();
const Tab = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator<{ Login: undefined }>();

// ── Tab icon helper ──────────────────────────────────────────────────────────
function TabIcon({ label, color }: { label: string; focused: boolean; color: string }) {
  const iconName = label === 'Today' ? 'calendar' : label === 'Board' ? 'board' : 'profile';
  return <Icon name={iconName as 'calendar' | 'board' | 'profile'} label="" color={color} size={22} />;
}

// ── Per-tab stack navigators ─────────────────────────────────────────────────
function TodayNav() {
  return (
    <TodayStack.Navigator screenOptions={{ headerShown: false }}>
      <TodayStack.Screen name="Today" component={TodayScreen} />
      <TodayStack.Screen name="Search" component={SearchScreen} />
      <TodayStack.Screen name="Notifications" component={NotificationsScreen} />
      <TodayStack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{ presentation: 'modal' }}
      />
    </TodayStack.Navigator>
  );
}

function BoardNav() {
  return (
    <BoardStack.Navigator screenOptions={{ headerShown: false }}>
      <BoardStack.Screen name="Board" component={BoardScreen} />
      <BoardStack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{ presentation: 'modal' }}
      />
      <BoardStack.Screen name="Archived" component={ArchivedScreen} />
      <BoardStack.Screen name="BoardMembers" component={BoardMembersScreen} />
      <BoardStack.Screen name="Search" component={SearchScreen} />
      <BoardStack.Screen name="Notifications" component={NotificationsScreen} />
      <BoardStack.Screen name="BoardList" component={BoardListScreen} />
    </BoardStack.Navigator>
  );
}

function ProfileNav() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
      <ProfileStack.Screen name="Appearance" component={AppearanceScreen} />
      <ProfileStack.Screen name="BoardList" component={BoardListScreen} />
      <ProfileStack.Screen name="Search" component={SearchScreen} />
      <ProfileStack.Screen name="Notifications" component={NotificationsScreen} />
      <ProfileStack.Screen name="Import" component={ImportScreen} />
    </ProfileStack.Navigator>
  );
}

// ── Root navigator ───────────────────────────────────────────────────────────
export function RootNavigator() {
  const { user, loading } = useAuth();
  const t = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const navTheme = t.name === 'light' ? DefaultTheme : DarkTheme;

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={{
        ...navTheme,
        colors: {
          ...navTheme.colors,
          background: t.bg,
          card: t.surface,
          text: t.text,
          border: t.border,
          primary: t.accent,
        },
      }}
    >
      {user ? (
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: t.accent,
            tabBarInactiveTintColor: t.textMuted,
            tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
            tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) =>
              <TabIcon label={route.name} focused={focused} color={color} />,
          })}
        >
          <Tab.Screen name="Today" component={TodayNav} />
          <Tab.Screen name="Board" component={BoardNav} />
          <Tab.Screen name="Profile" component={ProfileNav} />
        </Tab.Navigator>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
