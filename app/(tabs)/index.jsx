import { ScreenWithBanner } from '@/components/ScreenWithBanner';
import { useAuth } from '@/context/AuthContext';
import { useStudentAppMode } from '@/context/StudentAppModeContext';
import {
  ApiError,
  studentAllTimeFees,
  studentAttendance,
  studentCheckIn,
  studentCheckOut,
  studentHolidays,
  studentUpdateSelfStudy,
  studentQrPunch,
} from '@/lib/api/studentApi';
import { formatInr, ymNow } from '@/lib/format';
import { cardFlat, layout, palette, shadow } from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from '@react-navigation/native';
import {
  attendanceModeAllowsButton,
  attendanceModeAllowsQr,
  attendanceModeShortLabel,
  normalizeAttendanceMode,
} from '@/lib/attendanceMode';
import { showInterstitialAfterScreenSwitches, showPunchAppOpen } from '@/lib/adMob';
import { scheduleSelfStudyNudges } from '@/lib/pushNotifications';
import {
  activeChainSegment,
  chainDisplayName,
  checkInOpensMinutes,
  checkOutOpensMinutes,
  findUpcomingSlot,
  formatMinutesAsHi,
  isCheckInWindowForChain,
  isFullCheckOutWindowForChain,
  PUNCH_EARLY_MINUTES,
  minutesNow,
  partitionSlotChains,
  segmentFullyDone,
  sortedSlots,
  slotTimingLabel,
} from '@/lib/slotAttendanceWindow';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TEAL = '#0d9488';
const TEAL_SOFT = '#ccfbf1';
const HERO_TOP = '#1A367C';
const HERO_BOTTOM = '#243d8f';
const PREPARATION_OPTIONS = ['SSC', 'UPSC', 'Banking', 'Railway', 'NEET', 'JEE', 'Defence', 'State PCS', 'School/College', 'Other'];

