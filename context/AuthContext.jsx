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

import {
  ApiError,
  studentConnectLibrary,
  studentEmailLogin,
  studentLogout,
  studentMe,
} from '@/lib/api/studentApi';
import { getDevicePushToken, registerStudentPushToken } from '@/lib/pushNotifications';

const TOKEN_KEY = 'student_api_token';
const STUDENT_APP_MODE_KEY = 'student_app_mode';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);
  const [student, setStudent] = useState(null);
  const [library, setLibrary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [studentPreferredMode, setStudentPreferredMode] = useState('study');

  const clearSessionState = useCallback(() => {
    setToken(null);
    setStudent(null);
    setLibrary(null);
    setAlerts([]);
    setStudentPreferredMode('study');
  }, []);

  const hydrate = useCallback(async () => {
    const storedMode = await SecureStore.getItemAsync(STUDENT_APP_MODE_KEY);
    setStudentPreferredMode(storedMode === 'library' ? 'library' : 'study');

    const stored = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!stored) {
      clearSessionState();
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
      clearSessionState();
    }
  }, [clearSessionState]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (cancelled) return;
        await hydrate();
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

  const applyStudentSession = useCallback(async (data, preferredMode = null) => {
    await SecureStore.setItemAsync(TOKEN_KEY, data.token);
    if (preferredMode) {
      await SecureStore.setItemAsync(STUDENT_APP_MODE_KEY, preferredMode);
      setStudentPreferredMode(preferredMode);
    }
    setToken(data.token);
    setStudent(data.student);
    setLibrary(data.library);
    setAlerts(data.alerts ?? []);
    void registerStudentPushToken(data.token);
    return data;
  }, []);

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

  const emailStudentAuth = useCallback(async (payload) => {
    const deviceToken = await getDevicePushToken();
    const data = await studentEmailLogin(payload, deviceToken);
    await applyStudentSession(data, 'study');
    return data;
  }, [applyStudentSession]);

  const connectStudentLibrary = useCallback(async (loginId, password) => {
    if (!token) throw new Error('Student session is not ready.');
    const data = await studentConnectLibrary(token, loginId, password);
    await applyStudentSession(data, 'library');
    return data;
  }, [applyStudentSession, token]);

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
    await SecureStore.deleteItemAsync(STUDENT_APP_MODE_KEY);
    clearSessionState();
  }, [clearSessionState, token]);

  const value = useMemo(
    () => ({
      token,
      ready,
      student,
      library,
      alerts,
      studentPreferredMode,
      emailStudentAuth,
      connectStudentLibrary,
      logout,
      refreshMe,
    }),
    [token, ready, student, library, alerts, studentPreferredMode, emailStudentAuth, connectStudentLibrary, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
