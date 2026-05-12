import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
  useNavigation,
  type NavigationProp,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { useColorScheme } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { LoginScreen } from '@/screens/LoginScreen';
import { BoardListScreen } from '@/screens/BoardListScreen';
import { BoardScreen } from '@/screens/BoardScreen';
import { TaskDetailScreen } from '@/screens/TaskDetailScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { useTheme } from '@/theme';
import type { Board, Task } from '@/api/types';

export type RootStackParamList = {
  Login: undefined;
  BoardList: undefined;
  Board: { board: Board };
  TaskDetail: { board: Board; task: Task | null };
  Dashboard: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
export type Nav = NativeStackNavigationProp<RootStackParamList>;

function BoardListWrapper() {
  const nav = useNavigation<Nav>();
  return (
    <BoardListScreen
      onOpenBoard={(board) => nav.navigate('Board', { board })}
      onOpenDashboard={() => nav.navigate('Dashboard')}
    />
  );
}

function BoardWrapper({ route }: { route: { params: { board: Board } } }) {
  const nav = useNavigation<Nav>();
  return (
    <BoardScreen
      board={route.params.board}
      onBack={() => nav.goBack()}
      onOpenTask={(task) =>
        nav.navigate('TaskDetail', { board: route.params.board, task })
      }
    />
  );
}

function TaskDetailWrapper({
  route,
}: {
  route: { params: { board: Board; task: Task | null } };
}) {
  const nav = useNavigation<Nav>();
  return (
    <TaskDetailScreen
      board={route.params.board}
      task={route.params.task}
      onClose={() => nav.goBack()}
    />
  );
}

function DashboardWrapper() {
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  return <DashboardScreen onBack={() => nav.goBack()} />;
}

export function RootNavigator() {
  const { user, loading } = useAuth();
  const scheme = useColorScheme();
  const t = useTheme();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: t.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const navTheme = scheme === 'light' ? DefaultTheme : DarkTheme;

  return (
    <NavigationContainer
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
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        {user ? (
          <>
            <Stack.Screen name="BoardList" component={BoardListWrapper} />
            <Stack.Screen name="Board" component={BoardWrapper} />
            <Stack.Screen name="Dashboard" component={DashboardWrapper} />
            <Stack.Screen
              name="TaskDetail"
              component={TaskDetailWrapper}
              options={{ presentation: 'modal' }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