function localYmd() {
  const d = new Date();
  const p = (n) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function greetingPhrase() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatTodayHeading() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

function isYmdDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function daysUntilYmd(value) {
  if (!isYmdDate(value)) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  const target = new Date(year, month - 1, day);
  if (target.getFullYear() !== year || target.getMonth() !== month - 1 || target.getDate() !== day) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function countdownText(value, fallback = 'Set date') {
  const days = daysUntilYmd(value);
  if (days === null) return fallback;
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days left`;
}

function sessionStatusMeta({
  open,
  allSlotsComplete,
  canRecheckInWindow,
  sessionOpen,
  beforeCheckInWindow,
  segmentDone,
  inCheckInWindow,
}) {
  if (allSlotsComplete && !canRecheckInWindow) {
    return { label: 'Complete', tone: 'success', icon: 'check-circle' };
  }
  if (sessionOpen) {
    return { label: 'In session', tone: 'active', icon: 'play-circle' };
  }
  if (canRecheckInWindow) {
    return { label: 'Ready', tone: 'ready', icon: 'sign-in' };
  }
  if (beforeCheckInWindow) {
    return { label: 'Upcoming', tone: 'warn', icon: 'clock-o' };
  }
  if (segmentDone) {
    return { label: 'Break', tone: 'muted', icon: 'pause-circle' };
  }
  if (open && inCheckInWindow) {
    return { label: 'Ready', tone: 'ready', icon: 'sign-in' };
  }
  if (!open) {
    return { label: 'Closed', tone: 'danger', icon: 'lock' };
  }
  return { label: 'Waiting', tone: 'muted', icon: 'hourglass-half' };
}

function StatTile({ icon, label, value, accent }) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statTileIcon, accent && { backgroundColor: accent.bg }]}>
        <FontAwesome name={icon} size={14} color={accent?.fg ?? palette.primary} />
      </View>
      <Text style={styles.statTileValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statTileLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function slotDisplayName(slot) {
  if (!slot) return '';
  const label = slot.label || slot.slot_label;
  const range =
    slot.slot_start && slot.slot_end ? `${slot.slot_start}–${slot.slot_end}` : '';
  return [label, range].filter(Boolean).join(' · ') || 'Time slot';
}

function rowForSlot(rows, slotId) {
  if (slotId == null) return null;
  return rows.find((r) => Number(r.seat_time_slot_id) === Number(slotId)) ?? null;
}

function findRelevantChain(timeSlots, todayRows) {
  const chains = partitionSlotChains(timeSlots ?? []);
  if (!chains.length) return { chain: [], segment: [], first: null };

  const openRow = todayRows.find((r) => r.punch_in_at && !r.punch_out_at);
  if (openRow) {
    for (const chain of chains) {
      const hit = chain.find((s) => Number(s.id) === Number(openRow.seat_time_slot_id));
      if (hit) {
        const segment = activeChainSegment(chain, todayRows);
        return { chain, segment, first: segment[0] ?? hit };
      }
    }
  }

  const nowM = minutesNow();
  for (const chain of chains) {
    const segment = activeChainSegment(chain, todayRows);
    if (!segment.length) continue;
    if (isCheckInWindowForChain(segment, nowM)) {
      return { chain, segment, first: segment[0] };
    }
    if (nowM < checkInOpensMinutes(segment[0])) {
      return { chain, segment, first: segment[0] };
    }
  }

  for (const chain of chains) {
    const segment = activeChainSegment(chain, todayRows);
    if (segment.length) continue;
    if (isCheckInWindowForChain(chain, nowM)) {
      return { chain, segment: chain, first: chain[0] ?? null };
    }
  }

  const slots = sortedSlots(timeSlots ?? []);
  const upcoming = findUpcomingSlot(slots, nowM);
  if (upcoming) {
    for (const chain of chains) {
      if (chain.some((s) => Number(s.id) === Number(upcoming.id))) {
        const segment = activeChainSegment(chain, todayRows);
        return { chain, segment, first: segment[0] ?? upcoming };
      }
    }
  }

  for (const chain of chains) {
    const segment = activeChainSegment(chain, todayRows);
    if (segment.length) {
      return { chain, segment, first: segment[0] };
    }
  }

  const firstChain = chains[0];
  return { chain: firstChain, segment: firstChain, first: firstChain[0] ?? null };
}

function parseTodaySession(rows, timeSlots) {
  const ymd = localYmd();
  const todayRows = rows.filter((r) => r.date === ymd);
  const nowM = minutesNow();
  const openRow = todayRows.find((r) => r.punch_in_at && !r.punch_out_at) ?? null;
  const { chain, segment, first } = findRelevantChain(timeSlots, todayRows);
  const sessionRow = openRow ?? (first ? rowForSlot(todayRows, first.id) : null);
  const isMultiSlotChain = segment.length > 1;

  const slotsToday = sortedSlots(timeSlots ?? []).map((ts) => {
    const r = rowForSlot(todayRows, ts.id);
    const done = Boolean(r?.punch_in_at && r?.punch_out_at);
    const open = Boolean(r?.punch_in_at && !r?.punch_out_at);
    return {
      ...ts,
      punch_in_at: r?.punch_in_at ?? null,
      punch_out_at: r?.punch_out_at ?? null,
      done,
      open,
      checkInOpens: formatMinutesAsHi(checkInOpensMinutes(ts)),
      checkOutOpens: formatMinutesAsHi(checkOutOpensMinutes(ts)),
    };
  });

  const allSlotsComplete =
    slotsToday.length > 0 && slotsToday.every((s) => s.done);

  const segmentDone = segmentFullyDone(segment, todayRows);
  const inCheckInWindow = segment.length ? isCheckInWindowForChain(segment, nowM) : false;
  const inCheckOutWindow = segment.length ? isFullCheckOutWindowForChain(segment, nowM) : false;
  const waitingForCheckOut = Boolean(openRow && segment.length && !inCheckOutWindow);
  const beforeCheckInWindow = Boolean(segment.length && !openRow && !inCheckInWindow && !segmentDone && !allSlotsComplete);
  const lastInSegment = segment.length ? segment[segment.length - 1] : null;

  return {
    chain,
    segment,
    displaySlot: first,
    chainLabel: chainDisplayName(segment.length ? segment : chain),
    isMultiSlotChain,
    upcomingSlot: beforeCheckInWindow ? segment[0] : null,
    openRow,
    inStr: sessionRow?.punch_in_at ?? null,
    outStr: sessionRow?.punch_out_at ?? null,
    punchChannel: sessionRow?.punch_in_channel ?? null,
    slotsToday,
    allSlotsComplete,
    inCheckInWindow,
    inCheckOutWindow,
    waitingForCheckOut,
    beforeCheckInWindow,
    segmentDone,
    checkOutOpensLabel: lastInSegment ? slotTimingLabel(lastInSegment, 'check_out') : '',
    checkInOpensLabel: segment[0] ? slotTimingLabel(segment[0], 'check_in') : '',
  };
}

function formatSessionElapsed(inStr, outStr) {
  if (!inStr) return '--:--:--';
  if (outStr) return '00:00:00';
  const [hh, mm] = inStr.split(':').map(Number);
  const start = new Date();
  start.setHours(hh, mm, 0, 0);
  const sec = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n) => `${n}`.padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

function toMoneyNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function uniqueSeatLabels(slots = []) {
  const labels = [];
  const seen = new Set();
  for (const slot of slots) {
    const seatKey = slot.seat_id != null ? `id:${slot.seat_id}` : `label:${slot.seat_number || 'unassigned'}`;
    if (seen.has(seatKey)) continue;
    seen.add(seatKey);
    labels.push(slot.seat_number ? `Seat ${slot.seat_number}` : 'Seat not assigned');
  }
  return labels;
}

function achievementNameForStudent(subjects, profile) {
  const subjectTitles = subjects.map((subject) => String(subject.title || '').toLowerCase());
  const streak = Number(profile.reading_streak ?? 0);
  const progress = Number(profile.syllabus_progress ?? 0);
  const todayMinutes = Number(profile.today_minutes ?? 0);
  const hour = new Date().getHours();

  if ((hour >= 21 || hour <= 4) && todayMinutes > 0) return 'Night Reader';
  if (subjectTitles.some((title) => title.includes('math') || title.includes('गणित'))) return 'Math Hunter';
  if (subjectTitles.some((title) => title.includes('science') || title.includes('physics') || title.includes('chemistry'))) return 'Science Explorer';
  if (subjectTitles.some((title) => title.includes('english') || title.includes('grammar'))) return 'Word Warrior';
  if (streak >= 30) return 'Streak Legend';
  if (streak >= 14) return 'Focus Champion';
  if (streak >= 7) return 'Consistency King';
  if (progress >= 80) return 'Syllabus Finisher';
  if (progress >= 50) return 'Progress Builder';
  return 'Goal Starter';
}

function syllabiFromProfile(profile) {
  if (Array.isArray(profile?.syllabi) && profile.syllabi.length) return profile.syllabi;
  const subjects = Array.isArray(profile?.subjects) ? profile.subjects : [];
  if (subjects.length) {
    return [{ id: 'syl-default', title: profile?.syllabus_name || 'My Syllabus', subjects }];
  }
  return [];
}

function subjectsFromProfile(profile) {
  return syllabiFromProfile(profile).flatMap((syllabus) => Array.isArray(syllabus.subjects) ? syllabus.subjects : []);
}

function importantDatesFromProfile(profile) {
  if (Array.isArray(profile?.important_dates) && profile.important_dates.length) {
    return profile.important_dates
      .map((item) => ({
        id: String(item.id || `date-${item.date || Date.now()}`),
        title: String(item.title || '').trim(),
        date: String(item.date || '').trim(),
        type: String(item.type || 'custom').trim() || 'custom',
      }))
      .filter((item) => item.title && isYmdDate(item.date));
  }
  const dates = [];
  if (isYmdDate(profile?.exam_date)) {
    dates.push({ id: 'date-exam', title: String(profile?.exam_name || 'Exam').trim() || 'Exam', date: profile.exam_date, type: 'exam' });
  }
  if (isYmdDate(profile?.physical_training_date)) {
    dates.push({ id: 'date-physical', title: 'Physical training', date: profile.physical_training_date, type: 'physical' });
  }
  return dates;
}

function nearestImportantDate(dates) {
  return [...dates]
    .map((item) => ({ ...item, days: daysUntilYmd(item.date) }))
    .filter((item) => item.days !== null && item.days >= 0)
    .sort((a, b) => a.days - b.days)[0] || null;
}

function StandaloneStudentHome({ insets, onRefresh, refreshing, libraryConnected = false }) {
  const { token, student, connectStudentLibrary, refreshMe } = useAuth();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState(null);
  const [sectionY, setSectionY] = useState({});
  const [connectLoginId, setConnectLoginId] = useState('');
  const [connectPassword, setConnectPassword] = useState('');
  const [connectBusy, setConnectBusy] = useState(false);
  const [studyBusy, setStudyBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [preparationDraft, setPreparationDraft] = useState('');
  const [subjectTitle, setSubjectTitle] = useState('');
  const [chapterInputs, setChapterInputs] = useState({});
  const [examDateInput, setExamDateInput] = useState('');
  const [physicalDateInput, setPhysicalDateInput] = useState('');
  const focusTapCountRef = useRef(0);
  const profile = student?.self_study_profile && typeof student.self_study_profile === 'object'
    ? student.self_study_profile
    : {};
  const syllabi = syllabiFromProfile(profile);
  const subjects = subjectsFromProfile(profile);
  const firstName = student?.name?.split(' ')?.[0] || 'Student';
  const todayYmd = localYmd();
  const doneChapters = subjects.reduce((sum, subject) => sum + (subject.chapters ?? []).filter((chapter) => chapter.done).length, 0);
  const totalChapters = subjects.reduce((sum, subject) => sum + (subject.chapters ?? []).length, 0);
  const progress = totalChapters ? Math.round((doneChapters / totalChapters) * 100) : Math.max(0, Math.min(100, Number(profile.syllabus_progress ?? 0)));
  const revisionDueCount = subjects.reduce(
    (sum, subject) => sum + (subject.chapters ?? []).filter((chapter) => chapter.next_revision_date && chapter.next_revision_date <= todayYmd).length,
    0,
  );
  const achievementName = achievementNameForStudent(subjects, profile);
  const winningStreak = Math.max(Number(profile.reading_streak ?? 0), Number(profile.best_streak ?? 0));
  const xp = Number(profile.xp ?? 0);
  const level = Number(profile.level ?? 1);
  const xpInLevel = xp % 250;
  const xpLevelPct = Math.min(100, Math.round((xpInLevel / 250) * 100));
  const examDate = profile.exam_date ?? null;
  const physicalDate = profile.physical_training_date ?? null;
  const importantDates = importantDatesFromProfile(profile);
  const nearestDate = nearestImportantDate(importantDates);
  const examCountdown = countdownText(examDate, 'Set exam');
  const physicalCountdown = countdownText(physicalDate, 'Set training');

  useEffect(() => {
    setProfileName(student?.name || '');
    setProfilePhone(student?.phone || '');
    setPreparationDraft(student?.preparation || '');
  }, [student?.name, student?.phone, student?.preparation]);

  useEffect(() => {
    setExamDateInput(examDate || '');
    setPhysicalDateInput(physicalDate || '');
  }, [examDate, physicalDate]);

  useEffect(() => {
    void scheduleSelfStudyNudges(profile);
  }, [
    profile.reading_streak,
    profile.syllabus_progress,
    profile.today_minutes,
    profile.exam_name,
    profile.exam_date,
    profile.physical_training_date,
    JSON.stringify(profile.important_dates ?? []),
    JSON.stringify(profile.syllabi ?? []),
    JSON.stringify(profile.subjects ?? []),
  ]);

  function nextProfile(patch = {}) {
    return {
      reading_streak: Number(profile.reading_streak ?? 0),
      best_streak: Number(profile.best_streak ?? 0),
      today_minutes: Number(profile.today_minutes ?? 0),
      total_minutes: Number(profile.total_minutes ?? 0),
      syllabus_progress: progress,
      syllabus_name: profile.syllabus_name ?? null,
      level: Number(profile.level ?? 1),
      xp: Number(profile.xp ?? 0),
      last_reading_date: profile.last_reading_date ?? null,
      exam_name: profile.exam_name ?? null,
      exam_date: profile.exam_date ?? null,
      physical_training_date: profile.physical_training_date ?? null,
      important_dates: importantDates,
      syllabi,
      subjects,
      ...patch,
    };
  }

  function markSection(name) {
    return (event) => {
      const y = event?.nativeEvent?.layout?.y;
      if (typeof y === 'number') {
        setSectionY((items) => ({ ...items, [name]: y }));
      }
    };
  }

  async function saveStudyProfile(next, successMessage) {
    if (!token) return;
    setStudyBusy(true);
    try {
      await studentUpdateSelfStudy(token, next);
      await refreshMe();
      if (successMessage) Alert.alert('Study progress', successMessage);
    } catch (e) {
      Alert.alert('Study progress', e instanceof ApiError ? e.message : 'Could not update study progress.');
    } finally {
      setStudyBusy(false);
    }
  }

  function streakForStudy() {
    const last = profile.last_reading_date;
    if (last === todayYmd) return Number(profile.reading_streak ?? 0);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const ymd = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    return last === ymd ? Number(profile.reading_streak ?? 0) + 1 : 1;
  }

  function addStudyMinutes(minutes) {
    focusTapCountRef.current += 1;
    if (focusTapCountRef.current % 2 === 0) {
      showInterstitialAfterScreenSwitches();
    }
    const streak = streakForStudy();
    const xp = Number(profile.xp ?? 0) + minutes;
    void saveStudyProfile(nextProfile({
      reading_streak: streak,
      best_streak: Math.max(Number(profile.best_streak ?? 0), streak),
      today_minutes: Number(profile.today_minutes ?? 0) + minutes,
      total_minutes: Number(profile.total_minutes ?? 0) + minutes,
      xp,
      level: Math.floor(xp / 250) + 1,
      last_reading_date: todayYmd,
    }), `+${minutes} XP added. Keep your streak alive.`);
  }

  function addSubject() {
    const title = subjectTitle.trim();
    if (!title) return;
    const nextSubjects = [
      ...subjects,
      { id: `sub-${Date.now()}`, title, chapters: [] },
    ];
    setSubjectTitle('');
    void saveStudyProfile(nextProfile({ subjects: nextSubjects }), 'Subject added.');
  }

  function addChapter(subjectId) {
    const title = String(chapterInputs[subjectId] || '').trim();
    if (!title) return;
    const nextSubjects = subjects.map((subject) => {
      if (subject.id !== subjectId) return subject;
      return {
        ...subject,
        chapters: [...(subject.chapters ?? []), { id: `ch-${Date.now()}`, title, done: false, revision_count: 0, last_revised_date: null, next_revision_date: null }],
      };
    });
    setChapterInputs((items) => ({ ...items, [subjectId]: '' }));
    void saveStudyProfile(nextProfile({ subjects: nextSubjects }), 'Chapter added.');
  }

  function toggleChapter(subjectId, chapterId) {
    let completedNow = false;
    const nextSubjects = subjects.map((subject) => {
      if (subject.id !== subjectId) return subject;
      return {
        ...subject,
        chapters: (subject.chapters ?? []).map((chapter) => {
          if (chapter.id !== chapterId) return chapter;
          completedNow = !chapter.done;
          return { ...chapter, done: !chapter.done };
        }),
      };
    });
    const xp = Number(profile.xp ?? 0) + (completedNow ? 35 : 0);
    void saveStudyProfile(nextProfile({
      subjects: nextSubjects,
      xp,
      level: Math.floor(xp / 250) + 1,
    }), completedNow ? '+35 XP for completing a chapter.' : null);
  }

  function dateAfter(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function nextRevisionDateForCount(count) {
    if (count <= 0) return dateAfter(1);
    if (count === 1) return dateAfter(3);
    if (count === 2) return dateAfter(7);
    if (count === 3) return dateAfter(15);
    return dateAfter(30);
  }

  function scheduleRevision(subjectId, chapterId) {
    const nextSubjects = subjects.map((subject) => {
      if (subject.id !== subjectId) return subject;
      return {
        ...subject,
        chapters: (subject.chapters ?? []).map((chapter) => (
          chapter.id === chapterId
            ? { ...chapter, next_revision_date: dateAfter(1), revision_count: Number(chapter.revision_count ?? 0) }
            : chapter
        )),
      };
    });
    void saveStudyProfile(nextProfile({ subjects: nextSubjects }), 'Revision scheduled for tomorrow.');
  }

  function markRevised(subjectId, chapterId) {
    let revisedCount = 1;
    const nextSubjects = subjects.map((subject) => {
      if (subject.id !== subjectId) return subject;
      return {
        ...subject,
        chapters: (subject.chapters ?? []).map((chapter) => {
          if (chapter.id !== chapterId) return chapter;
          revisedCount = Number(chapter.revision_count ?? 0) + 1;
          return {
            ...chapter,
            revision_count: revisedCount,
            last_revised_date: todayYmd,
            next_revision_date: nextRevisionDateForCount(revisedCount),
          };
        }),
      };
    });
    const xp = Number(profile.xp ?? 0) + 20;
    void saveStudyProfile(nextProfile({
      subjects: nextSubjects,
      xp,
      level: Math.floor(xp / 250) + 1,
    }), '+20 XP for revision. Next revision scheduled.');
  }

  function saveImportantDates() {
    const examValue = examDateInput.trim();
    const physicalValue = physicalDateInput.trim();
    if (examValue && !isYmdDate(examValue)) {
      Alert.alert('Exam date', 'Enter exam date in YYYY-MM-DD format.');
      return;
    }
    if (physicalValue && !isYmdDate(physicalValue)) {
      Alert.alert('Physical training', 'Enter physical training date in YYYY-MM-DD format.');
      return;
    }
    void saveStudyProfile(nextProfile({
      exam_date: examValue || null,
      physical_training_date: physicalValue || null,
    }), 'Exam and training reminders updated.');
  }

  async function connectLibrary() {
    if (!connectLoginId.trim() || !connectPassword) {
      Alert.alert('Connect library', 'Enter the Library ID / Student Login ID and password given by your library.');
      return;
    }
    setConnectBusy(true);
    try {
      await connectStudentLibrary(connectLoginId.trim(), connectPassword);
      Alert.alert('Library connected', 'Your library account is connected.');
    } catch (e) {
      Alert.alert('Connect library', e instanceof ApiError ? e.message : 'Could not connect library.');
    } finally {
      setConnectBusy(false);
    }
  }

  async function saveStudentProfile() {
    if (!token) return;
    const name = profileName.trim();
    if (!name) {
      Alert.alert('My profile', 'Enter your name.');
      return;
    }
    setProfileBusy(true);
    try {
      await studentUpdateProfile(token, {
        name,
        phone: profilePhone.trim() || null,
        preparation: preparationDraft.trim() || null,
      });
      await refreshMe();
      Alert.alert('My profile', 'Profile updated.');
    } catch (e) {
      Alert.alert('My profile', e instanceof ApiError ? e.message : 'Could not update profile.');
    } finally {
      setProfileBusy(false);
    }
  }

  return (
    <ScreenWithBanner>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + layout.space.xxl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.selfHero}>
          <View style={styles.selfHeroTop}>
            <View>
              <Text style={styles.selfKicker}>Player dashboard</Text>
              <Text style={styles.selfTitle}>Hi, {firstName}</Text>
            </View>
            <View style={styles.heroActionRow}>
              <View style={styles.selfLevelPill}>
                <FontAwesome name="bolt" size={13} color="#f59e0b" />
                <Text style={styles.selfLevelText}>Level {level}</Text>
              </View>
            </View>
          </View>
          <View style={styles.xpPanel}>
            <View style={styles.xpHead}>
              <Text style={styles.xpLabel}>XP to next level</Text>
              <Text style={styles.xpValue}>{xpInLevel}/250 XP</Text>
            </View>
            <View style={styles.xpTrack}>
              <View style={[styles.xpFill, { width: `${xpLevelPct}%` }]} />
            </View>
          </View>
          <View style={styles.achievementCard}>
            <View style={styles.achievementIcon}>
              <FontAwesome name="trophy" size={16} color="#f59e0b" />
            </View>
            <View style={styles.achievementTextWrap}>
              <Text style={styles.achievementLabel}>Achievement name</Text>
              <Text style={styles.achievementTitle}>{achievementName}</Text>
            </View>
            <View style={styles.winningStreakBadge}>
              <FontAwesome name="fire" size={11} color="#fb923c" />
              <Text style={styles.winningStreakText}>{winningStreak} win</Text>
            </View>
          </View>
          <Text style={styles.selfSubtitle}>Complete quests, grow XP, revise on time, and unlock your library access when ready.</Text>
        </View>

        <View style={styles.questRow}>
          <View style={styles.questChip}>
            <FontAwesome name="gamepad" size={14} color="#7c3aed" />
            <Text style={styles.questText}>Daily Quest: +15 min focus</Text>
          </View>
          <View style={styles.questChip}>
            <FontAwesome name="shield" size={14} color={TEAL} />
            <Text style={styles.questText}>{libraryConnected ? 'Library connected' : 'Library locked'}</Text>
          </View>
        </View>

        <Pressable style={styles.dashboardCountdownCard} onPress={() => router.push('/(tabs)/study-dates')}>
          <View style={styles.dashboardCountdownIcon}>
            <FontAwesome name="flag-checkered" size={17} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dashboardCountdownKicker}>Nearest countdown</Text>
            <Text style={styles.dashboardCountdownTitle}>
              {nearestDate ? nearestDate.title : 'Add important date'}
            </Text>
            <Text style={styles.dashboardCountdownSub}>
              {nearestDate ? `${nearestDate.date} · ${countdownText(nearestDate.date, 'Set date')}` : 'Exam, physical, admit card, result and more'}
            </Text>
          </View>
          <View style={styles.dashboardCountdownBadge}>
            <Text style={styles.dashboardCountdownBadgeText}>
              {nearestDate ? countdownText(nearestDate.date, 'Set') : 'Set'}
            </Text>
          </View>
        </Pressable>

        <View style={styles.selfStatsGrid}>
          <StatTile icon="fire" label="Reading streak" value={`${Number(profile.reading_streak ?? 0)} days`} accent={{ bg: '#ffedd5', fg: '#ea580c' }} />
          <StatTile icon="star" label="XP earned" value={String(Number(profile.xp ?? 0))} accent={{ bg: '#fef9c3', fg: '#ca8a04' }} />
          <StatTile icon="refresh" label="Revision due" value={String(revisionDueCount)} accent={{ bg: '#ede9fe', fg: '#7c3aed' }} />
        </View>

        {activeSection === 'profile' ? (
        <View style={[cardFlat(), styles.profileQuestCard]} onLayout={markSection('profile')}>
          <View style={styles.profileQuestHead}>
            <View style={styles.profileQuestIcon}>
              <FontAwesome name="user-circle" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.selfCardTitle}>My profile</Text>
              <Text style={styles.selfHint}>Choose what you are preparing for so the app can guide your study vibe.</Text>
            </View>
          </View>
          <TextInput
            style={styles.connectInput}
            value={profileName}
            onChangeText={setProfileName}
            placeholder="Your name"
            placeholderTextColor={palette.textHint}
          />
          <TextInput
            style={styles.connectInput}
            value={profilePhone}
            onChangeText={setProfilePhone}
            placeholder="Phone (optional)"
            placeholderTextColor={palette.textHint}
            keyboardType="phone-pad"
          />
          <Text style={styles.prepLabel}>Preparing for</Text>
          <View style={styles.prepChipGrid}>
            {PREPARATION_OPTIONS.map((option) => {
              const active = preparationDraft === option;
              return (
                <Pressable
                  key={option}
                  style={[styles.prepChip, active && styles.prepChipActive]}
                  onPress={() => setPreparationDraft(option)}
                  disabled={profileBusy}
                >
                  <Text style={[styles.prepChipText, active && styles.prepChipTextActive]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={styles.connectInput}
            value={preparationDraft}
            onChangeText={setPreparationDraft}
            placeholder="Or type your exam/course"
            placeholderTextColor={palette.textHint}
          />
          <Pressable
            style={({ pressed }) => [styles.profileSaveBtn, pressed && { opacity: 0.92 }, profileBusy && { opacity: 0.6 }]}
            onPress={saveStudentProfile}
            disabled={profileBusy}
          >
            <FontAwesome name="save" size={14} color="#fff" />
            <Text style={styles.profileSaveText}>{profileBusy ? 'Saving...' : 'Save profile'}</Text>
          </Pressable>
        </View>
        ) : null}

        <View style={styles.studyActionRow}>
          {[15, 30, 60].map((minutes) => (
            <Pressable
              key={minutes}
              style={({ pressed }) => [styles.studyActionBtn, pressed && { opacity: 0.9 }, studyBusy && { opacity: 0.55 }]}
              onPress={() => addStudyMinutes(minutes)}
              disabled={studyBusy}
            >
              <FontAwesome name="play-circle" size={14} color="#fff" />
              <Text style={styles.studyActionText}>+{minutes} min</Text>
            </Pressable>
          ))}
        </View>

        {activeSection === 'unlock' ? (
        <View style={[cardFlat(), styles.connectCard, styles.unlockCard]} onLayout={markSection('unlock')}>
          <View style={styles.unlockGlow} />
          <View style={styles.connectHead}>
            <View style={[styles.connectIcon, styles.unlockIcon]}>
              <FontAwesome name="unlock-alt" size={17} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.selfCardTitle}>Unlock library mode</Text>
              <Text style={styles.selfHint}>Connect with Library ID / Student Login ID and password to access attendance, fees, notices, and profile.</Text>
            </View>
          </View>
          <TextInput
            style={styles.connectInput}
            value={connectLoginId}
            onChangeText={setConnectLoginId}
            placeholder="Library ID / Student Login ID"
            placeholderTextColor={palette.textHint}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.connectInput}
            value={connectPassword}
            onChangeText={setConnectPassword}
            placeholder="Library password"
            placeholderTextColor={palette.textHint}
            secureTextEntry
          />
          <View style={styles.unlockFeatureRow}>
            {[
              ['calendar', 'Attendance'],
              ['money', 'Fees'],
              ['bell', 'Notices'],
              ['user', 'Profile'],
            ].map(([icon, label]) => (
              <View key={label} style={styles.unlockFeaturePill}>
                <FontAwesome name={icon} size={11} color={palette.primary} />
                <Text style={styles.unlockFeatureText}>{label}</Text>
              </View>
            ))}
          </View>
          <Pressable
            style={({ pressed }) => [styles.connectButton, styles.unlockButton, pressed && { opacity: 0.92 }, connectBusy && { opacity: 0.6 }]}
            onPress={connectLibrary}
            disabled={connectBusy}
          >
            <FontAwesome name="key" size={14} color="#fff" />
            <Text style={styles.connectButtonText}>{connectBusy ? 'Unlocking...' : 'Unlock library access'}</Text>
          </Pressable>
        </View>
        ) : null}

        {activeSection === 'dates' ? (
        <View style={[cardFlat(), styles.goalDateCard]} onLayout={markSection('dates')}>
          <View style={styles.goalDateHead}>
            <View>
              <Text style={styles.selfCardTitle}>Important countdown</Text>
              <Text style={styles.selfHint}>Nearest: {nearestDate ? `${nearestDate.title} · ${countdownText(nearestDate.date, 'Set date')}` : 'Set important dates so reminders keep you focused.'}</Text>
            </View>
            <FontAwesome name="calendar-check-o" size={18} color={palette.primary} />
          </View>
          <View style={styles.countdownRow}>
            <View style={[styles.countdownBox, styles.examCountdownBox]}>
              <Text style={styles.countdownLabel}>Nearest date</Text>
              <Text style={styles.countdownValue}>{nearestDate ? countdownText(nearestDate.date, 'Set date') : examCountdown}</Text>
              <Text style={styles.countdownDate}>{nearestDate ? `${nearestDate.title} · ${nearestDate.date}` : examDate || 'YYYY-MM-DD'}</Text>
            </View>
            <View style={[styles.countdownBox, styles.physicalCountdownBox]}>
              <Text style={styles.countdownLabel}>Physical training</Text>
              <Text style={styles.countdownValue}>{physicalCountdown}</Text>
              <Text style={styles.countdownDate}>{physicalDate || 'YYYY-MM-DD'}</Text>
            </View>
          </View>
          <View style={styles.goalDateInputs}>
            <TextInput
              style={[styles.connectInput, styles.goalDateInput]}
              value={examDateInput}
              onChangeText={setExamDateInput}
              placeholder="Exam date YYYY-MM-DD"
              placeholderTextColor={palette.textHint}
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              style={[styles.connectInput, styles.goalDateInput]}
              value={physicalDateInput}
              onChangeText={setPhysicalDateInput}
              placeholder="Physical date YYYY-MM-DD"
              placeholderTextColor={palette.textHint}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <Pressable
            style={({ pressed }) => [styles.goalDateButton, pressed && { opacity: 0.92 }, studyBusy && { opacity: 0.6 }]}
            onPress={saveImportantDates}
            disabled={studyBusy}
          >
            <Text style={styles.goalDateButtonText}>Save reminders</Text>
          </Pressable>
        </View>
        ) : null}

        <View style={[cardFlat(), styles.selfProgressCard]}>
          <View style={styles.selfProgressHead}>
            <Text style={styles.selfCardTitle}>{syllabi.length > 1 ? `${syllabi.length} syllabi progress` : profile.syllabus_name || 'Syllabus progress'}</Text>
            <Text style={styles.selfProgressPct}>{progress}%</Text>
          </View>
          <View style={styles.selfProgressTrack}>
            <View style={[styles.selfProgressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.selfHint}>{doneChapters}/{totalChapters} chapters completed. Complete chapters to earn XP.</Text>
        </View>

        {activeSection === 'syllabus' ? (
        <View style={[cardFlat(), styles.syllabusCard]} onLayout={markSection('syllabus')}>
          <Text style={styles.selfCardTitle}>Subjects and chapters</Text>
          <View style={styles.addSubjectRow}>
            <TextInput
              style={[styles.connectInput, styles.addSubjectInput]}
              value={subjectTitle}
              onChangeText={setSubjectTitle}
              placeholder="Add subject"
              placeholderTextColor={palette.textHint}
            />
            <Pressable style={styles.smallAddBtn} onPress={addSubject} disabled={studyBusy}>
              <FontAwesome name="plus" size={14} color="#fff" />
            </Pressable>
          </View>
          {subjects.length === 0 ? (
            <Text style={styles.selfHint}>Create your first subject, then add chapters and mark them complete.</Text>
          ) : subjects.map((subject) => {
            const chapters = subject.chapters ?? [];
            const subjectDone = chapters.filter((chapter) => chapter.done).length;
            const subjectPct = chapters.length ? Math.round((subjectDone / chapters.length) * 100) : 0;
            return (
              <View key={subject.id} style={styles.subjectBox}>
                <View style={styles.subjectHead}>
                  <Text style={styles.subjectTitle}>{subject.title}</Text>
                  <Text style={styles.subjectPct}>{subjectPct}%</Text>
                </View>
                <View style={styles.subjectTrack}>
                  <View style={[styles.subjectFill, { width: `${subjectPct}%` }]} />
                </View>
                {chapters.map((chapter) => (
                  <View key={chapter.id} style={styles.chapterBlock}>
                    <Pressable
                      style={styles.chapterRow}
                      onPress={() => toggleChapter(subject.id, chapter.id)}
                      disabled={studyBusy}
                    >
                      <FontAwesome name={chapter.done ? 'check-circle' : 'circle-o'} size={17} color={chapter.done ? palette.success : palette.textHint} />
                      <View style={styles.chapterTextCol}>
                        <Text style={[styles.chapterText, chapter.done && styles.chapterDone]}>{chapter.title}</Text>
                        {chapter.next_revision_date ? (
                          <Text style={[styles.revisionDueText, chapter.next_revision_date <= todayYmd && styles.revisionDueNow]}>
                            Revise {chapter.next_revision_date <= todayYmd ? 'today' : `on ${chapter.next_revision_date}`} · {Number(chapter.revision_count ?? 0)}x
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                    <View style={styles.revisionActions}>
                      <Pressable
                        style={styles.revisionBtn}
                        onPress={() => scheduleRevision(subject.id, chapter.id)}
                        disabled={studyBusy}
                      >
                        <Text style={styles.revisionBtnText}>Schedule</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.revisionBtn, styles.revisionDoneBtn]}
                        onPress={() => markRevised(subject.id, chapter.id)}
                        disabled={studyBusy}
                      >
                        <Text style={[styles.revisionBtnText, styles.revisionDoneText]}>Revised</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
                <View style={styles.addChapterRow}>
                  <TextInput
                    style={[styles.connectInput, styles.addChapterInput]}
                    value={chapterInputs[subject.id] ?? ''}
                    onChangeText={(value) => setChapterInputs((items) => ({ ...items, [subject.id]: value }))}
                    placeholder="Add chapter"
                    placeholderTextColor={palette.textHint}
                  />
                  <Pressable style={styles.smallAddBtn} onPress={() => addChapter(subject.id)} disabled={studyBusy}>
                    <FontAwesome name="plus" size={14} color="#fff" />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
        ) : null}

      </ScrollView>
    </ScreenWithBanner>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { studentMode } = useStudentAppMode();
  const { token, student, library, alerts, refreshMe } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [punchBusy, setPunchBusy] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanCooldown, setScanCooldown] = useState(false);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [holidays, setHolidays] = useState([]);
  const [monthRows, setMonthRows] = useState([]);
  const [monthSummary, setMonthSummary] = useState(null);
  const [feeSummary, setFeeSummary] = useState(null);
  const [clockTick, setClockTick] = useState(0);

  const status = library?.status;
  const libraryAccess = library?.access_status;
  const libraryServicePaused = Boolean(libraryAccess && !libraryAccess.service_active);
  const open = status?.is_open_now ?? false;
  const attendanceMode = useMemo(
    () => normalizeAttendanceMode(library?.attendance_mode),
    [library?.attendance_mode],
  );
  const featureAccess = library?.feature_access && typeof library.feature_access === 'object' ? library.feature_access : {};
  const featureEnabled = useCallback(
    (key) => !featureAccess || featureAccess[key] !== false,
    [featureAccess],
  );
  const allowButtonAttendance = attendanceModeAllowsButton(attendanceMode) && featureEnabled('attendance_manual');
  const allowQrAttendance = attendanceModeAllowsQr(attendanceMode) && featureEnabled('attendance_qr');

  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const todaySession = useMemo(
    () => parseTodaySession(monthRows, student?.time_slots),
    [monthRows, student?.time_slots, clockTick],
  );

  const {
    displaySlot,
    chainLabel,
    isMultiSlotChain,
    segment,
    upcomingSlot,
    openRow,
    inStr,
    outStr,
    slotsToday,
    allSlotsComplete,
    inCheckInWindow,
    inCheckOutWindow,
    waitingForCheckOut,
    beforeCheckInWindow,
    segmentDone,
    checkOutOpensLabel,
    checkInOpensLabel,
  } = todaySession;

  const sessionOpen = Boolean(inStr && !outStr);
  const canRecheckInWindow = !sessionOpen && allSlotsComplete && inCheckInWindow;
  const showAllSlotsComplete = allSlotsComplete && !canRecheckInWindow;
  const canStartNextSlot =
    !sessionOpen && ((!allSlotsComplete && !segmentDone) || canRecheckInWindow) && inCheckInWindow;
  const canEarlyCheckOut = sessionOpen && !inCheckOutWindow;
  const canButtonCheckIn = allowButtonAttendance && open && canStartNextSlot;
  const canButtonCheckOut = allowButtonAttendance && sessionOpen && (inCheckOutWindow || canEarlyCheckOut);
  const canQrCheckIn = allowQrAttendance && open && canStartNextSlot;
  const canQrCheckOut = allowQrAttendance && sessionOpen && (inCheckOutWindow || canEarlyCheckOut);
  const canUseQrScanner = canQrCheckIn || canQrCheckOut;
  const showDirectCheckout = canButtonCheckOut;
  const showQrCheckout = canQrCheckOut;

  const [timerTick, setTimerTick] = useState(0);
  useEffect(() => {
    if (!inStr || outStr) return;
    const id = setInterval(() => setTimerTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [inStr, outStr]);

  const sessionClock = useMemo(
    () => formatSessionElapsed(inStr, outStr),
    [inStr, outStr, timerTick],
  );

  const loadMonthAttendance = useCallback(async () => {
    if (!token || !library) {
      setMonthRows([]);
      setMonthSummary(null);
      return;
    }
    try {
      const data = await studentAttendance(token, ymNow());
      setMonthRows(data.rows);
      setMonthSummary(data.summary ?? null);
    } catch {
      setMonthRows([]);
      setMonthSummary(null);
    }
  }, [library, token]);

  const loadHolidays = useCallback(async () => {
    if (!token || !library) {
      setHolidays([]);
      return;
    }
    try {
      const from = new Date().toISOString().slice(0, 10);
      const to = new Date();
      to.setMonth(to.getMonth() + 4);
      const data = await studentHolidays(token, from, to.toISOString().slice(0, 10));
      setHolidays(data.rows.filter((h) => h.is_closed).slice(0, 6));
    } catch {
      setHolidays([]);
    }
  }, [library, token]);

  const loadFeeSummary = useCallback(async () => {
    if (!token || !library) {
      setFeeSummary(null);
      return;
    }
    try {
      const data = await studentAllTimeFees(token);
      setFeeSummary(data);
    } catch {
      setFeeSummary(null);
    }
  }, [library, token]);

  const refreshDashboard = useCallback(async () => {
    if (!token) return;
    await refreshMe();
    await loadMonthAttendance();
    await loadHolidays();
    await loadFeeSummary();
  }, [token, refreshMe, loadMonthAttendance, loadHolidays, loadFeeSummary]);

  useFocusEffect(
    useCallback(() => {
      void refreshDashboard();
    }, [refreshDashboard]),
  );

  useEffect(() => {
    if (!allowQrAttendance) {
      setScannerOpen(false);
    }
  }, [allowQrAttendance]);

  const perf = useMemo(() => {
    const present = monthSummary?.present_days ?? monthRows.filter((r) => r.status === 'present').length;
    const total = monthSummary?.eligible_days ?? monthRows.length;
    const missed = monthSummary?.missed_days ?? monthRows.filter((r) => r.status === 'absent').length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    let badge = 'KEEP GOING';
    if (total === 0) badge = 'NO DATA YET';
    else if (pct >= 90) badge = 'EXCELLENT STATUS';
    else if (pct >= 70) badge = 'GOOD PROGRESS';
    else if (pct >= 50) badge = 'ROOM TO IMPROVE';
    return { present, total, missed, pct, badge };
  }, [monthRows, monthSummary]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshDashboard();
    } finally {
      setRefreshing(false);
    }
  }, [refreshDashboard]);

  async function doCheckIn() {
    if (!token) return;
    if (!canButtonCheckIn) {
      if (openRow) {
        Alert.alert('Check-in', 'Check out your open time slot before starting another session.');
      } else if (showAllSlotsComplete) {
        Alert.alert('Check-in', 'You have completed all assigned time slots for today.');
      } else if (beforeCheckInWindow && displaySlot) {
        Alert.alert('Check-in', slotTimingLabel(displaySlot, 'check_in'));
      } else if (segmentDone) {
        Alert.alert('Check-in', 'This session block is already complete.');
      } else if (!open) {
        Alert.alert('Check-in', status?.status_message || 'Library is currently closed.');
      } else if (!allowButtonAttendance) {
        Alert.alert('Attendance unavailable', featureEnabled('attendance_manual') ? 'This library accepts attendance only via QR scan.' : 'Button attendance is not enabled for this library plan.');
      }
      return;
    }
    setPunchBusy(true);
    try {
      await studentCheckIn(token);
      await refreshMe();
      await loadMonthAttendance();
      showPunchAppOpen(() => {
        Alert.alert('Checked in', 'Your check-in was recorded.');
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Check-in failed.';
      Alert.alert('Check-in', msg);
    } finally {
      setPunchBusy(false);
    }
  }

  async function doCheckOut() {
    if (!token) return;
    if (!canButtonCheckOut) {
      if (sessionOpen && waitingForCheckOut && displaySlot) {
        Alert.alert('Check-out', slotTimingLabel(displaySlot, 'check_out'));
      } else if (!sessionOpen) {
        Alert.alert('Check-out', 'Check in first before checking out.');
      } else if (!allowButtonAttendance) {
        Alert.alert('Attendance unavailable', featureEnabled('attendance_manual') ? 'Direct check-out is disabled. Use Scan to Check-Out.' : 'Button attendance is not enabled for this library plan.');
      }
      return;
    }
    setPunchBusy(true);
    try {
      await studentCheckOut(token);
      await refreshMe();
      await loadMonthAttendance();
      showPunchAppOpen(() => {
        Alert.alert('Checked out', 'Your check-out was recorded.');
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Check-out failed.';
      Alert.alert('Check-out', msg);
    } finally {
      setPunchBusy(false);
    }
  }

  async function openQrScanner() {
    if (!canUseQrScanner) {
      if (sessionOpen && waitingForCheckOut && displaySlot) {
        Alert.alert('QR attendance', slotTimingLabel(displaySlot, 'check_out'));
      } else if (beforeCheckInWindow && displaySlot) {
        Alert.alert('QR attendance', slotTimingLabel(displaySlot, 'check_in'));
      } else if (showAllSlotsComplete) {
        Alert.alert('QR attendance', 'You have completed all assigned time slots for today.');
      } else if (!open) {
        Alert.alert('QR attendance', status?.status_message || 'Library is currently closed.');
      } else if (!allowQrAttendance) {
        Alert.alert('QR attendance unavailable', featureEnabled('attendance_qr') ? 'This library accepts attendance only via the check-in button.' : 'QR attendance is not enabled for this library plan.');
      }
      return;
    }
    const perm = camPerm?.granted ? camPerm : await requestCamPerm();
    if (!perm?.granted) {
      Alert.alert('Camera permission', 'Allow camera permission to scan library attendance QR.');
      return;
    }
    setScannerOpen(true);
  }

  async function onScannedAttendanceQr(value) {
    if (!token || scanCooldown || qrBusy) return;
    const payload = String(value ?? '').trim();
    if (!payload) return;
    setScanCooldown(true);
    setQrBusy(true);
    try {
      const data = await studentQrPunch(token, { qr_payload: payload, action: 'auto' });
      await refreshMe();
      await loadMonthAttendance();
      setScannerOpen(false);
      Alert.alert(
        data.action === 'punch_out' ? 'Checked out' : 'Checked in',
        data.message || 'Attendance saved via QR.',
      );
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'QR attendance failed.';
      Alert.alert('QR attendance', msg);
    } finally {
      setQrBusy(false);
      setTimeout(() => setScanCooldown(false), 900);
    }
  }

  const hoursLine =
    status?.is_24x7 || library?.is_24x7
      ? 'Hours: Open 24x7'
      : status?.opening_time && status?.closing_time
        ? `Hours: ${status.opening_time} – ${status.closing_time}`
        : 'Hours: — – —';

  const statusPillText =
    status?.status_message ?? (open ? 'Library is open.' : 'Library is closed.');

  const readySubtitle = showAllSlotsComplete
    ? 'All time slots complete for today'
    : sessionOpen
      ? waitingForCheckOut
        ? checkOutOpensLabel
        : isMultiSlotChain
          ? `Checked in — ${chainLabel}`
          : `Checked in — ${slotDisplayName(displaySlot)}`
      : beforeCheckInWindow
        ? `Upcoming — ${chainLabel} · ${checkInOpensLabel}`
        : canRecheckInWindow
          ? `Ready again — ${chainLabel}`
        : segmentDone
          ? `Session done — ${chainLabel}`
          : open && inCheckInWindow
            ? `Ready — ${chainLabel}`
            : open
              ? 'Waiting for your session window'
              : 'Check hours below';

  const showQrCheckInCard = allowQrAttendance && !sessionOpen && !showAllSlotsComplete && canStartNextSlot;
  const showQrScannerPanel = allowQrAttendance && scannerOpen;

  const sessionMeta = sessionStatusMeta({
    open,
    allSlotsComplete,
    canRecheckInWindow,
    sessionOpen,
    beforeCheckInWindow,
    segmentDone,
    inCheckInWindow,
  });

  const slotsDoneCount = slotsToday.filter((s) => s.done).length;
  const slotsTotalCount = slotsToday.length;
  const firstName = student?.name?.split(' ')[0] ?? 'Student';
  const libraryName = library?.name ?? 'Your library';
  const assignedSlots = sortedSlots(student?.time_slots ?? []);
  const assignedSeatLabels = uniqueSeatLabels(assignedSlots);
  const currentSlotSeatLabels = uniqueSeatLabels(segment.length ? segment : displaySlot ? [displaySlot] : []);
  const assignedMonthlyFee = assignedSlots.reduce((sum, slot) => sum + toMoneyNumber(slot.fee_amount), 0);
  const totalDue = toMoneyNumber(feeSummary?.total_due);
  const advancePaid = toMoneyNumber(feeSummary?.advance_balance ?? student?.advance_balance);
  const totalPaid = toMoneyNumber(feeSummary?.total_paid);
  const totalBilled = toMoneyNumber(feeSummary?.total_billed);

  if (!library) {
    return <StandaloneStudentHome insets={insets} refreshing={refreshing} onRefresh={onRefresh} />;
  }

  if (studentMode === 'study') {
    return <StandaloneStudentHome insets={insets} refreshing={refreshing} onRefresh={onRefresh} libraryConnected />;
  }

  return (
    <ScreenWithBanner>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + layout.space.xxl }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }>
        <View style={styles.heroCard}>
          <View style={styles.heroBlobA} />
          <View style={styles.heroBlobB} />
          <View style={styles.heroTopRow}>
            <View style={styles.heroTextCol}>
              <Text style={styles.heroGreet}>
                {greetingPhrase()}, {firstName}
              </Text>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {libraryName}
              </Text>
              <Text style={styles.heroDate}>{formatTodayHeading()}</Text>
            </View>
          </View>
          <View style={styles.heroMetaRow}>
            <View style={[styles.heroMetaPill, open ? styles.heroMetaPillOpen : styles.heroMetaPillClosed]}>
              <FontAwesome name={open ? 'unlock' : 'lock'} size={11} color="rgba(255,255,255,0.9)" />
              <Text style={styles.heroMetaText}>{open ? 'Open now' : 'Closed now'}</Text>
            </View>
            <View style={styles.heroMetaPill}>
              <FontAwesome name="clock-o" size={11} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroMetaText}>{hoursLine.replace('Hours: ', '')}</Text>
            </View>
            <View style={styles.heroMetaPill}>
              <FontAwesome name="id-card-o" size={11} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroMetaText}>{student?.login_id ?? '—'}</Text>
            </View>
            <View style={styles.heroMetaPill}>
              <FontAwesome
                name={allowQrAttendance && !allowButtonAttendance ? 'qrcode' : allowButtonAttendance && !allowQrAttendance ? 'hand-pointer-o' : 'exchange'}
                size={11}
                color="rgba(255,255,255,0.85)"
              />
              <Text style={styles.heroMetaText}>
                {allowButtonAttendance && allowQrAttendance ? 'Button + QR' : allowQrAttendance ? 'QR scan' : allowButtonAttendance ? 'Button only' : 'Attendance off'}
              </Text>
            </View>
            {student?.time_slots?.length ? (
              <View style={styles.heroMetaPill}>
                <FontAwesome name="calendar" size={11} color="rgba(255,255,255,0.85)" />
                <Text style={styles.heroMetaText}>
                  {slotsTotalCount} slot{slotsTotalCount === 1 ? '' : 's'} today
                </Text>
              </View>
            ) : null}
          </View>
          {!open ? (
            <View style={styles.heroClosedReason}>
              <FontAwesome name="info-circle" size={12} color="rgba(255,255,255,0.9)" />
              <Text style={styles.heroClosedReasonText} numberOfLines={2}>
                {statusPillText}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.statRow}>
          <StatTile
            icon={open ? 'unlock' : 'lock'}
            label="Library"
            value={open ? 'Open' : 'Closed'}
            accent={{ bg: open ? palette.successSoft : palette.dangerSoft, fg: open ? palette.success : palette.danger }}
          />
          <StatTile
            icon="line-chart"
            label="This month"
            value={`${perf.pct}%`}
            accent={{ bg: palette.primarySoft, fg: palette.primary }}
          />
          <StatTile
            icon="calendar-check-o"
            label="Slots done"
            value={slotsTotalCount ? `${slotsDoneCount}/${slotsTotalCount}` : '—'}
            accent={{ bg: TEAL_SOFT, fg: TEAL }}
          />
        </View>

        {(allowButtonAttendance || allowQrAttendance) ? (
          <View style={[styles.sessionCard, sessionOpen && styles.sessionCardStacked]}>
            <View style={styles.sessionCardHeader}>
              <View>
                <Text style={styles.sessionLabel}>Today&apos;s session</Text>
                {chainLabel ? (
                  <Text style={styles.sessionSlotTitle} numberOfLines={2}>
                    {isMultiSlotChain ? chainLabel : slotDisplayName(displaySlot)}
                  </Text>
                ) : null}
              </View>
              <View
                style={[
                  styles.sessionStatusPill,
                  sessionMeta.tone === 'success' && styles.sessionPillSuccess,
                  sessionMeta.tone === 'active' && styles.sessionPillActive,
                  sessionMeta.tone === 'ready' && styles.sessionPillReady,
                  sessionMeta.tone === 'warn' && styles.sessionPillWarn,
                  sessionMeta.tone === 'danger' && styles.sessionPillDanger,
                  sessionMeta.tone === 'muted' && styles.sessionPillMuted,
                ]}>
                <FontAwesome
                  name={sessionMeta.icon}
                  size={11}
                  color={
                    sessionMeta.tone === 'success'
                      ? palette.success
                      : sessionMeta.tone === 'active'
                        ? TEAL
                        : sessionMeta.tone === 'danger'
                          ? palette.danger
                          : palette.textMuted
                  }
                />
                <Text style={styles.sessionStatusText}>{sessionMeta.label}</Text>
              </View>
            </View>
            <View style={styles.sessionCompactRow}>
              <View style={styles.assignedCompactPanel}>
                <View style={styles.assignedCompactIcon}>
                  <FontAwesome name="map-marker" size={12} color={palette.primary} />
                </View>
                <View style={styles.assignedCompactText}>
                  <Text style={styles.assignedCompactTitle} numberOfLines={1}>
                    {currentSlotSeatLabels.length ? currentSlotSeatLabels.join(' · ') : 'Seat not assigned'}
                  </Text>
                  <Text style={styles.assignedCompactSub} numberOfLines={1}>
                    {currentSlotSeatLabels.length ? 'Current seat' : 'Ask owner to assign seat'}
                  </Text>
                </View>
              </View>
              <View style={styles.timerCompactPanel}>
                <View style={[styles.timerDot, sessionOpen && styles.timerDotLive, showAllSlotsComplete && styles.timerDotDone]} />
                <View style={styles.timerCompactText}>
                  <Text style={styles.timerCompactDigits}>{sessionClock}</Text>
                  <Text style={styles.timerCompactCaption}>
                    {showAllSlotsComplete ? 'Done' : sessionOpen ? 'Elapsed' : 'Timer'}
                  </Text>
                </View>
              </View>
            </View>

            {showAllSlotsComplete ? (
              <Text style={styles.sessionHint}>Great work — you have finished all assigned time slots.</Text>
            ) : sessionOpen ? (
              <Text style={styles.sessionHint}>
                {waitingForCheckOut
                  ? checkOutOpensLabel
                  : isMultiSlotChain
                    ? 'Check out after consecutive slots finish, or leave early for completed slots only.'
                    : showDirectCheckout && showQrCheckout
                      ? 'Use Check-Out or scan the library QR when you leave.'
                      : 'Tap Check-Out when you leave the library.'}
              </Text>
            ) : beforeCheckInWindow ? (
              <Text style={styles.upcomingHint}>
                {checkInOpensLabel} · {PUNCH_EARLY_MINUTES} min early window
              </Text>
            ) : inCheckInWindow ? (
              <Text style={styles.sessionHint}>
                {isMultiSlotChain
                  ? `One check-in covers ${segment.length} consecutive slots. ${checkOutOpensLabel} for full checkout.`
                  : `Check-in open until ${displaySlot?.slot_end}`}
              </Text>
            ) : null}

            {showAllSlotsComplete ? (
              <View style={styles.sessionDoneBadge}>
                <FontAwesome name="check-circle" size={18} color={palette.success} />
                <Text style={styles.sessionDoneText}>All done for today</Text>
              </View>
            ) : sessionOpen ? (
              <View style={styles.checkoutActions}>
                {showDirectCheckout ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.checkOutCta,
                      styles.checkoutActionBtn,
                      punchBusy && styles.ctaDisabled,
                      pressed && !punchBusy && { opacity: 0.92 },
                    ]}
                    onPress={() => void doCheckOut()}
                    disabled={punchBusy}
                    android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
                    <FontAwesome name="sign-out" size={18} color="#fff" />
                    <Text style={styles.checkoutActionText}>Check-Out</Text>
                  </Pressable>
                ) : null}
                {showQrCheckout ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.qrCheckoutCta,
                      styles.checkoutActionBtn,
                      (qrBusy || punchBusy) && styles.ctaDisabled,
                      pressed && !qrBusy && !punchBusy && { opacity: 0.92 },
                    ]}
                    onPress={() => void openQrScanner()}
                    disabled={qrBusy || punchBusy}
                    android_ripple={{ color: 'rgba(255,255,255,0.15)' }}>
                    <FontAwesome name="qrcode" size={16} color={palette.primary} />
                    <Text style={styles.qrCheckoutText}>
                      {qrBusy ? 'Please wait…' : 'Scan to Check-Out'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : allowButtonAttendance ? (
              <Pressable
                style={({ pressed }) => [
                  styles.checkInCta,
                  (!canButtonCheckIn || punchBusy) && styles.ctaDisabled,
                  pressed && canButtonCheckIn && !punchBusy && { opacity: 0.92 },
                ]}
                onPress={() => void doCheckIn()}
                disabled={!canButtonCheckIn || punchBusy}
                android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
                <FontAwesome name="sign-in" size={20} color="#fff" />
                <Text style={styles.checkInText}>
                  {beforeCheckInWindow ? 'Opens soon' : 'Check-In'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}



        {!allowButtonAttendance && allowQrAttendance && !sessionOpen && !showAllSlotsComplete ? (
          <View style={styles.modeInfoCard}>
            <FontAwesome name="info-circle" size={16} color={palette.primary} />
            <View style={styles.modeInfoTextCol}>
              <Text style={styles.modeInfoTitle}>QR attendance only</Text>
              <Text style={styles.modeInfoBody}>Your library uses QR scan for check-in and check-out.</Text>
            </View>
          </View>
        ) : null}

        {showQrCheckInCard ? (
          <View style={styles.qrPunchCard}>
            <View style={styles.qrPunchHead}>
              <View style={styles.qrIconCircle}>
                <FontAwesome name="qrcode" size={20} color={palette.primary} />
              </View>
              <View style={styles.qrPunchCopy}>
                <Text style={styles.qrPunchTitle}>Scan library QR</Text>
                <Text style={styles.qrPunchSub}>Use today&apos;s code from the library desktop to check in.</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.qrPunchBtn,
                (!canQrCheckIn || qrBusy || punchBusy) && styles.ctaDisabled,
                pressed && canQrCheckIn && !qrBusy && !punchBusy && { opacity: 0.92 },
              ]}
              onPress={() => void openQrScanner()}
              disabled={!canQrCheckIn || qrBusy || punchBusy}>
              <FontAwesome name="camera" size={16} color="#fff" />
              <Text style={styles.qrPunchBtnText}>{qrBusy ? 'Please wait…' : 'Open scanner · Check-In'}</Text>
            </Pressable>
          </View>
        ) : null}

        {showQrScannerPanel ? (
          <View style={styles.qrPunchCard}>
            <SectionHeader
              title={sessionOpen ? 'Scan to check out' : 'Scan to check in'}
              subtitle="Point your camera at the library attendance QR"
            />
            <View style={styles.scannerWrap}>
              <CameraView
                style={styles.scannerView}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={(res) => void onScannedAttendanceQr(res?.data)}
              />
              <View style={styles.scannerFrame} pointerEvents="none" />
              <Pressable style={styles.scannerCloseBtn} onPress={() => setScannerOpen(false)}>
                <Text style={styles.scannerCloseText}>Close scanner</Text>
              </Pressable>
            </View>
          </View>
        ) : null}



        <View style={[cardFlat(), styles.financeCard]}>
          <SectionHeader title="Fees & advance" subtitle="Live billing status from your library" />
          <View style={styles.financeGrid}>
            <View style={[styles.financeTile, totalDue > 0 && styles.financeTileDue]}>
              <Text style={styles.financeLabel}>Total due</Text>
              <Text style={[styles.financeValue, totalDue > 0 ? styles.financeDueText : styles.financeOkText]}>
                {formatInr(totalDue)}
              </Text>
            </View>
            <View style={styles.financeTile}>
              <Text style={styles.financeLabel}>Advance paid</Text>
              <Text style={[styles.financeValue, advancePaid > 0 ? styles.financeAdvanceText : styles.financeMutedText]}>
                {formatInr(advancePaid)}
              </Text>
            </View>
          </View>
          <View style={styles.financeMetaRow}>
            <Text style={styles.financeMeta}>Paid: {formatInr(totalPaid)}</Text>
            <Text style={styles.financeMeta}>Billed: {formatInr(totalBilled)}</Text>
          </View>
        </View>

        <View style={[cardFlat(), styles.perfCard]}>
          <SectionHeader title="Monthly attendance" subtitle="Overall presence this month" />
          <View style={styles.perfBody}>
            <View style={styles.perfRingWrap}>
              <View style={styles.perfRingOuter}>
                <View style={[styles.perfRingArc, { width: `${Math.min(100, perf.pct)}%` }]} />
              </View>
              <View style={styles.perfRingInner}>
                <Text style={styles.perfPct}>{perf.pct}%</Text>
                <Text style={styles.perfPctLabel}>present</Text>
              </View>
            </View>
            <View style={styles.perfStatsCol}>
              <View style={styles.perfStatRow}>
                <Text style={styles.perfStatLabel}>Present</Text>
                <Text style={styles.perfStatValue}>{perf.present}</Text>
              </View>
              <View style={styles.perfStatRow}>
                <Text style={styles.perfStatLabel}>Records</Text>
                <Text style={styles.perfStatValue}>{perf.total}</Text>
              </View>
              <View style={styles.perfStatRow}>
                <Text style={styles.perfStatLabel}>Missed</Text>
                <Text style={[styles.perfStatValue, perf.missed > 0 && styles.perfStatValueWarn]}>{perf.missed}</Text>
              </View>
              <View style={styles.excellentPill}>
                <Text style={styles.excellentText}>{perf.badge}</Text>
              </View>
            </View>
          </View>
        </View>

        {libraryServicePaused ? (
          <View style={[cardFlat(), styles.servicePausedCard]}>
            <FontAwesome name="exclamation-circle" size={16} color={palette.warning} />
            <View style={styles.servicePausedCopy}>
              <Text style={styles.servicePausedTitle}>Library services limited</Text>
              <Text style={styles.servicePausedText}>
                Your library&apos;s trial or subscription has ended. Contact the library if attendance or billing looks outdated.
              </Text>
            </View>
          </View>
        ) : null}

        {alerts.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Alerts" subtitle="Important updates from your library" />
            {alerts.map((a) => (
              <View key={a.id} style={[cardFlat(), styles.alertItem]}>
                <View style={styles.alertIconBox}>
                  <FontAwesome
                    name={a.type === 'payment_due' ? 'credit-card' : a.type === 'library_closed' ? 'ban' : 'bell'}
                    size={14}
                    color={a.type === 'payment_due' ? palette.warning : palette.primary}
                  />
                </View>
                <View style={styles.alertContent}>
                  <Text style={styles.alertT}>{a.title}</Text>
                  <Text style={styles.alertM} numberOfLines={3}>
                    {a.message}
                  </Text>
                  {a.type === 'payment_due' && typeof a.meta?.total_due === 'number' ? (
                    <Text style={styles.alertDue}>{formatInr(a.meta.total_due)} due</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {holidays.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Upcoming closed days" subtitle="Library will be closed on these dates" />
            <View style={[cardFlat(), styles.listCard]}>
              {holidays.map((h, idx) => (
                <View
                  key={h.id}
                  style={[styles.holidayItem, idx < holidays.length - 1 && styles.listRowBorder]}>
                  <View style={styles.holidayDateBox}>
                    <Text style={styles.holidayDate}>{h.holiday_date?.slice(8, 10) ?? '—'}</Text>
                    <Text style={styles.holidayMonth}>
                      {h.holiday_date
                        ? new Date(`${h.holiday_date}T12:00:00`).toLocaleDateString('en-IN', { month: 'short' })
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.holidayTit} numberOfLines={2}>
                    {h.title}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {slotsToday.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title="Today&apos;s time slots"
              subtitle={`${slotsDoneCount} of ${slotsTotalCount} completed`}
            />
            <View style={[cardFlat(), styles.listCard]}>
              {slotsToday.map((s, idx) => (
                <View key={s.id} style={[styles.slotRow, idx < slotsToday.length - 1 && styles.listRowBorder]}>
                  <View
                    style={[
                      styles.slotIconWrap,
                      s.done && styles.slotIconDone,
                      s.open && styles.slotIconLive,
                    ]}>
                    <FontAwesome
                      name={s.done ? 'check' : s.open ? 'play' : 'clock-o'}
                      size={12}
                      color={s.done ? palette.success : s.open ? TEAL : palette.primary}
                    />
                  </View>
                  <View style={styles.slotTxtCol}>
                    <Text style={styles.slotTxt}>{slotDisplayName(s)}</Text>
                    {!s.done && !s.open ? (
                      <Text style={styles.slotSubTxt}>
                        Check-in {s.checkInOpens} · Check-out {s.checkOutOpens}
                      </Text>
                    ) : (
                      <Text style={styles.slotSubTxt}>
                        {s.done ? 'Completed' : s.open ? 'Currently in session' : ''}
                      </Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.slotBadge,
                      s.done && styles.slotBadgeDone,
                      s.open && styles.slotBadgeLive,
                    ]}>
                    <Text
                      style={[
                        styles.slotBadgeText,
                        s.done && styles.slotBadgeTextDone,
                        s.open && styles.slotBadgeTextLive,
                      ]}>
                      {s.done ? 'Done' : s.open ? 'Live' : 'Upcoming'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </ScreenWithBanner>
  );
}

const styles = StyleSheet.create({
  container: { padding: layout.space.lg, backgroundColor: palette.canvas, gap: layout.space.md },
  heroCard: {
    backgroundColor: HERO_TOP,
    borderRadius: layout.radius.xxl,
    padding: layout.space.xl,
    marginBottom: layout.space.sm,
    overflow: 'hidden',
    ...shadow.md,
  },
  heroBlobA: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -40,
    right: -30,
  },
  heroBlobB: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -20,
    left: -10,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: layout.space.md, zIndex: 1 },
  heroTextCol: { flex: 1, minWidth: 0 },
  heroGreet: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.82)' },
  heroTitle: { marginTop: 4, fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5, lineHeight: 28 },
  heroDate: { marginTop: 6, fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.72)' },
  heroMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: layout.space.lg, zIndex: 1 },
  heroMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: layout.radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroMetaPillOpen: { backgroundColor: 'rgba(16,185,129,0.26)' },
  heroMetaPillClosed: { backgroundColor: 'rgba(248,113,113,0.24)' },
  heroMetaText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  heroClosedReason: {
    zIndex: 1,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: layout.radius.lg,
    backgroundColor: 'rgba(248,113,113,0.18)',
  },
  heroClosedReasonText: { flex: 1, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.92)', lineHeight: 17 },
  statRow: { flexDirection: 'row', gap: layout.space.sm, marginBottom: layout.space.sm },
  statTile: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: layout.radius.lg,
    padding: layout.space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...shadow.sm,
  },
  statTileIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statTileValue: { fontSize: 16, fontWeight: '800', color: palette.text, letterSpacing: -0.3 },
  statTileLabel: { marginTop: 2, fontSize: 10, fontWeight: '700', color: palette.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  statusCard: {
    backgroundColor: palette.surface,
    borderRadius: layout.radius.xxl,
    padding: layout.space.xl,
    marginBottom: layout.space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...shadow.sm,
  },
  statusCardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: layout.space.md },
  statusTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  statusTitleCol: { flex: 1, minWidth: 0 },
  statusIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusOverline: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: palette.textMuted, textTransform: 'uppercase' },
  statusSub: { marginTop: 4, fontSize: 13, color: palette.textSecondary, fontWeight: '600', lineHeight: 18 },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: layout.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  openBadgeOn: { backgroundColor: palette.successSoft, borderColor: 'rgba(5, 150, 105, 0.2)' },
  openBadgeOff: { backgroundColor: palette.dangerSoft, borderColor: 'rgba(220, 38, 38, 0.15)' },
  openBadgeDot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: palette.success },
  dotOff: { backgroundColor: palette.danger },
  openBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  openBadgeTextOn: { color: palette.success },
  openBadgeTextOff: { color: palette.danger },
  statusMessageBox: {
    marginTop: layout.space.lg,
    padding: layout.space.md,
    borderRadius: layout.radius.lg,
    backgroundColor: palette.surfaceMuted,
  },
  statusMessageText: { fontSize: 14, fontWeight: '600', color: palette.text, lineHeight: 20 },
  infoGrid: { flexDirection: 'row', gap: layout.space.sm, marginTop: layout.space.md },
  infoCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: layout.space.md,
    borderRadius: layout.radius.md,
    backgroundColor: palette.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderSubtle,
  },
  infoCellText: { flex: 1, fontSize: 12, fontWeight: '600', color: palette.textSecondary, lineHeight: 17 },
  financeCard: { padding: layout.space.xl, marginBottom: layout.space.md, ...shadow.sm },
  financeGrid: { flexDirection: 'row', gap: layout.space.sm, marginTop: layout.space.md },
  financeTile: {
    flex: 1,
    padding: layout.space.md,
    borderRadius: layout.radius.lg,
    backgroundColor: palette.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderSubtle,
  },
  financeTileDue: { backgroundColor: palette.dangerSoft, borderColor: 'rgba(220, 38, 38, 0.18)' },
  financeLabel: { fontSize: 11, fontWeight: '800', color: palette.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  financeValue: { marginTop: 6, fontSize: 18, fontWeight: '900', color: palette.text, letterSpacing: -0.4 },
  financeDueText: { color: palette.danger },
  financeOkText: { color: palette.success },
  financeAdvanceText: { color: palette.primary },
  financeMutedText: { color: palette.textMuted },
  financeMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.space.sm, marginTop: layout.space.md },
  financeMeta: {
    fontSize: 12,
    color: palette.textSecondary,
    fontWeight: '700',
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: layout.radius.full,
  },
  assignmentInline: { marginBottom: layout.space.md },
  assignmentSummaryRow: { flexDirection: 'row', gap: layout.space.sm, marginTop: layout.space.md },
  assignmentMiniTile: {
    flex: 1,
    padding: layout.space.md,
    borderRadius: layout.radius.md,
    backgroundColor: palette.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderSubtle,
  },
  assignmentMiniLabel: { fontSize: 10, fontWeight: '800', color: palette.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  assignmentMiniValue: { marginTop: 5, fontSize: 15, fontWeight: '900', color: palette.text },
  assignmentList: {
    marginTop: layout.space.md,
    borderRadius: layout.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderSubtle,
    overflow: 'hidden',
  },
  assignmentSlotRow: { flexDirection: 'row', alignItems: 'center', gap: layout.space.md, padding: layout.space.md, backgroundColor: palette.surfaceMuted },
  assignmentSlotIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignmentSlotText: { flex: 1, minWidth: 0 },
  assignmentSlotTitle: { fontSize: 14, fontWeight: '800', color: palette.text },
  assignmentSlotSub: { marginTop: 3, fontSize: 12, fontWeight: '600', color: palette.textMuted },
  assignmentEmpty: { marginTop: layout.space.md, fontSize: 13, fontWeight: '600', color: palette.textMuted, lineHeight: 19 },
  selfHero: {
    borderRadius: 28,
    padding: layout.space.xl,
    marginBottom: layout.space.md,
    backgroundColor: HERO_TOP,
    ...shadow.md,
  },
  selfHeroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: layout.space.md },
  selfKicker: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.72)', textTransform: 'uppercase', letterSpacing: 0.8 },
  selfTitle: { marginTop: 5, fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.8 },
  selfSubtitle: { marginTop: layout.space.md, color: 'rgba(255,255,255,0.82)', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  heroActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selfLevelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: layout.radius.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  selfLevelText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  xpPanel: {
    marginTop: layout.space.lg,
    padding: layout.space.md,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  xpHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: layout.space.md },
  xpLabel: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.68)', textTransform: 'uppercase', letterSpacing: 0.6 },
  xpValue: { fontSize: 12, fontWeight: '900', color: '#fef3c7' },
  xpTrack: {
    height: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
    marginTop: 10,
  },
  xpFill: { height: '100%', borderRadius: 999, backgroundColor: '#f59e0b' },
  connectedStudyCard: {
    padding: layout.space.lg,
    marginBottom: layout.space.md,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.14)',
    backgroundColor: '#fbfaff',
  },
  connectedStudyHead: { flexDirection: 'row', alignItems: 'flex-start', gap: layout.space.md },
  connectedStudyTitleWrap: { flex: 1, minWidth: 0 },
  connectedStudyKicker: { fontSize: 11, fontWeight: '900', color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.7 },
  connectedStudyToolsBtn: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#7c3aed',
    ...shadow.sm,
  },
  connectedStudyToolsText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  xpPanelCompact: {
    marginTop: layout.space.md,
    padding: layout.space.md,
    borderRadius: 18,
    backgroundColor: '#312e81',
  },
  connectedStudyStats: { flexDirection: 'row', gap: layout.space.sm, marginTop: layout.space.md },
  connectedStudyStat: {
    flex: 1,
    padding: layout.space.sm,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  connectedStudyStatValue: { fontSize: 15, fontWeight: '900', color: palette.text },
  connectedStudyStatLabel: { marginTop: 2, fontSize: 10, fontWeight: '900', color: palette.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  connectedQuickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  connectedQuickBtn: {
    width: '48%',
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: palette.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  connectedQuickText: { fontSize: 12, fontWeight: '900', color: palette.primary },
  achievementCard: {
    marginTop: layout.space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.space.sm,
    padding: layout.space.md,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  achievementIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementTextWrap: { flex: 1, minWidth: 0 },
  achievementLabel: { fontSize: 10, fontWeight: '900', color: 'rgba(255,255,255,0.68)', textTransform: 'uppercase', letterSpacing: 0.7 },
  achievementTitle: { marginTop: 2, fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: -0.2 },
  winningStreakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(251,146,60,0.18)',
  },
  winningStreakText: { fontSize: 11, fontWeight: '900', color: '#fed7aa' },
  questRow: { flexDirection: 'row', gap: layout.space.sm, marginBottom: layout.space.md },
  questChip: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: layout.space.sm,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...shadow.sm,
  },
  questText: { flexShrink: 1, fontSize: 11, fontWeight: '900', color: palette.text, textAlign: 'center' },
  dashboardCountdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.space.md,
    padding: layout.space.md,
    borderRadius: 22,
    marginBottom: layout.space.md,
    backgroundColor: '#312e81',
    ...shadow.md,
  },
  dashboardCountdownIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardCountdownKicker: { fontSize: 10, fontWeight: '900', color: 'rgba(255,255,255,0.68)', textTransform: 'uppercase', letterSpacing: 0.7 },
  dashboardCountdownTitle: { marginTop: 2, fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: -0.2 },
  dashboardCountdownSub: { marginTop: 3, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.74)' },
  dashboardCountdownBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fff' },
  dashboardCountdownBadgeText: { fontSize: 11, fontWeight: '900', color: '#312e81' },
  selfStatsGrid: { flexDirection: 'row', gap: layout.space.sm, marginBottom: layout.space.md },
  profileQuestCard: {
    padding: layout.space.lg,
    marginBottom: layout.space.md,
    borderWidth: 1,
    borderColor: 'rgba(13,148,136,0.14)',
    backgroundColor: '#f7fffd',
  },
  profileQuestHead: { flexDirection: 'row', alignItems: 'flex-start', gap: layout.space.md, marginBottom: layout.space.sm },
  profileQuestIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prepLabel: { marginTop: layout.space.md, fontSize: 12, fontWeight: '900', color: palette.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  prepChipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: layout.space.sm },
  prepChip: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  prepChipActive: { backgroundColor: TEAL_SOFT, borderColor: 'rgba(13,148,136,0.28)' },
  prepChipText: { fontSize: 12, fontWeight: '900', color: palette.textMuted },
  prepChipTextActive: { color: TEAL },
  profileSaveBtn: {
    marginTop: layout.space.md,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: TEAL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadow.sm,
  },
  profileSaveText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  studyActionRow: { flexDirection: 'row', gap: layout.space.sm, marginBottom: layout.space.md },
  studyActionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: TEAL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...shadow.sm,
  },
  studyActionText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  goalDateCard: { padding: layout.space.lg, marginBottom: layout.space.md },
  goalDateHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: layout.space.md },
  countdownRow: { flexDirection: 'row', gap: layout.space.sm, marginTop: layout.space.md },
  countdownBox: {
    flex: 1,
    minHeight: 92,
    borderRadius: 18,
    padding: layout.space.md,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  examCountdownBox: { backgroundColor: '#eff6ff' },
  physicalCountdownBox: { backgroundColor: '#ecfdf5' },
  countdownLabel: { fontSize: 11, fontWeight: '900', color: palette.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  countdownValue: { marginTop: 7, fontSize: 18, fontWeight: '900', color: palette.text, letterSpacing: -0.4 },
  countdownDate: { marginTop: 4, fontSize: 12, fontWeight: '700', color: palette.textMuted },
  goalDateInputs: { flexDirection: 'row', gap: layout.space.sm, marginTop: layout.space.sm },
  goalDateInput: { flex: 1 },
  goalDateButton: {
    marginTop: layout.space.sm,
    minHeight: 46,
    borderRadius: 15,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalDateButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  selfProgressCard: { padding: layout.space.lg, marginBottom: layout.space.md },
  selfProgressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: layout.space.md },
  selfCardTitle: { fontSize: 16, fontWeight: '900', color: palette.text, letterSpacing: -0.2 },
  selfProgressPct: { fontSize: 16, fontWeight: '900', color: palette.primary },
  selfProgressTrack: { height: 10, borderRadius: 999, backgroundColor: palette.primarySoft, overflow: 'hidden' },
  selfProgressFill: { height: '100%', borderRadius: 999, backgroundColor: palette.primary },
  selfHint: { marginTop: 8, fontSize: 12, fontWeight: '600', color: palette.textMuted, lineHeight: 17 },
  syllabusCard: { padding: layout.space.lg, marginBottom: layout.space.md },
  addSubjectRow: { flexDirection: 'row', alignItems: 'center', gap: layout.space.sm, marginTop: layout.space.sm },
  addSubjectInput: { flex: 1, marginTop: 0 },
  smallAddBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  subjectBox: {
    marginTop: layout.space.md,
    padding: layout.space.md,
    borderRadius: 18,
    backgroundColor: '#f8fbff',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  subjectHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: layout.space.md },
  subjectTitle: { flex: 1, fontSize: 15, fontWeight: '900', color: palette.text },
  subjectPct: { fontSize: 13, fontWeight: '900', color: palette.primary },
  subjectTrack: { height: 7, borderRadius: 999, backgroundColor: palette.primarySoft, overflow: 'hidden', marginTop: 10 },
  subjectFill: { height: '100%', borderRadius: 999, backgroundColor: TEAL },
  chapterBlock: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,23,42,0.08)',
  },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4 },
  chapterTextCol: { flex: 1, minWidth: 0 },
  chapterText: { flex: 1, fontSize: 13, fontWeight: '700', color: palette.text },
  chapterDone: { color: palette.textMuted, textDecorationLine: 'line-through' },
  revisionDueText: { marginTop: 3, fontSize: 11, fontWeight: '700', color: palette.textMuted },
  revisionDueNow: { color: '#7c3aed' },
  revisionActions: { flexDirection: 'row', gap: 8, marginTop: 8, paddingLeft: 26 },
  revisionBtn: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#ede9fe',
  },
  revisionDoneBtn: { backgroundColor: palette.successSoft },
  revisionBtnText: { fontSize: 11, fontWeight: '900', color: '#7c3aed' },
  revisionDoneText: { color: palette.success },
  addChapterRow: { flexDirection: 'row', alignItems: 'center', gap: layout.space.sm, marginTop: layout.space.xs },
  addChapterInput: { flex: 1, marginTop: 0, minHeight: 46 },
  connectCard: { padding: layout.space.lg, marginBottom: layout.space.md },
  unlockCard: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.16)',
    backgroundColor: '#fcfbff',
  },
  unlockGlow: {
    position: 'absolute',
    right: -36,
    top: -42,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  connectHead: { flexDirection: 'row', alignItems: 'flex-start', gap: layout.space.md, marginBottom: layout.space.md },
  connectIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockIcon: { backgroundColor: '#7c3aed' },
  connectInput: {
    minHeight: 50,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: '#f8fbff',
    paddingHorizontal: layout.space.md,
    marginTop: layout.space.sm,
    fontSize: 15,
    color: palette.text,
  },
  connectButton: {
    marginTop: layout.space.md,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: palette.primary,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  unlockButton: { backgroundColor: '#7c3aed' },
  connectButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  unlockFeatureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: layout.space.md },
  unlockFeaturePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
  },
  unlockFeatureText: { fontSize: 11, fontWeight: '900', color: palette.primary },
  sessionCard: {
    backgroundColor: palette.surface,
    borderRadius: layout.radius.xxl,
    padding: layout.space.xl,
    marginBottom: layout.space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...shadow.md,
  },
  sessionCardStacked: { gap: layout.space.lg },
  sessionCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: layout.space.md },
  sessionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7, color: palette.textMuted, textTransform: 'uppercase' },
  sessionSlotTitle: { marginTop: 4, fontSize: 16, fontWeight: '800', color: palette.text, letterSpacing: -0.2 },
  sessionStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: layout.radius.full,
    backgroundColor: palette.surfaceMuted,
  },
  sessionPillSuccess: { backgroundColor: palette.successSoft },
  sessionPillActive: { backgroundColor: TEAL_SOFT },
  sessionPillReady: { backgroundColor: palette.primarySoft },
  sessionPillWarn: { backgroundColor: palette.warningSoft },
  sessionPillDanger: { backgroundColor: palette.dangerSoft },
  sessionPillMuted: { backgroundColor: palette.surfaceMuted },
  sessionStatusText: { fontSize: 11, fontWeight: '800', color: palette.textSecondary },
  timerPanel: {
    marginTop: layout.space.lg,
    padding: layout.space.lg,
    borderRadius: layout.radius.lg,
    backgroundColor: palette.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderSubtle,
  },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.textHint },
  timerDotLive: { backgroundColor: TEAL },
  timerDotDone: { backgroundColor: palette.success },
  timerDigits: { fontSize: 32, fontWeight: '800', letterSpacing: 1, color: palette.primary, fontVariant: ['tabular-nums'] },
  timerCaption: { marginTop: 6, fontSize: 12, color: palette.textMuted, fontWeight: '600' },
  sessionCompactRow: {
    flexDirection: 'row',
    gap: layout.space.sm,
    marginTop: layout.space.md,
  },
  assignedCompactPanel: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: layout.radius.lg,
    backgroundColor: palette.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderSubtle,
  },
  assignedCompactIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignedCompactText: { flex: 1, minWidth: 0 },
  assignedCompactTitle: { fontSize: 13, fontWeight: '900', color: palette.text },
  assignedCompactSub: { marginTop: 2, fontSize: 11, fontWeight: '700', color: palette.textMuted },
  timerCompactPanel: {
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: layout.radius.lg,
    backgroundColor: palette.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26, 54, 124, 0.14)',
  },
  timerCompactText: { flex: 1, minWidth: 0 },
  timerCompactDigits: { fontSize: 17, fontWeight: '900', color: palette.primary, fontVariant: ['tabular-nums'] },
  timerCompactCaption: { marginTop: 1, fontSize: 10, fontWeight: '800', color: palette.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  sessionHint: { marginTop: layout.space.md, fontSize: 12, color: palette.textMuted, fontWeight: '600', lineHeight: 18 },
  upcomingHint: { marginTop: layout.space.md, fontSize: 12, color: TEAL, fontWeight: '700', lineHeight: 18 },
  checkoutActions: { gap: 10, width: '100%' },
  checkoutActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: layout.radius.lg,
  },
  checkoutActionText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  qrCheckoutCta: { backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.primary },
  qrCheckoutText: { color: palette.primary, fontWeight: '800', fontSize: 15 },
  sessionDoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: layout.radius.lg,
    backgroundColor: palette.successSoft,
  },
  sessionDoneText: { fontSize: 15, fontWeight: '800', color: palette.success },
  checkInCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: palette.primary,
    paddingVertical: 16,
    borderRadius: layout.radius.lg,
    ...shadow.sm,
  },
  checkOutCta: { backgroundColor: palette.primaryDark, ...shadow.sm },
  ctaDisabled: { opacity: 0.42 },
  checkInText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  qrPunchCard: {
    backgroundColor: palette.surface,
    borderRadius: layout.radius.xl,
    padding: layout.space.lg,
    marginBottom: layout.space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: layout.space.md,
    ...shadow.sm,
  },
  qrPunchHead: { flexDirection: 'row', alignItems: 'flex-start', gap: layout.space.md },
  qrIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPunchCopy: { flex: 1, minWidth: 0 },
  qrPunchTitle: { fontSize: 16, fontWeight: '800', color: palette.text },
  qrPunchSub: { marginTop: 4, fontSize: 12, color: palette.textMuted, lineHeight: 17 },
  qrPunchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: palette.primary,
    borderRadius: layout.radius.lg,
    paddingVertical: 14,
    ...shadow.sm,
  },
  qrPunchBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  scannerWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    borderRadius: layout.radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  scannerView: { width: '100%', height: 260 },
  scannerFrame: {
    position: 'absolute',
    top: '18%',
    left: '12%',
    right: '12%',
    height: '50%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.75)',
    borderRadius: layout.radius.md,
  },
  scannerCloseBtn: { backgroundColor: '#111827', paddingVertical: 12, alignItems: 'center' },
  scannerCloseText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modeInfoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: layout.space.md,
    backgroundColor: palette.primarySoft,
    borderRadius: layout.radius.xl,
    padding: layout.space.lg,
    marginBottom: layout.space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  modeInfoTextCol: { flex: 1 },
  modeInfoTitle: { fontSize: 14, fontWeight: '800', color: palette.text },
  modeInfoBody: { marginTop: 4, fontSize: 12, color: palette.textSecondary, lineHeight: 17 },
  perfCard: { padding: layout.space.xl, marginBottom: layout.space.md, ...shadow.sm },
  perfBody: { flexDirection: 'row', alignItems: 'center', gap: layout.space.lg, marginTop: layout.space.md },
  perfRingWrap: { width: 108, height: 108, alignItems: 'center', justifyContent: 'center' },
  perfRingOuter: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: palette.primarySoft,
    overflow: 'hidden',
    transform: [{ rotate: '-90deg' }],
  },
  perfRingArc: { height: '100%', backgroundColor: palette.primary, borderRadius: 54 },
  perfRingInner: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  perfPct: { fontSize: 24, fontWeight: '800', color: palette.primary, letterSpacing: -0.5 },
  perfPctLabel: { fontSize: 10, fontWeight: '700', color: palette.textMuted, textTransform: 'uppercase' },
  perfStatsCol: { flex: 1, gap: 8 },
  perfStatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  perfStatLabel: { fontSize: 12, fontWeight: '600', color: palette.textMuted },
  perfStatValue: { fontSize: 16, fontWeight: '800', color: palette.text },
  perfStatValueWarn: { color: palette.danger },
  excellentPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: TEAL_SOFT,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: layout.radius.full,
  },
  excellentText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5, color: TEAL },
  section: { marginBottom: layout.space.md },
  sectionHeader: { marginBottom: layout.space.sm },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: palette.text, letterSpacing: -0.3 },
  sectionSubtitle: { marginTop: 2, fontSize: 12, color: palette.textMuted, fontWeight: '500' },
  listCard: { overflow: 'hidden' },
  listRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.borderSubtle },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: layout.space.md,
    padding: layout.space.lg,
    marginBottom: layout.space.sm,
  },
  servicePausedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: layout.space.md,
    padding: layout.space.lg,
    marginBottom: layout.space.md,
    backgroundColor: '#fff7ed',
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  servicePausedCopy: { flex: 1, minWidth: 0 },
  servicePausedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: palette.text,
  },
  servicePausedText: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: palette.textMuted,
    lineHeight: 17,
  },
  alertIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertContent: { flex: 1, minWidth: 0 },
  alertT: { fontSize: 15, fontWeight: '800', color: palette.text },
  alertM: { marginTop: 4, fontSize: 13, color: palette.textSecondary, lineHeight: 19 },
  alertDue: { marginTop: 8, fontWeight: '800', color: palette.warning, fontSize: 14 },
  holidayItem: { flexDirection: 'row', alignItems: 'center', gap: layout.space.md, padding: layout.space.lg },
  holidayDateBox: {
    width: 48,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: layout.radius.md,
    backgroundColor: TEAL_SOFT,
  },
  holidayDate: { fontSize: 18, fontWeight: '800', color: TEAL },
  holidayMonth: { marginTop: 2, fontSize: 10, fontWeight: '700', color: TEAL, textTransform: 'uppercase' },
  holidayTit: { flex: 1, fontSize: 14, fontWeight: '700', color: palette.text, lineHeight: 20 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: layout.space.md, padding: layout.space.lg },
  slotIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotIconDone: { backgroundColor: palette.successSoft },
  slotIconLive: { backgroundColor: TEAL_SOFT },
  slotTxtCol: { flex: 1, minWidth: 0 },
  slotTxt: { fontSize: 14, fontWeight: '700', color: palette.text },
  slotSubTxt: { marginTop: 3, fontSize: 11, color: palette.textMuted, fontWeight: '500' },
  slotBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: layout.radius.full,
    backgroundColor: palette.surfaceMuted,
  },
  slotBadgeDone: { backgroundColor: palette.successSoft },
  slotBadgeLive: { backgroundColor: TEAL_SOFT },
  slotBadgeText: { fontSize: 10, fontWeight: '800', color: palette.textMuted, textTransform: 'uppercase' },
  slotBadgeTextDone: { color: palette.success },
  slotBadgeTextLive: { color: TEAL },
});
