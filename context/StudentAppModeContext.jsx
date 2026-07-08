import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const StudentAppModeContext = createContext(null);

export function StudentAppModeProvider({ children, initialMode = 'study' }) {
  const [studentMode, setStudentMode] = useState(initialMode === 'library' ? 'library' : 'study');

  useEffect(() => {
    setStudentMode(initialMode === 'library' ? 'library' : 'study');
  }, [initialMode]);

  const value = useMemo(() => ({
    studentMode,
    setStudentMode,
  }), [studentMode]);

  return (
    <StudentAppModeContext.Provider value={value}>
      {children}
    </StudentAppModeContext.Provider>
  );
}

export function useStudentAppMode() {
  const value = useContext(StudentAppModeContext);
  if (!value) {
    return { studentMode: 'study', setStudentMode: () => {} };
  }
  return value;
}
