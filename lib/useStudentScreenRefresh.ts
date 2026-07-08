import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

import { useAuth } from '@/context/AuthContext';

type RefreshHandler = () => void | Promise<void>;

export function useStudentScreenRefresh(onRefresh: RefreshHandler, deps: ReadonlyArray<unknown> = []) {
  const { refreshMe } = useAuth() as { refreshMe: () => Promise<void> };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      void (async () => {
        try {
          await refreshMe();
        } catch {
          // Keep the last known library profile when background refresh fails.
        }
        if (!cancelled) {
          await Promise.resolve(onRefresh());
        }
      })();

      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshMe, onRefresh, ...deps]),
  );
}
