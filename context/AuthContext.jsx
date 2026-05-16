import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { ApiError, studentLogin, studentLogout, studentMe } from '@/lib/api/studentApi';
import { getDevicePushToken, registerStudentPushToken } from '@/lib/pushNotifications';

const TOKEN_KEY = 'student_api_token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);
  const [student, setStudent] = useState(null);
  const [library, setLibrary] = useState(null);
  const [alerts, setAlerts] = useState([]);

  const hydrate = useCallback(async (stored) => {
    if (!stored) {
      setToken(null);
      setStudent(null);
      setLibrary(null);
      setAlerts([]);
      return;
    }
    try {
      const me = await studentMe(stored);
      setToken(stored);
      setStudent(me.student);
      setLibrary(me.library);
      setAlerts(me.alerts ?? []);
      void registerStudentPushToken(stored);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
      setToken(null);
      setStudent(null);
      setLibrary(null);
      setAlerts([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (cancelled) return;
        await hydrate(stored);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    const me = await studentMe(token);
    setStudent(me.student);
    setLibrary(me.library);
    setAlerts(me.alerts ?? []);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void registerStudentPushToken(token);
        void refreshMe();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [token, refreshMe]);

  const login = useCallback(async (loginId, password) => {
    // Grab the device push token before the login request so the backend
    // can store it in the same round-trip — no separate /device-token call needed.
    const deviceToken = await getDevicePushToken();
    if (!deviceToken) {
      console.warn('[push] no device token available during login; backend cannot store FCM token');
    }
    const data = await studentLogin(loginId, password, deviceToken);
    if (deviceToken && data.push_token_registered === false) {
      console.warn('[push] backend login did not store the supplied device token');
    }
    await SecureStore.setItemAsync(TOKEN_KEY, data.token);
    setToken(data.token);
    setStudent(data.student);
    setLibrary(data.library);
    setAlerts(data.alerts ?? []);
    // Keep the post-login call as a fallback for token refreshes / app resumes.
    void registerStudentPushToken(data.token);
  }, []);

  const logout = useCallback(async () => {
    const t = token;
    if (t) {
      try {
        await studentLogout(t);
      } catch {
        /* still clear */
      }
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setStudent(null);
    setLibrary(null);
    setAlerts([]);
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      ready,
      student,
      library,
      alerts,
      login,
      logout,
      refreshMe,
    }),
    [token, ready, student, library, alerts, login, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
