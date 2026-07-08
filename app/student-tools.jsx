import { useAuth } from '@/context/AuthContext';
import { ApiError, studentUpdateProfile, studentUpdateSelfStudy } from '@/lib/api/studentApi';
import { showInterstitialAfterScreenSwitches } from '@/lib/adMob';
import { cardFlat, layout, palette, shadow } from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TEAL = '#0d9488';
const PREPARATION_OPTIONS = ['SSC', 'UPSC', 'Banking', 'Railway', 'NEET', 'JEE', 'Defence', 'State PCS', 'School/College', 'Other'];
const SECTIONS = [
  { id: 'syllabus', title: 'Syllabus', icon: 'book' },
  { id: 'profile', title: 'My profile', icon: 'user-circle' },
  { id: 'unlock', title: 'Connect library', icon: 'unlock-alt' },
  { id: 'dates', title: 'Exam dates', icon: 'calendar-check-o' },
];

function parsePreparation(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function localYmd() {
  const d = new Date();
  const p = (n) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isYmdDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
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

function daysUntilYmd(value) {
  if (!isYmdDate(value)) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  const target = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function countdownText(value, fallback) {
  const days = daysUntilYmd(value);
  if (days === null) return fallback;
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days left`;
}

function ymdFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromYmd(value) {
  if (!isYmdDate(value)) return new Date();
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function monthTitle(date) {
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function calendarDates(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const blanks = Array.from({ length: first.getDay() }, () => null);
  const dates = Array.from({ length: days }, (_, index) => new Date(date.getFullYear(), date.getMonth(), index + 1));
  return [...blanks, ...dates];
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
    dates.push({
      id: 'date-exam',
      title: String(profile?.exam_name || 'Exam').trim() || 'Exam',
      date: profile.exam_date,
      type: 'exam',
    });
  }
  if (isYmdDate(profile?.physical_training_date)) {
    dates.push({
      id: 'date-physical',
      title: 'Physical training',
      date: profile.physical_training_date,
      type: 'physical',
    });
  }
  return dates;
}

function nearestImportantDate(dates) {
  return [...dates]
    .map((item) => ({ ...item, days: daysUntilYmd(item.date) }))
    .filter((item) => item.days !== null && item.days >= 0)
    .sort((a, b) => a.days - b.days)[0] || null;
}

export default function StudentToolsScreen({ fixedSection = null, hideSectionTabs = false, hideBack = false, hideHeader = false } = {}) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { token, student, library, connectStudentLibrary, refreshMe } = useAuth();
  const initialSection = fixedSection || String(params.section || 'syllabus');
  const [activeSection, setActiveSection] = useState(SECTIONS.some((item) => item.id === initialSection) ? initialSection : 'syllabus');
  const [busy, setBusy] = useState(false);
  const [connectLoginId, setConnectLoginId] = useState('');
  const [connectPassword, setConnectPassword] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [selectedPreparation, setSelectedPreparation] = useState([]);
  const [customPreparation, setCustomPreparation] = useState('');
  const [syllabusName, setSyllabusName] = useState('');
  const [subjectTitle, setSubjectTitle] = useState('');
  const [formModal, setFormModal] = useState(null);
  const [subjectSyllabus, setSubjectSyllabus] = useState(null);
  const [chapterSubject, setChapterSubject] = useState(null);
  const [chapterSyllabus, setChapterSyllabus] = useState(null);
  const [chapterTitle, setChapterTitle] = useState('');
  const [expandedSyllabi, setExpandedSyllabi] = useState({});
  const [expandedSubjects, setExpandedSubjects] = useState({});
  const [importantDates, setImportantDates] = useState([]);
  const [importantTitleInput, setImportantTitleInput] = useState('');
  const [importantTypeInput, setImportantTypeInput] = useState('exam');
  const [importantDateInput, setImportantDateInput] = useState('');
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [pickerMonth, setPickerMonth] = useState(() => new Date());

  const profile = student?.self_study_profile && typeof student.self_study_profile === 'object' ? student.self_study_profile : {};
  const syllabi = useMemo(() => {
    if (Array.isArray(profile.syllabi) && profile.syllabi.length) return profile.syllabi;
    const subjects = Array.isArray(profile.subjects) ? profile.subjects : [];
    return subjects.length ? [{ id: 'syl-default', title: profile.syllabus_name || 'My Syllabus', subjects }] : [];
  }, [profile.syllabi, profile.subjects, profile.syllabus_name]);
  const totalChapters = syllabi.reduce((sum, syllabus) => sum + (syllabus.subjects ?? []).reduce((s, subject) => s + (subject.chapters ?? []).length, 0), 0);
  const doneChapters = syllabi.reduce((sum, syllabus) => sum + (syllabus.subjects ?? []).reduce((s, subject) => s + (subject.chapters ?? []).filter((chapter) => chapter.done).length, 0), 0);
  const progress = totalChapters ? Math.round((doneChapters / totalChapters) * 100) : Number(profile.syllabus_progress ?? 0);
  const nearestDate = useMemo(() => nearestImportantDate(importantDates), [importantDates]);
  const todayYmd = localYmd();
  const currentTitle = useMemo(() => SECTIONS.find((item) => item.id === activeSection)?.title || 'Student tools', [activeSection]);

  useEffect(() => {
    setProfileName(student?.name || '');
    setProfilePhone(student?.phone || '');
    const selected = parsePreparation(student?.preparation);
    setSelectedPreparation(selected.filter((item) => PREPARATION_OPTIONS.includes(item)));
    setCustomPreparation(selected.filter((item) => !PREPARATION_OPTIONS.includes(item)).join(', '));
  }, [student?.name, student?.phone, student?.preparation]);

  useEffect(() => {
    setSyllabusName('');
    setImportantDates(importantDatesFromProfile(profile));
  }, [profile.important_dates, profile.exam_name, profile.exam_date, profile.physical_training_date]);

  useEffect(() => {
    if (fixedSection && activeSection !== fixedSection) {
      setActiveSection(fixedSection);
    }
  }, [activeSection, fixedSection]);

  if (!token) return <Redirect href="/login" />;

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
      subjects: syllabi.flatMap((syllabus) => (syllabus.subjects ?? []).map((subject) => ({ ...subject, syllabus_id: syllabus.id, syllabus_title: syllabus.title }))),
      ...patch,
    };
  }

  async function saveStudyProfile(next, message) {
    setBusy(true);
    try {
      await studentUpdateSelfStudy(token, next);
      await refreshMe();
      if (message) Alert.alert('Study tools', message);
    } catch (e) {
      Alert.alert('Study tools', e instanceof ApiError ? e.message : 'Could not save changes.');
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    const name = profileName.trim();
    if (!name) {
      Alert.alert('My profile', 'Enter your name.');
      return;
    }
    const customItems = parsePreparation(customPreparation);
    const preparation = [...selectedPreparation, ...customItems]
      .filter((item, index, items) => items.indexOf(item) === index)
      .join(', ');
    setBusy(true);
    try {
      await studentUpdateProfile(token, {
        name,
        phone: profilePhone.trim() || null,
        preparation: preparation || null,
      });
      await refreshMe();
      Alert.alert('My profile', 'Profile updated.');
    } catch (e) {
      Alert.alert('My profile', e instanceof ApiError ? e.message : 'Could not update profile.');
    } finally {
      setBusy(false);
    }
  }

  async function connectLibrary() {
    if (!connectLoginId.trim() || !connectPassword) {
      Alert.alert('Connect library', 'Enter Library ID / Student Login ID and password.');
      return;
    }
    setBusy(true);
    try {
      await connectStudentLibrary(connectLoginId.trim(), connectPassword);
      Alert.alert('Library connected', 'Attendance, fees, notices and profile are now unlocked.');
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('Connect library', e instanceof ApiError ? e.message : 'Could not connect library.');
    } finally {
      setBusy(false);
    }
  }

  function addSubject() {
    const title = subjectTitle.trim();
    if (!title || !subjectSyllabus?.id) return;
    const nextSyllabi = syllabi.map((syllabus) => (
      syllabus.id === subjectSyllabus.id
        ? { ...syllabus, subjects: [...(syllabus.subjects ?? []), { id: `sub-${Date.now()}`, title, chapters: [] }] }
        : syllabus
    ));
    setSubjectTitle('');
    setSubjectSyllabus(null);
    setFormModal(null);
    void saveStudyProfile(nextProfile({ syllabi: nextSyllabi }), 'Subject added.');
  }

  function addSyllabus() {
    const name = syllabusName.trim();
    if (!name) return;
    const id = `syl-${Date.now()}`;
    setSyllabusName('');
    setFormModal(null);
    setExpandedSyllabi((items) => ({ ...items, [id]: true }));
    showInterstitialAfterScreenSwitches();
    void saveStudyProfile(nextProfile({ syllabi: [...syllabi, { id, title: name, subjects: [] }], syllabus_name: syllabi.length ? profile.syllabus_name : name }), 'Syllabus added.');
  }

  function removeSyllabus(syllabusId) {
    const nextSyllabi = syllabi.filter((syllabus) => syllabus.id !== syllabusId);
    setExpandedSyllabi((items) => {
      const next = { ...items };
      delete next[syllabusId];
      return next;
    });
    const patch = {
      syllabi: nextSyllabi,
      syllabus_name: nextSyllabi[0]?.title ?? null,
    };
    if (nextSyllabi.length === 0) patch.subjects = [];
    void saveStudyProfile(nextProfile(patch), 'Syllabus removed.');
  }

  function confirmRemoveSyllabus(syllabus) {
    Alert.alert(
      'Remove syllabus',
      `Remove "${syllabus.title}" with all subjects and chapters?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeSyllabus(syllabus.id) },
      ],
    );
  }

  function togglePreparation(option) {
    setSelectedPreparation((items) => (
      items.includes(option) ? items.filter((item) => item !== option) : [...items, option]
    ));
  }

  function addChapter(subjectId) {
    const title = String(chapterTitle || '').trim();
    if (!title || !chapterSyllabus?.id || !subjectId) return;
    const nextSyllabi = syllabi.map((syllabus) => (
      syllabus.id === chapterSyllabus.id
        ? {
          ...syllabus,
          subjects: (syllabus.subjects ?? []).map((subject) => (
            subject.id === subjectId
              ? { ...subject, chapters: [...(subject.chapters ?? []), { id: `ch-${Date.now()}`, title, done: false, revision_count: 0, last_revised_date: null, next_revision_date: null }] }
              : subject
          )),
        }
        : syllabus
    ));
    setChapterTitle('');
    setChapterSubject(null);
    setChapterSyllabus(null);
    setFormModal(null);
    void saveStudyProfile(nextProfile({ syllabi: nextSyllabi }), 'Chapter added.');
  }

  function openSubjectModal(syllabus) {
    setSubjectSyllabus(syllabus);
    setSubjectTitle('');
    setFormModal('subject');
  }

  function openChapterModal(syllabus, subject) {
    setChapterSyllabus(syllabus);
    setChapterSubject(subject);
    setChapterTitle('');
    setFormModal('chapter');
  }

  function toggleChapter(syllabusId, subjectId, chapterId) {
    let completedNow = false;
    const nextSyllabi = syllabi.map((syllabus) => {
      if (syllabus.id !== syllabusId) return syllabus;
      return {
        ...syllabus,
        subjects: (syllabus.subjects ?? []).map((subject) => {
          if (subject.id !== subjectId) return subject;
          return {
            ...subject,
            chapters: (subject.chapters ?? []).map((chapter) => {
              if (chapter.id !== chapterId) return chapter;
              completedNow = !chapter.done;
              return { ...chapter, done: !chapter.done };
            }),
          };
        }),
      };
    });
    const xp = Number(profile.xp ?? 0) + (completedNow ? 35 : 0);
    void saveStudyProfile(nextProfile({ syllabi: nextSyllabi, xp, level: Math.floor(xp / 250) + 1 }), completedNow ? '+35 XP for completing a chapter.' : null);
  }

  function deleteChapter(syllabusId, subjectId, chapterId) {
    const nextSyllabi = syllabi.map((syllabus) => (
      syllabus.id === syllabusId
        ? {
          ...syllabus,
          subjects: (syllabus.subjects ?? []).map((subject) => (
            subject.id === subjectId
              ? { ...subject, chapters: (subject.chapters ?? []).filter((chapter) => chapter.id !== chapterId) }
              : subject
          )),
        }
        : syllabus
    ));
    void saveStudyProfile(nextProfile({ syllabi: nextSyllabi }), 'Chapter deleted.');
  }

  function confirmDeleteChapter(syllabusId, subjectId, chapter) {
    Alert.alert(
      'Delete chapter',
      `Delete "${chapter.title}" from this subject?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteChapter(syllabusId, subjectId, chapter.id) },
      ],
    );
  }

  function scheduleRevision(syllabusId, subjectId, chapterId) {
    const nextSyllabi = syllabi.map((syllabus) => (
      syllabus.id === syllabusId
        ? { ...syllabus, subjects: (syllabus.subjects ?? []).map((subject) => (subject.id === subjectId ? { ...subject, chapters: (subject.chapters ?? []).map((chapter) => (chapter.id === chapterId ? { ...chapter, next_revision_date: dateAfter(1), revision_count: Number(chapter.revision_count ?? 0) } : chapter)) } : subject)) }
        : syllabus
    ));
    void saveStudyProfile(nextProfile({ syllabi: nextSyllabi }), 'Revision scheduled for tomorrow.');
  }

  function markRevised(syllabusId, subjectId, chapterId) {
    const nextSyllabi = syllabi.map((syllabus) => {
      if (syllabus.id !== syllabusId) return syllabus;
      return {
        ...syllabus,
        subjects: (syllabus.subjects ?? []).map((subject) => {
          if (subject.id !== subjectId) return subject;
          return {
            ...subject,
            chapters: (subject.chapters ?? []).map((chapter) => {
              if (chapter.id !== chapterId) return chapter;
              const count = Number(chapter.revision_count ?? 0) + 1;
              return { ...chapter, revision_count: count, last_revised_date: todayYmd, next_revision_date: nextRevisionDateForCount(count) };
            }),
          };
        }),
      };
    });
    const xp = Number(profile.xp ?? 0) + 20;
    void saveStudyProfile(nextProfile({ syllabi: nextSyllabi, xp, level: Math.floor(xp / 250) + 1 }), '+20 XP for revision.');
  }

  function toggleSyllabusOpen(id) {
    setExpandedSyllabi((items) => ({ ...items, [id]: items[id] === false ? true : false }));
  }

  function toggleSubjectOpen(id) {
    setExpandedSubjects((items) => ({ ...items, [id]: items[id] === false ? true : false }));
  }

  function saveDates() {
    showInterstitialAfterScreenSwitches();
    void saveStudyProfile(nextProfile({
      important_dates: importantDates,
      exam_name: null,
      exam_date: null,
      physical_training_date: null,
    }), 'Important dates updated.');
  }

  function addImportantDate() {
    const title = importantTitleInput.trim();
    const date = importantDateInput.trim();
    if (!title) {
      Alert.alert('Important date', 'Enter a title for this date.');
      return;
    }
    if (!isYmdDate(date)) {
      Alert.alert('Important date', 'Select a valid date from the calendar.');
      return;
    }
    setImportantDates((items) => [
      ...items,
      {
        id: `date-${Date.now()}`,
        title,
        date,
        type: importantTypeInput,
      },
    ].sort((a, b) => String(a.date).localeCompare(String(b.date))));
    setImportantTitleInput('');
    setImportantDateInput('');
    setImportantTypeInput('exam');
    showInterstitialAfterScreenSwitches();
  }

  function removeImportantDate(id) {
    setImportantDates((items) => items.filter((item) => item.id !== id));
  }

  function openDatePicker(target) {
    const value = target === 'important' ? importantDateInput : '';
    setPickerMonth(dateFromYmd(value));
    setDatePickerTarget(target);
  }

  function selectDate(date) {
    const value = ymdFromDate(date);
    if (datePickerTarget === 'important') {
      setImportantDateInput(value);
    }
    setDatePickerTarget(null);
  }

  function clearPickedDate() {
    if (datePickerTarget === 'important') {
      setImportantDateInput('');
    }
    setDatePickerTarget(null);
  }

  return (
    <View style={styles.screen}>
      <Modal visible={Boolean(formModal)} transparent animationType="fade" onRequestClose={() => setFormModal(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFormModal(null)}>
          <Pressable style={styles.modalCard}>
            <View style={styles.modalHead}>
              <View>
                <Text style={styles.modalKicker}>Syllabus builder</Text>
                <Text style={styles.modalTitle}>
                  {formModal === 'syllabus' ? 'Add syllabus' : formModal === 'subject' ? 'Add subject' : 'Add chapter'}
                </Text>
              </View>
              <Pressable style={styles.modalClose} onPress={() => setFormModal(null)}>
                <FontAwesome name="close" size={15} color={palette.text} />
              </Pressable>
            </View>
            {formModal === 'syllabus' ? (
              <>
                <TextInput style={styles.input} value={syllabusName} onChangeText={setSyllabusName} placeholder="e.g. SSC CGL 2026" placeholderTextColor={palette.textHint} autoFocus />
                <PrimaryButton icon="plus" label="Add syllabus" onPress={addSyllabus} disabled={busy || !syllabusName.trim()} />
              </>
            ) : null}
            {formModal === 'subject' ? (
              <>
                <Text style={styles.modalHint}>Syllabus: {subjectSyllabus?.title || 'Select syllabus'}</Text>
                <TextInput style={styles.input} value={subjectTitle} onChangeText={setSubjectTitle} placeholder="Subject name" placeholderTextColor={palette.textHint} autoFocus />
                <PrimaryButton icon="plus" label="Add subject" onPress={addSubject} disabled={busy || !subjectSyllabus?.id || !subjectTitle.trim()} />
              </>
            ) : null}
            {formModal === 'chapter' ? (
              <>
                <Text style={styles.modalHint}>Syllabus: {chapterSyllabus?.title || 'Syllabus'}</Text>
                <Text style={styles.modalHint}>Subject: {chapterSubject?.title || 'Subject'}</Text>
                <TextInput style={styles.input} value={chapterTitle} onChangeText={setChapterTitle} placeholder="Chapter name" placeholderTextColor={palette.textHint} autoFocus />
                <PrimaryButton icon="plus" label="Add chapter" onPress={() => addChapter(chapterSubject?.id)} disabled={busy || !chapterSubject?.id || !chapterTitle.trim()} />
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={Boolean(datePickerTarget)} transparent animationType="fade" onRequestClose={() => setDatePickerTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDatePickerTarget(null)}>
          <Pressable style={styles.modalCard}>
            <View style={styles.modalHead}>
              <View>
                <Text style={styles.modalKicker}>Important date</Text>
                <Text style={styles.modalTitle}>Select date</Text>
              </View>
              <Pressable style={styles.modalClose} onPress={() => setDatePickerTarget(null)}>
                <FontAwesome name="close" size={15} color={palette.text} />
              </Pressable>
            </View>
            <View style={styles.calendarHead}>
              <Pressable style={styles.calendarNav} onPress={() => setPickerMonth((date) => addMonths(date, -1))}>
                <FontAwesome name="angle-left" size={20} color={palette.primary} />
              </Pressable>
              <Text style={styles.calendarTitle}>{monthTitle(pickerMonth)}</Text>
              <Pressable style={styles.calendarNav} onPress={() => setPickerMonth((date) => addMonths(date, 1))}>
                <FontAwesome name="angle-right" size={20} color={palette.primary} />
              </Pressable>
            </View>
            <View style={styles.weekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekDay}>{day}</Text>)}
            </View>
            <View style={styles.calendarGrid}>
              {calendarDates(pickerMonth).map((date, index) => {
                const value = date ? ymdFromDate(date) : null;
                const selected = value && value === importantDateInput;
                return (
                  <Pressable
                    key={value || `blank-${index}`}
                    style={[styles.dateCell, selected && styles.dateCellActive, !date && styles.dateCellBlank]}
                    onPress={() => date && selectDate(date)}
                    disabled={!date}
                  >
                    <Text style={[styles.dateCellText, selected && styles.dateCellTextActive]}>{date ? date.getDate() : ''}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.dateModalActions}>
              <Pressable style={styles.clearDateBtn} onPress={clearPickedDate}>
                <Text style={styles.clearDateText}>Clear date</Text>
              </Pressable>
              <Pressable style={styles.todayDateBtn} onPress={() => selectDate(new Date())}>
                <Text style={styles.todayDateText}>Today</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {!hideHeader ? <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        {!hideBack ? (
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <FontAwesome name="angle-left" size={24} color="#fff" />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Student tools</Text>
          <Text style={styles.title}>{currentTitle}</Text>
        </View>
      </View> : null}
      {!hideSectionTabs ? <View style={styles.sectionTabs}>
        {SECTIONS.map((item) => {
          const active = activeSection === item.id;
          return (
            <Pressable key={item.id} style={[styles.sectionTab, active && styles.sectionTabActive]} onPress={() => setActiveSection(item.id)}>
              <FontAwesome name={item.icon} size={13} color={active ? '#fff' : palette.primary} />
              <Text style={[styles.sectionTabText, active && styles.sectionTabTextActive]}>{item.title}</Text>
            </Pressable>
          );
        })}
      </View> : null}
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + layout.space.xxl }]}>
        {activeSection === 'profile' ? (
          <View style={[cardFlat(), styles.card]}>
            <Text style={styles.cardTitle}>My profile</Text>
            <Text style={styles.hint}>Tell us what you are preparing for.</Text>
            <TextInput style={styles.input} value={profileName} onChangeText={setProfileName} placeholder="Your name" placeholderTextColor={palette.textHint} />
            <TextInput style={styles.input} value={profilePhone} onChangeText={setProfilePhone} placeholder="Phone (optional)" placeholderTextColor={palette.textHint} keyboardType="phone-pad" />
            <Text style={styles.label}>Preparing for</Text>
            <View style={styles.chipGrid}>
              {PREPARATION_OPTIONS.map((option) => {
                const active = selectedPreparation.includes(option);
                return (
                  <Pressable key={option} style={[styles.chip, active && styles.chipActive]} onPress={() => togglePreparation(option)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput style={styles.input} value={customPreparation} onChangeText={setCustomPreparation} placeholder="Other goals, comma separated" placeholderTextColor={palette.textHint} />
            <PrimaryButton icon="save" label={busy ? 'Saving...' : 'Save profile'} onPress={saveProfile} disabled={busy} />
          </View>
        ) : null}

        {activeSection === 'unlock' ? (
          <View style={[cardFlat(), styles.card]}>
            <Text style={styles.cardTitle}>Connect library</Text>
            <Text style={styles.hint}>Use Library ID / Student Login ID and password to unlock attendance, fees, notices and profile.</Text>
            <TextInput style={styles.input} value={connectLoginId} onChangeText={setConnectLoginId} placeholder="Library ID / Student Login ID" placeholderTextColor={palette.textHint} autoCapitalize="none" />
            <TextInput style={styles.input} value={connectPassword} onChangeText={setConnectPassword} placeholder="Library password" placeholderTextColor={palette.textHint} secureTextEntry />
            <View style={styles.unlockRow}>
              {['Attendance', 'Fees', 'Notices', 'Profile'].map((label) => <Text key={label} style={styles.unlockPill}>{label}</Text>)}
            </View>
            <PrimaryButton icon="key" label={busy ? 'Connecting...' : 'Connect library'} onPress={connectLibrary} disabled={busy} />
          </View>
        ) : null}

        {activeSection === 'dates' ? (
          <View style={[cardFlat(), styles.card]}>
            <Text style={styles.cardTitle}>Important dates</Text>
            <Text style={styles.hint}>
              {nearestDate ? `${nearestDate.title}: ${countdownText(nearestDate.date, 'Set date')}` : 'Add exam, physical, admit card, result, or any important date.'}
            </Text>
            {nearestDate ? (
              <View style={styles.nearestDateCard}>
                <View style={styles.nearestDateIcon}>
                  <FontAwesome name="flag-checkered" size={16} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nearestDateLabel}>Nearest countdown</Text>
                  <Text style={styles.nearestDateTitle}>{nearestDate.title}</Text>
                  <Text style={styles.nearestDateSub}>{nearestDate.date} · {countdownText(nearestDate.date, 'Set date')}</Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.label}>Date type</Text>
            <View style={styles.dateTypeRow}>
              {[
                ['exam', 'Exam'],
                ['physical', 'Physical'],
                ['custom', 'Other'],
              ].map(([type, label]) => {
                const active = importantTypeInput === type;
                return (
                  <Pressable key={type} style={[styles.dateTypePill, active && styles.dateTypePillActive]} onPress={() => setImportantTypeInput(type)}>
                    <Text style={[styles.dateTypeText, active && styles.dateTypeTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.label}>Title</Text>
            <TextInput style={styles.input} value={importantTitleInput} onChangeText={setImportantTitleInput} placeholder="e.g. SSC CGL Tier 1, Admit card, Physical test" placeholderTextColor={palette.textHint} />
            <Text style={styles.label}>Date</Text>
            <Pressable style={styles.datePickerButton} onPress={() => openDatePicker('important')}>
              <View style={styles.datePickerIcon}>
                <FontAwesome name="calendar" size={15} color={palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.datePickerLabel}>{importantDateInput || 'Choose date'}</Text>
                <Text style={styles.datePickerSub}>{countdownText(importantDateInput, 'Tap to select from calendar')}</Text>
              </View>
              <FontAwesome name="angle-right" size={18} color={palette.textHint} />
            </Pressable>
            <Pressable style={styles.addImportantDateBtn} onPress={addImportantDate} disabled={busy}>
              <FontAwesome name="plus-circle" size={14} color="#fff" />
              <Text style={styles.addImportantDateText}>Add date</Text>
            </Pressable>
            {importantDates.length ? (
              <View style={styles.importantDateList}>
                {importantDates.map((item) => (
                  <View key={item.id} style={styles.importantDateItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.importantDateTitle}>{item.title}</Text>
                      <Text style={styles.importantDateSub}>{item.date} · {countdownText(item.date, 'Date')}</Text>
                    </View>
                    <Text style={styles.importantDateType}>{item.type}</Text>
                    <Pressable style={styles.deleteIconBtn} onPress={() => removeImportantDate(item.id)} disabled={busy}>
                      <FontAwesome name="trash-o" size={14} color="#dc2626" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <PrimaryButton icon="calendar-check-o" label={busy ? 'Saving...' : 'Save important dates'} onPress={saveDates} disabled={busy} />
          </View>
        ) : null}

        {activeSection === 'syllabus' ? (
          <View style={[cardFlat(), styles.card]}>
            <View style={styles.syllabusHero}>
              <View style={styles.syllabusIcon}>
                <FontAwesome name="map" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.syllabusKicker}>Your learning map</Text>
                <Text style={styles.cardTitle}>My syllabi</Text>
                <Text style={styles.hint}>{syllabi.length} syllabus · {doneChapters}/{totalChapters} chapters completed.</Text>
              </View>
              <Text style={styles.progressPct}>{progress}%</Text>
            </View>
            <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, progress))}%` }]} /></View>
            <View style={styles.syllabusActions}>
              <Pressable style={[styles.actionPill, styles.actionPillPrimary]} onPress={() => setFormModal('syllabus')}>
                <FontAwesome name="plus" size={12} color="#fff" />
                <Text style={[styles.actionPillText, styles.actionPillTextPrimary]}>Add syllabus</Text>
              </Pressable>
            </View>
            {syllabi.length === 0 ? <Text style={styles.empty}>Create your first syllabus to start your quest.</Text> : syllabi.map((syllabus) => {
              const subjects = syllabus.subjects ?? [];
              const syllabusTotal = subjects.reduce((sum, subject) => sum + (subject.chapters ?? []).length, 0);
              const syllabusDone = subjects.reduce((sum, subject) => sum + (subject.chapters ?? []).filter((chapter) => chapter.done).length, 0);
              const syllabusPct = syllabusTotal ? Math.round((syllabusDone / syllabusTotal) * 100) : 0;
              const syllabusOpen = expandedSyllabi[syllabus.id] !== false;
              return (
                <View key={syllabus.id} style={styles.syllabusBox}>
                  <Pressable style={styles.subjectHead} onPress={() => toggleSyllabusOpen(syllabus.id)}>
                    <View style={styles.subjectTitleWrap}>
                      <Text style={styles.subjectLabel}>Syllabus</Text>
                      <Text style={styles.subjectTitle}>{syllabus.title}</Text>
                      <Text style={styles.hint}>{subjects.length} subjects · {syllabusDone}/{syllabusTotal} chapters</Text>
                    </View>
                    <View style={styles.subjectPctBadge}>
                      <Text style={styles.subjectPct}>{syllabusPct}%</Text>
                    </View>
                    <View style={styles.headerActions}>
                      <Pressable style={styles.deleteIconBtn} onPress={() => confirmRemoveSyllabus(syllabus)} disabled={busy}>
                        <FontAwesome name="trash-o" size={15} color="#dc2626" />
                      </Pressable>
                      <FontAwesome name={syllabusOpen ? 'angle-up' : 'angle-down'} size={18} color={palette.textHint} />
                    </View>
                  </Pressable>
                  <View style={styles.subjectMiniTrack}><View style={[styles.subjectMiniFill, { width: `${syllabusPct}%` }]} /></View>
                  {syllabusOpen ? (
                    <>
                      {subjects.map((subject) => {
                        const subjectKey = `${syllabus.id}:${subject.id}`;
                        const chapters = subject.chapters ?? [];
                        const subjectDone = chapters.filter((chapter) => chapter.done).length;
                        const subjectPct = chapters.length ? Math.round((subjectDone / chapters.length) * 100) : 0;
                        const subjectOpen = expandedSubjects[subjectKey] !== false;
                        return (
                          <View key={subjectKey} style={styles.subjectBox}>
                            <Pressable style={styles.subjectHead} onPress={() => toggleSubjectOpen(subjectKey)}>
                              <View style={styles.subjectTitleWrap}>
                                <Text style={styles.subjectLabel}>Subject</Text>
                                <Text style={styles.subjectTitle}>{subject.title}</Text>
                                <Text style={styles.hint}>{subjectDone}/{chapters.length} chapters completed</Text>
                              </View>
                              <View style={styles.subjectPctBadge}>
                                <Text style={styles.subjectPct}>{subjectPct}%</Text>
                              </View>
                              <FontAwesome name={subjectOpen ? 'angle-up' : 'angle-down'} size={18} color={palette.textHint} />
                            </Pressable>
                            <View style={styles.subjectMiniTrack}><View style={[styles.subjectMiniFill, { width: `${subjectPct}%` }]} /></View>
                            {subjectOpen ? chapters.map((chapter) => (
                              <View key={chapter.id} style={styles.chapterBlock}>
                                <View style={styles.chapterRow}>
                                  <Pressable style={styles.chapterToggle} onPress={() => toggleChapter(syllabus.id, subject.id, chapter.id)}>
                                    <FontAwesome name={chapter.done ? 'check-circle' : 'circle-o'} size={17} color={chapter.done ? palette.success : palette.textHint} />
                                    <View style={{ flex: 1 }}>
                                      <Text style={[styles.chapterText, chapter.done && styles.chapterDone]}>{chapter.title}</Text>
                                      {chapter.next_revision_date ? <Text style={[styles.revisionText, chapter.next_revision_date <= todayYmd && styles.revisionDue]}>Revise {chapter.next_revision_date <= todayYmd ? 'today' : `on ${chapter.next_revision_date}`} · {Number(chapter.revision_count ?? 0)}x</Text> : null}
                                    </View>
                                  </Pressable>
                                  <Pressable style={styles.deleteIconBtn} onPress={() => confirmDeleteChapter(syllabus.id, subject.id, chapter)} disabled={busy}>
                                    <FontAwesome name="trash-o" size={14} color="#dc2626" />
                                  </Pressable>
                                </View>
                                <View style={styles.revisionActions}>
                                  <Pressable style={styles.revisionBtn} onPress={() => scheduleRevision(syllabus.id, subject.id, chapter.id)}><Text style={styles.revisionBtnText}>Schedule</Text></Pressable>
                                  <Pressable style={styles.revisionBtn} onPress={() => markRevised(syllabus.id, subject.id, chapter.id)}><Text style={styles.revisionBtnText}>Revised</Text></Pressable>
                                </View>
                              </View>
                            )) : null}
                            {subjectOpen ? (
                              <Pressable style={styles.addChapterCardBtn} onPress={() => openChapterModal(syllabus, subject)} disabled={busy}>
                                <FontAwesome name="plus-circle" size={14} color={palette.primary} />
                                <Text style={styles.addChapterCardText}>Add chapter</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        );
                      })}
                      <Pressable style={styles.addChapterCardBtn} onPress={() => openSubjectModal(syllabus)} disabled={busy}>
                        <FontAwesome name="plus-circle" size={14} color={palette.primary} />
                        <Text style={styles.addChapterCardText}>Add subject in {syllabus.title}</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function PrimaryButton({ icon, label, onPress, disabled }) {
  return (
    <Pressable style={[styles.primaryBtn, disabled && { opacity: 0.6 }]} onPress={onPress} disabled={disabled}>
      <FontAwesome name={icon} size={14} color="#fff" />
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.48)',
    justifyContent: 'center',
    padding: layout.space.lg,
  },
  modalCard: {
    borderRadius: 26,
    padding: layout.space.lg,
    backgroundColor: palette.surface,
    ...shadow.md,
  },
  modalHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: layout.space.md },
  modalKicker: { fontSize: 11, fontWeight: '900', color: palette.textMuted, textTransform: 'uppercase', letterSpacing: 0.7 },
  modalTitle: { marginTop: 3, fontSize: 20, fontWeight: '900', color: palette.text, letterSpacing: -0.4 },
  modalClose: { width: 34, height: 34, borderRadius: 13, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  modalHint: { fontSize: 13, fontWeight: '700', color: palette.textMuted, marginBottom: layout.space.xs },
  calendarHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: layout.space.sm },
  calendarNav: { width: 38, height: 38, borderRadius: 14, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' },
  calendarTitle: { fontSize: 16, fontWeight: '900', color: palette.text },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekDay: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, fontWeight: '900', color: palette.textMuted },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dateCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  dateCellActive: { backgroundColor: palette.primary },
  dateCellBlank: { opacity: 0 },
  dateCellText: { fontSize: 13, fontWeight: '800', color: palette.text },
  dateCellTextActive: { color: '#fff' },
  dateModalActions: { flexDirection: 'row', gap: layout.space.sm, marginTop: layout.space.md },
  clearDateBtn: { flex: 1, minHeight: 42, borderRadius: 14, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  clearDateText: { fontSize: 13, fontWeight: '900', color: palette.textMuted },
  todayDateBtn: { flex: 1, minHeight: 42, borderRadius: 14, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' },
  todayDateText: { fontSize: 13, fontWeight: '900', color: '#fff' },
  header: {
    backgroundColor: '#1A367C',
    paddingHorizontal: layout.space.lg,
    paddingBottom: layout.space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.space.md,
  },
  backBtn: { width: 38, height: 38, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  kicker: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { marginTop: 3, color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  sectionTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: layout.space.md, backgroundColor: '#fff' },
  sectionTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: palette.primarySoft },
  sectionTabActive: { backgroundColor: palette.primary },
  sectionTabText: { fontSize: 12, fontWeight: '900', color: palette.primary },
  sectionTabTextActive: { color: '#fff' },
  container: { padding: layout.space.md },
  card: { padding: layout.space.lg },
  cardTitle: { fontSize: 18, fontWeight: '900', color: palette.text, letterSpacing: -0.3 },
  hint: { marginTop: 6, marginBottom: layout.space.md, fontSize: 13, fontWeight: '600', color: palette.textMuted, lineHeight: 19 },
  input: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(15,23,42,0.10)', backgroundColor: '#f8fbff', paddingHorizontal: layout.space.md, marginTop: layout.space.sm, fontSize: 15, color: palette.text },
  label: { marginTop: layout.space.md, fontSize: 12, fontWeight: '900', color: palette.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  datePickerButton: { marginTop: layout.space.sm, minHeight: 62, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(15,23,42,0.10)', backgroundColor: '#f8fbff', paddingHorizontal: layout.space.md, flexDirection: 'row', alignItems: 'center', gap: layout.space.sm },
  datePickerIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' },
  trainingDateIcon: { backgroundColor: '#ccfbf1' },
  datePickerLabel: { fontSize: 15, fontWeight: '900', color: palette.text },
  datePickerSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: palette.textMuted },
  nearestDateCard: { marginTop: layout.space.sm, padding: layout.space.md, borderRadius: 20, backgroundColor: '#312e81', flexDirection: 'row', alignItems: 'center', gap: layout.space.md },
  nearestDateIcon: { width: 42, height: 42, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  nearestDateLabel: { fontSize: 10, fontWeight: '900', color: 'rgba(255,255,255,0.70)', textTransform: 'uppercase', letterSpacing: 0.7 },
  nearestDateTitle: { marginTop: 2, fontSize: 16, fontWeight: '900', color: '#fff' },
  nearestDateSub: { marginTop: 3, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.76)' },
  dateTypeRow: { flexDirection: 'row', gap: 8, marginTop: layout.space.sm },
  dateTypePill: { flex: 1, minHeight: 38, borderRadius: 999, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' },
  dateTypePillActive: { backgroundColor: palette.primary },
  dateTypeText: { fontSize: 12, fontWeight: '900', color: palette.primary },
  dateTypeTextActive: { color: '#fff' },
  addImportantDateBtn: { marginTop: layout.space.md, minHeight: 44, borderRadius: 15, backgroundColor: TEAL, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadow.sm },
  addImportantDateText: { fontSize: 14, fontWeight: '900', color: '#fff' },
  importantDateList: { marginTop: layout.space.md, gap: 10 },
  importantDateItem: { padding: layout.space.md, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', flexDirection: 'row', alignItems: 'center', gap: layout.space.sm },
  importantDateTitle: { fontSize: 14, fontWeight: '900', color: palette.text },
  importantDateSub: { marginTop: 3, fontSize: 12, fontWeight: '700', color: palette.textMuted },
  importantDateType: { fontSize: 10, fontWeight: '900', color: palette.primary, backgroundColor: palette.primarySoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, textTransform: 'uppercase' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: layout.space.sm },
  chip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)' },
  chipActive: { backgroundColor: '#ccfbf1', borderColor: 'rgba(13,148,136,0.28)' },
  chipText: { fontSize: 12, fontWeight: '900', color: palette.textMuted },
  chipTextActive: { color: TEAL },
  primaryBtn: { marginTop: layout.space.md, minHeight: 50, borderRadius: 16, backgroundColor: palette.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadow.sm },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  unlockRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: layout.space.sm },
  unlockPill: { fontSize: 11, fontWeight: '900', color: palette.primary, backgroundColor: palette.primarySoft, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  syllabusHero: { flexDirection: 'row', alignItems: 'flex-start', gap: layout.space.md },
  syllabusIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center' },
  syllabusKicker: { fontSize: 11, fontWeight: '900', color: palette.textMuted, textTransform: 'uppercase', letterSpacing: 0.7 },
  syllabusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: layout.space.md },
  actionPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 999, backgroundColor: palette.primarySoft },
  actionPillPrimary: { backgroundColor: palette.primary },
  actionPillText: { fontSize: 12, fontWeight: '900', color: palette.primary },
  actionPillTextPrimary: { color: '#fff' },
  progressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressPct: { fontSize: 16, fontWeight: '900', color: palette.primary },
  track: { height: 10, borderRadius: 999, backgroundColor: palette.primarySoft, overflow: 'hidden', marginTop: layout.space.md },
  fill: { height: '100%', borderRadius: 999, backgroundColor: TEAL },
  row: { flexDirection: 'row', alignItems: 'center', gap: layout.space.sm, marginTop: layout.space.sm },
  rowInput: { flex: 1, marginTop: 0 },
  addBtn: { width: 48, height: 48, borderRadius: 16, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  empty: { marginTop: layout.space.md, fontSize: 13, fontWeight: '600', color: palette.textMuted, lineHeight: 19 },
  syllabusBox: { marginTop: layout.space.md, padding: layout.space.md, borderRadius: 22, backgroundColor: '#eef4ff', borderWidth: 1, borderColor: 'rgba(26,54,124,0.12)' },
  subjectBox: { marginTop: layout.space.md, padding: layout.space.md, borderRadius: 20, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)' },
  subjectHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subjectTitleWrap: { flex: 1, minWidth: 0 },
  subjectLabel: { fontSize: 10, fontWeight: '900', color: palette.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  subjectTitle: { flex: 1, fontSize: 15, fontWeight: '900', color: palette.text },
  subjectPctBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: palette.primarySoft },
  subjectPct: { fontSize: 13, fontWeight: '900', color: palette.primary },
  subjectMiniTrack: { height: 7, borderRadius: 999, backgroundColor: palette.primarySoft, overflow: 'hidden', marginTop: 10, marginBottom: 6 },
  subjectMiniFill: { height: '100%', borderRadius: 999, backgroundColor: TEAL },
  chapterBlock: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(15,23,42,0.08)' },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4 },
  chapterToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  chapterText: { fontSize: 13, fontWeight: '700', color: palette.text },
  chapterDone: { color: palette.textMuted, textDecorationLine: 'line-through' },
  revisionText: { marginTop: 3, fontSize: 11, fontWeight: '700', color: palette.textMuted },
  revisionDue: { color: '#7c3aed' },
  revisionActions: { flexDirection: 'row', gap: 8, marginTop: 8, paddingLeft: 26 },
  revisionBtn: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: '#ede9fe' },
  revisionBtnText: { fontSize: 11, fontWeight: '900', color: '#7c3aed' },
  deleteIconBtn: { width: 34, height: 34, borderRadius: 13, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  addChapterCardBtn: { marginTop: 10, minHeight: 42, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(26,54,124,0.28)', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  addChapterCardText: { fontSize: 13, fontWeight: '900', color: palette.primary },
});
