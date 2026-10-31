/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, MessageSquare, BookOpen, Award, CheckCircle,
  Send, Copy, Check, Trash2, RefreshCw, AlertCircle, 
  Bot, User, ExternalLink, Cpu, Image as ImageIcon, X, Camera,
  FileCheck, Timer, Play, Pause, RotateCcw, Volume2, VolumeX,
  CheckSquare, Plus, GraduationCap, Flame, Lightbulb, Star,
  Trophy, TrendingUp, BarChart3, Clock, Target, CheckCircle2,
  BookMarked, Zap, Gem, Crown, Printer, Share2,
  History, MessageSquarePlus, Search, FolderClock, ChevronRight,
  ShieldCheck, Lock, Unlock, Key, LogOut, LogIn, UserPlus, Smartphone, DownloadCloud, Database
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  AreaChart,
  Area
} from 'recharts';
import { 
  auth, 
  db, 
  googleProvider,
  type FirebaseUser
} from './firebase';
import {
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged
} from 'firebase/auth';
import {
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  deleteDoc
} from 'firebase/firestore';
import platformData from '../data.json';
import { ThreeDLoader } from './components/ThreeDLoader';

type ToolMode = 'study' | 'image_solver' | 'explain' | 'quiz' | 'timer' | 'achievements' | 'rewards' | 'admin';

export interface ChatSession {
  id: string;
  title: string;
  stage: string;
  grade: string;
  subject: string;
  persona: string;
  messages: Message[];
  createdAt: string;
  lastUpdated: string;
}

export interface DailyRecord {
  day: string;
  questions: number;
  studyMinutes: number;
  lessons: number;
}

export interface StudentProfile {
  name: string;
  school: string;
  governorate: string;
}

export interface StudentCertificate {
  id: string;
  minGems: number;
  title: string;
  levelTitle: string;
  description: string;
  serialNumber: string;
  themeColor: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  image?: string;
}

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

interface QuizQuestion {
  id: number;
  questionText: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

interface InteractiveQuiz {
  title: string;
  questions: QuizQuestion[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ToolMode>('study');
  const [selectedStage, setSelectedStage] = useState<string>('الثانوية العامة');
  const [selectedGrade, setSelectedGrade] = useState<string>('الصف الثالث الثانوي');
  const [selectedSubject, setSelectedSubject] = useState<string>('الرياضيات (جبر وتفاضل وتكامل)');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Chat with Persona & Image Support (Locked to Gemini 3.1 Flash Lite)
  const [chatPersona, setChatPersona] = useState<string>('معلم صبور وشامل');
  const [chatMessages, setChatMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'أهلاً بك يا بطل في M Web AI! 📚 أنا معلمك ومساعدك الدراسي الذكي لمناهج وزارة التربية والتعليم المصرية (أعمل بنسخة Gemini 3.1 Flash Lite السريعة والخفيفة). يمكنك كتابة أسئلتك، إرسال صورة لأي مسألة أو صفحة كتاب، طلب شرح الدروس، أو خوض امتحانات تجريبية تفاعلية.',
      timestamp: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedMime, setAttachedMime] = useState<string>('image/jpeg');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Chat History & Sessions Management (Persisted in localStorage)
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => `session-${Date.now()}`);
  const [chatHistory, setChatHistory] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('mweb_study_chat_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');

  const syncChatHistory = (newMsgs: Message[]) => {
    setChatHistory(prev => {
      const nowStr = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
      const firstUserMsg = newMsgs.find(m => m.role === 'user');
      const title = firstUserMsg ? firstUserMsg.content.slice(0, 42) + (firstUserMsg.content.length > 42 ? '...' : '') : `محادثة ${selectedSubject}`;

      const existingIdx = prev.findIndex(s => s.id === currentSessionId);
      let updated: ChatSession[];

      if (existingIdx >= 0) {
        updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          messages: newMsgs,
          title: updated[existingIdx].title.includes('محادثة') ? title : updated[existingIdx].title,
          lastUpdated: nowStr,
        };
      } else {
        const newSession: ChatSession = {
          id: currentSessionId,
          title,
          stage: selectedStage,
          grade: selectedGrade,
          subject: selectedSubject,
          persona: chatPersona,
          messages: newMsgs,
          createdAt: nowStr,
          lastUpdated: nowStr,
        };
        updated = [newSession, ...prev];
      }

      try {
        localStorage.setItem('mweb_study_chat_history', JSON.stringify(updated));
      } catch {}

      if (currentUser) {
        setDoc(doc(db, 'chat_sessions', currentSessionId), {
          id: currentSessionId,
          userId: currentUser.uid,
          userName: studentProfile.name,
          userEmail: currentUser.email || '',
          title,
          stage: selectedStage,
          grade: selectedGrade,
          subject: selectedSubject,
          messages: newMsgs,
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(err => console.error('Firestore chat session sync error:', err));
      }

      return updated;
    });
  };

  const handleStartNewChat = () => {
    const newId = `session-${Date.now()}`;
    setCurrentSessionId(newId);
    setChatMessages([
      {
        role: 'assistant',
        content: `أهلاً بك مجدداً يا بطل! 📚 بدأت محادثة جديدة لمادة ${selectedSubject} (${selectedGrade}). اكتب سؤالك أو أرسل صورة لأي مسألة كتاب أو امتحان.`,
        timestamp: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setShowHistoryDrawer(false);
  };

  const handleLoadSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setChatMessages(session.messages);
    setSelectedStage(session.stage);
    setSelectedGrade(session.grade);
    setSelectedSubject(session.subject);
    setChatPersona(session.persona);
    setShowHistoryDrawer(false);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatHistory(prev => {
      const filtered = prev.filter(s => s.id !== id);
      try {
        localStorage.setItem('mweb_study_chat_history', JSON.stringify(filtered));
      } catch {}
      return filtered;
    });

    if (currentSessionId === id) {
      handleStartNewChat();
    }
  };

  const handleClearAllHistory = () => {
    if (window.confirm('هل تريد مسح سجل جميع المحادثات السابقة؟')) {
      setChatHistory([]);
      try {
        localStorage.removeItem('mweb_study_chat_history');
      } catch {}
      handleStartNewChat();
    }
  };

  // Dedicated Image Homework Solver state
  const [solverImage, setSolverImage] = useState<string | null>(null);
  const [solverMime, setSolverMime] = useState<string>('image/jpeg');
  const [solverQuestion, setSolverQuestion] = useState<string>('حل هذه المسألة خطوة بخطوة مع توضيح القوانين الرياضية/العلمية المستخدمة.');
  const [solverResult, setSolverResult] = useState<string>('');

  // Lesson Explainer state
  const [lessonTitle, setLessonTitle] = useState<string>('');
  const [lessonExplanation, setLessonExplanation] = useState<string>('');

  // Interactive Quiz state
  const [quizTopic, setQuizTopic] = useState<string>('');
  const [quizCount, setQuizCount] = useState<number>(5);
  const [currentQuiz, setCurrentQuiz] = useState<InteractiveQuiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [isQuizSubmitted, setIsQuizSubmitted] = useState<boolean>(false);
  const [quizScore, setQuizScore] = useState<{ correct: number; total: number; percentage: number } | null>(null);

  // Pomodoro Focus Timer
  const [pomodoroMinutes, setPomodoroMinutes] = useState<number>(25);
  const [pomodoroSeconds, setPomodoroSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [timerMode, setTimerMode] = useState<'study' | 'break'>('study');
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Ambient Study Sound (Synthesized Brown Noise via Web Audio)
  const [isAmbiencePlaying, setIsAmbiencePlaying] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const noiseNodeRef = useRef<AudioNode | null>(null);

  // Quick Study Checklist
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', text: 'مراجعة الباب الأول وحل 10 مسائل', completed: false },
    { id: '2', text: 'تدوين القوانين والملخص في الكشكول', completed: true },
  ]);
  const [newTaskInput, setNewTaskInput] = useState<string>('');

  // Achievement Dashboard & Study Progress State (Recharts)
  const [weeklyProgress, setWeeklyProgress] = useState<DailyRecord[]>([
    { day: 'السبت', questions: 18, studyMinutes: 65, lessons: 3 },
    { day: 'الأحد', questions: 26, studyMinutes: 80, lessons: 4 },
    { day: 'الاثنين', questions: 14, studyMinutes: 45, lessons: 2 },
    { day: 'الثلاثاء', questions: 32, studyMinutes: 95, lessons: 5 },
    { day: 'الأربعاء', questions: 20, studyMinutes: 70, lessons: 3 },
    { day: 'الخميس', questions: 28, studyMinutes: 85, lessons: 4 },
    { day: 'اليوم (الجمعة)', questions: 15, studyMinutes: 50, lessons: 2 },
  ]);
  const [selectedChartMetric, setSelectedChartMetric] = useState<'all' | 'questions' | 'time' | 'lessons'>('all');
  const [showLogModal, setShowLogModal] = useState<boolean>(false);
  const [manualQuestions, setManualQuestions] = useState<number>(5);
  const [manualMinutes, setManualMinutes] = useState<number>(25);
  const [manualLessons, setManualLessons] = useState<number>(1);

  const recordActivity = (activity: { questions?: number; studyMinutes?: number; lessons?: number }) => {
    setWeeklyProgress(prev => {
      const copy = [...prev];
      const todayIdx = copy.length - 1;
      if (todayIdx >= 0) {
        copy[todayIdx] = {
          ...copy[todayIdx],
          questions: copy[todayIdx].questions + (activity.questions || 0),
          studyMinutes: copy[todayIdx].studyMinutes + (activity.studyMinutes || 0),
          lessons: copy[todayIdx].lessons + (activity.lessons || 0),
        };
      }
      return copy;
    });
  };

  const totalQuestionsSolved = weeklyProgress.reduce((acc, curr) => acc + curr.questions, 0);
  const totalStudyMinutes = weeklyProgress.reduce((acc, curr) => acc + curr.studyMinutes, 0);
  const totalLessonsReviewed = weeklyProgress.reduce((acc, curr) => acc + curr.lessons, 0);
  const totalStudyHours = (totalStudyMinutes / 60).toFixed(1);

  // Student Profile & Login State
  const [studentProfile, setStudentProfile] = useState<StudentProfile>(() => {
    try {
      const saved = localStorage.getItem('mweb_student_profile');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      name: 'أحمد محمود',
      school: 'مدرسة المتفوقين الثانوية',
      governorate: 'القاهرة'
    };
  });
  const [profileDraft, setProfileDraft] = useState<StudentProfile>(studentProfile);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);

  // Gamification Gems System
  const [gems, setGems] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('mweb_student_gems');
      if (saved) return Number(saved);
    } catch {}
    return 180;
  });

  const [gemNotification, setGemNotification] = useState<{ amount: number; reason: string; id: number } | null>(null);
  const [activeCertificate, setActiveCertificate] = useState<StudentCertificate | null>(null);
  const [newCertificateUnlocked, setNewCertificateUnlocked] = useState<StudentCertificate | null>(null);

  // Certificates Milestones List
  const certificatesList: StudentCertificate[] = [
    {
      id: 'cert-1',
      minGems: 100,
      title: 'شهادة الاجتهاد والتفوق الأكاديمي',
      levelTitle: 'المستوى الفضي · باحث مجتهد',
      description: 'تُمنح هذه الشهادة تقديراً لإتمام أساسيات المذاكرة والبدء المتميز في استيعاب المناهج المصرية.',
      serialNumber: 'CERT-EGY-100-MWEB-01',
      themeColor: '#3B82F6'
    },
    {
      id: 'cert-2',
      minGems: 250,
      title: 'وسام الامتياز في بنك الامتحانات وحل المسائل',
      levelTitle: 'المستوى الذهبي · عبقري الدفعة',
      description: 'تقديراً لحل الاختبارات التفاعلية بنجاح وتجاوز أصعب مسائل الكتب المدرسية خطوة بخطوة.',
      serialNumber: 'CERT-EGY-250-MWEB-02',
      themeColor: '#F59E0B'
    },
    {
      id: 'cert-3',
      minGems: 500,
      title: 'شهادة الصدارة والشرف في المناهج المصرية',
      levelTitle: 'المستوى الماسي · نجم الثانوية العامة',
      description: 'تقديراً للالتزام الأسبوعي الشامل بمراجعة الدروس وتحقيق أعلى معدلات التركيز والإنتاجية.',
      serialNumber: 'CERT-EGY-500-MWEB-03',
      themeColor: '#10B981'
    },
    {
      id: 'cert-4',
      minGems: 1000,
      title: 'الدرع الملكي لأسطورة التفوق والجمهورية',
      levelTitle: 'المستوى الأسطوري · أوائل الجمهورية',
      description: 'أعلى وسام شرف تمنحه منصة M Web AI للطلاب الذين بلغوا قمة الالتزام وحل مئات المسائل والامتحانات.',
      serialNumber: 'CERT-EGY-1000-MWEB-VIP',
      themeColor: '#EC4899'
    }
  ];

  const getStudentLevel = (g: number) => {
    if (g < 100) return { level: 1, title: 'طالب مبتدئ 🌟', nextGoal: 100, progress: (g / 100) * 100 };
    if (g < 250) return { level: 2, title: 'باحث مجتهد 🚀', nextGoal: 250, progress: ((g - 100) / 150) * 100 };
    if (g < 500) return { level: 3, title: 'عبقري الصف 🧠', nextGoal: 500, progress: ((g - 250) / 250) * 100 };
    if (g < 1000) return { level: 4, title: 'نجم المناهج 🎖️', nextGoal: 1000, progress: ((g - 500) / 500) * 100 };
    return { level: 5, title: 'أسطورة الثانوية 👑', nextGoal: 2000, progress: 100 };
  };

  const currentLevelInfo = getStudentLevel(gems);

  // Firebase Auth State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authTab, setAuthTab] = useState<'signin' | 'signup' | 'admin'>('signin');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authName, setAuthName] = useState<string>('');
  const [authSchool, setAuthSchool] = useState<string>('');
  const [authGov, setAuthGov] = useState<string>('القاهرة');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  // Admin Access State (Code: 100100)
  const [adminCodeInput, setAdminCodeInput] = useState<string>('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminStudentsList, setAdminStudentsList] = useState<any[]>([]);

  // PWA Install Prompt State
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(false);

  // 3D Intro Splash Loader State (Shown on entry, replayable anytime)
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('mweb_splash_shown') !== 'true';
    } catch {
      return true;
    }
  });

  // Secret Admin Modal Trigger via 3 Consecutive Logo Clicks
  const [showSecretAdminModal, setShowSecretAdminModal] = useState<boolean>(false);
  const logoClicksRef = useRef<number>(0);
  const logoTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleTripleClickLogo = () => {
    logoClicksRef.current += 1;
    if (logoTimerRef.current) clearTimeout(logoTimerRef.current);

    if (logoClicksRef.current >= 3) {
      logoClicksRef.current = 0;
      setShowSecretAdminModal(true);
      setAuthError(null);
    } else {
      logoTimerRef.current = setTimeout(() => {
        logoClicksRef.current = 0;
      }, 1500);
    }
  };

  // Admin Monitoring & Student Management State
  const [monitoredStudent, setMonitoredStudent] = useState<any | null>(null);
  const [monitoredChats, setMonitoredChats] = useState<any[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState<boolean>(false);

  // Firebase Auth Listener & Firestore Sync with Banned Check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            if (data.banned) {
              await signOut(auth);
              setCurrentUser(null);
              setAuthError('🚫 تم حظر هذا الحساب من قِبل إدارة المنصة. يرجى التواصل مع الدعم.');
              setShowAuthModal(true);
              setIsAuthLoading(false);
              return;
            }
            setStudentProfile({
              name: data.name || user.displayName || 'طالب مصري',
              school: data.school || 'مدرسة المتفوقين',
              governorate: data.governorate || 'القاهرة'
            });
            if (typeof data.gems === 'number') {
              setGems(data.gems);
            }
          } else {
            await setDoc(userDocRef, {
              id: user.uid,
              email: user.email || '',
              name: user.displayName || studentProfile.name,
              school: studentProfile.school,
              governorate: studentProfile.governorate,
              stage: selectedStage,
              grade: selectedGrade,
              gems: gems,
              role: 'student',
              banned: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          }
        } catch (e) {
          console.error('Firestore user profile load error:', e);
        }
      }
      setCurrentUser(user);
      setIsAuthLoading(false);
    });

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setInstallPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      unsubscribe();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (installPromptEvent) {
      installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setIsAppInstalled(true);
      }
      setInstallPromptEvent(null);
    } else {
      alert('لتثبيت التطبيق على جهازك:\n- على الهواتف أو كروم: اضغط على خيارات المتصفح (⋮) ثم اختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".');
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, authEmail, authPassword);
      // Check banned in Firestore
      const userSnap = await getDoc(doc(db, 'users', cred.user.uid));
      if (userSnap.exists() && userSnap.data().banned) {
        await signOut(auth);
        setAuthError('🚫 تم حظر هذا الحساب من قِبل إدارة المنصة.');
        return;
      }
      setAuthSuccess('تم تسجيل الدخول بنجاح! مرحباً بك.');
      setTimeout(() => setShowAuthModal(false), 1200);
    } catch (err: any) {
      setAuthError(err.message || 'فشل تسجيل الدخول. يرجى التأكد من البريد وكلمة المرور.');
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      const user = cred.user;
      const initialProfile = {
        name: authName.trim() || 'طالب جديد',
        school: authSchool.trim() || 'مدرسة حكومية',
        governorate: authGov
      };
      setStudentProfile(initialProfile);
      await setDoc(doc(db, 'users', user.uid), {
        id: user.uid,
        email: user.email,
        name: initialProfile.name,
        school: initialProfile.school,
        governorate: initialProfile.governorate,
        stage: selectedStage,
        grade: selectedGrade,
        gems: gems,
        role: 'student',
        banned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setAuthSuccess('تم إنشاء حساب الطالب بنجاح وحفظ البيانات في قاعدة البيانات!');
      setTimeout(() => setShowAuthModal(false), 1200);
    } catch (err: any) {
      setAuthError(err.message || 'فشل إنشاء الحساب.');
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthSuccess(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const userSnap = await getDoc(doc(db, 'users', cred.user.uid));
      if (userSnap.exists() && userSnap.data().banned) {
        await signOut(auth);
        setAuthError('🚫 تم حظر هذا الحساب من قِبل إدارة المنصة.');
        return;
      }
      setAuthSuccess('تم تسجيل الدخول عبر Google بنجاح!');
      setTimeout(() => setShowAuthModal(false), 1200);
    } catch (err: any) {
      setAuthError(err.message || 'فشل تسجيل الدخول بحساب Google.');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setAuthSuccess(null);
    setAuthError(null);
  };

  // Secret Admin Authentication Handler
  const handleAdminAccess = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (adminCodeInput.trim() === '100100') {
      setIsAdminAuthenticated(true);
      setShowSecretAdminModal(false);
      setShowAuthModal(false);
      setActiveTab('admin');
      setAdminCodeInput('');
      loadAdminStudents();
    } else {
      setAuthError('رمز التحقق غير صحيح! يرجى إعادة المحاولة.');
    }
  };

  const loadAdminStudents = async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAdminStudentsList(list);
    } catch (e) {
      console.error('Error fetching admin students list:', e);
    }
  };

  const handleMonitorStudentChats = async (student: any) => {
    setMonitoredStudent(student);
    setIsLoadingChats(true);
    setMonitoredChats([]);
    try {
      let chats: any[] = [];
      if (student.id) {
        const q = query(collection(db, 'chat_sessions'), where('userId', '==', student.id));
        const snap = await getDocs(q);
        chats = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      }
      
      // Fallback 1: Query by email if empty
      if (chats.length === 0 && student.email) {
        const qEmail = query(collection(db, 'chat_sessions'), where('userEmail', '==', student.email));
        const snapEmail = await getDocs(qEmail);
        chats = snapEmail.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      }

      // Fallback 2: Local active history if student matches current logged in user
      if (chats.length === 0 && (student.id === currentUser?.uid || student.email === currentUser?.email)) {
        chats = chatHistory;
      }

      setMonitoredChats(chats);
    } catch (err) {
      console.error('Error fetching monitored chats:', err);
      if (student.id === currentUser?.uid || student.email === currentUser?.email) {
        setMonitoredChats(chatHistory);
      }
    } finally {
      setIsLoadingChats(false);
    }
  };

  const handleToggleBanUser = async (studentId: string, currentBanned: boolean) => {
    const newBannedState = !currentBanned;
    try {
      await updateDoc(doc(db, 'users', studentId), {
        banned: newBannedState,
        updatedAt: new Date().toISOString()
      });
      setAdminStudentsList(prev => prev.map(s => s.id === studentId ? { ...s, banned: newBannedState } : s));
      if (monitoredStudent && monitoredStudent.id === studentId) {
        setMonitoredStudent({ ...monitoredStudent, banned: newBannedState });
      }
    } catch (err: any) {
      console.error('Error banning/unbanning student:', err);
      alert('فشل تغيير حالة الحظر.');
    }
  };

  const handleDeleteUser = async (studentId: string, studentName: string) => {
    if (!window.confirm(`هل أنت تأكد من إزالة وتجريد الطالب (${studentName}) نهائياً من قاعدة البيانات؟`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', studentId));
      setAdminStudentsList(prev => prev.filter(s => s.id !== studentId));
      if (monitoredStudent && monitoredStudent.id === studentId) {
        setMonitoredStudent(null);
        setMonitoredChats([]);
      }
      alert('تم حذف سجل الطالب من قاعدة البيانات بنجاح.');
    } catch (err) {
      console.error('Error deleting student:', err);
      alert('تعذر حذف الطالب.');
    }
  };

  const handleAdminGrantGems = async (studentId: string, currentStudentGems: number) => {
    try {
      const newAmount = (currentStudentGems || 0) + 50;
      await updateDoc(doc(db, 'users', studentId), {
        gems: newAmount,
        updatedAt: new Date().toISOString()
      });
      setAdminStudentsList(prev => prev.map(s => s.id === studentId ? { ...s, gems: newAmount } : s));
    } catch (err: any) {
      console.error('Could not update student gems:', err);
    }
  };

  const handleDownloadDataJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(platformData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "data.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const [copiedDataJson, setCopiedDataJson] = useState<boolean>(false);
  const handleCopyDataJson = () => {
    navigator.clipboard.writeText(JSON.stringify(platformData, null, 2));
    setCopiedDataJson(true);
    setTimeout(() => setCopiedDataJson(false), 2000);
  };

  const addGems = (amount: number, reason: string) => {
    setGems(prev => {
      const next = prev + amount;
      try {
        localStorage.setItem('mweb_student_gems', String(next));
      } catch {}

      if (currentUser) {
        updateDoc(doc(db, 'users', currentUser.uid), {
          gems: next,
          updatedAt: new Date().toISOString()
        }).catch(() => {});
      }

      certificatesList.forEach(cert => {
        if (prev < cert.minGems && next >= cert.minGems) {
          setNewCertificateUnlocked(cert);
        }
      });

      return next;
    });

    setGemNotification({ amount, reason, id: Date.now() });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileDraft.name.trim()) return;
    setStudentProfile(profileDraft);
    try {
      localStorage.setItem('mweb_student_profile', JSON.stringify(profileDraft));
      if (currentUser) {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          name: profileDraft.name,
          school: profileDraft.school,
          governorate: profileDraft.governorate,
          updatedAt: new Date().toISOString()
        });
      }
    } catch {}
    setShowProfileModal(false);
  };

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedBox, setCopiedBox] = useState<boolean>(false);

  useEffect(() => {
    if (activeTab === 'study') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  // Pomodoro Timer Logic
  useEffect(() => {
    if (isTimerRunning) {
      timerIntervalRef.current = setInterval(() => {
        setPomodoroSeconds(prevSec => {
          if (prevSec === 0) {
            setPomodoroMinutes(prevMin => {
              if (prevMin === 0) {
                setIsTimerRunning(false);
                if (timerMode === 'study') {
                  recordActivity({ studyMinutes: 25 });
                  addGems(30, 'جلسة تركيز بومودورو (25 دقيقة)');
                  setTimerMode('break');
                  return 5;
                } else {
                  setTimerMode('study');
                  return 25;
                }
              }
              return prevMin - 1;
            });
            return 59;
          }
          return prevSec - 1;
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isTimerRunning, timerMode]);

  const toggleTimer = () => setIsTimerRunning(prev => !prev);
  const resetTimer = (mode: 'study' | 'break') => {
    setIsTimerRunning(false);
    setTimerMode(mode);
    setPomodoroMinutes(mode === 'study' ? 25 : 5);
    setPomodoroSeconds(0);
  };

  const toggleAmbience = () => {
    if (isAmbiencePlaying) {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      setIsAmbiencePlaying(false);
    } else {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioCtxRef.current = ctx;

        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = data[i];
          data[i] *= 0.14;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const gainNode = ctx.createGain();
        gainNode.gain.value = 0.35;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 650;

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);

        noise.start();
        noiseNodeRef.current = noise;
        setIsAmbiencePlaying(true);
      } catch (e) {
        console.error('Audio ambience error', e);
      }
    }
  };

  const handleCopy = (text: string, index?: number) => {
    navigator.clipboard.writeText(text);
    if (index !== undefined) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } else {
      setCopiedBox(true);
      setTimeout(() => setCopiedBox(false), 2000);
    }
  };

  const handleImageUpload = (file: File, target: 'chat' | 'solver') => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      if (target === 'chat') {
        setAttachedImage(base64String);
        setAttachedMime(file.type || 'image/jpeg');
      } else {
        setSolverImage(base64String);
        setSolverMime(file.type || 'image/jpeg');
      }
    };
    reader.readAsDataURL(file);
  };

  // 1. Send Chat Message (With optional attached Image)
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!chatInput.trim() && !attachedImage) || loading) return;

    const userText = chatInput.trim() || (attachedImage ? 'حل وشرح المسألة أو المحتوى الموجود بالصورة المرفقة' : '');
    const currentImg = attachedImage;
    const currentMime = attachedMime;

    setChatInput('');
    setAttachedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    const timeStr = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    const userMsg: Message = { 
      role: 'user', 
      content: userText, 
      timestamp: timeStr,
      image: currentImg ? `data:${currentMime};base64,${currentImg}` : undefined
    };

    setChatMessages(prev => {
      const updated = [...prev, userMsg];
      syncChatHistory(updated);
      return updated;
    });

    setLoading(true);
    setError(null);

    const systemPrompt = `أنت ${chatPersona} للطلاب المصريين من شركة M Web، تعمل بنسخة Gemini 3.1 Flash Lite السريعة. الطالب في مرحلة (${selectedStage}) - صف (${selectedGrade}) - مادة (${selectedSubject}) بمناهج وزارة التربية والتعليم المصرية. اشرح بإيجابية وتبسيط خطوة بخطوة مع القوانين والأمثلة التوضيحية وحلول المسائل الدقيقة.`;

    try {
      const res = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userText,
          imageBase64: currentImg,
          mimeType: currentMime,
          systemInstruction: systemPrompt,
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ في الاتصال');

      const assistantMsg: Message = { 
        role: 'assistant', 
        content: data.text, 
        timestamp: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
      };

      setChatMessages(prev => {
        const updated = [...prev, assistantMsg];
        syncChatHistory(updated);
        return updated;
      });
      addGems(10, 'سؤال المعلم الذكي 📚');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Photo Solver
  const handleSolveImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!solverImage || loading) return;

    setLoading(true);
    setError(null);
    setSolverResult('');

    const systemPrompt = `أنت معلم متخصص في مناهج وزارة التربية والتعليم المصرية لمادة (${selectedSubject}) للصف (${selectedGrade}). حل المسألة الموجودة في الصورة بدقة تامة وبطريقة نموذجية مع كتابة القوانين والخطوات والناتج النهائي بوضوح.`;

    try {
      const res = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: solverQuestion,
          imageBase64: solverImage,
          mimeType: solverMime,
          systemInstruction: systemPrompt,
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ أثناء فحص الصورة');
      setSolverResult(data.text);
      addGems(20, 'حل مسألة كتاب الوزارة بالصورة 📸');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Lesson Explainer
  const handleExplainLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonTitle.trim() || loading) return;

    setLoading(true);
    setError(null);
    setLessonExplanation('');

    const prompt = `اشرح لي درس "${lessonTitle}" في مادة ${selectedSubject} للصف ${selectedGrade} (${selectedStage}) بمنهج مصر بشكل مبسط وشامل ومنظم في عناصر واضحة مع ملخص وقوانين وأمثلة محلولة.`;

    try {
      const res = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          systemInstruction: 'أنت مدرس متخصص في تبسيط المناهج المصرية للطلاب بأسلوب شيق وواضح.',
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ في شرح الدرس');
      setLessonExplanation(data.text);
      recordActivity({ lessons: 1 });
      addGems(25, 'مراجعة وشرح درس وزاري 📖');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 4. Interactive Quiz
  const handleGenerateInteractiveQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizTopic.trim() || loading) return;

    setLoading(true);
    setError(null);
    setCurrentQuiz(null);
    setUserAnswers({});
    setIsQuizSubmitted(false);
    setQuizScore(null);

    const prompt = `قم بإنشاء اختبار تفاعلي مكون من ${quizCount} أسئلة اختيار من متعدد (4 خيارات لكل سؤال) في مادة ${selectedSubject} للصف ${selectedGrade} (${selectedStage}) حول موضوع: "${quizTopic}". كل سؤال يجب أن يحتوي على خيارات واضحة، ورقم الإجابة الصحيحة من 0 إلى 3 (correctAnswerIndex)، وشرح تفصيلي للحل.`;

    try {
      const res = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          mode: 'quiz',
          systemInstruction: 'أنت مستشار وضع الامتحانات في وزارة التربية والتعليم المصرية. أنشئ أسئلة تفاعلية دقيقة طبقاً لنظام التقييم الحديث.',
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ في إنشاء الاختبار');
      
      const parsedQuiz: InteractiveQuiz = typeof data.json === 'string' ? JSON.parse(data.json) : data.json;
      setCurrentQuiz(parsedQuiz);
    } catch (err: any) {
      setError(err.message || 'فشل في تحليل بيانات الاختبار');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (questionIndex: number, optionIndex: number) => {
    if (isQuizSubmitted) return;
    setUserAnswers(prev => ({ ...prev, [questionIndex]: optionIndex }));
  };

  const handleSubmitQuiz = () => {
    if (!currentQuiz) return;
    let correctCount = 0;
    currentQuiz.questions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correctAnswerIndex) {
        correctCount++;
      }
    });

    const total = currentQuiz.questions.length;
    const percentage = Math.round((correctCount / total) * 100);
    setQuizScore({ correct: correctCount, total, percentage });
    setIsQuizSubmitted(true);
    recordActivity({ questions: total });
    const earnedGems = 30 + correctCount * 5;
    addGems(earnedGems, `إتمام اختبار (${percentage}% نسبة النجاح) 🎯`);
  };

  const handleRetakeQuiz = () => {
    setUserAnswers({});
    setIsQuizSubmitted(false);
    setQuizScore(null);
  };

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskInput.trim()) return;
    setTasks(prev => [...prev, { id: Date.now().toString(), text: newTaskInput.trim(), completed: false }]);
    setNewTaskInput('');
  };

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  // 3D Entrance Loader Screen
  if (showSplash) {
    return (
      <ThreeDLoader
        onComplete={() => {
          try { sessionStorage.setItem('mweb_splash_shown', 'true'); } catch {}
          setShowSplash(false);
        }}
        onLoginClick={() => {
          try { sessionStorage.setItem('mweb_splash_shown', 'true'); } catch {}
          setShowSplash(false);
          setAuthTab('signin');
          setShowAuthModal(true);
        }}
        onTripleClickLogo={() => {
          try { sessionStorage.setItem('mweb_splash_shown', 'true'); } catch {}
          setShowSplash(false);
          setShowSecretAdminModal(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0F1D] text-slate-100 flex flex-col font-['Cairo'] antialiased selection:bg-amber-400 selection:text-slate-900">
      {/* Top Header - Vibrant Egyptian Textbook Palette (Amber, Royal Blue, Deep Navy) */}
      <header className="h-16 px-4 sm:px-6 border-b border-amber-500/20 bg-[#0F172E]/90 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between gap-4 shadow-lg shadow-black/20">
        {/* Brand Zone (Click 3 times consecutively for secret admin access) */}
        <div 
          onClick={handleTripleClickLogo} 
          className="flex items-center gap-3 shrink-0 cursor-pointer select-none" 
          title="M Web AI - مناهج مصر"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-blue-600 flex items-center justify-center shadow-md shadow-amber-500/20 ring-1 ring-amber-400/40">
            <BookOpen className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <span className="text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap flex items-center gap-2">
              M Web AI <span className="text-[10px] px-2 py-0.5 bg-amber-400/20 text-amber-300 rounded-md border border-amber-400/30 font-bold">النسخة السريعة (Lite)</span>
            </span>
          </div>
        </div>

        {/* Navigation Tabs (5 Core Features natively supported by Gemini 3.1 Flash Lite) */}
        <nav className="hidden lg:flex items-center gap-1.5 text-xs font-semibold">
          <button 
            onClick={() => setActiveTab('study')} 
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'study' 
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-bold' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> المعلم الذكي والأسئلة
          </button>
          <button 
            onClick={() => setActiveTab('image_solver')} 
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'image_solver' 
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-bold' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Camera className="w-3.5 h-3.5" /> حل صور المسائل والكتب
          </button>
          <button 
            onClick={() => setActiveTab('explain')} 
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'explain' 
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-bold' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" /> شرح الدروس والمفاهيم
          </button>
          <button 
            onClick={() => setActiveTab('quiz')} 
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'quiz' 
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-bold' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Award className="w-3.5 h-3.5" /> بنك الامتحانات والتقييم
          </button>
          <button 
            onClick={() => setActiveTab('timer')} 
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'timer' 
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-bold' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Timer className="w-3.5 h-3.5" /> مؤقت المذاكرة والمهام
          </button>
          <button 
            onClick={() => setActiveTab('achievements')} 
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'achievements' 
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-bold' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" /> إنجازاتي
          </button>
          <button 
            onClick={() => setActiveTab('rewards')} 
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'rewards' 
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-bold' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Crown className="w-3.5 h-3.5 text-amber-400" /> الشهادات والجواهر
          </button>

          {/* Dedicated Login / Profile Tab */}
          <button 
            onClick={() => {
              if (currentUser) {
                setProfileDraft(studentProfile);
                setShowProfileModal(true);
              } else {
                setAuthTab('signin');
                setShowAuthModal(true);
              }
            }} 
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap font-bold ${
              currentUser 
                ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/40' 
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400/50'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{currentUser ? `طالب: ${studentProfile.name}` : 'تسجيل الدخول / حسابي'}</span>
          </button>

          {isAdminAuthenticated && (
            <button 
              onClick={() => setActiveTab('admin')} 
              className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'admin' 
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-bold' 
                  : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/30'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> لوحة الإدارة
            </button>
          )}
        </nav>

        {/* Action Controls & Atmosphere Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 3D Intro Loader Replay Button */}
          <button
            onClick={() => setShowSplash(true)}
            title="مشاهدة شاشة التحميل ثلاثية الأبعاد (3D)"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-900/40 border border-indigo-500/40 hover:bg-indigo-900/60 text-indigo-300 text-xs font-bold transition-all shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            <span className="hidden xl:inline">تحميل 3D</span>
          </button>

          {/* PWA Install Button */}
          <button
            onClick={handleInstallPWA}
            title="تثبيت التطبيق على جهازك أو هاتفك للوصول السريع"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 hover:bg-emerald-600/30 text-emerald-300 text-xs font-bold transition-all shadow-sm"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">📲 تثبيت التطبيق</span>
          </button>

          {/* Gems Counter Pill */}
          <button
            onClick={() => setActiveTab('rewards')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/20 via-yellow-400/20 to-blue-600/20 border border-amber-400/50 hover:border-amber-300 text-xs font-bold transition-all shadow-sm group cursor-pointer"
            title="رصيد الجواهر وشهادات التقدير"
          >
            <Gem className="w-4 h-4 text-amber-400 fill-amber-400/30 animate-pulse" />
            <span className="font-mono font-black text-amber-300">{gems}</span>
            <span className="text-[10px] text-amber-200 hidden md:inline">💎 {currentLevelInfo.title}</span>
          </button>

          {/* User Auth / Student Profile Button (PROMINENT ON ALL SCREENS) */}
          {currentUser ? (
            <div className="flex items-center gap-1 bg-[#141F3C] border border-blue-900/60 rounded-lg p-1">
              <button
                onClick={() => {
                  setProfileDraft(studentProfile);
                  setShowProfileModal(true);
                }}
                className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-bold text-white hover:text-amber-400 transition-colors"
                title="تعديل بيانات الحساب والشهادة"
              >
                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-500 text-slate-950 flex items-center justify-center text-[10px] font-black">
                  {studentProfile.name.charAt(0) || 'ط'}
                </div>
                <span className="max-w-[70px] sm:max-w-[100px] truncate">{studentProfile.name}</span>
              </button>
              <button
                onClick={handleLogout}
                title="تسجيل الخروج من الحساب"
                className="p-1 text-slate-400 hover:text-red-400 rounded-md hover:bg-slate-800 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setAuthTab('signin');
                setShowAuthModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 text-xs font-black transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
              title="تسجيل الدخول أو إنشاء حساب طالب"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="font-bold">تسجيل الدخول</span>
            </button>
          )}

          <button 
            onClick={toggleAmbience}
            title={isAmbiencePlaying ? 'إيقاف صوت المطر والتركيز' : 'تشغيل صوت هادئ للمذاكرة (White noise)'}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border hidden sm:flex items-center gap-1.5 transition-all ${
              isAmbiencePlaying 
                ? 'bg-amber-400/20 border-amber-400 text-amber-300 shadow-sm' 
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            {isAmbiencePlaying ? <Volume2 className="w-3.5 h-3.5 text-amber-400 animate-pulse" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
            <span className="hidden lg:inline">{isAmbiencePlaying ? 'صوت المطر' : 'صوت التركيز'}</span>
          </button>

          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-amber-400 font-bold">
            <Timer className="w-3.5 h-3.5 text-amber-400" />
            <span>{String(pomodoroMinutes).padStart(2, '0')}:{String(pomodoroSeconds).padStart(2, '0')}</span>
            <button onClick={toggleTimer} className="hover:text-white mr-1 text-slate-400">
              {isTimerRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </button>
          </div>

          <a 
            href="https://m-web-psi.vercel.app/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-400 text-xs font-bold hover:bg-blue-600/30 transition-colors"
          >
            <span>M Web</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </header>

      {/* Floating Gem Toast Notification */}
      {gemNotification && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#101932] border-2 border-amber-400 text-white px-5 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce">
          <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold">
            💎
          </div>
          <div>
            <div className="text-xs font-black text-amber-300 flex items-center gap-1">
              <span>+{gemNotification.amount} جوهرة إضافية!</span>
            </div>
            <div className="text-[11px] text-slate-300">{gemNotification.reason}</div>
          </div>
        </div>
      )}

      {/* Mobile Subheader Navigation */}
      <div className="lg:hidden flex overflow-x-auto gap-2 p-2.5 bg-[#0F172E] border-b border-slate-800 shrink-0">
        {!currentUser && (
          <button 
            onClick={() => {
              setAuthTab('signin');
              setShowAuthModal(true);
            }} 
            className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap flex items-center gap-1 font-black bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
          >
            <LogIn className="w-3.5 h-3.5" /> تسجيل الدخول
          </button>
        )}
        <button onClick={() => setActiveTab('study')} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap flex items-center gap-1 font-semibold ${activeTab === 'study' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-300'}`}>
          <MessageSquare className="w-3.5 h-3.5" /> المعلم والأسئلة
        </button>
        <button onClick={() => setActiveTab('image_solver')} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap flex items-center gap-1 font-semibold ${activeTab === 'image_solver' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-300'}`}>
          <Camera className="w-3.5 h-3.5" /> حل صور المسائل
        </button>
        <button onClick={() => setActiveTab('explain')} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap flex items-center gap-1 font-semibold ${activeTab === 'explain' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-300'}`}>
          <FileCheck className="w-3.5 h-3.5" /> شرح الدروس
        </button>
        <button onClick={() => setActiveTab('quiz')} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap flex items-center gap-1 font-semibold ${activeTab === 'quiz' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-300'}`}>
          <Award className="w-3.5 h-3.5" /> الامتحانات والتقييم
        </button>
        <button onClick={() => setActiveTab('timer')} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap flex items-center gap-1 font-semibold ${activeTab === 'timer' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-300'}`}>
          <Timer className="w-3.5 h-3.5" /> المؤقت والمهام
        </button>
        <button onClick={() => setActiveTab('achievements')} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap flex items-center gap-1 font-semibold ${activeTab === 'achievements' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-300'}`}>
          <Trophy className="w-3.5 h-3.5" /> إنجازاتي
        </button>
        <button onClick={() => setActiveTab('rewards')} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap flex items-center gap-1 font-semibold ${activeTab === 'rewards' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-300'}`}>
          <Crown className="w-3.5 h-3.5 text-amber-400" /> الشهادات والجواهر
        </button>
        {isAdminAuthenticated && (
          <button onClick={() => setActiveTab('admin')} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap flex items-center gap-1 font-semibold ${activeTab === 'admin' ? 'bg-amber-500 text-slate-950' : 'bg-amber-950/70 border border-amber-500/50 text-amber-300'}`}>
            <ShieldCheck className="w-3.5 h-3.5" /> لوحة الإدارة
          </button>
        )}
      </div>

      {/* Egyptian Curriculum Stage / Grade / Subject Control Ribbon */}
      <div className="bg-[#131D36] border-b border-blue-900/40 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Stage */}
          <div className="flex items-center gap-1.5 bg-[#0A0F1D] border border-blue-900/50 px-3 py-1.5 rounded-lg shadow-sm">
            <span className="text-amber-400 font-semibold">المرحلة:</span>
            <select 
              value={selectedStage}
              onChange={e => {
                setSelectedStage(e.target.value);
                if (e.target.value === 'المرحلة الابتدائية') setSelectedGrade('الصف السادس الابتدائي');
                if (e.target.value === 'المرحلة الإعدادية') setSelectedGrade('الصف الثالث الإعدادي');
                if (e.target.value === 'الثانوية العامة') setSelectedGrade('الصف الثالث الثانوي');
              }}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="المرحلة الابتدائية" className="bg-[#0A0F1D]">المرحلة الابتدائية</option>
              <option value="المرحلة الإعدادية" className="bg-[#0A0F1D]">المرحلة الإعدادية</option>
              <option value="الثانوية العامة" className="bg-[#0A0F1D]">الثانوية العامة</option>
            </select>
          </div>

          {/* Grade */}
          <div className="flex items-center gap-1.5 bg-[#0A0F1D] border border-blue-900/50 px-3 py-1.5 rounded-lg shadow-sm">
            <span className="text-amber-400 font-semibold">الصف:</span>
            <select 
              value={selectedGrade}
              onChange={e => setSelectedGrade(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              {selectedStage === 'المرحلة الابتدائية' && (
                <>
                  <option value="الصف الأول الابتدائي" className="bg-[#0A0F1D]">الأول الابتدائي</option>
                  <option value="الصف الثاني الابتدائي" className="bg-[#0A0F1D]">الثاني الابتدائي</option>
                  <option value="الصف الثالث الابتدائي" className="bg-[#0A0F1D]">الثالث الابتدائي</option>
                  <option value="الصف الرابع الابتدائي" className="bg-[#0A0F1D]">الرابع الابتدائي</option>
                  <option value="الصف الخامس الابتدائي" className="bg-[#0A0F1D]">الخامس الابتدائي</option>
                  <option value="الصف السادس الابتدائي" className="bg-[#0A0F1D]">السادس الابتدائي</option>
                </>
              )}
              {selectedStage === 'المرحلة الإعدادية' && (
                <>
                  <option value="الصف الأول الإعدادي" className="bg-[#0A0F1D]">الأول الإعدادي</option>
                  <option value="الصف الثاني الإعدادي" className="bg-[#0A0F1D]">الثاني الإعدادي</option>
                  <option value="الصف الثالث الإعدادي" className="bg-[#0A0F1D]">الثالث الإعدادي</option>
                </>
              )}
              {selectedStage === 'الثانوية العامة' && (
                <>
                  <option value="الصف الأول الثانوي" className="bg-[#0A0F1D]">الأول الثانوي</option>
                  <option value="الصف الثاني الثانوي" className="bg-[#0A0F1D]">الثاني الثانوي</option>
                  <option value="الصف الثالث الثانوي" className="bg-[#0A0F1D]">الثالث الثانوي</option>
                </>
              )}
            </select>
          </div>

          {/* Subject */}
          <div className="flex items-center gap-1.5 bg-[#0A0F1D] border border-blue-900/50 px-3 py-1.5 rounded-lg shadow-sm">
            <span className="text-amber-400 font-semibold">المادة:</span>
            <select 
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="الرياضيات (جبر، هندسة، تفاضل وتكامل)" className="bg-[#0A0F1D]">الرياضيات (جبر، تفاضل، هندسة)</option>
              <option value="اللغة العربية (نحو، قراءة، بلاغة، أدب)" className="bg-[#0A0F1D]">اللغة العربية (نحو، بلاغة، نصوص)</option>
              <option value="اللغة الإنجليزية (English)" className="bg-[#0A0F1D]">اللغة الإنجليزية</option>
              <option value="العلوم / الفيزياء والكيمياء والأحياء" className="bg-[#0A0F1D]">العلوم والفيزياء والكيمياء والأحياء</option>
              <option value="الدراسات الاجتماعية / التاريخ والجغرافيا" className="bg-[#0A0F1D]">الدراسات الاجتماعية والتاريخ والجغرافيا</option>
              <option value="الفلسفة والمنطق وعلم النفس" className="bg-[#0A0F1D]">الفلسفة والمنطق وعلم النفس</option>
            </select>
          </div>
        </div>

        {/* Model Indicator (Locked to Gemini 3.1 Flash Lite) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-[#0A0F1D] border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs text-amber-300 font-bold">
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <span>Gemini 3.1 Flash Lite (النسخة المجانية السريعة فقط)</span>
          </div>
        </div>
      </div>

      {/* Prominent Login & Sign Up Hero Banner (When not logged in) */}
      {!currentUser && (
        <div className="bg-gradient-to-r from-blue-950 via-[#101e40] to-amber-950/60 border-b border-amber-500/40 px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
              <LogIn className="w-5 h-5" />
            </div>
            <div>
              <div className="text-white font-black text-sm flex items-center gap-2">
                <span>تسجيل الدخول مطلوب لحفظ المذاكرة ورصيد الجواهر 💎</span>
                <span className="text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full font-bold">
                  سحابي ومجاني
                </span>
              </div>
              <p className="text-slate-300 text-[11px] mt-0.5">
                سجّل حسابك الآن لحفظ نتائج الامتحانات، كسب الجواهر، وإصدار الشهادات الرسمية باسمك ورقم جلوسك.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button
              onClick={() => {
                setAuthTab('signin');
                setShowAuthModal(true);
              }}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>تسجيل الدخول</span>
            </button>
            <button
              onClick={() => {
                setAuthTab('signup');
                setShowAuthModal(true);
              }}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>طالب جديد</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area: Gated behind Authentication */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 flex flex-col">
        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!currentUser && !isAdminAuthenticated ? (
          /* MANDATORY GATEWAY SCREEN: No app content visible before login */
          <div className="flex-1 flex items-center justify-center py-6">
            <div className="w-full max-w-xl bg-[#101932] border-2 border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-blue-600 p-0.5 shadow-xl shadow-amber-500/20 mx-auto flex items-center justify-center">
                  <div className="w-full h-full bg-[#0A0F1D] rounded-[14px] flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-amber-400 stroke-[2.5]" />
                  </div>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white font-serif tracking-tight">
                  منصة M Web AI للتعليم والمناهج المصرية
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                  تسجيل الدخول أو إنشاء حساب جديد مطلوب للوصول إلى محتويات المنصة، المعلم الذكي، حل المسائل بالصور، شرح الدروس والامتحانات.
                </p>
              </div>

              {/* Gateway Auth Card */}
              <div className="bg-[#0A0F1D] border border-blue-900/60 rounded-2xl p-5 space-y-4">
                <div className="flex border-b border-blue-900/60 pb-3 gap-2">
                  <button
                    onClick={() => setAuthTab('signin')}
                    className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      authTab === 'signin' ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <LogIn className="w-3.5 h-3.5 inline ml-1" />
                    <span>تسجيل الدخول</span>
                  </button>
                  <button
                    onClick={() => setAuthTab('signup')}
                    className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      authTab === 'signup' ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5 inline ml-1" />
                    <span>حساب طالب جديد</span>
                  </button>
                </div>

                {authError && (
                  <div className="p-3 rounded-xl bg-red-950/80 border border-red-500 text-red-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{authError}</span>
                  </div>
                )}
                {authSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500 text-emerald-200 text-xs flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{authSuccess}</span>
                  </div>
                )}

                {authTab === 'signin' ? (
                  <form onSubmit={handleEmailSignIn} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">البريد الإلكتروني:</label>
                      <input
                        type="email"
                        required
                        value={authEmail}
                        onChange={e => setAuthEmail(e.target.value)}
                        placeholder="student@example.com"
                        className="w-full bg-[#101932] border border-blue-900/60 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">كلمة المرور:</label>
                      <input
                        type="password"
                        required
                        value={authPassword}
                        onChange={e => setAuthPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[#101932] border border-blue-900/60 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 cursor-pointer"
                    >
                      دخول المنصة وبدء المذاكرة 🚀
                    </button>
                    <div className="relative text-center my-2">
                      <span className="bg-[#0A0F1D] px-2 text-[11px] text-slate-400 relative z-10">أو</span>
                      <div className="absolute inset-0 top-1/2 border-t border-slate-800"></div>
                    </div>
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="w-full py-2.5 bg-[#101932] hover:bg-slate-900 border border-blue-900/60 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>الدخول السريع عبر Google</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleEmailSignUp} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">الاسم الرباعي للطالب:</label>
                      <input
                        type="text"
                        required
                        value={authName}
                        onChange={e => setAuthName(e.target.value)}
                        placeholder="أحمد محمد علي"
                        className="w-full bg-[#101932] border border-blue-900/60 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">البريد الإلكتروني:</label>
                      <input
                        type="email"
                        required
                        value={authEmail}
                        onChange={e => setAuthEmail(e.target.value)}
                        placeholder="student@example.com"
                        className="w-full bg-[#101932] border border-blue-900/60 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">كلمة المرور:</label>
                      <input
                        type="password"
                        required
                        value={authPassword}
                        onChange={e => setAuthPassword(e.target.value)}
                        placeholder="6 أحرف على الأقل"
                        className="w-full bg-[#101932] border border-blue-900/60 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">المدرسة:</label>
                        <input
                          type="text"
                          value={authSchool}
                          onChange={e => setAuthSchool(e.target.value)}
                          placeholder="مدرسة المتفوقين"
                          className="w-full bg-[#101932] border border-blue-900/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">المحافظة:</label>
                        <select
                          value={authGov}
                          onChange={e => setAuthGov(e.target.value)}
                          className="w-full bg-[#101932] border border-blue-900/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                        >
                          <option value="القاهرة">القاهرة</option>
                          <option value="الجيزة">الجيزة</option>
                          <option value="الإسكندرية">الإسكندرية</option>
                          <option value="الدقهلية">الدقهلية</option>
                          <option value="الشرقية">الشرقية</option>
                          <option value="القليوبية">القليوبية</option>
                          <option value="الغربية">الغربية</option>
                          <option value="المنوفية">المنوفية</option>
                          <option value="أسيوط">أسيوط</option>
                          <option value="سوهاج">سوهاج</option>
                        </select>
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 cursor-pointer mt-1"
                    >
                      إنشاء حساب جديد وبدء المذاكرة 🎓
                    </button>
                  </form>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setShowSplash(true)}
                  className="text-xs text-indigo-300 hover:text-white flex items-center gap-1 font-bold cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  <span>إعادة تشغيل العرض 3D</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>

        {/* 1. STUDY CHAT TAB WITH PERSONA, IMAGE UPLOAD & CHAT HISTORY */}
        {activeTab === 'study' && (
          <div className="flex-1 flex flex-col h-[calc(100vh-14rem)] bg-[#101932] border border-blue-900/40 rounded-2xl overflow-hidden shadow-2xl relative">
            <div className="px-4 sm:px-6 py-3 bg-[#172344] border-b border-blue-900/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setShowHistoryDrawer(prev => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    showHistoryDrawer 
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20' 
                      : 'bg-[#0A0F1D] border-blue-900/60 text-slate-200 hover:text-white hover:border-amber-400/50'
                  }`}
                  title="سجل الرسائل والمحادثات السابقة"
                >
                  <History className="w-4 h-4 text-amber-400" />
                  <span>سجل الرسائل</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-amber-300 font-mono">
                    {chatHistory.length}
                  </span>
                </button>

                <button
                  onClick={handleStartNewChat}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/40 text-blue-300 transition-all"
                  title="بدء محادثة جديدة وحفظ الحالية"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">محادثة جديدة</span>
                </button>

                <div className="hidden md:flex items-center gap-2 pr-2 border-r border-blue-900/40">
                  <div className="w-7 h-7 rounded-lg bg-amber-400/20 border border-amber-400/40 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="font-bold text-white text-xs sm:text-sm">المعلم الدراسي الذكي</h2>
                    <p className="text-[10px] text-amber-200/80">{selectedSubject}</p>
                  </div>
                </div>
              </div>

              {/* Persona Selector */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-[#0A0F1D] border border-blue-900/50 px-2 py-1 rounded-lg">
                  <span className="text-[11px] text-slate-400 hidden sm:inline">الدور:</span>
                  <select 
                    value={chatPersona}
                    onChange={e => setChatPersona(e.target.value)}
                    className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="معلم صبور وشامل" className="bg-[#0A0F1D]">معلم صبور وشامل</option>
                    <option value="خبير حل مسائل وقوانين" className="bg-[#0A0F1D]">خبير مسائل وقوانين</option>
                    <option value="أستاذ لغة عربية ونحو وبلاغة" className="bg-[#0A0F1D]">أستاذ لغة عربية</option>
                    <option value="مدرب امتحانات حديثة" className="bg-[#0A0F1D]">مدرب امتحانات حديثة</option>
                  </select>
                </div>

                <button 
                  onClick={handleStartNewChat}
                  className="text-xs text-slate-300 hover:text-white flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 transition-colors"
                  title="مسح وبدء محادثة جديدة"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">جديدة</span>
                </button>
              </div>
            </div>

            {/* Chat Body & History Drawer Container */}
            <div className="flex-1 flex overflow-hidden relative">
              {/* History Drawer Sidebar */}
              {showHistoryDrawer && (
                <div className="w-full sm:w-80 md:w-96 bg-[#0B1124] border-l border-blue-900/60 z-30 flex flex-col shrink-0 shadow-2xl transition-all">
                  <div className="p-3.5 border-b border-blue-900/50 flex items-center justify-between gap-2 bg-[#121B35]">
                    <div className="flex items-center gap-2">
                      <FolderClock className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-black text-white">سجل المحادثات والأسئلة</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {chatHistory.length > 0 && (
                        <button
                          onClick={handleClearAllHistory}
                          className="text-[11px] text-red-400 hover:text-red-300 font-bold"
                          title="مسح كل السجل"
                        >
                          مسح الكل
                        </button>
                      )}
                      <button
                        onClick={() => setShowHistoryDrawer(false)}
                        className="p-1 text-slate-400 hover:text-white rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Search in History */}
                  <div className="p-2.5 border-b border-blue-900/40">
                    <div className="flex items-center gap-2 bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3 py-1.5 text-xs">
                      <Search className="w-3.5 h-3.5 text-slate-400" />
                      <input 
                        type="text"
                        value={historySearchQuery}
                        onChange={e => setHistorySearchQuery(e.target.value)}
                        placeholder="ابحث في سجل أسئلتك..."
                        className="w-full bg-transparent text-white text-xs focus:outline-none"
                      />
                      {historySearchQuery && (
                        <button onClick={() => setHistorySearchQuery('')} className="text-slate-400 hover:text-white">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* History Sessions List */}
                  <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                    {chatHistory
                      .filter(s => 
                        !historySearchQuery.trim() || 
                        s.title.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
                        s.subject.toLowerCase().includes(historySearchQuery.toLowerCase())
                      )
                      .map(session => {
                        const isCurrent = session.id === currentSessionId;
                        return (
                          <div
                            key={session.id}
                            onClick={() => handleLoadSession(session)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer group flex items-start justify-between gap-2 ${
                              isCurrent 
                                ? 'bg-[#18264b] border-amber-500/70 shadow-md shadow-amber-500/10' 
                                : 'bg-[#101932] border-blue-900/40 hover:border-amber-400/40 hover:bg-[#142042]'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-950 border border-blue-800 text-blue-300 font-bold truncate max-w-[130px]">
                                  {session.subject}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">{session.lastUpdated}</span>
                              </div>
                              <h4 className="text-xs font-bold text-white truncate leading-relaxed group-hover:text-amber-300 transition-colors">
                                {session.title}
                              </h4>
                              <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                                <span>{session.messages.length} رسائل</span>
                                <span>·</span>
                                <span>{session.grade}</span>
                              </div>
                            </div>

                            <button
                              onClick={(e) => handleDeleteSession(session.id, e)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                              title="حذف هذه المحادثة من السجل"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}

                    {chatHistory.length === 0 && (
                      <div className="text-center py-12 px-4 text-slate-500 text-xs">
                        <History className="w-8 h-8 mx-auto mb-2 opacity-40 text-amber-400" />
                        <p>لا يوجد رسائل محفوظة حتى الآن</p>
                        <p className="text-[11px] text-slate-600 mt-1">أي محادثة أو سؤال تطرحه يُحفظ هنا تلقائياً</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Chat Message Stream */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex gap-3 sm:gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-amber-400" />
                    </div>
                  )}
                  <div className={`max-w-2xl rounded-2xl p-4 text-sm leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 border border-blue-500 text-white rounded-bl-sm shadow-md' 
                      : 'bg-[#182548] border border-blue-900/60 text-slate-100 rounded-br-sm shadow-md'
                  }`}>
                    {msg.image && (
                      <div className="mb-3 max-h-60 overflow-hidden rounded-xl border border-white/20 bg-black/40">
                        <img src={msg.image} alt="User Question attachment" className="w-full h-full object-contain max-h-60" />
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{msg.content}</div>

                    <div className={`text-[10px] mt-2 flex items-center justify-between ${msg.role === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
                      <span>{msg.timestamp}</span>
                      {msg.role === 'assistant' && (
                        <button onClick={() => handleCopy(msg.content, idx)} className="hover:text-amber-300 flex items-center gap-1 transition-colors">
                          {copiedIndex === idx ? <Check className="w-3 h-3 text-amber-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedIndex === idx ? 'تم النسخ' : 'نسخ الإجابة'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-blue-700 border border-blue-500 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-4 items-center">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-amber-400 animate-spin" />
                  </div>
                  <div className="bg-[#182548] border border-blue-900/60 px-4 py-3 rounded-2xl text-xs text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce"></span>
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:0.4s]"></span>
                    <span className="mr-2">المعلم الذكي يجهز الشرح والحل خطوة بخطوة...</span>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {attachedImage && (
              <div className="px-4 py-2 bg-[#0D1429] border-t border-blue-900/50 flex items-center gap-3">
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-amber-400/60 bg-black">
                  <img src={`data:${attachedMime};base64,${attachedImage}`} alt="Preview" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => setAttachedImage(null)}
                    className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full p-0.5 hover:bg-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-xs text-amber-300 font-medium">
                  <span>تم إرفاق صورة المسألة. اكتب سؤالك أو اضغط إرسال للحل الفوري!</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSendChat} className="p-3 sm:p-4 bg-[#141F3B] border-t border-blue-900/50 flex items-center gap-2 sm:gap-3">
              <input 
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, 'chat');
                }}
                className="hidden"
              />
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-[#1C2A50] hover:bg-[#253768] text-amber-400 p-3 rounded-xl transition-colors flex items-center justify-center shrink-0 border border-amber-400/30"
                title="إرفاق صورة مسألة أو صفحة كتاب"
              >
                <Camera className="w-4 h-4" />
              </button>

              <input 
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder={attachedImage ? "اكتب توضيحك مع الصورة أو اضغط إرسال مباشرة..." : `اكتب سؤالك أو ارفع صورة في ${selectedSubject}...`}
                className="flex-1 bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-400 transition-colors"
              />
              <button 
                type="submit" 
                disabled={loading || (!chatInput.trim() && !attachedImage)}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-3 rounded-xl transition-colors flex items-center gap-2 shrink-0 shadow-md shadow-amber-500/20"
              >
                <span>إرسال</span>
                <Send className="w-4 h-4 rtl:rotate-180" />
              </button>
            </form>
              </div>
            </div>
          </div>
        )}

        {/* 2. DEDICATED IMAGE HOMEWORK SOLVER TAB */}
        {activeTab === 'image_solver' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-[#101932] border border-blue-900/40 rounded-2xl p-6 shadow-xl flex flex-col gap-5">
              <div>
                <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-amber-400" /> حل مسائل الصور والكتب
                </h2>
                <p className="text-xs text-slate-300">صوّر أو ارفع أي مسألة رياضية أو صفحة من كتاب الوزارة وسيقوم الذكاء الاصطناعي بحلها وشرح خطواتها فوراً.</p>
              </div>

              <form onSubmit={handleSolveImage} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-amber-300 mb-1.5">ارفع صورة المسألة أو الواجب</label>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, 'solver');
                    }}
                    className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3 py-2 text-xs text-slate-300 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-amber-500 file:text-slate-950 hover:file:bg-amber-400 cursor-pointer"
                  />
                </div>

                {solverImage && (
                  <div className="w-full h-44 bg-[#0A0F1D] border border-amber-400/40 rounded-xl overflow-hidden flex items-center justify-center p-2">
                    <img src={`data:${solverMime};base64,${solverImage}`} alt="Uploaded homework" className="h-full object-contain rounded-lg" />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-amber-300 mb-1.5">تعليمات أو استفسار محدد حول الصورة</label>
                  <textarea 
                    rows={3}
                    value={solverQuestion}
                    onChange={e => setSolverQuestion(e.target.value)}
                    placeholder="مثال: حل المسألة رقم 3 مع توضيح خطوات الحل بالقوانين..."
                    className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-400 resize-none"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={loading || !solverImage}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md shadow-amber-500/20"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>حل المسألة وشرح الخطوات</span>
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 bg-[#101932] border border-blue-900/40 rounded-2xl p-6 shadow-xl flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-blue-900/50 mb-4">
                <span className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" /> الحل والخطوات التفصيلية
                </span>
                {solverResult && (
                  <button onClick={() => handleCopy(solverResult)} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1.5 font-bold">
                    {copiedBox ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedBox ? 'تم النسخ' : 'نسخ الحل'}</span>
                  </button>
                )}
              </div>
              <div className="flex-1 bg-[#0A0F1D] border border-blue-900/60 rounded-xl p-4 text-sm text-slate-200 overflow-y-auto whitespace-pre-wrap leading-relaxed min-h-[300px]">
                {solverResult || (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center">
                    <Camera className="w-12 h-12 mb-2 stroke-1" />
                    <p>قم باختيار صورة المسألة واضغط على زر الحل لعرض الخطوات والقوانين هنا.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3. LESSON EXPLAINER TAB */}
        {activeTab === 'explain' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-[#101932] border border-blue-900/40 rounded-2xl p-6 shadow-xl flex flex-col gap-5">
              <div>
                <h2 className="text-lg font-bold text-white mb-1">شرح الدروس والمفاهيم</h2>
                <p className="text-xs text-slate-300">احصل على شرح مفصل لأي درس طبقاً لكتاب وزارة التربية والتعليم المصرية بأسلوب مبسط وشيق.</p>
              </div>

              <form onSubmit={handleExplainLesson} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-amber-300 mb-1.5">عنوان الدرس أو القاعدة المطلوبة</label>
                  <input 
                    type="text"
                    value={lessonTitle}
                    onChange={e => setLessonTitle(e.target.value)}
                    placeholder="مثال: نظرية ذات الحدين، أو ثورة 1919، أو كان وأخواتها"
                    className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="p-3 bg-[#0A0F1D] border border-blue-900/50 rounded-xl text-xs text-slate-300 space-y-1">
                  <p className="font-bold text-amber-400">المادة والصف المحددان:</p>
                  <p>{selectedSubject} ({selectedGrade} - {selectedStage})</p>
                </div>

                <button 
                  type="submit"
                  disabled={loading || !lessonTitle.trim()}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md shadow-amber-500/20"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                  <span>شرح الدرس بالكامل</span>
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 bg-[#101932] border border-blue-900/40 rounded-2xl p-6 shadow-xl flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-blue-900/50 mb-4">
                <span className="text-sm font-bold text-amber-300">شرح الدرس المعتمد</span>
                {lessonExplanation && (
                  <button onClick={() => handleCopy(lessonExplanation)} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1.5 font-bold">
                    {copiedBox ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedBox ? 'تم النسخ' : 'نسخ الشرح'}</span>
                  </button>
                )}
              </div>
              <div className="flex-1 bg-[#0A0F1D] border border-blue-900/60 rounded-xl p-4 text-sm text-slate-200 overflow-y-auto whitespace-pre-wrap leading-relaxed min-h-[300px]">
                {lessonExplanation || (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center">
                    <BookOpen className="w-12 h-12 mb-2 stroke-1" />
                    <p>اكتب اسم الدرس واضغط على شرح الدرس ليبدأ المعلم الذكي بتقديم الشرح التفاعلي.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 4. INTERACTIVE QUIZ & EXAM TAB WITH ANSWERS AND RESULTS */}
        {activeTab === 'quiz' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 bg-[#101932] border border-blue-900/40 rounded-2xl p-6 shadow-xl flex flex-col gap-5">
              <div>
                <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" /> بنك الامتحانات والتقييم
                </h2>
                <p className="text-xs text-slate-300">أنشئ امتحاناً تفاعلياً، اختر إجاباتك، واحصل على نتيجتك وتقييمك الفوري مع تصحيح الأخطاء.</p>
              </div>

              <form onSubmit={handleGenerateInteractiveQuiz} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-amber-300 mb-1.5">موضوع الامتحان أو الوحدة</label>
                  <input 
                    type="text"
                    value={quizTopic}
                    onChange={e => setQuizTopic(e.target.value)}
                    placeholder="مثال: الباب الأول تفاضل وتكامل، أو ثورة 1919"
                    className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-300 mb-1.5">عدد الأسئلة</label>
                  <select 
                    value={quizCount}
                    onChange={e => setQuizCount(Number(e.target.value))}
                    className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value={3} className="bg-[#0A0F1D]">3 أسئلة سريعة</option>
                    <option value={5} className="bg-[#0A0F1D]">5 أسئلة قياسية</option>
                    <option value={10} className="bg-[#0A0F1D]">10 أسئلة امتحان شامل</option>
                  </select>
                </div>

                <button 
                  type="submit"
                  disabled={loading || !quizTopic.trim()}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md shadow-amber-500/20"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                  <span>توليد الامتحان التفاعلي</span>
                </button>
              </form>

              {/* Score Summary Badge if submitted */}
              {isQuizSubmitted && quizScore && (
                <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/20 via-blue-900/30 to-slate-900 border border-amber-400/40 text-center animate-in fade-in shadow-lg">
                  <div className="text-4xl font-extrabold text-amber-300 font-mono mb-1">
                    {quizScore.percentage}%
                  </div>
                  <div className="text-xs text-slate-200 mb-2">
                    حصلت على {quizScore.correct} إجابات صحيحة من أصل {quizScore.total}
                  </div>
                  <div className="text-xs font-bold text-amber-200">
                    {quizScore.percentage >= 85 ? '🌟 ممتاز جداً! أداء متميز' : quizScore.percentage >= 65 ? '👍 جيد جداً! راجع الشرح أدناه' : '💪 تدريب مفيد! اقرأ التوضيحات وحاول مرة أخرى'}
                  </div>

                  <button 
                    onClick={handleRetakeQuiz}
                    className="mt-3 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-blue-600/30"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> إعادة حل الامتحان
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: Questions & Instant Results */}
            <div className="lg:col-span-8 bg-[#101932] border border-blue-900/40 rounded-2xl p-6 shadow-xl flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-blue-900/50 mb-6">
                <div>
                  <h3 className="font-bold text-white text-base">
                    {currentQuiz ? currentQuiz.title : 'ورقة الأسئلة التفاعلية'}
                  </h3>
                  {currentQuiz && (
                    <span className="text-xs text-amber-300 font-semibold">
                      تمت الإجابة على {Object.keys(userAnswers).length} من {currentQuiz.questions.length} أسئلة
                    </span>
                  )}
                </div>

                {currentQuiz && !isQuizSubmitted && (
                  <button 
                    onClick={handleSubmitQuiz}
                    disabled={Object.keys(userAnswers).length === 0}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>تصحيح الامتحان وعرض النتيجة</span>
                  </button>
                )}
              </div>

              {/* Questions Container */}
              <div className="flex-1 overflow-y-auto space-y-6 max-h-[600px] pr-1">
                {loading ? (
                  <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
                    <span className="text-sm">جاري صياغة أسئلة الامتحان طبقاً لمناهج وزارة التربية والتعليم...</span>
                  </div>
                ) : currentQuiz ? (
                  currentQuiz.questions.map((q, qIdx) => {
                    const selectedOpt = userAnswers[qIdx];
                    const isCorrect = selectedOpt === q.correctAnswerIndex;

                    return (
                      <div 
                        key={q.id || qIdx} 
                        className={`p-5 rounded-2xl border transition-all ${
                          isQuizSubmitted 
                            ? isCorrect 
                              ? 'bg-emerald-950/30 border-emerald-500/50' 
                              : 'bg-red-950/30 border-red-500/50'
                            : 'bg-[#182548] border-blue-900/60'
                        }`}
                      >
                        {/* Question Header */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <h4 className="font-bold text-white text-sm sm:text-base leading-relaxed">
                            <span className="inline-block w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold text-center leading-6 ml-2">
                              {qIdx + 1}
                            </span>
                            {q.questionText}
                          </h4>
                          {isQuizSubmitted && (
                            <span className={`text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1 shrink-0 ${
                              isCorrect ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                              {isCorrect ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                              {isCorrect ? 'إجابة صحيحة' : 'إجابة خاطئة'}
                            </span>
                          )}
                        </div>

                        {/* 4 Choices */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {q.options.map((opt, optIdx) => {
                            const isSelected = selectedOpt === optIdx;
                            const isActualCorrect = isQuizSubmitted && q.correctAnswerIndex === optIdx;
                            const isWrongSelection = isQuizSubmitted && isSelected && !isCorrect;

                            let optionClasses = 'bg-[#0A0F1D] border-blue-900/50 text-slate-200 hover:border-amber-400/50';

                            if (isQuizSubmitted) {
                              if (isActualCorrect) {
                                optionClasses = 'bg-emerald-600/30 border-emerald-500 text-emerald-200 font-bold';
                              } else if (isWrongSelection) {
                                optionClasses = 'bg-red-600/30 border-red-500 text-red-200';
                              } else {
                                optionClasses = 'bg-[#0A0F1D]/40 border-slate-800/40 text-slate-500';
                              }
                            } else if (isSelected) {
                              optionClasses = 'bg-amber-400/20 border-amber-400 text-amber-200 font-bold shadow-sm';
                            }

                            return (
                              <button
                                key={optIdx}
                                type="button"
                                onClick={() => handleSelectOption(qIdx, optIdx)}
                                disabled={isQuizSubmitted}
                                className={`p-3.5 rounded-xl border text-right text-xs leading-relaxed flex items-center gap-2.5 transition-all ${optionClasses}`}
                              >
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                  isSelected ? 'bg-amber-400 text-slate-950 font-extrabold' : 'bg-slate-800 text-slate-300'
                                }`}>
                                  {['أ', 'ب', 'ج', 'د'][optIdx] || optIdx + 1}
                                </span>
                                <span className="flex-1">{opt}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Explanation on submission */}
                        {isQuizSubmitted && (
                          <div className="mt-4 p-3.5 rounded-xl bg-[#0A0F1D] border border-blue-900/60 text-xs text-slate-300 leading-relaxed animate-in fade-in">
                            <span className="font-bold text-amber-400 block mb-1 flex items-center gap-1.5">
                              <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> توضيح الحل والإجابة النموذجية:
                            </span>
                            <p>{q.explanation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-center">
                    <Award className="w-14 h-14 mb-3 stroke-1" />
                    <p className="text-sm">أدخل موضوع الامتحان واضغط "توليد الامتحان التفاعلي" لبدء الحل والتصحيح المباشر.</p>
                  </div>
                )}
              </div>

              {/* Bottom Sticky Submit Bar if Quiz is open */}
              {currentQuiz && !isQuizSubmitted && (
                <div className="mt-6 pt-4 border-t border-blue-900/50 flex items-center justify-between">
                  <span className="text-xs text-slate-300">
                    أجب على الأسئلة واضغط التصحيح لمعرفة درجاتك وشرح الإجابات.
                  </span>
                  <button 
                    onClick={handleSubmitQuiz}
                    disabled={Object.keys(userAnswers).length === 0}
                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>تصحيح الامتحان وعرض النتيجة</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. STUDY FOCUS & POMODORO TAB */}
        {activeTab === 'timer' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Pomodoro Timer Card */}
            <div className="lg:col-span-6 bg-[#101932] border border-blue-900/40 rounded-2xl p-6 sm:p-8 shadow-xl flex flex-col items-center justify-center text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-bold mb-6">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>جلسة {timerMode === 'study' ? 'مذاكرة مركزة (25 دقيقة)' : 'استراحة قصيرة (5 دقائق)'}</span>
              </div>

              {/* Large Clock Display */}
              <div className="text-6xl sm:text-7xl font-extrabold font-mono text-amber-300 mb-6 tracking-wider drop-shadow-md">
                {String(pomodoroMinutes).padStart(2, '0')}:{String(pomodoroSeconds).padStart(2, '0')}
              </div>

              {/* Timer Buttons */}
              <div className="flex items-center gap-4 mb-8">
                <button 
                  onClick={toggleTimer}
                  className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:scale-105"
                >
                  {isTimerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{isTimerRunning ? 'إيقاف مؤقت' : 'بدء التركيز'}</span>
                </button>
                <button 
                  onClick={() => resetTimer('study')}
                  className="p-3 rounded-xl bg-[#182548] hover:bg-[#20315E] text-slate-300 transition-colors border border-blue-900/50"
                  title="إعادة ضبط المؤقت"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Mode Switches */}
              <div className="flex items-center gap-2 p-1.5 bg-[#0A0F1D] rounded-xl border border-blue-900/50 text-xs">
                <button 
                  onClick={() => resetTimer('study')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${timerMode === 'study' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                >
                  مذاكرة 25 دقيقة
                </button>
                <button 
                  onClick={() => resetTimer('break')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${timerMode === 'break' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                >
                  استراحة 5 دقائق
                </button>
              </div>
            </div>

            {/* Daily Study Tasks Card */}
            <div className="lg:col-span-6 bg-[#101932] border border-blue-900/40 rounded-2xl p-6 shadow-xl flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-blue-900/50 mb-4">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-white text-base">قائمة مهام المذاكرة اليومية</h3>
                </div>
                <span className="text-xs text-amber-300 font-mono font-bold">
                  {tasks.filter(t => t.completed).length} من {tasks.length} منجز
                </span>
              </div>

              {/* Task Form */}
              <form onSubmit={addTask} className="flex gap-2 mb-4">
                <input 
                  type="text"
                  value={newTaskInput}
                  onChange={e => setNewTaskInput(e.target.value)}
                  placeholder="أضف مهمة مذاكرة جديدة (مثال: حل 10 مسائل تفاضل)..."
                  className="flex-1 bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                />
                <button 
                  type="submit"
                  disabled={!newTaskInput.trim()}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة</span>
                </button>
              </form>

              {/* Task List */}
              <div className="flex-1 space-y-2 overflow-y-auto max-h-64">
                {tasks.map(task => (
                  <div 
                    key={task.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      task.completed 
                        ? 'bg-[#0A0F1D]/50 border-blue-950 text-slate-500 line-through' 
                        : 'bg-[#182548] border-blue-900/60 text-slate-200'
                    }`}
                  >
                    <div 
                      onClick={() => toggleTask(task.id)}
                      className="flex items-center gap-3 cursor-pointer flex-1"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        task.completed ? 'bg-amber-500 border-amber-400 text-slate-950 font-bold' : 'border-slate-600'
                      }`}>
                        {task.completed && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="text-xs font-medium">{task.text}</span>
                    </div>
                    <button 
                      onClick={() => deleteTask(task.id)}
                      className="text-slate-500 hover:text-red-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Study Tip Box */}
              <div className="mt-4 p-3 rounded-xl bg-amber-400/10 border border-amber-400/20 text-xs text-amber-200 flex items-start gap-2.5">
                <Lightbulb className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>نصيحة للمذاكرة:</strong> تقسيم وقت الدراسة إلى فترات 25 دقيقة مع 5 دقائق استراحة (تقنية بومودورو) يرفع تركيز الدماغ ويمنع الإجهاد بنسبة تصل إلى 40%.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 6. TAB: لوحة إنجازاتي (Achievement Dashboard with Recharts) */}
        {activeTab === 'achievements' && (
          <div className="space-y-6">
            {/* Header & Action Ribbon */}
            <div className="bg-[#101932] border border-blue-900/40 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
                  <Trophy className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-white flex items-center gap-2">
                    لوحة إنجازاتي ومتابعة المذاكرة
                    <span className="text-[11px] px-2.5 py-0.5 bg-amber-400/20 text-amber-300 rounded-full font-bold border border-amber-400/30">
                      مناهج مصر 🇪🇬
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    رسم بياني تفاعلي ومتابعة حية للأسئلة المحلولة، وساعات التركيز، والدروس التي راجعتها
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowLogModal(prev => !prev)}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition-all"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>تسجيل مذاكرة يدوية</span>
                </button>
              </div>
            </div>

            {/* Quick Manual Activity Logger Box */}
            {showLogModal && (
              <div className="bg-[#131E3D] border border-amber-500/30 rounded-2xl p-5 shadow-2xl animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between pb-3 border-b border-blue-900/60 mb-4">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>تسجيل مذاكرة من الكتب المدرسية والواجبات الورقية</span>
                  </div>
                  <button 
                    onClick={() => setShowLogModal(false)}
                    className="text-slate-400 hover:text-white text-xs p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-300 font-medium mb-1.5">الأسئلة التي تم حلها:</label>
                    <div className="flex items-center gap-2 bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3 py-2">
                      <Target className="w-4 h-4 text-amber-400" />
                      <input 
                        type="number"
                        min="1"
                        max="200"
                        value={manualQuestions}
                        onChange={e => setManualQuestions(Math.max(1, Number(e.target.value)))}
                        className="w-full bg-transparent text-white font-bold text-xs focus:outline-none"
                      />
                      <span className="text-[11px] text-slate-400">سؤال</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-300 font-medium mb-1.5">وقت المذاكرة والتركيز:</label>
                    <div className="flex items-center gap-2 bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3 py-2">
                      <Clock className="w-4 h-4 text-blue-400" />
                      <input 
                        type="number"
                        min="5"
                        max="300"
                        step="5"
                        value={manualMinutes}
                        onChange={e => setManualMinutes(Math.max(5, Number(e.target.value)))}
                        className="w-full bg-transparent text-white font-bold text-xs focus:outline-none"
                      />
                      <span className="text-[11px] text-slate-400">دقيقة</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-300 font-medium mb-1.5">الدروس التي تمت مراجعتها:</label>
                    <div className="flex items-center gap-2 bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3 py-2">
                      <BookOpen className="w-4 h-4 text-emerald-400" />
                      <input 
                        type="number"
                        min="1"
                        max="20"
                        value={manualLessons}
                        onChange={e => setManualLessons(Math.max(1, Number(e.target.value)))}
                        className="w-full bg-transparent text-white font-bold text-xs focus:outline-none"
                      />
                      <span className="text-[11px] text-slate-400">درس</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button 
                    type="button"
                    onClick={() => setShowLogModal(false)}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white font-semibold"
                  >
                    إلغاء
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      recordActivity({
                        questions: manualQuestions,
                        studyMinutes: manualMinutes,
                        lessons: manualLessons,
                      });
                      addGems(manualQuestions * 2 + manualLessons * 5, 'مذاكرة كتب وواجبات ورقية 📚');
                      setShowLogModal(false);
                    }}
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm"
                  >
                    حفظ وإضافة إلى الرسم البياني
                  </button>
                </div>
              </div>
            )}

            {/* 4 Core Metric KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Metric 1: Questions Solved */}
              <div className="bg-[#101932] border border-amber-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-amber-400 transition-all">
                <div className="absolute top-0 left-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -mr-6 -mt-6"></div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-400 font-medium">الأسئلة التي تم حلها</span>
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center">
                    <Target className="w-5 h-5 stroke-[2.5]" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-amber-400 font-mono tracking-tight">{totalQuestionsSolved}</span>
                  <span className="text-xs text-amber-200/80 font-bold">سؤال منجز</span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>يشمل الامتحانات والمسائل المحلولة</span>
                </div>
              </div>

              {/* Metric 2: Study Time */}
              <div className="bg-[#101932] border border-blue-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-blue-400 transition-all">
                <div className="absolute top-0 left-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl -mr-6 -mt-6"></div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-400 font-medium">الوقت المقضي في المذاكرة</span>
                  <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-400/30 flex items-center justify-center">
                    <Clock className="w-5 h-5 stroke-[2.5]" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-blue-400 font-mono tracking-tight">{totalStudyHours}</span>
                  <span className="text-xs text-blue-200/80 font-bold">ساعة ({totalStudyMinutes} دقيقة)</span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Timer className="w-3.5 h-3.5 text-blue-400" />
                  <span>عبر جلسات بومودورو والمذاكرة المركزة</span>
                </div>
              </div>

              {/* Metric 3: Lessons Reviewed */}
              <div className="bg-[#101932] border border-emerald-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-emerald-400 transition-all">
                <div className="absolute top-0 left-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -mr-6 -mt-6"></div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-400 font-medium">الدروس التي تمت مراجعتها</span>
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 stroke-[2.5]" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-emerald-400 font-mono tracking-tight">{totalLessonsReviewed}</span>
                  <span className="text-xs text-emerald-200/80 font-bold">درس ومفهوم</span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                  <BookMarked className="w-3.5 h-3.5 text-emerald-400" />
                  <span>وفق خطة مناهج وزارة التربية والتعليم</span>
                </div>
              </div>

              {/* Metric 4: Daily Streak */}
              <div className="bg-[#101932] border border-orange-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-orange-400 transition-all">
                <div className="absolute top-0 left-0 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl -mr-6 -mt-6"></div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-400 font-medium">الالتزام اليومي (Streak)</span>
                  <div className="w-9 h-9 rounded-xl bg-orange-500/20 text-orange-300 border border-orange-400/30 flex items-center justify-center">
                    <Flame className="w-5 h-5 stroke-[2.5] text-orange-400" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-orange-400 font-mono tracking-tight">7</span>
                  <span className="text-xs text-orange-200/80 font-bold">أيام متتالية 🔥</span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                  <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
                  <span>مستوى استمرارية ممتاز جداً</span>
                </div>
              </div>
            </div>

            {/* Recharts Interactive Visualizer */}
            <div className="bg-[#101932] border border-blue-900/40 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-blue-900/50 mb-6 gap-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="font-bold text-white text-base">الرسم البياني للنشاط الأسبوعي</h3>
                    <p className="text-xs text-slate-400">متابعة بيانية تفاعلية مدعومة بمكتبة Recharts</p>
                  </div>
                </div>

                {/* Metric View Switcher */}
                <div className="flex items-center gap-1.5 bg-[#0A0F1D] p-1 rounded-xl border border-blue-900/60 overflow-x-auto">
                  <button 
                    onClick={() => setSelectedChartMetric('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      selectedChartMetric === 'all' 
                        ? 'bg-amber-500 text-slate-950 shadow-sm' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    المقارنة الشاملة
                  </button>
                  <button 
                    onClick={() => setSelectedChartMetric('questions')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      selectedChartMetric === 'questions' 
                        ? 'bg-amber-500 text-slate-950 shadow-sm' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    الأسئلة 📝
                  </button>
                  <button 
                    onClick={() => setSelectedChartMetric('time')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      selectedChartMetric === 'time' 
                        ? 'bg-blue-600 text-white shadow-sm' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    الوقت (دقائق) ⏱️
                  </button>
                  <button 
                    onClick={() => setSelectedChartMetric('lessons')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      selectedChartMetric === 'lessons' 
                        ? 'bg-emerald-500 text-slate-950 shadow-sm' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    الدروس 📚
                  </button>
                </div>
              </div>

              {/* Chart Container */}
              <div className="h-80 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  {selectedChartMetric === 'time' ? (
                    <AreaChart data={weeklyProgress} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                      <defs>
                        <linearGradient id="timeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.6}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                      <XAxis 
                        dataKey="day" 
                        stroke="#94A3B8" 
                        tick={{ fill: '#94A3B8', fontSize: 12, fontFamily: 'Cairo' }} 
                      />
                      <YAxis 
                        stroke="#94A3B8" 
                        tick={{ fill: '#94A3B8', fontSize: 12 }} 
                        unit=" د"
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#0A0F1D', 
                          borderColor: '#2563EB', 
                          borderRadius: '12px',
                          fontFamily: 'Cairo',
                          direction: 'rtl',
                          textAlign: 'right'
                        }}
                        labelStyle={{ color: '#FBBF24', fontWeight: 'bold' }}
                      />
                      <Legend wrapperStyle={{ fontFamily: 'Cairo', paddingTop: '10px' }} />
                      <Area 
                        type="monotone" 
                        dataKey="studyMinutes" 
                        name="وقت المذاكرة (دقائق)" 
                        stroke="#3B82F6" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#timeGradient)" 
                      />
                    </AreaChart>
                  ) : (
                    <BarChart data={weeklyProgress} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                      <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                      <XAxis 
                        dataKey="day" 
                        stroke="#94A3B8" 
                        tick={{ fill: '#94A3B8', fontSize: 12, fontFamily: 'Cairo' }} 
                      />
                      <YAxis 
                        stroke="#94A3B8" 
                        tick={{ fill: '#94A3B8', fontSize: 12 }} 
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#0A0F1D', 
                          borderColor: '#F59E0B', 
                          borderRadius: '12px',
                          fontFamily: 'Cairo',
                          direction: 'rtl',
                          textAlign: 'right'
                        }}
                        labelStyle={{ color: '#FBBF24', fontWeight: 'bold' }}
                      />
                      <Legend wrapperStyle={{ fontFamily: 'Cairo', paddingTop: '10px' }} />
                      
                      {(selectedChartMetric === 'all' || selectedChartMetric === 'questions') && (
                        <Bar 
                          dataKey="questions" 
                          name="الأسئلة المحلولة" 
                          fill="#F59E0B" 
                          radius={[6, 6, 0, 0]} 
                          maxBarSize={40}
                        />
                      )}

                      {(selectedChartMetric === 'all') && (
                        <Bar 
                          dataKey="studyMinutes" 
                          name="وقت المذاكرة (دقائق)" 
                          fill="#3B82F6" 
                          radius={[6, 6, 0, 0]} 
                          maxBarSize={40}
                        />
                      )}

                      {(selectedChartMetric === 'all' || selectedChartMetric === 'lessons') && (
                        <Bar 
                          dataKey="lessons" 
                          name="الدروس المراجعة" 
                          fill="#10B981" 
                          radius={[6, 6, 0, 0]} 
                          maxBarSize={40}
                        />
                      )}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Chart Legend Explanation */}
              <div className="mt-4 pt-4 border-t border-blue-900/40 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-amber-500"></span>
                    <span>الأسئلة المحلولة</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-blue-500"></span>
                    <span>وقت المذاكرة (دقائق)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-emerald-500"></span>
                    <span>الدروس المراجعة</span>
                  </div>
                </div>
                <span className="text-amber-300 font-mono">آخر تحديث: قبل لحظات</span>
              </div>
            </div>

            {/* Badges & Achievements (أوسمة التفوق والشارات) */}
            <div className="bg-[#101932] border border-blue-900/40 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-2 pb-4 border-b border-blue-900/50 mb-4">
                <Award className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">أوسمة التفوق والشهادات التحفيزية</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Badge 1 */}
                <div className="p-4 rounded-xl bg-[#0A0F1D] border border-amber-500/30 flex flex-col justify-between">
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center text-lg">
                      🥇
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                      مكتمل
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">فارس بنك الأسئلة</h4>
                    <p className="text-xs text-slate-400 mt-1">حل أكثر من 100 سؤال في المناهج المصرية</p>
                  </div>
                  <div className="mt-3 w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div className="bg-amber-500 h-2 rounded-full w-full"></div>
                  </div>
                </div>

                {/* Badge 2 */}
                <div className="p-4 rounded-xl bg-[#0A0F1D] border border-blue-500/30 flex flex-col justify-between">
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-400/30 flex items-center justify-center text-lg">
                      ⏱️
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                      مكتمل
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">سيد التركيز وبومودورو</h4>
                    <p className="text-xs text-slate-400 mt-1">إتمام أكثر من 300 دقيقة مذاكرة متواصلة</p>
                  </div>
                  <div className="mt-3 w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div className="bg-blue-500 h-2 rounded-full w-full"></div>
                  </div>
                </div>

                {/* Badge 3 */}
                <div className="p-4 rounded-xl bg-[#0A0F1D] border border-emerald-500/30 flex flex-col justify-between">
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center justify-center text-lg">
                      📚
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                      مكتمل
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">موسوعة المناهج المصرية</h4>
                    <p className="text-xs text-slate-400 mt-1">مراجعة وشرح 15 درساً في مختلف المواد</p>
                  </div>
                  <div className="mt-3 w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div className="bg-emerald-500 h-2 rounded-full w-full"></div>
                  </div>
                </div>

                {/* Badge 4 */}
                <div className="p-4 rounded-xl bg-[#0A0F1D] border border-orange-500/30 flex flex-col justify-between">
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-300 border border-orange-400/30 flex items-center justify-center text-lg">
                      🔥
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 font-bold">
                      نشط حالياً
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">شعلة الالتزام الأسبوعي</h4>
                    <p className="text-xs text-slate-400 mt-1">المواظبة على المذاكرة 7 أيام متتالية</p>
                  </div>
                  <div className="mt-3 w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div className="bg-orange-500 h-2 rounded-full w-full"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 7. TAB: الشهادات والجواهر (Rewards & Student Certificates) */}
        {activeTab === 'rewards' && (
          <div className="space-y-6">
            {/* Header: Level & Gems Status Banner */}
            <div className="bg-gradient-to-r from-[#101932] via-[#14234b] to-[#101932] border border-amber-500/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
              <div className="absolute -top-10 -left-10 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-blue-600/15 rounded-full blur-3xl pointer-events-none"></div>

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                {/* Student Info & Level Title */}
                <div className="flex items-start sm:items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-600 p-0.5 shadow-xl shadow-amber-500/20 shrink-0">
                    <div className="w-full h-full bg-[#0A0F1D] rounded-[14px] flex flex-col items-center justify-center">
                      <Crown className="w-7 h-7 text-amber-400 stroke-[2.5]" />
                      <span className="text-[10px] font-black text-amber-300">مستوى {currentLevelInfo.level}</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl sm:text-2xl font-black text-white">{studentProfile.name}</h2>
                      <button 
                        onClick={() => {
                          setProfileDraft(studentProfile);
                          setShowProfileModal(true);
                        }}
                        className="text-xs px-2.5 py-0.5 rounded-full bg-blue-900/60 border border-blue-500/40 text-blue-300 hover:text-white font-medium transition-all"
                      >
                        تعديل الاسم
                      </button>
                    </div>
                    <p className="text-xs text-amber-200 mt-1 flex flex-wrap items-center gap-2">
                      <span className="font-bold text-amber-400">{currentLevelInfo.title}</span>
                      <span>·</span>
                      <span className="text-slate-300">{studentProfile.school} ({studentProfile.governorate})</span>
                    </p>
                  </div>
                </div>

                {/* Gems Box */}
                <div className="flex items-center gap-4 bg-[#0A0F1D]/80 border border-amber-500/30 rounded-2xl p-4 shrink-0 backdrop-blur-sm">
                  <div className="text-center sm:text-right">
                    <div className="text-xs text-slate-400 font-medium">رصيد الجواهر الإجمالي</div>
                    <div className="flex items-center gap-2 text-3xl font-black text-amber-400 font-mono tracking-tight">
                      <Gem className="w-7 h-7 text-amber-400 fill-amber-400/20" />
                      <span>{gems}</span>
                      <span className="text-sm font-bold text-slate-300 font-['Cairo']">جوهرة</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress to Next Certificate Milestone */}
              <div className="mt-6 pt-5 border-t border-blue-900/40 relative z-10">
                <div className="flex flex-wrap items-center justify-between text-xs font-semibold mb-2 text-slate-300 gap-2">
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>الهدف القادم للشهادة التالية:</span>
                    <strong className="text-white font-mono">{currentLevelInfo.nextGoal} جوهرة</strong>
                  </span>
                  <span className="text-slate-400 font-mono">
                    {gems} من {currentLevelInfo.nextGoal} ({Math.min(100, Math.round(currentLevelInfo.progress))}%)
                  </span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-3.5 p-0.5 border border-blue-900/60 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-blue-600 via-amber-500 to-yellow-400 h-full rounded-full transition-all duration-700 ease-out shadow-sm"
                    style={{ width: `${Math.min(100, Math.max(5, currentLevelInfo.progress))}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* How to Earn Gems Chips Ribbon */}
            <div className="bg-[#101932] border border-blue-900/40 rounded-2xl p-4 shadow-lg">
              <h3 className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>كيف تكسب الجواهر وترفع مستواك؟</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-[#0A0F1D] border border-blue-900/40 flex items-center justify-between">
                  <span className="text-slate-300 font-medium">سؤال في الشات</span>
                  <span className="font-bold text-amber-400 font-mono">+10 💎</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0A0F1D] border border-blue-900/40 flex items-center justify-between">
                  <span className="text-slate-300 font-medium">حل مسألة بالصورة</span>
                  <span className="font-bold text-amber-400 font-mono">+20 💎</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0A0F1D] border border-blue-900/40 flex items-center justify-between">
                  <span className="text-slate-300 font-medium">مراجعة وشرح درس</span>
                  <span className="font-bold text-amber-400 font-mono">+25 💎</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0A0F1D] border border-blue-900/40 flex items-center justify-between">
                  <span className="text-slate-300 font-medium">بومودورو (25 دقيقة)</span>
                  <span className="font-bold text-amber-400 font-mono">+30 💎</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0A0F1D] border border-blue-900/40 flex items-center justify-between">
                  <span className="text-slate-300 font-medium">اختبار تفاعلي ناجح</span>
                  <span className="font-bold text-amber-400 font-mono">+30 إلى 50 💎</span>
                </div>
              </div>
            </div>

            {/* Certificates Catalog */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-400" />
                    <span>شهادات التقدير المعتمدة المفتوحة والمستحقة</span>
                  </h3>
                  <p className="text-xs text-slate-400">تصدر الشهادة الرسمية وتُطبع باسم الطالب المسجل تلقائياً</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {certificatesList.map((cert) => {
                  const isUnlocked = gems >= cert.minGems;
                  const remaining = cert.minGems - gems;

                  return (
                    <div 
                      key={cert.id}
                      className={`rounded-2xl border p-5 transition-all relative overflow-hidden flex flex-col justify-between ${
                        isUnlocked 
                          ? 'bg-[#101932] border-amber-500/50 shadow-xl shadow-amber-500/5 hover:border-amber-400' 
                          : 'bg-[#0E152A]/80 border-slate-800/80 opacity-80'
                      }`}
                    >
                      {/* Top Bar of Certificate Card */}
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${
                              isUnlocked ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40' : 'bg-slate-800 text-slate-500'
                            }`}>
                              {isUnlocked ? '📜' : '🔒'}
                            </div>
                            <div>
                              <span className="text-[11px] font-bold text-amber-400 block">{cert.levelTitle}</span>
                              <h4 className="font-black text-white text-sm sm:text-base">{cert.title}</h4>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isUnlocked ? (
                              <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> مفتوحة
                              </span>
                            ) : (
                              <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-bold">
                                {cert.minGems} 💎 مطلوبة
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed mb-4">
                          {cert.description}
                        </p>
                      </div>

                      {/* Card Footer / Action Button */}
                      <div className="pt-4 border-t border-blue-900/40 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-400 font-mono">
                          كود الاعتماد: {cert.serialNumber}
                        </div>

                        {isUnlocked ? (
                          <button
                            onClick={() => setActiveCertificate(cert)}
                            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition-transform hover:scale-105"
                          >
                            <Printer className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>عرض وطباعة الشهادة</span>
                          </button>
                        ) : (
                          <span className="text-xs text-amber-400 font-bold">
                            متبقي {remaining} 💎 لفتحها
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        </>
      )}
      </main>

      {/* MODAL 1: Full-Screen Printable Official Certificate */}
      {activeCertificate && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in">
          <div className="w-full max-w-4xl bg-[#0F172E] border-2 border-amber-500/60 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            {/* Action Bar (Not Printed) */}
            <div className="p-4 bg-[#141F3C] border-b border-amber-500/30 flex items-center justify-between gap-2 no-print">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Award className="w-5 h-5 text-amber-400" />
                <span>شهادة التفوق المعتمدة لـ: <span className="text-amber-300 font-black">{studentProfile.name}</span></span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-amber-500/30 transition-all"
                >
                  <Printer className="w-4 h-4 stroke-[2.5]" />
                  <span>طباعة وحفظ كـ PDF</span>
                </button>
                <button
                  onClick={() => {
                    setProfileDraft(studentProfile);
                    setShowProfileModal(true);
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all"
                >
                  تعديل الاسم
                </button>
                <button
                  onClick={() => setActiveCertificate(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-900 border border-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Certificate Body */}
            <div id="printable-certificate" className="p-6 sm:p-10 bg-slate-950 text-slate-100 relative overflow-hidden">
              {/* Outer Golden Border with Corners */}
              <div className="border-4 border-amber-500/80 rounded-2xl p-6 sm:p-10 relative bg-gradient-to-b from-[#101932] via-[#0A0F1D] to-[#101932]">
                {/* Decorative Inner Border */}
                <div className="absolute inset-2 border border-amber-400/40 rounded-xl pointer-events-none"></div>

                {/* Decorative Corners */}
                <div className="absolute top-4 right-4 text-amber-400 font-serif text-2xl font-bold select-none">⚜</div>
                <div className="absolute top-4 left-4 text-amber-400 font-serif text-2xl font-bold select-none">⚜</div>
                <div className="absolute bottom-4 right-4 text-amber-400 font-serif text-2xl font-bold select-none">⚜</div>
                <div className="absolute bottom-4 left-4 text-amber-400 font-serif text-2xl font-bold select-none">⚜</div>

                {/* Top Header of Certificate */}
                <div className="flex flex-col sm:flex-row items-center justify-between text-center sm:text-right pb-6 border-b border-amber-500/30 gap-4">
                  <div>
                    <h5 className="text-xs font-bold text-amber-300 tracking-wider">جمهورية مصر العربية</h5>
                    <h6 className="text-[11px] text-slate-400">مناهج وزارة التربية والتعليم والتعليم الفني</h6>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-blue-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/30 mb-1">
                      <BookOpen className="w-7 h-7 stroke-[2.5]" />
                    </div>
                    <span className="text-sm font-black text-white tracking-widest font-mono">M WEB AI</span>
                  </div>

                  <div className="text-center sm:text-left text-[11px] text-slate-400 font-mono">
                    <div>كود الاعتماد: <span className="text-amber-400 font-bold">{activeCertificate.serialNumber}</span></div>
                    <div>التاريخ: {new Date().toLocaleDateString('ar-EG')}</div>
                  </div>
                </div>

                {/* Certificate Main Title */}
                <div className="text-center my-8">
                  <span className="text-xs font-bold text-amber-400 tracking-widest uppercase px-4 py-1 rounded-full bg-amber-400/10 border border-amber-400/30">
                    CERTIFICATE OF ACADEMIC EXCELLENCE
                  </span>
                  <h1 className="text-2xl sm:text-4xl font-black text-white mt-3 font-serif tracking-tight text-amber-300">
                    شـهــادة تـقــديـر وتـفــوق دراسـي
                  </h1>
                  <h3 className="text-sm sm:text-base font-bold text-blue-400 mt-1">
                    {activeCertificate.title}
                  </h3>
                </div>

                {/* Body Text Personalized */}
                <div className="text-center max-w-2xl mx-auto space-y-4 my-6">
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    تشهد منصة <strong>M Web AI للتعليم والذكاء الاصطناعي</strong> بأن الطالبـ/ة المتفوقـ/ة:
                  </p>

                  <div className="py-2 px-6 inline-block border-b-2 border-amber-400">
                    <h2 className="text-2xl sm:text-3xl font-black text-white font-serif tracking-wide text-amber-300">
                      {studentProfile.name}
                    </h2>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    المقيد في <strong>{selectedGrade}</strong> ({selectedStage}) بمدرسة <strong>{studentProfile.school}</strong> بمحافظة <strong>{studentProfile.governorate}</strong>.
                  </p>

                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed pt-2">
                    قد اجتاز بتفوق متطلبات المذاكرة الدورية، وحل بنك الامتحانات التفاعلية، ومراجعة الدروس بمناهج وزارة التربية والتعليم المصرية، وحقق رصيداً فائقاً يبلغ:
                  </p>

                  <div className="inline-flex items-center gap-2 bg-amber-500/20 border border-amber-400/50 px-4 py-1.5 rounded-full text-amber-300 font-mono font-bold text-base">
                    <Gem className="w-5 h-5 text-amber-400" />
                    <span>{gems} جوهرة تفوق واجتهاد</span>
                  </div>
                </div>

                {/* Signatures & Stamps */}
                <div className="mt-10 pt-6 border-t border-amber-500/30 flex flex-col sm:flex-row items-center justify-between text-center gap-6">
                  {/* Left Signature */}
                  <div className="text-center">
                    <div className="text-xs text-slate-400 mb-1">المستشار التعليمي العام</div>
                    <div className="text-sm font-bold text-white font-serif italic">د. إبراهيم كمال</div>
                    <div className="text-[10px] text-slate-500">لجنة المناهج والتطوير</div>
                  </div>

                  {/* Golden Academic Seal */}
                  <div className="w-24 h-24 rounded-full border-4 border-amber-400 bg-gradient-to-tr from-amber-600 to-yellow-400 text-slate-950 flex flex-col items-center justify-center p-2 shadow-xl shadow-amber-500/30 transform rotate-[-6deg]">
                    <Star className="w-4 h-4 fill-slate-950 stroke-none" />
                    <span className="text-[10px] font-black tracking-tighter text-center leading-tight">M WEB AI<br/>معتمد رسمي</span>
                    <span className="text-[8px] font-mono font-bold">2026 EGY</span>
                  </div>

                  {/* Right Signature */}
                  <div className="text-center">
                    <div className="text-xs text-slate-400 mb-1">إدارة منصة M Web الذكية</div>
                    <a 
                      href="https://m-web-psi.vercel.app/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm font-bold text-amber-400 hover:underline"
                    >
                      شركة M Web
                    </a>
                    <div className="text-[10px] text-slate-500">m-web-psi.vercel.app</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. TAB: لوحة تحكم الأدمن (Admin Panel - Code: 100100) */}
      {activeTab === 'admin' && (
        <div className="space-y-6">
          {/* Top Admin Banner */}
          <div className="bg-gradient-to-r from-[#101932] via-[#14234b] to-[#101932] border-2 border-amber-500/50 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-400 shadow-lg">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-black text-white">لوحة تحكم المشرفين والإدارة العامة</h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
                      وضع المشرف المعلم
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    إدارة الطلاب وقاعدة بيانات Firebase Firestore، واستعراض وتحميل ملف <code className="text-amber-400 font-bold">data.json</code>، ومتابعة النشر على Vercel و PWA.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={loadAdminStudents}
                  className="px-3.5 py-2 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:bg-blue-600/30 text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>تحديث البيانات من Firestore</span>
                </button>
                <button
                  onClick={() => {
                    setIsAdminAuthenticated(false);
                    setActiveTab('study');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-red-600/20 border border-red-500/40 text-red-300 hover:bg-red-600/30 text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج من وضع الأدمن</span>
                </button>
              </div>
            </div>

            {/* Admin Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-blue-900/40">
              <div className="bg-[#0A0F1D]/80 border border-blue-900/40 p-3 rounded-xl">
                <div className="text-[11px] text-slate-400 font-medium">الطلاب المسجلين بقاعدة البيانات</div>
                <div className="text-2xl font-black text-amber-400 font-mono mt-0.5">
                  {Math.max(adminStudentsList.length, 1)} <span className="text-xs text-slate-400 font-['Cairo']">طالب</span>
                </div>
              </div>
              <div className="bg-[#0A0F1D]/80 border border-blue-900/40 p-3 rounded-xl">
                <div className="text-[11px] text-slate-400 font-medium">إجمالي الجواهر المتداولة</div>
                <div className="text-2xl font-black text-amber-300 font-mono mt-0.5">
                  {adminStudentsList.reduce((acc, curr) => acc + (Number(curr.gems) || 0), 0) + gems} 💎
                </div>
              </div>
              <div className="bg-[#0A0F1D]/80 border border-blue-900/40 p-3 rounded-xl">
                <div className="text-[11px] text-slate-400 font-medium">مراحل المنهج المصري</div>
                <div className="text-2xl font-black text-white font-mono mt-0.5">
                  3 <span className="text-xs text-slate-400 font-['Cairo']">مراحل (12 صفاً)</span>
                </div>
              </div>
              <div className="bg-[#0A0F1D]/80 border border-blue-900/40 p-3 rounded-xl">
                <div className="text-[11px] text-slate-400 font-medium">حالة النشر والتشغيل</div>
                <div className="text-sm font-bold text-emerald-400 mt-1 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span>Vercel + PWA جاهز</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: data.json Viewer and Downloader */}
          <div className="bg-[#101932] border border-blue-900/40 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-blue-900/50 gap-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-white text-base">ملف البيانات الأساسي (data.json)</h3>
                  <p className="text-xs text-slate-400">يحتوي على هيكلية المراحل الدراسية، بنك الأسئلة النموذجي، وإعدادات المنصة</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyDataJson}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  {copiedDataJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedDataJson ? 'تم النسخ!' : 'نسخ JSON'}</span>
                </button>
                <button
                  onClick={handleDownloadDataJson}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20"
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span>تحميل data.json</span>
                </button>
              </div>
            </div>

            <div className="mt-4">
              <div className="bg-[#070B16] border border-blue-950 rounded-xl p-4 overflow-x-auto max-h-80 text-xs font-mono text-emerald-300 scrollbar-thin">
                <pre>{JSON.stringify(platformData, null, 2)}</pre>
              </div>
            </div>
          </div>

          {/* Section: Registered Students in Firestore */}
          <div className="bg-[#101932] border border-blue-900/40 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-blue-900/50 gap-3">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-white text-base">سجل الطلاب وقاعدة بيانات المستخدمين (Firestore)</h3>
                  <p className="text-xs text-slate-400">قائمة الطلاب المسجلين عبر Firebase Auth و Firestore Database</p>
                </div>
              </div>

              <button
                onClick={loadAdminStudents}
                className="px-3 py-1.5 rounded-lg bg-blue-600/30 border border-blue-500/40 hover:bg-blue-600/50 text-blue-300 text-xs font-bold flex items-center gap-1.5 w-fit"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>إعادة تحميل</span>
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-blue-900/40 text-slate-400">
                    <th className="py-2.5 px-3">اسم الطالب</th>
                    <th className="py-2.5 px-3">البريد الإلكتروني</th>
                    <th className="py-2.5 px-3">المدرسة والمحافظة</th>
                    <th className="py-2.5 px-3">الصف</th>
                    <th className="py-2.5 px-3 text-center">الجواهر</th>
                    <th className="py-2.5 px-3 text-center">💬 مراقبة المحادثات</th>
                    <th className="py-2.5 px-3 text-center">إجراءات الحساب والحظر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-950/60">
                  {/* Current Active Student Row */}
                  <tr className="bg-amber-500/5 font-semibold">
                    <td className="py-3 px-3 text-white flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-[10px]">
                        {studentProfile.name.charAt(0) || 'ط'}
                      </div>
                      <span>{studentProfile.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                        (حسابك)
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-300 font-mono">
                      {currentUser?.email || 'حساب محلي متزامن'}
                    </td>
                    <td className="py-3 px-3 text-slate-300">{studentProfile.school} ({studentProfile.governorate})</td>
                    <td className="py-3 px-3 text-slate-300">{selectedGrade}</td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-amber-400">
                      {gems} 💎
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => handleMonitorStudentChats({ id: currentUser?.uid || 'local', name: studentProfile.name, email: currentUser?.email || '', school: studentProfile.school, governorate: studentProfile.governorate })}
                        className="px-3 py-1.5 bg-[#172344] hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                        <span>عرض المحادثات</span>
                      </button>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => addGems(50, 'مكافأة تشجيعية من الأدمن')}
                        className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-lg text-[11px] font-bold"
                      >
                        +50 💎 مكافأة
                      </button>
                    </td>
                  </tr>

                  {/* Other Registered Firestore Users */}
                  {adminStudentsList.filter(s => s.id !== currentUser?.uid).map((student, idx) => (
                    <tr key={student.id || idx} className="hover:bg-blue-900/10">
                      <td className="py-3 px-3 text-white font-medium flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px]">
                          {(student.name || 'ط').charAt(0)}
                        </div>
                        <span>{student.name || 'طالب مجهول'}</span>
                        {student.banned && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-500/20 text-red-300 border border-red-500/40 font-bold">
                            محظور 🚫
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-300 font-mono">{student.email || 'غير مسجل'}</td>
                      <td className="py-3 px-3 text-slate-300">{student.school || 'مدرسة حكومية'} ({student.governorate || 'القاهرة'})</td>
                      <td className="py-3 px-3 text-slate-300">{student.grade || selectedGrade}</td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-amber-400">
                        {student.gems || 0} 💎
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleMonitorStudentChats(student)}
                          className="px-3 py-1.5 bg-[#172344] hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                          <span>عرض المحادثات</span>
                        </button>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleAdminGrantGems(student.id, student.gems || 0)}
                            className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 rounded-lg text-[11px] font-bold"
                            title="منح 50 جوهرة للطالب"
                          >
                            +50 💎
                          </button>

                          <button
                            onClick={() => handleToggleBanUser(student.id, !!student.banned)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                              student.banned
                                ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/40'
                                : 'bg-red-600/20 text-red-300 border-red-500/40 hover:bg-red-600/40'
                            }`}
                            title={student.banned ? 'إلغاء حظر هذا الحساب' : 'حظر هذا الحساب من دخول المنصة'}
                          >
                            {student.banned ? 'فك الحظر 🔓' : 'حظر 🚫'}
                          </button>

                          <button
                            onClick={() => handleDeleteUser(student.id, student.name)}
                            className="p-1 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
                            title="حذف الطالب نهائياً من قاعدة البيانات"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MONITORED STUDENT CHAT LOGS DRAWER / CARD */}
            {monitoredStudent && (
              <div className="mt-6 pt-6 border-t-2 border-amber-500/40 bg-[#0A0F1D] rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-blue-900/50 gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 font-bold text-lg">
                      💬
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-white text-base">
                          سجل محادثات الطالب: <span className="text-amber-300">{monitoredStudent.name || 'طالب مجهول'}</span>
                        </h4>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${monitoredStudent.banned ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'}`}>
                          {monitoredStudent.banned ? 'محظور 🚫' : 'حساب نشط 🟢'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        البريد: <span className="font-mono text-amber-400">{monitoredStudent.email || 'حساب محلي'}</span> | المدرسة: {monitoredStudent.school || 'مدرسة حكومية'} | المحافظة: {monitoredStudent.governorate || 'القاهرة'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleBanUser(monitoredStudent.id, !!monitoredStudent.banned)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                        monitoredStudent.banned
                          ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/50'
                          : 'bg-red-600/30 text-red-300 border border-red-500/40 hover:bg-red-600/50'
                      }`}
                    >
                      {monitoredStudent.banned ? 'فك حظر الطالب 🔓' : 'حظر الطالب 🚫'}
                    </button>

                    <button
                      onClick={() => {
                        setMonitoredStudent(null);
                        setMonitoredChats([]);
                      }}
                      className="px-3 py-1.5 text-slate-300 hover:text-white rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold flex items-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      <span>إغلاق السجل</span>
                    </button>
                  </div>
                </div>

                {isLoadingChats ? (
                  <div className="py-10 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                    <span>جاري تحميل سجل المحادثات والرسائل من قاعدة بيانات Firestore...</span>
                  </div>
                ) : monitoredChats.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs bg-[#101932] border border-blue-900/40 rounded-xl p-4">
                    <MessageSquare className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-50" />
                    <p className="font-bold text-slate-300">لا توجد محادثات مسجلة لهذا الطالب في قاعدة البيانات حالياً.</p>
                    <p className="text-[11px] text-slate-500 mt-1">يتم حفظ المحادثات تلقائياً في Firestore عند استخدام المعلم الذكي.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4" />
                      <span>جلسات المحادثة المكتشفة ({monitoredChats.length}):</span>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {monitoredChats.map((session, sIdx) => (
                        <div key={session.id || sIdx} className="bg-[#101932] border border-blue-900/60 rounded-xl p-4 space-y-3 shadow-md">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-900/40 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold font-mono">
                                #{sIdx + 1}
                              </span>
                              <div>
                                <h5 className="font-bold text-white text-sm">{session.title || 'محادثة دراسية'}</h5>
                                <span className="text-[10px] text-amber-300 font-medium">
                                  المادة: {session.subject || selectedSubject} ({session.grade || selectedGrade})
                                </span>
                              </div>
                            </div>

                            <div className="text-[10px] font-mono text-slate-400">
                              {session.updatedAt ? new Date(session.updatedAt).toLocaleString('ar-EG') : 'حديثاً'}
                            </div>
                          </div>

                          {/* Message Bubbles Transcript */}
                          <div className="space-y-2.5 max-h-80 overflow-y-auto p-3 scrollbar-thin bg-[#070B16] rounded-xl border border-blue-950">
                            {(session.messages || []).map((msg: any, mIdx: number) => (
                              <div
                                key={mIdx}
                                className={`flex flex-col p-3 rounded-xl text-xs max-w-[92%] ${
                                  msg.role === 'user'
                                    ? 'mr-auto bg-amber-500/15 border border-amber-500/30 text-amber-100'
                                    : 'ml-auto bg-[#14234c] border border-blue-900/60 text-slate-200'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-1 border-b border-white/10 pb-1 text-[10px] font-bold">
                                  <span className={msg.role === 'user' ? 'text-amber-300' : 'text-blue-300'}>
                                    {msg.role === 'user' ? `👤 الطالب (${session.userName || monitoredStudent.name})` : '🤖 المعلم الذكي (M Web AI)'}
                                  </span>
                                  <span className="text-slate-400 font-mono">{msg.timestamp || ''}</span>
                                </div>

                                {msg.image && (
                                  <img src={msg.image} alt="صورة المسألة المرفقة" className="max-w-xs rounded-lg my-1.5 border border-amber-500/40" />
                                )}

                                <div className="whitespace-pre-wrap leading-relaxed font-sans">{msg.content}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AUTH MODAL: Sign In / Sign Up / Admin Access (100100) */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-[#101932] border border-amber-500/40 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setShowAuthModal(false);
                setAuthError(null);
                setAuthSuccess(null);
              }}
              className="absolute top-4 left-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Auth Modal Header Tabs */}
            <div className="flex border-b border-blue-900/60 pb-3 mb-4 gap-2">
              <button
                onClick={() => {
                  setAuthTab('signin');
                  setAuthError(null);
                  setAuthSuccess(null);
                }}
                className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-colors ${
                  authTab === 'signin' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <LogIn className="w-3.5 h-3.5 inline ml-1" />
                <span>تسجيل الدخول</span>
              </button>
              <button
                onClick={() => {
                  setAuthTab('signup');
                  setAuthError(null);
                  setAuthSuccess(null);
                }}
                className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-colors ${
                  authTab === 'signup' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5 inline ml-1" />
                <span>طالب جديد</span>
              </button>
            </div>

            {/* Notifications inside modal */}
            {authError && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-500 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{authError}</span>
              </div>
            )}
            {authSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{authSuccess}</span>
              </div>
            )}

            {/* TAB 1: SIGN IN */}
            {authTab === 'signin' && (
              <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">البريد الإلكتروني:</label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">كلمة المرور:</label>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-amber-500/20"
                >
                  تسجيل الدخول للمنصة
                </button>
                <div className="relative text-center my-3">
                  <span className="bg-[#101932] px-2 text-[11px] text-slate-400 relative z-10">أو</span>
                  <div className="absolute inset-0 top-1/2 border-t border-slate-800"></div>
                </div>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full py-2.5 bg-[#0A0F1D] hover:bg-slate-900 border border-blue-900/60 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2"
                >
                  <span>الدخول السريع بحساب Google</span>
                </button>
              </form>
            )}

            {/* TAB 2: SIGN UP */}
            {authTab === 'signup' && (
              <form onSubmit={handleEmailSignUp} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">الاسم الرباعي للطالب:</label>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={e => setAuthName(e.target.value)}
                    placeholder="أحمد محمد علي"
                    className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">البريد الإلكتروني:</label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">كلمة المرور:</label>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    placeholder="6 أحرف على الأقل"
                    className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">المدرسة:</label>
                    <input
                      type="text"
                      value={authSchool}
                      onChange={e => setAuthSchool(e.target.value)}
                      placeholder="مدرسة المتفوقين"
                      className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">المحافظة:</label>
                    <select
                      value={authGov}
                      onChange={e => setAuthGov(e.target.value)}
                      className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="القاهرة">القاهرة</option>
                      <option value="الجيزة">الجيزة</option>
                      <option value="الإسكندرية">الإسكندرية</option>
                      <option value="الدقهلية">الدقهلية</option>
                      <option value="الشرقية">الشرقية</option>
                      <option value="القليوبية">القليوبية</option>
                      <option value="الغربية">الغربية</option>
                      <option value="المنوفية">المنوفية</option>
                      <option value="أسيوط">أسيوط</option>
                      <option value="سوهاج">سوهاج</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-amber-500/20 mt-2"
                >
                  إنشاء الحساب وبدء المذاكرة 🎓
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* SECRET ADMIN VERIFICATION MODAL (Accessible ONLY by clicking the app logo 3 times consecutively) */}
      {showSecretAdminModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-[#101932] border-2 border-amber-500/50 rounded-3xl p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setShowSecretAdminModal(false);
                setAuthError(null);
                setAdminCodeInput('');
              }}
              className="absolute top-4 left-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 mx-auto mb-3">
                <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
              </div>
              <h3 className="text-base font-black text-white">التحقق من صلاحيات الإدارة</h3>
              <p className="text-xs text-slate-400 mt-1">يرجى إدخال رمز التحقق الخاص للمتابعة</p>
            </div>

            {authError && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-500 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleAdminAccess} className="space-y-4">
              <div>
                <input
                  type="password"
                  required
                  autoFocus
                  value={adminCodeInput}
                  onChange={e => setAdminCodeInput(e.target.value)}
                  placeholder="رمز التحقق..."
                  className="w-full bg-[#0A0F1D] border-2 border-amber-500/50 rounded-xl px-4 py-3 text-sm text-center text-amber-400 font-mono tracking-widest font-black focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSecretAdminModal(false);
                    setAuthError(null);
                    setAdminCodeInput('');
                  }}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-amber-500/20"
                >
                  تأكيد الدخول
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Student Profile / Login Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-[#101932] border border-amber-500/40 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-blue-900/60 mb-4">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <User className="w-5 h-5 text-amber-400" />
                <span>تسجيل بيانات الطالب للشهادات</span>
              </div>
              <button 
                onClick={() => setShowProfileModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  الاسم الرباعي أو الثلاثي للطالب (يظهر في الشهادة الرسمية):
                </label>
                <input 
                  type="text"
                  required
                  value={profileDraft.name}
                  onChange={e => setProfileDraft(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="مثال: أحمد محمود إبراهيم"
                  className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  اسم المدرسة المقيد بها:
                </label>
                <input 
                  type="text"
                  value={profileDraft.school}
                  onChange={e => setProfileDraft(prev => ({ ...prev, school: e.target.value }))}
                  placeholder="مثال: مدرسة المتفوقين أو الشهيد أحمد الثانوية"
                  className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  المحافظة:
                </label>
                <select
                  value={profileDraft.governorate}
                  onChange={e => setProfileDraft(prev => ({ ...prev, governorate: e.target.value }))}
                  className="w-full bg-[#0A0F1D] border border-blue-900/60 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 font-bold"
                >
                  <option value="القاهرة">القاهرة</option>
                  <option value="الجيزة">الجيزة</option>
                  <option value="الإسكندرية">الإسكندرية</option>
                  <option value="الدقهلية">الدقهلية</option>
                  <option value="الشرقية">الشرقية</option>
                  <option value="القليوبية">القليوبية</option>
                  <option value="المنوفية">المنوفية</option>
                  <option value="الغربية">الغربية</option>
                  <option value="البحيرة">البحيرة</option>
                  <option value="كفر الشيخ">كفر الشيخ</option>
                  <option value="دمياط">دمياط</option>
                  <option value="بورسعيد">بورسعيد</option>
                  <option value="الإسماعيلية">الإسماعيلية</option>
                  <option value="السويس">السويس</option>
                  <option value="شمال سيناء">شمال سيناء</option>
                  <option value="جنوب سيناء">جنوب سيناء</option>
                  <option value="بني سويف">بني سويف</option>
                  <option value="الفيوم">الفيوم</option>
                  <option value="المنيا">المنيا</option>
                  <option value="أسيوط">أسيوط</option>
                  <option value="سوهاج">سوهاج</option>
                  <option value="قنا">قنا</option>
                  <option value="الأقصر">الأقصر</option>
                  <option value="أسوان">أسوان</option>
                  <option value="البحر الأحمر">البحر الأحمر</option>
                  <option value="الوادي الجديد">الوادي الجديد</option>
                  <option value="مطروح">مطروح</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-amber-500/20"
                >
                  حفظ البيانات واعتمادها
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Celebratory Notification when New Certificate Unlocked */}
      {newCertificateUnlocked && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in zoom-in-95">
          <div className="w-full max-w-sm bg-[#101932] border-2 border-amber-400 rounded-3xl p-6 text-center shadow-2xl relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-600 flex items-center justify-center text-slate-950 mx-auto mb-4 shadow-lg shadow-amber-500/40 text-2xl">
              🏆
            </div>
            <h3 className="text-xl font-black text-white">مبارك يا بطل! 🎉</h3>
            <p className="text-xs text-amber-300 font-bold mt-1">
              لقد فتحت شهادة تقدير جديدة:
            </p>
            <div className="p-3 rounded-xl bg-[#0A0F1D] border border-amber-500/30 my-3">
              <span className="text-sm font-black text-white block">{newCertificateUnlocked.title}</span>
              <span className="text-xs text-slate-400 block mt-0.5">{newCertificateUnlocked.levelTitle}</span>
            </div>
            <div className="flex gap-2 justify-center mt-4">
              <button
                onClick={() => {
                  setActiveCertificate(newCertificateUnlocked);
                  setNewCertificateUnlocked(null);
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-amber-500/20"
              >
                معاينة وطباعة الشهادة 📜
              </button>
              <button
                onClick={() => setNewCertificateUnlocked(null)}
                className="px-3 py-2 bg-slate-800 text-slate-300 hover:text-white text-xs font-bold rounded-xl"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer with M Web links */}
      <footer className="py-4 border-t border-blue-900/40 bg-[#070B16] text-center text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between px-6 gap-3">
        <div className="flex items-center gap-2">
          <span>M Web AI - منصة المذاكرة والتعليم المصري · بيئة دراسية محفزة من تطوير</span>
          <a 
            href="https://m-web-psi.vercel.app/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-amber-400 hover:underline font-bold inline-flex items-center gap-1"
          >
            شركة M Web <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="flex items-center gap-4 text-[11px]">
          <button
            onClick={handleInstallPWA}
            className="text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1"
          >
            <Smartphone className="w-3 h-3 text-emerald-400" />
            <span>تثبيت PWA</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
