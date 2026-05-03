import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { db, auth, messaging, requestNotificationPermission } from './firebase';
import { doc, setDoc, getDoc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { onMessage } from "firebase/messaging";

// ============================================================
// CẤU HÌNH DANH MỤC & MÀU SẮC
// ============================================================
const CATEGORIES = [
  { id: 'study',   icon: '📚', label: 'Học tập',   color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  { id: 'work',    icon: '💼', label: 'Công việc', color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9' },
  { id: 'goal',    icon: '🎯', label: 'Mục tiêu',  color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
  { id: 'event',   icon: '🎉', label: 'Sự kiện',   color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  { id: 'health',  icon: '💪', label: 'Sức khoẻ',  color: '#ef4444', bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  { id: 'other',   icon: '✨', label: 'Khác',      color: '#ec4899', bg: '#fdf2f8', border: '#fbcfe8', text: '#be185d' },
];

const STATUSES = [
  { id: 'todo',        label: 'Chưa bắt đầu',  icon: '⬜', accent: '#94a3b8' },
  { id: 'in-progress', label: 'Đang thực hiện', icon: '⏳', accent: '#ec4899' }, 
  { id: 'done',        label: 'Hoàn thành',    icon: '✅', accent: '#10b981' },
];

const PRIORITIES = [
  { id: 'low',    label: 'Thấp',   icon: '🟢' },
  { id: 'medium', label: 'Vừa',    icon: '🟡' },
  { id: 'high',   label: 'Cao',    icon: '🔴' },
];

const REACTIONS = ['👍', '❤️', '😂', '🔥', '👏'];

const getCat  = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[5];
const getStat = (id) => STATUSES.find(s => s.id === id)   || STATUSES[0];
const getPri  = (id) => PRIORITIES.find(p => p.id === id) || PRIORITIES[1];

// ============================================================
// HELPERS
// ============================================================
const formatDateToYMD = (dateObj) => {
  const d = new Date(dateObj);
  if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const todayYMD = formatDateToYMD(new Date());

// ============================================================
// MAIN COMPONENT
// ============================================================
const GameRoadmap = ({ user }) => {

  // ── 1. THỜI GIAN ──────────────────────────────────────────
  const now = new Date();
  const currentYear = now.getFullYear();
  const startDate   = new Date(currentYear - 1, 0, 1);
  const endDate     = new Date(currentYear + 1, 11, 31, 23, 59, 59);
  const totalDuration = endDate.getTime() - startDate.getTime();
  const totalDays     = Math.round(totalDuration / (1000 * 60 * 60 * 24));
  const daysArray     = Array.from({ length: totalDays + 1 }, (_, i) => new Date(startDate.getTime() + i * 86400000));

  const yearsData = []; const monthsData = [];
  let tempYear = -1; let tempMonthStr = "";
  daysArray.forEach(date => {
    if (date.getFullYear() !== tempYear) { yearsData.push({ year: date.getFullYear(), count: 1 }); tempYear = date.getFullYear(); }
    else yearsData[yearsData.length - 1].count++;
    const mStr = `${date.getFullYear()}-${date.getMonth()}`;
    if (mStr !== tempMonthStr) { monthsData.push({ month: date.getMonth() + 1, year: date.getFullYear(), count: 1 }); tempMonthStr = mStr; }
    else monthsData[monthsData.length - 1].count++;
  });

  const isNowVisible       = now >= startDate && now <= endDate;
  const nowOffsetPercent   = ((now.getTime() - startDate.getTime()) / totalDuration) * 100;
  const scrollContainerRef = useRef(null);
  const [zoomLevel, setZoomLevel]   = useState(1);      
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCat, setFilterCat]   = useState('all');
  const [filterStat, setFilterStat] = useState('all');

  const dayWidth = Math.max(20, 100 * zoomLevel);

  useEffect(() => {
    if (scrollContainerRef.current && isNowVisible) {
      const containerWidth    = scrollContainerRef.current.clientWidth;
      const totalScrollWidth  = scrollContainerRef.current.scrollWidth;
      const scrollToX         = (nowOffsetPercent / 100) * totalScrollWidth - containerWidth / 2;
      scrollContainerRef.current.scrollLeft = scrollToX;
    }
  }, [nowOffsetPercent, isNowVisible, zoomLevel]);

  const todayLabel = `HÔM NAY (${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')})`;

  // ── 2. STATE & FIRESTORE ───────────────────────────────────
  const [showMobileMap,       setShowMobileMap]       = useState(false);
  const [selectedEventDetail, setSelectedEventDetail] = useState(null);
  const [isDailyModalOpen,    setIsDailyModalOpen]    = useState(false);
  const [quickViewDate,       setQuickViewDate]       = useState(todayYMD);
  const [isDeadlineModalOpen, setIsDeadlineModalOpen] = useState(false);
  const [targetScrollId,      setTargetScrollId]      = useState(null);

  const generateID = () => Math.floor(10000000 + Math.random() * 90000000).toString();

  const [profile, setProfile] = useState({
    avatar:      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200",
    background:  "https://images.unsplash.com/photo-1541562232579-512a21360020?q=80&w=800",
    title:       "TỔNG QUAN LỊCH TRÌNH",
    subtitle:    "v10.6",
    displayName: "Người dùng mới",
    shortId:     "........",
    bio:         "",
  });

  const [events,        setEvents]        = useState([]);
  const [dailySchedule, setDailySchedule] = useState([]);
  const [specialEvents, setSpecialEvents] = useState([]);
  const [friendsList,   setFriendsList]   = useState([]);
  const [friendsData,   setFriendsData]   = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isNotifOpen,   setIsNotifOpen]   = useState(false);

  const [searchFriendId,    setSearchFriendId]    = useState('');
  const [viewingFriendFeed, setViewingFriendFeed] = useState(null);
  const [commentInputs,     setCommentInputs]     = useState({});
  const [replyingTo,        setReplyingTo]        = useState({}); 
  const [activeReactionId,  setActiveReactionId]  = useState(null); // Giải quyết triệt để lỗi thả cảm xúc trên mobile
  const [isLoading,         setIsLoading]         = useState(true);

  useEffect(() => {
    if (viewingFriendFeed && targetScrollId) {
      setTimeout(() => {
        const el = document.getElementById(`public-item-${targetScrollId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('shadow-[0_0_0_4px_rgba(236,72,153,0.5)]');
          setTimeout(() => el.classList.remove('shadow-[0_0_0_4px_rgba(236,72,153,0.5)]'), 2000);
          setTargetScrollId(null);
        }
      }, 500);
    }
  }, [viewingFriendFeed, targetScrollId]);

  useEffect(() => {
    if (!user) return;

    let unsubscribeOnMessage = null;

    // Yêu cầu quyền và lưu FCM Token
    const setupFCM = async () => {
      const token = await requestNotificationPermission();
      if (token) {
        setDoc(doc(db, "users", user.uid), { fcmToken: token }, { merge: true });
      }
    };
    setupFCM();

    // Lắng nghe thông báo ở Foreground
    unsubscribeOnMessage = onMessage(messaging, (payload) => {
      console.log('Nhận thông báo ở foreground:', payload);
      const title = payload.notification?.title || "Thông báo";
      const body = payload.notification?.body || "Bạn có tin nhắn mới";
      alert(`${title}\n${body}`);
    });

    const unsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let loadedProfile = data.profile ? { ...data.profile } : { ...profile };
        let needsSave = false;
        if (!loadedProfile.shortId || loadedProfile.shortId === "........") { loadedProfile.shortId = generateID(); needsSave = true; }
        if (!loadedProfile.displayName) { loadedProfile.displayName = "Người dùng mới"; needsSave = true; }
        if (!loadedProfile.background)  { loadedProfile.background  = loadedProfile.avatar || profile.background; needsSave = true; }
        setProfile(loadedProfile);
        
        if (needsSave) setDoc(doc(db, "users", user.uid), { profile: loadedProfile }, { merge: true });
        
        if (Array.isArray(data.events)) {
          setEvents(data.events.map(ev => ({
            ...ev,
            start:    ev.start && ev.start.toDate ? ev.start.toDate() : new Date(ev.start || Date.now()),
            end:      ev.end && ev.end.toDate   ? ev.end.toDate()   : new Date(ev.end || Date.now()),
            isShared: ev.isShared || false,
            category: ev.category || 'other',
            status:   ev.status   || 'todo',
            priority: ev.priority || 'medium',
            progress: ev.progress ?? 0,
            notes:    ev.notes    || '',
            reactions: ev.reactions || {},
            comments: Array.isArray(ev.comments) ? ev.comments : []
          })));
        } else setEvents([]);
        
        if (Array.isArray(data.dailySchedule)) {
          setDailySchedule(data.dailySchedule.map(t => ({
            ...t,
            startDate: t.startDate || todayYMD,
            time: t.time || "00:00",
            endTime: t.endTime || "",
            repeat: t.repeat || 'none',
            customDays: t.customDays || 1,
            completedDates: Array.isArray(t.completedDates) ? t.completedDates : (t.isDone ? [todayYMD] : []),
            isShared: t.isShared || false,
            reactions: t.reactions || {},
            comments: Array.isArray(t.comments) ? t.comments : []
          })));
        } else setDailySchedule([]);

        if (Array.isArray(data.specialEvents)) setSpecialEvents(data.specialEvents); else setSpecialEvents([]);
        if (Array.isArray(data.friends)) setFriendsList(data.friends); else setFriendsList([]);
        
        if (Array.isArray(data.notifications)) {
            const validNotifs = data.notifications.filter(n => n && n.id);
            setNotifications(validNotifs.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
        } else setNotifications([]);

      } else {
        const newProfile = { ...profile, shortId: generateID() };
        setProfile(newProfile);
        saveToCloud(newProfile, [], [], [], [], []);
      }
      setIsLoading(false);
    });
    return () => {
      unsub();
      if (unsubscribeOnMessage) unsubscribeOnMessage();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const fetchFriendsData = async () => {
      if (friendsList.length === 0) { setFriendsData([]); return; }
      const dataArr = [];
      for (const fUid of friendsList) {
        const fDoc = await getDoc(doc(db, "users", fUid));
        if (fDoc.exists()) {
          const fProfile = fDoc.data().profile;
          if (!fProfile.background) fProfile.background = fProfile.avatar;
          dataArr.push({ uid: fUid, ...fProfile });
        }
      }
      setFriendsData(dataArr);
    };
    fetchFriendsData();
  }, [friendsList]);

  const saveToCloud = async (newProfile, newEvents = events, newFriends = friendsList, newDaily = dailySchedule, newNotifs = notifications, newSpecials = specialEvents) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), { 
        profile: newProfile, 
        events: newEvents, 
        friends: newFriends,
        dailySchedule: newDaily,
        notifications: newNotifs,
        specialEvents: newSpecials
      }, { merge: true });
    } catch (error) { console.error("Lỗi đồng bộ:", error); }
  };

  // ── 3. FILTERED EVENTS ─────────────────────────────────────
  const filteredEvents = useMemo(() => events.filter(ev => {
    const matchCat   = filterCat  === 'all' || ev.category === filterCat;
    const matchStat  = filterStat === 'all' || ev.status   === filterStat;
    const matchSearch = !searchQuery || (ev.title || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchStat && matchSearch;
  }), [events, filterCat, filterStat, searchQuery]);

  // ── 4. DAILY SCHEDULE LOGIC ────────────────────────────────
  const checkTaskOnDate = (task, targetDateStr) => {
    if (!task || !task.startDate) return false; 
    const start = new Date(task.startDate); start.setHours(0,0,0,0);
    const target = new Date(targetDateStr); target.setHours(0,0,0,0);
    
    if (isNaN(start.getTime()) || isNaN(target.getTime())) return false;
    if (target < start) return false; 

    const diffTime = Math.abs(target - start);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (task.repeat === 'none')     return diffDays === 0;
    if (task.repeat === 'daily')    return true;
    if (task.repeat === 'weekly')   return diffDays % 7 === 0;
    if (task.repeat === 'biweekly') return diffDays % 14 === 0;
    if (task.repeat === 'yearly')   return start.getDate() === target.getDate() && start.getMonth() === target.getMonth();
    if (task.repeat === 'custom')   return diffDays % (task.customDays || 1) === 0;
    
    return false;
  };

  const uniqueScheduledDates = useMemo(() => {
    const dates = new Set(dailySchedule.map(t => t.startDate).filter(Boolean));
    dates.add(todayYMD);
    return Array.from(dates).sort();
  }, [dailySchedule]);

  const quickViewSchedule = useMemo(() => {
    return dailySchedule
      .filter(t => checkTaskOnDate(t, quickViewDate))
      .sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00")); 
  }, [dailySchedule, quickViewDate]);

  // ── SIDEBAR SPECIAL EVENTS LOGIC ──
  const { todaySpecials, nextSpecial } = useMemo(() => {
    const td = new Date();
    const tMonth = td.getMonth() + 1;
    const tDay = td.getDate();

    const todayList = [];
    let nextEvt = null;
    let minDiff = Infinity;

    specialEvents.forEach(ev => {
        if(!ev.date) return;
        const d = new Date(ev.date);
        if(isNaN(d.getTime())) return;

        const m = d.getMonth() + 1;
        const day = d.getDate();

        if (m === tMonth && day === tDay) todayList.push(ev);

        const nextDate = new Date(td.getFullYear(), m - 1, day);
        if (nextDate < td && (m !== tMonth || day !== tDay)) nextDate.setFullYear(td.getFullYear() + 1);

        const diff = nextDate.getTime() - td.getTime();
        if (diff > 0 && diff < minDiff) {
            minDiff = diff;
            nextEvt = { ...ev, nextDate, daysLeft: Math.ceil(diff / (1000 * 3600 * 24)) };
        }
    });
    return { todaySpecials: todayList, nextSpecial: nextEvt };
  }, [specialEvents]);

  // ── 5. SETTINGS MODAL STATE ────────────────────────────────
  const [isSettingsOpen,   setIsSettingsOpen]   = useState(false);
  const [activeTab,        setActiveTab]        = useState('profile');
  const [profileFormData,  setProfileFormData]  = useState(profile); 
  const [eventFormData,    setEventFormData]    = useState({
    title: '', startDate: '', endDate: '', rewards: '', notes: '',
    category: 'study', status: 'todo', priority: 'medium', progress: 0,
  });

  const [dailyViewDate, setDailyViewDate] = useState(todayYMD);
  const [dailyForm, setDailyForm] = useState({ 
    startDate: todayYMD, time: '', endTime: '', task: '', repeat: 'none', customDays: 1, isShared: false 
  });

  const [specialForm, setSpecialForm] = useState({ title: '', date: todayYMD, type: 'birthday' });

  const filteredSettingsDailySchedule = useMemo(() => {
    return dailySchedule
      .filter(t => checkTaskOnDate(t, dailyViewDate))
      .sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00")); 
  }, [dailySchedule, dailyViewDate]);

  // ── 6. IMAGE CROP ──────────────────────────────────────────
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [upImg,           setUpImg]           = useState();
  const [crop,            setCrop]            = useState({ unit: '%', width: 50, x: 25, y: 25 });
  const [cropAspectRatio, setCropAspectRatio] = useState(9/16);
  const [completedCrop,   setCompletedCrop]   = useState(null);
  const imgRef    = useRef(null);
  const [cropTarget, setCropTarget] = useState('');

  const processImageBlob = (blob, target) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => setUpImg(reader.result));
    reader.readAsDataURL(blob);
    setCropTarget(target);
    if      (target === 'avatar')     { setCropAspectRatio(1/1);  setCrop({ unit: '%', width: 50, aspect: 1/1 }); }
    else if (target === 'background') { setCropAspectRatio(21/9); setCrop({ unit: '%', width: 80, aspect: 21/9 }); }
    else                              { setCropAspectRatio(21/9); setCrop({ unit: '%', width: 80, aspect: 21/9 }); }
    setIsCropModalOpen(true);
  };

  const onSelectFile = (e, target) => {
    if (e.target.files?.length > 0) { processImageBlob(e.target.files[0], target); e.target.value = ''; }
  };

  const handlePasteButtonClick = async (target) => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgTypes = item.types.filter(t => t.startsWith('image/'));
        if (imgTypes.length > 0) { processImageBlob(await item.getType(imgTypes[0]), target); return; }
      }
      alert('Không tìm thấy ảnh trong thiết bị nhớ tạm (Clipboard)!');
    } catch { alert('Trình duyệt chặn Clipboard. Vui lòng sử dụng phím tắt Ctrl+V!'); }
  };

  useEffect(() => {
    const handleGlobalPaste = (e) => {
      if (!isSettingsOpen || isCropModalOpen || activeTab === 'friends' || activeTab === 'daily') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          processImageBlob(items[i].getAsFile(), activeTab === 'profile' ? 'background' : 'event');
          break;
        }
      }
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [isSettingsOpen, isCropModalOpen, activeTab]);

  const handleCropComplete = async () => {
    if (!completedCrop || !imgRef.current) return;
    const image  = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth  / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width  = completedCrop.width;
    canvas.height = completedCrop.height;
    canvas.getContext('2d').drawImage(image,
      completedCrop.x * scaleX, completedCrop.y * scaleY,
      completedCrop.width * scaleX, completedCrop.height * scaleY,
      0, 0, completedCrop.width, completedCrop.height);
    const url = canvas.toDataURL('image/jpeg', 0.85);
    if      (cropTarget === 'event')      setEventFormData(p => ({ ...p, croppedImage: url }));
    else if (cropTarget === 'avatar')     setProfileFormData(p => ({ ...p, avatar: url }));
    else if (cropTarget === 'background') setProfileFormData(p => ({ ...p, background: url }));
    setIsCropModalOpen(false); setUpImg(null);
  };

  // ── 7. HANDLERS TÀI KHOẢN & SỰ KIỆN ──
  const handleSaveProfile = () => {
    const upd = {
      ...profile,
      displayName: profileFormData.displayName,
      avatar:      profileFormData.avatar,
      background:  profileFormData.background,
      title:       (profileFormData.title || "").toUpperCase(),
      subtitle:    (profileFormData.subtitle || "").toUpperCase(),
      bio:         profileFormData.bio || '',
    };
    setProfile(upd); saveToCloud(upd, events, friendsList, dailySchedule, notifications, specialEvents);
    alert("Cấu hình đã được lưu thành công.");
  };

  const handleAddEvent = (e) => {
    e.preventDefault();
    const startObj = new Date(eventFormData.startDate);
    const endObj   = new Date(eventFormData.endDate);
    endObj.setHours(23, 59, 59, 999);
    const pad = n => n.toString().padStart(2, '0');
    const dateStr = `${pad(startObj.getDate())}/${pad(startObj.getMonth()+1)} — ${pad(endObj.getDate())}/${pad(endObj.getMonth()+1)}`;

    let assignedRow = 0, isRowOccupied = true;
    while (isRowOccupied) {
      const overlap = events.find(ev => ev.trackRow === assignedRow && startObj <= ev.end && endObj >= ev.start);
      if (overlap) assignedRow++; else isRowOccupied = false;
    }

    const newEvent = {
      id:       "ev_" + Date.now(),
      title:    eventFormData.title,
      dateStr,
      start:    startObj,
      end:      endObj,
      image:    eventFormData.croppedImage || "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400&q=80",
      rewards:  eventFormData.rewards,
      notes:    eventFormData.notes,
      trackRow: assignedRow,
      isShared: false,
      category: eventFormData.category,
      status:   eventFormData.status,
      priority: eventFormData.priority,
      progress: Number(eventFormData.progress),
      reactions: {},
      comments: []
    };

    const updated = [...events, newEvent];
    setEvents(updated); saveToCloud(profile, updated, friendsList, dailySchedule, notifications, specialEvents);
    setEventFormData({ title: '', startDate: '', endDate: '', rewards: '', notes: '', category: 'study', status: 'todo', priority: 'medium', progress: 0, croppedImage: null });
  };

  const handleUpdateEventField = (eventId, field, value) => {
    const updated = events.map(ev => ev.id === eventId ? { ...ev, [field]: value } : ev);
    setEvents(updated); saveToCloud(profile, updated, friendsList, dailySchedule, notifications, specialEvents);
    setSelectedEventDetail(updated.find(e => e.id === eventId));
  };

  const handleDeleteEvent = (id) => {
    const updated = events.filter(e => e.id !== id);
    setEvents(updated); saveToCloud(profile, updated, friendsList, dailySchedule, notifications, specialEvents);
    setSelectedEventDetail(null);
  };

  const handleToggleShareEvent = (eventId) => {
    const updated = events.map(ev => ev.id === eventId ? { ...ev, isShared: !ev.isShared } : ev);
    setEvents(updated); saveToCloud(profile, updated, friendsList, dailySchedule, notifications, specialEvents);
    setSelectedEventDetail(updated.find(e => e.id === eventId));
  };

  // ── HANDLERS CHO LỊCH NGÀY ──
  const handleAddDailyTask = (e) => {
    e.preventDefault();
    if (!dailyForm.time || !dailyForm.task || !dailyForm.startDate) return;
    const newTask = {
      id: "dl_" + Date.now(),
      startDate: dailyForm.startDate,
      time: dailyForm.time,
      endTime: dailyForm.endTime,
      task: dailyForm.task,
      repeat: dailyForm.repeat,
      customDays: Number(dailyForm.customDays) || 1,
      isShared: dailyForm.isShared,
      completedDates: [],
      reactions: {},
      comments: []
    };
    
    const updated = [...dailySchedule, newTask];
    setDailySchedule(updated);
    saveToCloud(profile, events, friendsList, updated, notifications, specialEvents);
    setDailyForm(p => ({ ...p, time: '', endTime: '', task: '' }));
  };

  const handleToggleDailyTask = (id, targetDateStr) => {
    const updated = dailySchedule.map(t => {
      if (t.id === id) {
        const isCompleted = (t.completedDates || []).includes(targetDateStr);
        const newCompleted = isCompleted 
          ? (t.completedDates || []).filter(d => d !== targetDateStr)
          : [...(t.completedDates || []), targetDateStr];
        return { ...t, completedDates: newCompleted };
      }
      return t;
    });
    setDailySchedule(updated);
    saveToCloud(profile, events, friendsList, updated, notifications, specialEvents);
  };

  const handleDeleteDailyTask = (id) => {
    const updated = dailySchedule.filter(t => t.id !== id);
    setDailySchedule(updated);
    saveToCloud(profile, events, friendsList, updated, notifications, specialEvents);
  };

  const handleToggleShareDailyTask = (id) => {
    const updated = dailySchedule.map(t => t.id === id ? { ...t, isShared: !t.isShared } : t);
    setDailySchedule(updated);
    saveToCloud(profile, events, friendsList, updated, notifications, specialEvents);
  };

  const handleAddSpecialEvent = (e) => {
    e.preventDefault();
    if (!specialForm.title || !specialForm.date) return;
    const newEvt = { id: "sp_" + Date.now(), title: specialForm.title, date: specialForm.date, type: specialForm.type };
    const updated = [...specialEvents, newEvt].sort((a,b) => new Date(a.date) - new Date(b.date));
    setSpecialEvents(updated);
    saveToCloud(profile, events, friendsList, dailySchedule, notifications, updated);
    setSpecialForm({ title: '', date: todayYMD, type: 'birthday' });
  };

  const handleDeleteSpecialEvent = (id) => {
    const updated = specialEvents.filter(x => x.id !== id);
    setSpecialEvents(updated);
    saveToCloud(profile, events, friendsList, dailySchedule, notifications, updated);
  };

  // ── BẠN BÈ: GỬI YÊU CẦU & CHẤP NHẬN/TỪ CHỐI & XOÁ BẠN ──
  const handleAddFriend = async (e) => {
    e.preventDefault();
    if (searchFriendId === profile.shortId) { alert("Bạn không thể tự kết bạn với chính mình!"); return; }

    const q = query(collection(db, "users"), where("profile.shortId", "==", searchFriendId));
    const snap = await getDocs(q);
    if (snap.empty) { alert("Không tìm thấy người dùng này trên hệ thống!"); return; }

    let targetUid = "";
    let targetData = null;
    snap.forEach(d => { targetUid = d.id; targetData = d.data(); });

    if (friendsList.includes(targetUid)) { alert("Người này đã là bạn bè của bạn!"); return; }

    const targetNotifs = targetData.notifications || [];
    const alreadySent = targetNotifs.some(n => n.itemType === 'friend_request' && n.fromUid === user.uid && !n.handled);
    if (alreadySent) { alert("Bạn đã gửi lời mời rồi, đang chờ đối phương phản hồi!"); return; }

    const newNotif = {
      id: "fr_" + Date.now(),
      fromUid: user.uid,
      fromName: profile.displayName,
      fromAvatar: profile.avatar,
      text: "muốn kết bạn với bạn",
      read: false,
      createdAt: new Date().toISOString(),
      itemType: "friend_request",
      handled: false
    };

    await setDoc(doc(db, "users", targetUid), { notifications: [...targetNotifs, newNotif] }, { merge: true });
    setSearchFriendId('');
    alert("✅ Đã gửi lời mời kết bạn! Vui lòng chờ đối phương xác nhận.");
  };

  const handleAcceptFriend = async (notif) => {
    try {
      const newFriends = [...friendsList, notif.fromUid];
      const newNotifs = notifications.map(n => n.id === notif.id ? { ...n, handled: true, read: true } : n);
      setFriendsList(newFriends);
      setNotifications(newNotifs);
      await setDoc(doc(db, "users", user.uid), { friends: newFriends, notifications: newNotifs }, { merge: true });

      const targetRef = doc(db, "users", notif.fromUid);
      const targetSnap = await getDoc(targetRef);
      if (targetSnap.exists()) {
        const targetData = targetSnap.data();
        const targetFriends = targetData.friends || [];
        const targetNotifs = targetData.notifications || [];
        if (!targetFriends.includes(user.uid)) targetFriends.push(user.uid);
        
        targetNotifs.push({
          id: "acc_" + Date.now(),
          fromUid: user.uid,
          fromName: profile.displayName,
          fromAvatar: profile.avatar,
          text: "đã chấp nhận lời mời kết bạn của bạn 🎉",
          read: false,
          createdAt: new Date().toISOString(),
          itemType: "system"
        });
        await setDoc(targetRef, { friends: targetFriends, notifications: targetNotifs }, { merge: true });
      }
      alert("Đã kết bạn thành công!");
    } catch(e) { console.error(e); }
  };

  const handleRejectFriend = async (notif) => {
    const newNotifs = notifications.map(n => n.id === notif.id ? { ...n, handled: true, read: true } : n);
    setNotifications(newNotifs);
    await setDoc(doc(db, "users", user.uid), { notifications: newNotifs }, { merge: true });
  };

  const handleRemoveFriend = async (friendUid) => {
    if (!window.confirm("Bạn có chắc chắn muốn hủy kết bạn với người này? Thao tác này không thể hoàn tác.")) return;
    
    const newFriends = friendsList.filter(id => id !== friendUid);
    setFriendsList(newFriends);
    await setDoc(doc(db, "users", user.uid), { friends: newFriends }, { merge: true });

    const targetRef = doc(db, "users", friendUid);
    const targetSnap = await getDoc(targetRef);
    if (targetSnap.exists()) {
      const targetData = targetSnap.data();
      const targetFriends = (targetData.friends || []).filter(id => id !== user.uid);
      await setDoc(targetRef, { friends: targetFriends }, { merge: true });
    }
  };

  // ── TƯƠNG TÁC: CẢM XÚC, BÌNH LUẬN & TRẢ LỜI ──
  const handleInteract = async (targetUid, itemId, itemType, actionType, payload, replyData = null, targetViewDate = null) => {
    if(!user) return;
    try {
      const docRef = doc(db, "users", targetUid);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return;
      const d = docSnap.data();
      
      const targetList = Array.isArray(d[itemType === 'event' ? 'events' : 'dailySchedule']) ? d[itemType === 'event' ? 'events' : 'dailySchedule'] : [];
      const itemIndex = targetList.findIndex(x => x.id === itemId);
      if (itemIndex === -1) return;

      const item = targetList[itemIndex];
      let notifs = Array.isArray(d.notifications) ? d.notifications : [];
      let notifMsgForOwner = "";

      if (actionType === 'reaction') {
        if (!item.reactions) item.reactions = {};
        if (item.reactions[user.uid] === payload) delete item.reactions[user.uid];
        else {
          item.reactions[user.uid] = payload;
          notifMsgForOwner = `đã thả ${payload} vào lịch trình của bạn.`;
        }
      } else if (actionType === 'comment') {
        if (!item.comments) item.comments = [];
        item.comments.push({
          id: Date.now().toString(), uid: user.uid, displayName: profile.displayName, avatar: profile.avatar,
          text: payload, createdAt: new Date().toISOString(),
          replyToUid: replyData ? replyData.uid : null, replyToName: replyData ? replyData.displayName : null
        });

        setCommentInputs(p => ({ ...p, [itemId]: '' })); 
        setReplyingTo(p => { const newP = {...p}; delete newP[itemId]; return newP; });
        
        notifMsgForOwner = (replyData && replyData.uid !== targetUid) 
          ? `đã bình luận trong bài viết của bạn: "${payload}"` 
          : (replyData ? `đã trả lời bình luận của bạn: "${payload}"` : `đã bình luận: "${payload}"`);
      }

      if (targetUid !== user.uid && notifMsgForOwner) {
        notifs.push({
          id: Date.now().toString() + "_1", fromUid: user.uid, fromName: profile.displayName, fromAvatar: profile.avatar,
          text: notifMsgForOwner, read: false, createdAt: new Date().toISOString(),
          itemId: itemId, itemType: itemType, targetDate: targetViewDate, postOwnerUid: targetUid
        });
      }

      await setDoc(docRef, { 
        [itemType === 'event' ? 'events' : 'dailySchedule']: targetList,
        notifications: notifs
      }, { merge: true });

      if (actionType === 'comment' && replyData && replyData.uid !== user.uid && replyData.uid !== targetUid) {
        const repliedUserRef = doc(db, "users", replyData.uid);
        const repliedUserSnap = await getDoc(repliedUserRef);
        if (repliedUserSnap.exists()) {
            const ruData = repliedUserSnap.data();
            const ruNotifs = Array.isArray(ruData.notifications) ? ruData.notifications : [];
            ruNotifs.push({
                id: Date.now().toString() + "_2", fromUid: user.uid, fromName: profile.displayName, fromAvatar: profile.avatar,
                text: `đã trả lời bình luận của bạn: "${payload}"`, read: false, createdAt: new Date().toISOString(),
                itemId: itemId, itemType: itemType, targetDate: targetViewDate, postOwnerUid: targetUid
            });
            await setDoc(repliedUserRef, { notifications: ruNotifs }, { merge: true });
        }
      }

      if (viewingFriendFeed && viewingFriendFeed.uid === targetUid) {
        setViewingFriendFeed(prev => {
          const newFeed = {...prev};
          if(itemType === 'event'){
            newFeed.events = targetList.filter(ev => ev.isShared).map(ev => ({ ...ev, start: new Date(ev.start), end: new Date(ev.end) })).sort((a,b) => a.start - b.start);
          } else {
            newFeed.daily = targetList.filter(t => t.isShared && checkTaskOnDate(t, prev.viewDate)).sort((a,b) => (a.time||"").localeCompare(b.time||""));
          }
          return newFeed;
        });
      }
    } catch (e) { console.error("Lỗi tương tác:", e); }
  };

  const handleViewFriendFeed = async (friendUid, overrideDate = null) => {
    if (friendUid !== user.uid && !friendsList.includes(friendUid)) {
      alert("Chỉ bạn bè mới có thể xem trang công khai của nhau!");
      return;
    }

    const fDoc = await getDoc(doc(db, "users", friendUid));
    if (!fDoc.exists()) return;
    const fData = fDoc.data(); let fProfile = fData.profile;
    if (!fProfile.background) fProfile.background = fProfile.avatar;
    
    const sharedEvents = (Array.isArray(fData.events) ? fData.events : []).filter(ev => ev.isShared).map(ev => ({
      ...ev, start: ev.start && ev.start.toDate ? ev.start.toDate() : new Date(ev.start), end: ev.end && ev.end.toDate ? ev.end.toDate() : new Date(ev.end),
    })).sort((a, b) => a.start - b.start);

    const viewDate = overrideDate || todayYMD;
    const sharedDaily = (Array.isArray(fData.dailySchedule) ? fData.dailySchedule : [])
      .filter(t => t.isShared && checkTaskOnDate(t, viewDate))
      .sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));

    setViewingFriendFeed({ uid: friendUid, profile: fProfile, events: sharedEvents, daily: sharedDaily, viewDate: viewDate });
    setIsSettingsOpen(false);
  };

  // 🔥 XỬ LÝ CLICK THÔNG BÁO VÀ AUTO-SCROLL ĐẾN POST
  const handleNotifClick = async (notif) => {
    if (notif.itemType === 'friend_request') return; 

    const updated = notifications.map(n => n.id === notif.id ? {...n, read: true} : n);
    setNotifications(updated);
    setDoc(doc(db, "users", user.uid), { notifications: updated }, { merge: true });
    
    setIsNotifOpen(false);

    const targetUid = notif.postOwnerUid || user.uid; 
    let targetDate = todayYMD;
    
    if (notif.itemType === 'daily') {
      targetDate = notif.targetDate || formatDateToYMD(notif.createdAt);
    }
    
    await handleViewFriendFeed(targetUid, targetDate);
    setTargetScrollId(notif.itemId); 
  };

  const markNotifsRead = async () => {
    setIsNotifOpen(!isNotifOpen);
    if (isNotifOpen && notifications.some(n => !n.read)) {
      const updated = notifications.map(n => ({...n, read: true}));
      setNotifications(updated);
      await setDoc(doc(db, "users", user.uid), { notifications: updated }, { merge: true });
    }
  };

  const handleLogout = () => signOut(auth).catch(console.error);

  // ── 8. HELPERS CHỈ SỐ ─────────────────────────────────────────────
  const getDaysLeft = (ev) => {
    if (!ev.end) return 0;
    return Math.ceil((ev.end.getTime() - now.getTime()) / 86400000);
  };
  const getEventProgress = (ev) => {
    if (ev.status === 'done') return 100;
    if (ev.status === 'todo') return 0;
    return ev.progress || 0;
  };

  const stats = useMemo(() => {
    const safeEvents = Array.isArray(events) ? events : [];
    const total     = safeEvents.length;
    const done      = safeEvents.filter(e => e.status === 'done').length;
    const inProg    = safeEvents.filter(e => e.status === 'in-progress').length;
    const upcoming  = safeEvents.filter(e => e.start && e.start > now).length;
    const catBreakdown = CATEGORIES.map(c => ({ ...c, count: safeEvents.filter(e => e.category === c.id).length }));
    return { total, done, inProg, upcoming, catBreakdown };
  }, [events]);

  const urgentEvents = useMemo(() => {
    return (Array.isArray(events) ? events : []).filter(ev => { 
      if(!ev.end) return false;
      const d = getDaysLeft(ev); 
      return d >= 0 && d <= 3 && ev.status !== 'done'; 
    });
  }, [events]);

  const validNotifs = Array.isArray(notifications) ? notifications.filter(n => n && n.id) : [];
  const unreadNotifs = validNotifs.filter(n => n.read === false).length;
  // Trích xuất list kết bạn đang chờ (chưa handled)
  const pendingRequests = validNotifs.filter(n => n.itemType === 'friend_request' && !n.handled);

  // ── 9. RENDER ──────────────────────────────────────────────
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-pink-50">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-pink-600 font-bold text-sm tracking-widest uppercase">Đang tải dữ liệu...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-2 md:p-4 font-sans select-none" style={{ background: 'linear-gradient(135deg, #fdf2f8 0%, #eff6ff 50%, #fdf2f8 100%)' }}>

      {/* ══ KHUNG APP ══════════════════════════════════════════ */}
      <div className="w-full max-w-[1500px] h-[96vh] md:h-[820px] rounded-3xl flex flex-col relative overflow-hidden"
        style={{ background: 'rgba(255, 255, 255, 0.95)', border: '2px solid #fbcfe8', boxShadow: '0 10px 40px rgba(236, 72, 153, 0.15)' }}>

        {/* ═══ HEADER (Z-INDEX 40) ═══════════════════════════ */}
        <div className="h-16 flex items-center justify-between px-4 border-b shrink-0 shadow-sm z-40 relative"
          style={{ background: 'linear-gradient(90deg, #fce7f3, #e0e7ff)', borderColor: '#fbcfe8' }}>

          <div className="flex items-center gap-3">
            <div className="relative">
              <img src={profile.avatar} alt="avatar"
                className="w-10 h-10 rounded-full object-cover border-2 shadow-sm"
                style={{ borderColor: '#ec4899', background: '#fff' }} />
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white"></div>
            </div>
            <div>
              <div className="text-indigo-900 font-black text-[14px] leading-tight drop-shadow-sm">{profile.displayName}</div>
              <div className="text-[10px] font-bold mt-0.5 px-1.5 py-0.5 rounded-full inline-block" style={{ color: '#be185d', background: 'rgba(236, 72, 153, 0.15)' }}>ID: {profile.shortId}</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2">
            
            <button onClick={() => setIsDailyModalOpen(true)}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase px-2.5 md:px-4 py-2 rounded-xl transition-all shadow-sm hover:scale-105 hover:shadow-md cursor-pointer"
              style={{ background: '#e0e7ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}>
              📅 <span className="hidden md:inline">Lịch Ngày</span>
            </button>

            <button onClick={() => setIsDeadlineModalOpen(true)}
              className="relative flex items-center gap-1.5 text-[11px] font-black uppercase px-2.5 md:px-4 py-2 rounded-xl transition-all shadow-sm hover:scale-105 hover:shadow-md cursor-pointer"
              style={{ background: urgentEvents.length > 0 ? '#fee2e2' : '#fef3c7', color: urgentEvents.length > 0 ? '#dc2626' : '#d97706', border: `1px solid ${urgentEvents.length > 0 ? '#fecaca' : '#fde68a'}` }}>
              ⏰ <span className="hidden md:inline">Hạn Chót</span>
              {urgentEvents.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-bounce shadow-md">
                  {urgentEvents.length}
                </span>
              )}
            </button>

            {/* THÔNG BÁO */}
            <div className="relative z-[999]">
              <button onClick={markNotifsRead} className="relative flex items-center justify-center w-8 md:w-9 h-8 md:h-9 rounded-xl bg-white border border-pink-200 text-pink-500 shadow-sm hover:scale-105 transition-all cursor-pointer">
                🔔
                {unreadNotifs > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 rounded-full min-w-[1.25rem] px-1 h-5 text-white text-[10px] font-black flex items-center justify-center shadow-md animate-bounce">{unreadNotifs}</span>}
              </button>
              
              {isNotifOpen && (
                <div className="absolute top-12 right-0 w-72 md:w-80 bg-white border-2 border-pink-100 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col">
                  <div className="bg-pink-50 px-4 py-2.5 text-[12px] font-black text-pink-600 border-b border-pink-100 flex justify-between items-center">
                    <span>Thông báo của bạn</span>
                    {unreadNotifs > 0 && <span className="bg-pink-200 text-pink-700 px-2 py-0.5 rounded-full text-[9px]">{unreadNotifs} Mới</span>}
                  </div>
                  <div className="max-h-72 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {validNotifs.length === 0 ? <div className="text-[12px] text-center text-slate-400 p-6 font-bold">Chưa có thông báo nào.</div> :
                     validNotifs.map(n => {
                       if (n.itemType === 'friend_request') {
                         return (
                           <div key={n.id} className="flex flex-col gap-2 p-3 rounded-xl transition-colors bg-blue-50/50 border border-blue-100 mb-1 shadow-sm">
                             <div className="flex gap-3 items-center">
                               <img src={n.fromAvatar} alt="" className="w-10 h-10 rounded-full object-cover border border-white shadow-sm shrink-0"/>
                               <div className="text-[12px] text-slate-600 leading-snug flex-1">
                                 <span className="font-black text-slate-800">{n.fromName}</span> {n.text}
                               </div>
                             </div>
                             {!n.handled && (
                               <div className="flex gap-2 ml-12 mt-1">
                                 <button onClick={(e) => { e.stopPropagation(); handleAcceptFriend(n); }} className="flex-1 bg-blue-500 text-white py-1.5 rounded-lg text-[11px] font-black shadow-sm cursor-pointer hover:bg-blue-600 transition-colors">Đồng ý</button>
                                 <button onClick={(e) => { e.stopPropagation(); handleRejectFriend(n); }} className="flex-1 bg-white border border-slate-200 text-slate-600 py-1.5 rounded-lg text-[11px] font-black shadow-sm cursor-pointer hover:bg-slate-50 transition-colors">Từ chối</button>
                               </div>
                             )}
                           </div>
                         );
                       }
                       // Thông báo bình thường
                       return (
                         <div key={n.id} onClick={() => handleNotifClick(n)} className={`flex gap-3 p-2.5 rounded-xl transition-colors cursor-pointer border ${n.read ? 'bg-white border-transparent hover:bg-slate-50' : 'bg-pink-50/50 border-pink-100 hover:bg-pink-50'}`}>
                           <img src={n.fromAvatar} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0 shadow-sm"/>
                           <div className="text-[12px] text-slate-600 leading-snug flex-1">
                             <span className="font-black text-slate-800">{n.fromName}</span> {n.text}
                             <div className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-wider">{new Date(n.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(n.createdAt).toLocaleDateString()}</div>
                           </div>
                           {!n.read && <div className="w-2 h-2 rounded-full bg-pink-500 self-center shrink-0"></div>}
                         </div>
                       )
                     })}
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => { setProfileFormData(profile); setIsSettingsOpen(true); }}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase px-2.5 md:px-4 py-2 md:py-2.5 rounded-xl transition-all shadow-sm hover:scale-105 hover:shadow-md cursor-pointer"
              style={{ background: '#ffffff', color: '#db2777', border: '1px solid #fbcfe8' }}>
              ⚙️ <span className="hidden md:inline">Cài đặt</span>
            </button>

            <button onClick={handleLogout}
              className="flex items-center justify-center w-8 md:w-9 h-8 md:h-9 rounded-xl transition-all shadow-sm hover:scale-105 cursor-pointer text-lg"
              style={{ background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca' }}>
              ⏏
            </button>
          </div>
        </div>

        {/* ═══ BODY ══════════════════════════════════════════════ */}
        <div className="flex flex-1 overflow-hidden gap-3 p-3 bg-slate-50 z-10">

          {/* ── SIDEBAR ── */}
          <div className={`w-full md:w-[280px] shrink-0 flex flex-col gap-3 ${showMobileMap ? 'hidden md:flex' : 'flex'}`}>

            {/* Profile Card */}
            <div className="relative rounded-2xl overflow-hidden flex-none h-[200px] shadow-sm border-2 border-pink-100 bg-white">
              <img src={profile.background} alt="bg" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0.1) 60%, transparent 100%)' }}></div>
              <div className="absolute bottom-0 left-0 right-0 p-4 z-10 pointer-events-none">
                <div className="text-white font-black text-[17px] leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{profile.title}</div>
                <div className="text-[12px] font-bold mt-0.5 text-pink-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{profile.subtitle}</div>
                {profile.bio && <div className="text-[11px] font-medium text-slate-800 mt-1.5 line-clamp-2 bg-white/80 p-1.5 rounded-lg border border-white shadow-sm pointer-events-auto">{profile.bio}</div>}
              </div>
              
              <div className="md:hidden absolute inset-0 flex items-center justify-center bg-black/10 transition-opacity z-20">
                <button onClick={() => setShowMobileMap(true)}
                  className="bg-pink-500 text-white font-black px-6 py-3 rounded-full text-sm shadow-[0_4px_15px_rgba(236,72,153,0.4)] border-2 border-white cursor-pointer active:scale-95">
                  XEM LỊCH TRÌNH 
                </button>
              </div>
            </div>

            {/* 🔥 SỰ KIỆN QUAN TRỌNG */}
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
              
              <div className="rounded-2xl p-4 bg-gradient-to-br from-pink-50 to-white shadow-sm border border-pink-100">
                <div className="text-[11px] font-black text-pink-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <span className="text-sm">🎈</span> Sự Kiện Hôm Nay
                </div>
                {todaySpecials.length === 0 ? (
                  <div className="text-[12px] text-slate-400 italic font-medium py-4 text-center border border-dashed border-pink-200 rounded-xl">
                    Không có kỷ niệm nào hôm nay.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {todaySpecials.map(ev => (
                      <div key={ev.id} className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-pink-100 shadow-sm">
                        <div className="text-xl shrink-0">{ev.type === 'birthday' ? '🎂' : ev.type === 'anniversary' ? '💍' : '🎉'}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-black text-pink-600 truncate">{ev.title}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">Chúc mừng ngày đặc biệt!</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl p-4 bg-gradient-to-br from-indigo-50 to-white shadow-sm border border-indigo-100">
                <div className="text-[11px] font-black text-indigo-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <span className="text-sm">⏳</span> Sự Kiện Sắp Tới
                </div>
                {!nextSpecial ? (
                  <div className="text-[12px] text-slate-400 italic font-medium py-4 text-center border border-dashed border-indigo-200 rounded-xl">
                    Chưa có lịch sự kiện nào được tạo.
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-indigo-100 shadow-sm">
                    <div className="text-2xl shrink-0">{nextSpecial.type === 'birthday' ? '🎂' : nextSpecial.type === 'anniversary' ? '💍' : '🎉'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-black text-indigo-700 truncate">{nextSpecial.title}</div>
                      <div className="text-[11px] font-bold text-slate-500 mt-1 flex items-center gap-1.5">
                        <span className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-md">{nextSpecial.nextDate.toLocaleDateString('vi-VN')}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-center bg-indigo-500 text-white rounded-xl p-2 min-w-[50px] shadow-md">
                      <div className="text-lg font-black leading-none">{nextSpecial.daysLeft}</div>
                      <div className="text-[8px] uppercase font-bold mt-1">Ngày</div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ── TIMELINE ────────────────────────────────────────── */}
          <div className={`flex-1 flex flex-col rounded-2xl overflow-hidden shadow-sm bg-white border border-slate-200 ${showMobileMap ? 'flex' : 'hidden md:flex'}`}>
            <div className="shrink-0 px-4 py-3 flex flex-wrap items-center gap-3 bg-white border-b border-slate-100 z-10">
              <button onClick={() => setShowMobileMap(false)}
                className="md:hidden text-[10px] font-black px-3 py-1.5 rounded-lg bg-pink-100 text-pink-600 border border-pink-200 shadow-sm cursor-pointer">
                ← Quay lại
              </button>
              <div className="relative flex-1 min-w-[140px] max-w-[220px]">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="🔍 Tìm kiếm..."
                  className="w-full text-[12px] font-medium py-2 pl-3 pr-3 rounded-xl outline-none bg-slate-50 border border-slate-200 text-slate-700 focus:border-pink-300 focus:bg-white transition-all shadow-inner" />
              </div>
              <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1 md:pb-0">
                <button onClick={() => setFilterCat('all')}
                  className={`shrink-0 text-[11px] font-black px-3 py-1.5 rounded-xl transition-all shadow-sm cursor-pointer ${filterCat === 'all' ? 'bg-pink-100 text-pink-600 border-pink-300' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  style={{ border: `1px solid ${filterCat === 'all' ? '#f9a8d4' : '#e2e8f0'}` }}>Tất cả</button>
                {CATEGORIES.map(cat => (
                  <button key={cat.id} onClick={() => setFilterCat(cat.id === filterCat ? 'all' : cat.id)}
                    className="shrink-0 text-[11px] font-black px-3 py-1.5 rounded-xl transition-all shadow-sm cursor-pointer"
                    style={{ background: filterCat === cat.id ? cat.bg : '#ffffff', color: filterCat === cat.id ? cat.text : '#64748b', border: `1px solid ${filterCat === cat.id ? cat.border : '#e2e8f0'}` }}>
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                {[{ id: 'all', label: '⭐ Tất cả' }, ...STATUSES.map(s => ({ id: s.id, label: s.icon + ' ' + s.label }))].map(s => (
                  <button key={s.id} onClick={() => setFilterStat(s.id === filterStat ? 'all' : s.id)}
                    className="shrink-0 text-[11px] font-black px-3 py-1.5 rounded-xl transition-all shadow-sm cursor-pointer"
                    style={{ background: filterStat === s.id ? '#e0e7ff' : '#ffffff', color: filterStat === s.id ? '#4f46e5' : '#64748b', border: `1px solid ${filterStat === s.id ? '#c7d2fe' : '#e2e8f0'}` }}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 ml-auto bg-slate-50 p-1 rounded-xl border border-slate-200 shadow-inner">
                <button onClick={() => setZoomLevel(z => Math.max(0.4, +(z - 0.3).toFixed(1)))} className="w-7 h-7 bg-white rounded-lg text-sm font-black text-slate-500 hover:text-pink-500 shadow-sm border border-slate-200 cursor-pointer">−</button>
                <span className="text-[11px] font-black w-12 text-center text-indigo-600">{Math.round(zoomLevel * 100)}%</span>
                <button onClick={() => setZoomLevel(z => Math.min(3, +(z + 0.3).toFixed(1)))} className="w-7 h-7 bg-white rounded-lg text-sm font-black text-slate-500 hover:text-pink-500 shadow-sm border border-slate-200 cursor-pointer">+</button>
                <button onClick={() => setZoomLevel(1)} className="text-[10px] px-3 h-7 rounded-lg font-black bg-pink-100 text-pink-600 shadow-sm border border-pink-200 ml-1 cursor-pointer">Reset</button>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar" ref={scrollContainerRef}>
              <div className="flex flex-col h-full relative" style={{ minWidth: `${totalDays * dayWidth}px` }}>
                <div className="sticky top-0 z-40 shadow-sm">
                  <div className="h-6 flex text-[10px] font-black tracking-widest uppercase bg-pink-100 text-pink-600 border-b border-pink-200">
                    {yearsData.map((y, i) => (
                      <div key={i} className="flex items-center justify-center border-r border-pink-200" style={{ width: `${(y.count / totalDays) * 100}%` }}>NĂM {y.year}</div>
                    ))}
                  </div>
                  <div className="h-8 flex text-[12px] font-black bg-indigo-50 text-indigo-600 border-b border-indigo-100">
                    {monthsData.map((m, i) => (
                      <div key={i} className="flex items-center justify-center border-r border-indigo-100" style={{ width: `${(m.count / totalDays) * 100}%` }}>THÁNG {m.month}</div>
                    ))}
                  </div>
                  <div className="h-7 flex relative bg-white border-b border-slate-100">
                    {daysArray.map((date, idx) => {
                      if (idx % Math.max(1, Math.round(2 / zoomLevel)) !== 0 && idx !== totalDays) return null;
                      return (
                        <div key={idx} className="absolute top-0 flex flex-col items-center" style={{ left: `${(idx / totalDays) * 100}%`, transform: 'translateX(-50%)' }}>
                          <span className="text-[10px] font-black text-slate-500 mt-1">{date.getDate()}</span>
                          <div className="w-0.5 h-2 mt-0.5 bg-slate-200 rounded-full"></div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1 relative overflow-hidden bg-white"
                  style={{ backgroundImage: `repeating-linear-gradient(to right, #f8fafc 0px, #f8fafc 1px, transparent 1px, transparent ${dayWidth * 7}px)`, backgroundSize: `${(7 / totalDays) * 100}% 100%` }}>
                  {isNowVisible && (
                    <div className="absolute top-0 bottom-0 z-30 flex flex-col items-center" style={{ left: `${nowOffsetPercent}%` }}>
                      <div className="w-0.5 h-full bg-pink-400 shadow-[0_0_8px_rgba(244,114,182,0.6)]"></div>
                      <div className="absolute top-2 text-[10px] font-black px-3 py-1 rounded-full whitespace-nowrap bg-pink-500 text-white shadow-md border-2 border-white">{todayLabel}</div>
                    </div>
                  )}

                  {filteredEvents.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center bg-white/60 p-6 rounded-3xl backdrop-blur-sm border border-slate-100 shadow-sm">
                        <div className="text-5xl mb-3">📅</div>
                        <div className="text-[14px] font-black text-slate-500">Hãy bắt đầu thêm sự kiện mới tại mục Cài Đặt!</div>
                      </div>
                    </div>
                  )}

                  <div className="relative w-full h-full" style={{ paddingTop: '12px' }}>
                    {filteredEvents.map((event) => {
                      const leftPct  = Math.max(0, ((event.start.getTime() - startDate.getTime()) / totalDuration) * 100);
                      const rawWidth = ((event.end.getTime() - event.start.getTime()) / totalDuration) * 100;
                      const widthPct = Math.min(rawWidth, 100 - leftPct);
                      const top      = event.trackRow * 76;
                      const cat      = getCat(event.category);
                      const progress = getEventProgress(event);

                      return (
                        <div
                          key={event.id} onClick={() => setSelectedEventDetail(event)}
                          className="absolute h-[62px] flex items-center z-20 cursor-pointer group transition-all duration-200 hover:-translate-y-0.5 bg-white"
                          style={{
                            left: `${leftPct}%`, width: `${widthPct}%`, minWidth: 'max-content', top: `${top}px`,
                            border: `2px solid ${cat.border}`, borderRadius: '16px',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                          }}>
                          <div className="absolute left-0 top-0 bottom-0 w-2 rounded-l-xl" style={{ background: cat.color }}></div>
                          <div className="w-[72px] md:w-[90px] h-full relative shrink-0 pl-3.5 pr-2 py-1.5">
                            <img src={event.image} alt="" className="w-full h-full object-cover rounded-xl shadow-sm border border-slate-100" style={{ opacity: event.status === 'done' ? 0.6 : 1 }} />
                            {event.status === 'done' && <div className="absolute inset-0 flex items-center justify-center"><span className="text-2xl drop-shadow-md">✅</span></div>}
                          </div>
                          <div className="flex-1 min-w-0 py-1 flex flex-col justify-center pr-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[10px]">{getPri(event.priority).icon}</span>
                              <span className="text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider" style={{ background: cat.bg, color: cat.text, border: `1px solid ${cat.border}` }}>{cat.label}</span>
                              {event.isShared && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-black bg-pink-100 text-pink-500 border border-pink-200">📢</span>}
                            </div>
                            <h4 className="font-black text-[13px] truncate text-slate-800" style={{ textDecoration: event.status === 'done' ? 'line-through' : 'none', color: event.status === 'done' ? '#94a3b8' : '#1e293b' }}>{event.title}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="text-[10px] font-bold text-slate-400">{event.dateStr}</div>
                              {event.status === 'in-progress' && (
                                <div className="flex-1 max-w-[80px]">
                                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: cat.color }}></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          SETTINGS MODAL (Z-INDEX 100 ĐỂ NẰM DƯỚI DROP DOWN NOTIF)
      ════════════════════════════════════════════════════════ */}
      {isSettingsOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-2 md:p-4" style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)' }}>
          <div className="w-full max-w-[860px] h-[92vh] md:h-[680px] rounded-[2rem] flex flex-col overflow-hidden relative bg-white border-[3px] border-pink-200 shadow-[0_20px_60px_rgba(236,72,153,0.15)]">

            <div className="h-16 flex items-center justify-between px-4 md:px-6 shrink-0 bg-pink-50 border-b border-pink-100">
              <div className="flex gap-2 overflow-x-auto custom-scrollbar whitespace-nowrap pr-4">
                {[
                  { id: 'profile', label: 'Tài Khoản',     icon: '⚙️' },
                  { id: 'events',  label: 'Quản Lý Lịch',  icon: '📅' },
                  { id: 'daily',   label: 'Lịch Ngày',     icon: '⏰' },
                  { id: 'special', label: 'Sự Kiện',       icon: '🎈' }, 
                  { id: 'friends', label: 'Bạn Bè',        icon: '👥' },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className="px-4 py-2 rounded-xl text-[11px] md:text-[12px] font-black uppercase tracking-wide transition-all shadow-sm cursor-pointer shrink-0"
                    style={{
                      background: activeTab === tab.id ? '#fbcfe8' : '#ffffff',
                      color: activeTab === tab.id ? '#be185d' : '#64748b',
                      border: activeTab === tab.id ? '2px solid #f9a8d4' : '2px solid #f1f5f9',
                    }}>
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setIsSettingsOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-all bg-white text-slate-400 hover:bg-pink-500 hover:text-white border-2 border-slate-200 hover:border-pink-500 shadow-sm cursor-pointer shrink-0">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 md:p-8 custom-scrollbar bg-slate-50/50">

              {/* ── TAB: TÀI KHOẢN ── */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <div className="relative h-32 rounded-3xl overflow-hidden border-[3px] border-white shadow-md bg-white">
                    <img src={profileFormData.background} alt="bg" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-r from-white/70 via-white/30 to-transparent"></div>
                    <div className="absolute inset-0 flex items-center gap-5 px-6">
                      <img src={profileFormData.avatar} alt="av" className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-md bg-white" />
                      <div>
                        <div className="font-black text-indigo-900 text-2xl drop-shadow-sm">{profileFormData.displayName || "Người dùng mới"}</div>
                        <div className="text-[12px] font-black font-mono px-3 py-1 rounded-full mt-2 inline-block bg-pink-100 text-pink-600 border border-pink-200 shadow-sm">ID: {profile.shortId}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button onClick={() => handleViewFriendFeed(user.uid)} className="px-5 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-600 rounded-xl font-black text-[11px] uppercase tracking-wider hover:bg-indigo-100 hover:scale-105 transition-all shadow-sm cursor-pointer">
                      👁️ Xem trang công khai của tôi
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {[
                      { key: 'displayName', label: 'Tên hiển thị', placeholder: 'Nhập tên của bạn' },
                      { key: 'title',       label: 'Tiêu đề lớn',  placeholder: 'TỔNG QUAN LỊCH TRÌNH' },
                      { key: 'subtitle',    label: 'Tiêu đề phụ',  placeholder: 'Năm học mới' },
                      { key: 'bio',         label: 'Giới thiệu',   placeholder: 'Mô tả ngắn về bạn...' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-[11px] font-black uppercase mb-2 block text-indigo-500">{f.label}</label>
                        <input type="text" placeholder={f.placeholder}
                          className="w-full rounded-2xl px-4 py-3 text-sm font-semibold outline-none transition-all bg-white border-2 border-slate-200 text-slate-700 focus:border-pink-400 focus:shadow-[0_0_0_4px_rgba(244,114,182,0.1)]"
                          value={profileFormData[f.key] || ''}
                          onChange={e => setProfileFormData(p => ({ ...p, [f.key]: e.target.value }))} />
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {[
                      { key: 'avatar',     label: 'Ảnh đại diện (1:1)',  target: 'avatar' },
                      { key: 'background', label: 'Ảnh nền (21:9)', target: 'background' }, 
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-[11px] font-black uppercase mb-2 block text-pink-500">{f.label}</label>
                        <div className="flex gap-2 items-center bg-white p-2 rounded-2xl border-2 border-slate-200 shadow-sm">
                          <input type="file" accept="image/*" onChange={e => onSelectFile(e, f.target)}
                            className="flex-1 text-xs px-2 cursor-pointer file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 transition-colors text-slate-500" />
                          <button type="button" onClick={() => handlePasteButtonClick(f.target)}
                            className="shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all bg-indigo-500 text-white shadow-[0_4px_10px_rgba(99,102,241,0.3)] hover:scale-105 cursor-pointer">
                            📋 Dán
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-6 mt-4 border-t-2 border-slate-100">
                    <button onClick={handleSaveProfile}
                      className="w-full py-4 rounded-2xl font-black uppercase text-sm tracking-wider transition-all hover:-translate-y-1 bg-gradient-to-r from-pink-400 to-indigo-400 text-white shadow-[0_10px_20px_rgba(236,72,153,0.3)] cursor-pointer">
                      💾 LƯU CẤU HÌNH
                    </button>
                  </div>
                </div>
              )}

              {/* ── TAB: QUẢN LÝ LỊCH SỰ KIỆN ── */}
              {activeTab === 'events' && (
                <div className="space-y-6">
                  <div className="rounded-3xl p-4 space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar bg-white border-2 border-slate-100 shadow-sm">
                    <div className="text-[11px] font-black uppercase mb-3 text-indigo-500 flex items-center gap-2"><span className="text-lg">📚</span> Danh sách hiện có ({events.length})</div>
                    {events.length === 0 && <div className="text-[13px] italic text-slate-400 text-center py-4">Chưa có sự kiện nào được tạo!</div>}
                    {events.map(ev => {
                      const cat = getCat(ev.category);
                      return (
                        <div key={ev.id} className="flex items-center gap-3 rounded-2xl px-4 py-3 bg-slate-50 border border-slate-200 hover:border-pink-200 hover:bg-pink-50 transition-colors">
                          <div className="w-2 h-8 rounded-full" style={{ background: cat.color }}></div>
                          <span className="text-xl">{getStat(ev.status).icon}</span>
                          <span className="text-[13px] font-black flex-1 truncate text-slate-700">{ev.title}</span>
                          <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: cat.bg, color: cat.text, border: `1px solid ${cat.border}` }}>{cat.label}</span>
                          {ev.isShared && <span className="text-[10px] bg-pink-100 text-pink-600 px-2 py-1 rounded-lg border border-pink-200 font-bold shrink-0">Công khai</span>}
                          <button onClick={() => handleDeleteEvent(ev.id)}
                            className="text-[10px] font-black px-3 py-1.5 rounded-lg transition-all hover:scale-105 bg-red-100 text-red-600 border border-red-200 cursor-pointer">Xóa</button>
                        </div>
                      );
                    })}
                  </div>

                  <form onSubmit={handleAddEvent} className="space-y-4 bg-white p-5 rounded-3xl border-2 border-slate-100 shadow-sm">
                    <div className="text-[13px] font-black uppercase text-pink-500 flex items-center gap-2 mb-2"><span className="text-xl">✏️</span> Thêm sự kiện mới</div>
                    <input required type="text" placeholder="Tên sự kiện / môn học..."
                      className="w-full rounded-2xl px-4 py-3 text-sm font-semibold outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-pink-400 focus:bg-white transition-all"
                      value={eventFormData.title} onChange={e => setEventFormData(p => ({ ...p, title: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-4">
                      {[{ key: 'startDate', label: 'Ngày' }, { key: 'endDate', label: 'Đến ngày' }].map(f => (
                        <div key={f.key}>
                          <label className="text-[10px] font-black uppercase mb-1.5 block text-indigo-400">{f.label}</label>
                          <input required type="date" className="w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-indigo-400 focus:bg-white transition-all"
                            value={eventFormData[f.key]} onChange={e => setEventFormData(p => ({ ...p, [f.key]: e.target.value }))} />
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase mb-2 block text-indigo-400">Danh mục</label>
                      <div className="flex flex-wrap gap-2">
                        {CATEGORIES.map(cat => (
                          <button key={cat.id} type="button" onClick={() => setEventFormData(p => ({ ...p, category: cat.id }))}
                            className="text-[11px] font-black px-3 py-1.5 rounded-xl transition-all shadow-sm hover:scale-105 cursor-pointer"
                            style={{ background: eventFormData.category === cat.id ? cat.bg : '#f8fafc', color: eventFormData.category === cat.id ? cat.text : '#64748b', border: `2px solid ${eventFormData.category === cat.id ? cat.color : '#e2e8f0'}` }}>
                            {cat.icon} {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black uppercase mb-2 block text-indigo-400">Độ ưu tiên</label>
                        <div className="flex gap-1.5 bg-slate-50 p-1.5 rounded-2xl border-2 border-slate-200">
                          {PRIORITIES.map(p => (
                            <button key={p.id} type="button" onClick={() => setEventFormData(f => ({ ...f, priority: p.id }))}
                              className="flex-1 text-[11px] font-black py-1.5 rounded-xl transition-all shadow-sm cursor-pointer"
                              style={{ background: eventFormData.priority === p.id ? '#ffffff' : 'transparent', color: eventFormData.priority === p.id ? '#1e293b' : '#94a3b8', border: eventFormData.priority === p.id ? '1px solid #e2e8f0' : '1px solid transparent' }}>
                              {p.icon} {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase mb-2 block text-indigo-400">Trạng thái ban đầu</label>
                        <select className="w-full rounded-2xl px-3 py-2.5 text-[12px] font-black outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-indigo-400"
                          value={eventFormData.status} onChange={e => setEventFormData(p => ({ ...p, status: e.target.value }))}>
                          {STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <input type="text" placeholder="🏆 Mục tiêu / Phần thưởng"
                        className="rounded-2xl px-4 py-3 text-sm font-semibold outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-amber-400 focus:bg-white transition-all"
                        value={eventFormData.rewards} onChange={e => setEventFormData(p => ({ ...p, rewards: e.target.value }))} />
                      <input type="text" placeholder="📝 Ghi chú thông tin"
                        className="rounded-2xl px-4 py-3 text-sm font-semibold outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-blue-400 focus:bg-white transition-all"
                        value={eventFormData.notes} onChange={e => setEventFormData(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase mb-2 block text-pink-500">Ảnh thumbnail (21:9)</label>
                      <div className="flex gap-2 items-center bg-slate-50 p-2 rounded-2xl border-2 border-slate-200 shadow-sm">
                        <input type="file" accept="image/*" onChange={e => onSelectFile(e, 'event')}
                          className="flex-1 text-xs px-2 cursor-pointer file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-pink-100 file:text-pink-600 hover:file:bg-pink-200 transition-colors text-slate-500" />
                        <button type="button" onClick={() => handlePasteButtonClick('event')}
                          className="shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all bg-pink-500 text-white shadow-[0_4px_10px_rgba(236,72,153,0.3)] hover:scale-105 cursor-pointer">
                          📋 Dán
                        </button>
                      </div>
                      {eventFormData.croppedImage && (
                        <div className="mt-3 relative inline-block">
                          <img src={eventFormData.croppedImage} alt="preview" className="h-16 rounded-xl border-4 border-white shadow-md" />
                          <button type="button" onClick={() => setEventFormData(p => ({ ...p, croppedImage: null }))}
                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center bg-red-500 text-white shadow-sm border-2 border-white hover:scale-110 transition-transform cursor-pointer">✕</button>
                        </div>
                      )}
                    </div>
                    <button type="submit"
                      className="w-full py-4 mt-2 rounded-2xl font-black uppercase text-sm tracking-wider transition-all hover:-translate-y-1 bg-gradient-to-r from-emerald-400 to-teal-500 text-white shadow-[0_10px_20px_rgba(16,185,129,0.3)] cursor-pointer">
                      ✨ TẠO SỰ KIỆN MỚI
                    </button>
                  </form>
                </div>
              )}

              {/* ── TAB: LỊCH TRÌNH TRONG NGÀY (CÀI ĐẶT) ── */}
              {activeTab === 'daily' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between bg-indigo-50 p-4 rounded-3xl border-2 border-indigo-100 shadow-sm gap-3">
                    <div className="text-[12px] font-black uppercase text-indigo-600">Đang xem lịch ngày:</div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => {
                        const d = new Date(dailyViewDate); d.setDate(d.getDate() - 1);
                        setDailyViewDate(formatDateToYMD(d));
                      }} className="w-10 h-10 rounded-xl bg-white border border-indigo-200 text-indigo-600 font-black shadow-sm hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer">←</button>
                      
                      <input type="date" value={dailyViewDate} onChange={e => setDailyViewDate(e.target.value)}
                        className="px-4 py-2.5 rounded-xl border-2 border-indigo-200 outline-none font-black text-slate-700 bg-white" />
                      
                      <button onClick={() => {
                        const d = new Date(dailyViewDate); d.setDate(d.getDate() + 1);
                        setDailyViewDate(formatDateToYMD(d));
                      }} className="w-10 h-10 rounded-xl bg-white border border-indigo-200 text-indigo-600 font-black shadow-sm hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer">→</button>
                    </div>
                    <button onClick={() => setDailyViewDate(todayYMD)} 
                      className={`text-[11px] font-black px-4 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer ${dailyViewDate === todayYMD ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border border-indigo-200'}`}>Hôm nay</button>
                  </div>

                  <form onSubmit={handleAddDailyTask} className="bg-white p-5 rounded-3xl border-2 border-slate-100 shadow-sm flex flex-col gap-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                      <div className="col-span-2 md:col-span-1">
                        <label className="text-[10px] font-black uppercase mb-1.5 block text-indigo-500">Ngày</label>
                        <input required type="date"
                          className="w-full rounded-2xl px-3 py-2.5 text-sm font-bold outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-indigo-400 focus:bg-white transition-all cursor-pointer"
                          value={dailyForm.startDate} onChange={e => setDailyForm(p => ({ ...p, startDate: e.target.value }))} />
                      </div>
                      
                      <div className="col-span-2 md:col-span-1 flex gap-2">
                        <div className="w-1/2">
                          <label className="text-[10px] font-black uppercase mb-1.5 block text-indigo-500">Giờ BĐ</label>
                          <input required type="time"
                            className="w-full rounded-2xl px-2 py-2.5 text-sm font-bold outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-indigo-400 focus:bg-white transition-all text-center cursor-pointer"
                            value={dailyForm.time} onChange={e => setDailyForm(p => ({ ...p, time: e.target.value }))} />
                        </div>
                        <div className="w-1/2">
                          <label className="text-[10px] font-black uppercase mb-1.5 block text-indigo-500">Giờ KT</label>
                          <input type="time"
                            className="w-full rounded-2xl px-2 py-2.5 text-sm font-bold outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-indigo-400 focus:bg-white transition-all text-center cursor-pointer"
                            value={dailyForm.endTime} onChange={e => setDailyForm(p => ({ ...p, endTime: e.target.value }))} />
                        </div>
                      </div>
                      
                      <div className="col-span-2">
                        <label className="text-[10px] font-black uppercase mb-1.5 block text-indigo-500">Chu kỳ lặp</label>
                        <select
                          className="w-full rounded-2xl px-3 py-2.5 text-[13px] font-bold outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-indigo-400 cursor-pointer"
                          value={dailyForm.repeat} onChange={e => setDailyForm(p => ({ ...p, repeat: e.target.value }))}>
                          <option value="none">Không lặp lại</option>
                          <option value="daily">Mỗi ngày</option>
                          <option value="weekly">Mỗi tuần</option>
                          <option value="biweekly">Mỗi 2 tuần</option>
                          <option value="yearly">Mỗi năm</option>
                          <option value="custom">Tùy chỉnh (Số ngày lặp)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 items-end mt-2">
                      <div className="flex-1 w-full relative">
                        <label className="text-[10px] font-black uppercase mb-1.5 block text-indigo-500">Nội dung công việc</label>
                        <input required type="text" placeholder="Ví dụ: Tập thể dục..."
                          className="w-full rounded-2xl px-4 py-3 text-sm font-semibold outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-indigo-400 focus:bg-white transition-all pr-28"
                          value={dailyForm.task} onChange={e => setDailyForm(p => ({ ...p, task: e.target.value }))} />
                          
                        <label className="absolute right-2 bottom-2 bg-pink-50 border border-pink-200 text-pink-600 px-3 py-1.5 rounded-xl text-[10px] font-black cursor-pointer flex items-center gap-1.5 transition-colors hover:bg-pink-100">
                          <input type="checkbox" checked={dailyForm.isShared} onChange={e => setDailyForm(p => ({ ...p, isShared: e.target.checked }))} className="accent-pink-500 cursor-pointer" />
                          Công khai
                        </label>
                      </div>

                      {dailyForm.repeat === 'custom' && (
                        <div className="w-full md:w-28">
                          <label className="text-[10px] font-black uppercase mb-1.5 block text-indigo-500">Số ngày lặp</label>
                          <input required type="number" min="2" max="365"
                            className="w-full rounded-2xl px-3 py-3 text-sm font-bold outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-indigo-400 focus:bg-white transition-all text-center"
                            value={dailyForm.customDays} onChange={e => setDailyForm(p => ({ ...p, customDays: e.target.value }))} />
                        </div>
                      )}

                      <button type="submit"
                        className="w-full md:w-auto px-6 py-3.5 rounded-2xl font-black text-sm transition-all hover:-translate-y-1 shadow-[0_10px_20px_rgba(99,102,241,0.3)] bg-gradient-to-r from-indigo-500 to-blue-500 text-white whitespace-nowrap cursor-pointer">
                        ➕ THÊM VÀO LỊCH
                      </button>
                    </div>
                  </form>

                  <div className="rounded-3xl p-5 bg-white border-2 border-slate-100 shadow-sm">
                    <div className="text-[13px] font-black uppercase text-indigo-500 mb-4 flex items-center gap-2">
                      <span className="text-xl">⏰</span> Lịch trình ngày {dailyViewDate} ({filteredSettingsDailySchedule.length})
                    </div>
                    
                    {filteredSettingsDailySchedule.length === 0 ? (
                      <div className="text-[13px] italic text-slate-400 py-6 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                        Trống trơn! Hãy dành thời gian nghỉ ngơi hoặc lên kế hoạch mới nhé.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredSettingsDailySchedule.map(item => {
                          const isDoneOnThisDate = item.completedDates?.includes(dailyViewDate);
                          return (
                            <div key={item.id} className={`flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-3.5 rounded-2xl border-2 transition-all ${isDoneOnThisDate ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-indigo-100 hover:border-indigo-300 shadow-sm'}`}>
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <button onClick={() => handleToggleDailyTask(item.id, dailyViewDate)}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 transition-colors shadow-inner cursor-pointer ${isDoneOnThisDate ? 'bg-emerald-500 text-white border border-emerald-600' : 'bg-slate-50 border-2 border-slate-300 text-transparent hover:border-emerald-400'}`}>
                                  ✔
                                </button>
                                
                                <div className={`text-[12px] md:text-[14px] font-black font-mono px-2 md:px-3 py-1.5 rounded-xl border shrink-0 text-center ${isDoneOnThisDate ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-indigo-50 text-indigo-600 border-indigo-200'}`}>
                                  {item.time} {item.endTime && <><br/><span className="text-[10px] text-slate-400">{item.endTime}</span></>}
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                  <div className={`text-[13px] md:text-[14px] font-bold truncate ${isDoneOnThisDate ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                    {item.task}
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                    {item.repeat !== 'none' && (
                                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded border border-slate-200 text-slate-400 bg-slate-50">
                                        🔄 {item.repeat === 'custom' ? `${item.customDays} ngày` : item.repeat}
                                      </span>
                                    )}
                                    {item.isShared && (
                                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded border border-pink-200 text-pink-500 bg-pink-50">📢 Công khai</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <button onClick={() => handleDeleteDailyTask(item.id)}
                                className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-50 hover:text-white transition-colors border border-red-100 shrink-0 cursor-pointer md:ml-auto">
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── TAB: SỰ KIỆN QUAN TRỌNG (SINH NHẬT, KỶ NIỆM) ── */}
              {activeTab === 'special' && (
                <div className="space-y-6">
                  <form onSubmit={handleAddSpecialEvent} className="bg-gradient-to-br from-pink-50 to-white p-5 rounded-3xl border border-pink-100 shadow-sm flex flex-col gap-4">
                    <div className="text-[13px] font-black uppercase text-pink-500 flex items-center gap-2 mb-1"><span className="text-xl">🎈</span> Thêm sự kiện đặc biệt</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                      <div className="col-span-1 md:col-span-1">
                        <label className="text-[10px] font-black uppercase mb-1.5 block text-pink-500">Phân loại</label>
                        <select className="w-full rounded-2xl px-3 py-3 text-[13px] font-bold outline-none bg-white border border-pink-200 text-slate-700 focus:border-pink-500 cursor-pointer shadow-inner"
                          value={specialForm.type} onChange={e => setSpecialForm(p => ({ ...p, type: e.target.value }))}>
                          <option value="birthday">🎂 Sinh nhật</option>
                          <option value="anniversary">💍 Kỷ niệm</option>
                          <option value="other">🎉 Sự kiện khác</option>
                        </select>
                      </div>
                      <div className="col-span-1 md:col-span-1">
                        <label className="text-[10px] font-black uppercase mb-1.5 block text-pink-500">Tên sự kiện / Tên người</label>
                        <input required type="text" placeholder="Ví dụ: Sinh nhật Phúc..."
                          className="w-full rounded-2xl px-4 py-2.5 text-sm font-semibold outline-none bg-white border border-pink-200 text-slate-700 focus:border-pink-500 shadow-inner"
                          value={specialForm.title} onChange={e => setSpecialForm(p => ({ ...p, title: e.target.value }))} />
                      </div>
                      <div className="col-span-1 md:col-span-1">
                        <label className="text-[10px] font-black uppercase mb-1.5 block text-pink-500">Ngày / Tháng / Năm</label>
                        <input required type="date"
                          className="w-full rounded-2xl px-3 py-2.5 text-sm font-bold outline-none bg-white border border-pink-200 text-slate-700 focus:border-pink-500 shadow-inner cursor-pointer"
                          value={specialForm.date} onChange={e => setSpecialForm(p => ({ ...p, date: e.target.value }))} />
                      </div>
                    </div>
                    <button type="submit"
                      className="w-full py-3.5 rounded-2xl font-black uppercase text-sm tracking-wider transition-all hover:-translate-y-1 shadow-md bg-pink-500 text-white cursor-pointer mt-2">
                      LƯU SỰ KIỆN
                    </button>
                  </form>

                  <div className="rounded-3xl p-5 bg-white border border-slate-100 shadow-sm">
                    <div className="text-[13px] font-black uppercase text-pink-500 mb-4 flex items-center gap-2">
                      <span className="text-xl">📋</span> Danh sách sự kiện đặc biệt ({specialEvents.length})
                    </div>
                    {specialEvents.length === 0 ? (
                      <div className="text-[13px] italic text-slate-400 py-6 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                        Bạn chưa thêm sự kiện đặc biệt nào.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {specialEvents.map(ev => (
                          <div key={ev.id} className="flex items-center gap-3 p-3 rounded-2xl border border-pink-100 bg-pink-50/30 hover:shadow-md transition-shadow">
                            <div className="text-3xl shrink-0 bg-white w-12 h-12 rounded-xl flex items-center justify-center shadow-sm border border-pink-100">
                              {ev.type === 'birthday' ? '🎂' : ev.type === 'anniversary' ? '💍' : '🎉'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[14px] font-black text-slate-800 truncate">{ev.title}</div>
                              <div className="text-[11px] font-bold text-pink-500 mt-0.5">{new Date(ev.date).toLocaleDateString('vi-VN')}</div>
                            </div>
                            <button onClick={() => handleDeleteSpecialEvent(ev.id)}
                              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white text-red-500 hover:bg-red-500 hover:text-white transition-colors border border-red-100 shrink-0 shadow-sm cursor-pointer">
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── TAB: BẠN BÈ ── */}
              {activeTab === 'friends' && (
                <div className="space-y-6">

                  {/* 🔥 LỜI MỜI KẾT BẠN (TÁCH RIÊNG TỪ THÔNG BÁO) */}
                  {pendingRequests.length > 0 && (
                    <div className="bg-blue-50 border-2 border-blue-200 p-5 rounded-3xl shadow-sm">
                      <h3 className="text-[12px] font-black uppercase mb-4 text-blue-600 flex items-center gap-2">
                        <span className="text-lg">👋</span> Lời mời kết bạn đang chờ ({pendingRequests.length})
                      </h3>
                      <div className="space-y-3">
                        {pendingRequests.map(req => (
                          <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white shadow-sm border border-blue-100">
                            <div className="flex items-center gap-3">
                              <img src={req.fromAvatar} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-blue-100 shadow-sm" />
                              <div>
                                <div className="text-[14px] font-black text-slate-800">{req.fromName}</div>
                                <div className="text-[11px] text-slate-500 font-medium">Đã gửi lời mời kết bạn</div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                               <button onClick={() => handleAcceptFriend(req)} className="flex-1 sm:flex-none bg-blue-500 text-white px-5 py-2.5 rounded-xl text-[12px] font-black shadow-sm hover:bg-blue-600 transition-colors cursor-pointer">Đồng ý</button>
                               <button onClick={() => handleRejectFriend(req)} className="flex-1 sm:flex-none bg-slate-100 border border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl text-[12px] font-black shadow-sm hover:bg-slate-200 transition-colors cursor-pointer">Từ chối</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleAddFriend} className="bg-white p-5 rounded-3xl border-[3px] border-pink-100 shadow-sm flex flex-col md:flex-row gap-3 items-end">
                    <div className="flex-1 w-full">
                      <label className="text-[11px] font-black uppercase mb-2 block text-pink-500">Nhập ID bạn bè (8 số)</label>
                      <input required type="text" maxLength="8" pattern="\d{8}" placeholder="Ví dụ: 12345678"
                        className="w-full rounded-2xl px-4 py-3 text-lg font-black font-mono tracking-[4px] outline-none bg-slate-50 border-2 border-pink-200 text-slate-700 focus:border-pink-500 focus:bg-white transition-all text-center md:text-left"
                        value={searchFriendId} onChange={e => setSearchFriendId(e.target.value)} />
                    </div>
                    <button type="submit"
                      className="w-full md:w-auto px-8 py-3.5 rounded-2xl font-black text-sm transition-all hover:-translate-y-1 shadow-[0_10px_20px_rgba(236,72,153,0.3)] bg-gradient-to-r from-pink-500 to-rose-500 text-white h-auto cursor-pointer">
                      👥 GỬI LỜI MỜI KẾT BẠN
                    </button>
                  </form>

                  <div className="p-5 rounded-3xl text-center bg-gradient-to-br from-indigo-50 to-pink-50 border-2 border-dashed border-indigo-200 shadow-inner">
                    <div className="text-[11px] font-black uppercase mb-2 text-indigo-500">ID Của Bạn (Chia sẻ để kết bạn)</div>
                    <div className="font-black text-3xl tracking-[8px] font-mono text-indigo-600 drop-shadow-sm bg-white inline-block px-6 py-2 rounded-2xl border-2 border-white shadow-sm">{profile.shortId}</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {friendsData.length === 0 && <div className="col-span-2 text-center py-8 text-[14px] font-bold text-slate-400 bg-white rounded-3xl border-2 border-slate-100 border-dashed">Chưa có bạn bè nào. Đừng ngần ngại chia sẻ ID nhé!</div>}
                    {friendsData.map(friend => (
                      <div key={friend.uid} className="rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-4 transition-all bg-white border-2 border-slate-100 shadow-sm hover:border-pink-300 hover:shadow-md">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <img src={friend.avatar} alt="" className="w-14 h-14 rounded-2xl object-cover border-2 border-pink-100 shadow-sm" />
                          <div className="flex-1 min-w-0">
                            <div className="font-black text-[15px] text-indigo-900 truncate">{friend.displayName}</div>
                            <div className="text-[11px] font-black font-mono text-pink-400 mt-0.5">ID: {friend.shortId}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 md:mt-0">
                          <button onClick={() => handleViewFriendFeed(friend.uid)}
                            className="flex-1 md:flex-none px-4 py-2 rounded-xl text-[11px] font-black transition-all hover:scale-105 bg-indigo-50 text-indigo-600 border border-indigo-200 uppercase cursor-pointer">
                            Xem lịch
                          </button>
                          <button onClick={() => handleRemoveFriend(friend.uid)}
                            className="flex-1 md:flex-none px-4 py-2 rounded-xl text-[11px] font-black transition-all hover:scale-105 bg-red-50 text-red-500 border border-red-200 uppercase cursor-pointer">
                            Xóa
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          MODAL XEM LỊCH NGÀY NHANH
      ════════════════════════════════════════════════════════ */}
      {isDailyModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[150] p-4" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)' }} onClick={() => setIsDailyModalOpen(false)}>
          <div className="w-full max-w-[600px] max-h-[85vh] rounded-[2rem] overflow-hidden bg-white border-[3px] border-indigo-100 shadow-[0_20px_50px_rgba(79,70,229,0.15)] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 flex items-center justify-between bg-indigo-50 border-b border-indigo-100 shrink-0">
              <h2 className="font-black text-xl text-indigo-900 flex items-center gap-2"><span>📅</span> Lịch Trình Trong Ngày</h2>
              <button onClick={() => setIsDailyModalOpen(false)} className="text-slate-400 hover:text-indigo-600 hover:bg-white w-8 h-8 rounded-full flex items-center justify-center font-black transition-all shadow-sm border border-transparent hover:border-indigo-200 cursor-pointer">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-slate-50/50 custom-scrollbar flex flex-col gap-5">
              
              <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-2xl border-2 border-indigo-50 shadow-sm">
                <select 
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border-2 border-indigo-100 outline-none font-black text-indigo-700 bg-indigo-50/50 cursor-pointer text-sm"
                  value={quickViewDate}
                  onChange={e => setQuickViewDate(e.target.value)}
                >
                  <option value={todayYMD} disabled className="italic">-- Ngày đã đặt lịch --</option>
                  {uniqueScheduledDates.map(dateStr => (
                    <option key={dateStr} value={dateStr}>
                      {dateStr === todayYMD ? '🔥 Hôm nay' : `📅 ${dateStr}`}
                    </option>
                  ))}
                </select>

                <div className="hidden sm:block w-px h-8 bg-slate-200 mx-1"></div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button onClick={() => {
                    const d = new Date(quickViewDate); d.setDate(d.getDate() - 1);
                    setQuickViewDate(formatDateToYMD(d));
                  }} className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 font-black shadow-sm hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer shrink-0">←</button>
                  
                  <input type="date" value={quickViewDate} onChange={e => setQuickViewDate(e.target.value)}
                    className="flex-1 px-2 md:px-4 py-2.5 rounded-xl border-2 border-slate-200 outline-none font-bold text-slate-700 bg-white text-sm" />
                  
                  <button onClick={() => {
                    const d = new Date(quickViewDate); d.setDate(d.getDate() + 1);
                    setQuickViewDate(formatDateToYMD(d));
                  }} className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 font-black shadow-sm hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer shrink-0">→</button>
                </div>

                <button onClick={() => setQuickViewDate(todayYMD)} 
                  className={`w-full sm:w-auto text-[11px] font-black px-4 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer ${quickViewDate === todayYMD ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'}`}>
                  HÔM NAY
                </button>
              </div>

              <div className="bg-white rounded-3xl border-2 border-slate-100 shadow-sm p-4 min-h-[250px]">
                <div className="text-[13px] font-black uppercase text-indigo-500 mb-4 flex items-center justify-between">
                  <span>Danh sách công việc ({quickViewSchedule.length})</span>
                  <span className="text-[10px] text-slate-400 font-bold bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                    {quickViewDate === todayYMD ? 'Hôm nay' : quickViewDate}
                  </span>
                </div>

                {quickViewSchedule.length === 0 ? (
                  <div className="text-[13px] italic text-slate-400 py-10 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                    Chưa có lịch trình nào cho ngày này.<br/>
                    <span className="text-[11px] text-indigo-400">Bạn có thể tạo mới trong mục Cài đặt ⚙️</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {quickViewSchedule.map(item => {
                      const isDone = (item.completedDates || []).includes(quickViewDate);
                      return (
                        <div key={item.id} className={`flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-3.5 rounded-2xl border-2 transition-all ${isDone ? 'bg-slate-50 border-slate-100 opacity-70' : 'bg-white border-indigo-50 shadow-sm hover:border-indigo-200'}`}>
                          
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <button onClick={() => handleToggleDailyTask(item.id, quickViewDate)}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 transition-colors shadow-inner cursor-pointer ${isDone ? 'bg-emerald-500 text-white border border-emerald-600' : 'bg-slate-50 border-2 border-slate-300 text-transparent hover:border-emerald-400'}`}>
                              ✔
                            </button>
                            
                            <div className={`text-[12px] md:text-[14px] font-black font-mono px-2 py-1 rounded-xl border shrink-0 text-center ${isDone ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-indigo-50 text-indigo-600 border-indigo-200'}`}>
                              {item.time} {item.endTime && <><br/><span className="text-[9px] opacity-70">{item.endTime}</span></>}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className={`text-[13px] md:text-[14px] font-bold truncate ${isDone ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                {item.task}
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {item.repeat !== 'none' && (
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded border border-slate-200 text-slate-400 bg-slate-50">
                                    🔄 {item.repeat === 'custom' ? `${item.customDays} ngày` : item.repeat}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <button onClick={() => handleToggleShareDailyTask(item.id)}
                            className={`shrink-0 text-[10px] font-black px-3 py-1.5 rounded-xl border transition-all cursor-pointer w-fit md:ml-auto ${item.isShared ? 'bg-pink-100 text-pink-600 border-pink-200 hover:bg-pink-200' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}>
                            {item.isShared ? '📢 Công khai' : '🔒 Riêng tư'}
                          </button>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* EVENT DETAIL & DEADLINE MODALS... */}
      {selectedEventDetail && (
        <div className="fixed inset-0 flex items-center justify-center z-[120] p-4" style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)' }} onClick={() => setSelectedEventDetail(null)}>
          <div className="w-full max-w-[420px] rounded-[2rem] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.1)] bg-white relative flex flex-col" onClick={e => e.stopPropagation()}
            style={{ border: `3px solid ${getCat(selectedEventDetail.category).border}` }}>
            {(() => {
              const cat  = getCat(selectedEventDetail.category);
              const stat = getStat(selectedEventDetail.status);
              return (
                <>
                  <div className="relative h-48 bg-slate-50 p-2">
                    <div className="w-full h-full rounded-2xl overflow-hidden relative border-2 shadow-inner" style={{ borderColor: cat.border }}>
                      <img src={selectedEventDetail.image} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: selectedEventDetail.status === 'done' ? 0.5 : 1 }} />
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%)' }}></div>
                      <button onClick={() => setSelectedEventDetail(null)}
                        className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center font-black text-sm bg-white/80 text-slate-500 hover:bg-white hover:text-red-500 shadow-sm backdrop-blur-sm transition-all cursor-pointer">✕</button>
                      <div className="absolute top-3 left-3 flex gap-2">
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-xl shadow-sm backdrop-blur-md" style={{ background: 'rgba(255,255,255,0.8)', color: cat.color, border: `1px solid ${cat.color}40` }}>{cat.icon} {cat.label}</span>
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-xl shadow-sm backdrop-blur-md" style={{ background: 'rgba(255,255,255,0.8)', color: '#475569', border: '1px solid rgba(0,0,0,0.1)' }}>{getPri(selectedEventDetail.priority).icon} {getPri(selectedEventDetail.priority).label}</span>
                        {selectedEventDetail.isShared && <span className="text-[10px] font-black px-2.5 py-1 rounded-xl shadow-sm backdrop-blur-md bg-pink-500 text-white">📢 Công Khai</span>}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 pt-2 space-y-4 flex-1 bg-white">
                    <h3 className="font-black text-2xl text-slate-800 leading-tight drop-shadow-sm text-center mb-6">{selectedEventDetail.title}</h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl p-3 text-center bg-slate-50 border border-slate-100 shadow-sm">
                        <div className="text-[10px] font-black uppercase mb-1.5 text-indigo-400">Thời gian</div>
                        <div className="text-[12px] font-bold text-slate-700">{selectedEventDetail.dateStr}</div>
                      </div>
                      <div className="rounded-2xl p-3 bg-slate-50 border border-slate-100 shadow-sm">
                        <div className="text-[10px] font-black uppercase mb-1.5 text-indigo-400">Trạng thái</div>
                        <select
                          value={selectedEventDetail.status}
                          onChange={e => handleUpdateEventField(selectedEventDetail.id, 'status', e.target.value)}
                          className="w-full text-[12px] rounded-xl px-2 py-1.5 outline-none font-black bg-white shadow-inner transition-colors cursor-pointer"
                          style={{ border: `2px solid ${stat.accent}50`, color: stat.accent }}>
                          {STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
                        </select>
                      </div>
                    </div>

                    {selectedEventDetail.status === 'in-progress' && (
                      <div className="rounded-2xl p-4 bg-blue-50 border border-blue-100 shadow-sm">
                        <div className="flex justify-between text-[11px] font-black mb-2">
                          <span className="text-blue-500 uppercase">Tiến độ</span>
                          <span className="text-blue-700 bg-white px-2 py-0.5 rounded-md">{selectedEventDetail.progress || 0}%</span>
                        </div>
                        <input type="range" min="0" max="100"
                          value={selectedEventDetail.progress || 0}
                          onChange={e => handleUpdateEventField(selectedEventDetail.id, 'progress', Number(e.target.value))}
                          className="w-full accent-blue-500 h-2 bg-white rounded-full border border-blue-200 cursor-pointer" />
                      </div>
                    )}

                    {selectedEventDetail.rewards && (
                      <div className="flex items-start gap-3 rounded-2xl p-3 bg-amber-50 border border-amber-100 shadow-sm">
                        <span className="text-2xl drop-shadow-sm mt-1">🏆</span>
                        <div>
                          <div className="text-[10px] font-black uppercase mb-0.5 text-amber-500">Mục tiêu / Thưởng</div>
                          <div className="text-[13px] font-bold text-amber-700 leading-snug">{selectedEventDetail.rewards}</div>
                        </div>
                      </div>
                    )}
                    {selectedEventDetail.notes && (
                      <div className="flex items-start gap-3 rounded-2xl p-3 bg-slate-50 border border-slate-200 shadow-sm">
                        <span className="text-2xl drop-shadow-sm mt-1">📝</span>
                        <div>
                          <div className="text-[10px] font-black uppercase mb-0.5 text-slate-500">Ghi chú</div>
                          <div className="text-[12px] font-medium text-slate-700 leading-snug">{selectedEventDetail.notes}</div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-4 border-t-2 border-slate-100">
                      <button onClick={() => handleToggleShareEvent(selectedEventDetail.id)}
                        className={`py-3 rounded-2xl font-black text-[11px] uppercase tracking-wider transition-all shadow-sm flex items-center justify-center gap-1.5 border-2 cursor-pointer ${selectedEventDetail.isShared ? 'bg-white text-pink-500 border-pink-200 hover:border-pink-500' : 'bg-gradient-to-r from-pink-400 to-pink-500 text-white border-transparent hover:shadow-[0_5px_15px_rgba(236,72,153,0.3)]'}`}>
                        {selectedEventDetail.isShared ? '🔒 Thu hồi' : '📢 Lên sóng'}
                      </button>
                      <button onClick={() => handleDeleteEvent(selectedEventDetail.id)}
                        className="py-3 rounded-2xl font-black text-[11px] uppercase tracking-wider transition-all bg-white text-red-500 border-2 border-red-100 hover:border-red-500 hover:bg-red-50 shadow-sm flex items-center justify-center gap-1.5 cursor-pointer">
                        🗑 Xóa
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {isDeadlineModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[110] p-4" style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)' }} onClick={() => setIsDeadlineModalOpen(false)}>
          <div className="w-full max-w-[400px] max-h-[80vh] rounded-[2rem] overflow-hidden flex flex-col bg-white border-4 border-red-100 shadow-[0_20px_50px_rgba(239,68,68,0.15)]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 flex items-center justify-between bg-red-50 border-b-2 border-red-100">
              <h2 className="font-black text-lg text-red-500 flex items-center gap-2"><span>🚨</span> BÁO ĐỘNG ĐỎ</h2>
              <button onClick={() => setIsDeadlineModalOpen(false)} className="font-black text-slate-400 hover:text-red-500 bg-white w-8 h-8 rounded-full shadow-sm border border-slate-200 flex items-center justify-center transition-colors cursor-pointer">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar bg-slate-50/50">
              {urgentEvents.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                  <div className="text-5xl mb-3">☕</div>
                  <div className="text-[13px] font-black text-slate-500">Chưa có hạn chót nào trong 3 ngày tới.<br/><span className="text-indigo-400 text-[11px]">Mọi thứ đang nằm trong tầm kiểm soát!</span></div>
                </div>
              ) : urgentEvents.sort((a, b) => a.end - b.end).map(ev => {
                const daysLeft = getDaysLeft(ev);
                const cat = getCat(ev.category);
                return (
                  <div key={ev.id} onClick={() => { setIsDeadlineModalOpen(false); setSelectedEventDetail(ev); }}
                    className="flex gap-3 p-3 rounded-2xl cursor-pointer transition-all bg-white border-2 border-red-100 hover:border-red-400 shadow-sm hover:shadow-md group">
                    <img src={ev.image} className="w-16 h-16 rounded-xl object-cover border border-slate-100 group-hover:scale-105 transition-transform" alt="" />
                    <div className="flex-1 min-w-0 py-1">
                      <div className="font-black text-[13px] truncate text-slate-800 mb-1.5">{ev.title}</div>
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-red-500 text-white shadow-sm animate-pulse inline-block">
                        {daysLeft === 0 ? '🔥 NỘP NGAY HÔM NAY' : `⏳ CÒN ${daysLeft} NGÀY NỮA`}
                      </span>
                    </div>
                    <div className="shrink-0 text-[10px] font-black px-2 py-1 rounded-lg self-center bg-slate-50 border border-slate-200" style={{ color: cat.color }}>{cat.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* CROP MODAL */}
      {isCropModalOpen && upImg && (
        <div className="fixed inset-0 flex flex-col items-center justify-center z-[200] p-4" style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(15px)' }}>
          <div className="text-center mb-6">
            <h2 className="text-indigo-900 font-black text-2xl uppercase tracking-wide drop-shadow-sm">Cắt Ảnh</h2>
            <p className="text-[11px] mt-2 px-4 py-1.5 rounded-full inline-block font-bold bg-indigo-50 text-indigo-500 border border-indigo-200 shadow-sm">
              Kéo thả khung để căn chỉnh ảnh của bạn
            </p>
          </div>
          <div className="rounded-3xl overflow-hidden p-2 bg-white shadow-[0_20px_50px_rgba(99,102,241,0.15)] border-[3px] border-indigo-100" style={{ maxWidth: '95%' }}>
            <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)} aspect={cropAspectRatio}>
              <img ref={imgRef} src={upImg} alt="crop" className="max-h-[50vh] max-w-full object-contain rounded-2xl" />
            </ReactCrop>
          </div>
          <div className="flex gap-4 mt-8 w-full max-w-[400px]">
            <button onClick={() => { setIsCropModalOpen(false); setUpImg(null); }}
              className="flex-1 py-3.5 rounded-2xl font-black text-sm bg-white text-slate-500 border-2 border-slate-200 hover:bg-slate-50 hover:text-slate-700 shadow-sm transition-all cursor-pointer">
              Huỷ
            </button>
            <button onClick={handleCropComplete}
              className="flex-1 py-3.5 rounded-2xl font-black text-sm bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_10px_20px_rgba(99,102,241,0.3)] hover:-translate-y-1 transition-all cursor-pointer">
              ✅ Xác Nhận
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TRANG CÔNG KHAI / FRIEND FEED MODAL
      ════════════════════════════════════════════════════════ */}
      {viewingFriendFeed && (
        <div className="fixed inset-0 flex items-center justify-center z-[130] p-2 md:p-4" style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)' }} onClick={() => setViewingFriendFeed(null)}>
          <div className="w-full max-w-[560px] h-[90vh] rounded-[2.5rem] flex flex-col overflow-hidden bg-slate-50 border-[4px] border-pink-200 shadow-[0_20px_60px_rgba(236,72,153,0.15)] relative" onClick={e => e.stopPropagation()}>

            {/* Cover */}
            <div className="relative h-48 shrink-0 bg-pink-50 p-2">
              <div className="w-full h-full rounded-[2rem] overflow-hidden relative border-2 border-white shadow-inner bg-white">
                <img src={viewingFriendFeed.profile.background} alt="bg" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/20 to-transparent"></div>
              </div>
              <button onClick={() => setViewingFriendFeed(null)}
                className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center font-black bg-white/80 text-slate-500 hover:bg-white hover:text-pink-500 border-2 border-white shadow-md backdrop-blur-sm transition-all z-20 cursor-pointer">✕</button>
              
              <div className="absolute -bottom-10 left-6 flex items-end gap-4 z-10">
                <img src={viewingFriendFeed.profile.avatar} alt="" className="w-24 h-24 rounded-[1.5rem] border-4 object-cover shadow-lg bg-white" style={{ borderColor: 'white' }} />
                <div className="pb-10 drop-shadow-md">
                  <div className="font-black text-2xl text-indigo-900 bg-white/60 px-2 py-0.5 rounded-lg backdrop-blur-sm inline-block">{viewingFriendFeed.profile.displayName}</div>
                  <div className="text-[11px] font-black font-mono text-pink-600 bg-pink-100 border border-pink-200 px-3 py-1 rounded-full mt-1.5 shadow-sm inline-block">ID: {viewingFriendFeed.profile.shortId}</div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pt-16 px-4 md:px-6 pb-6 custom-scrollbar space-y-6">
              
              {/* LỊCH NGÀY PUBLIC */}
              <div>
                <h4 className="text-[11px] font-black text-indigo-500 uppercase mb-3 flex items-center gap-1.5 ml-2">
                  <span className="text-sm">⏰</span> Lịch trình hôm nay ({viewingFriendFeed.viewDate})
                </h4>
                {(!viewingFriendFeed.daily || viewingFriendFeed.daily.length === 0) ? (
                  <div className="text-center py-6 bg-white rounded-3xl border-2 border-dashed border-indigo-100 text-[12px] font-bold text-slate-400">
                    Hôm nay rảnh rỗi, chưa có lịch trình nào.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {viewingFriendFeed.daily.map(t => {
                      const isDone = (t.completedDates || []).includes(viewingFriendFeed.viewDate);
                      const myReaction = (t.reactions || {})[user?.uid];
                      
                      const reactionCounts = {};
                      REACTIONS.forEach(emo => {
                        const count = Object.values(t.reactions || {}).filter(r => r === emo).length;
                        if (count > 0) reactionCounts[emo] = count;
                      });

                      return (
                        <div key={t.id} id={`public-item-${t.id}`} className="bg-white rounded-3xl border border-indigo-100 shadow-sm p-4 hover:shadow-md transition-all scroll-mt-20">
                          <div className={`flex items-center gap-3 ${isDone ? 'opacity-60' : ''}`}>
                            <div className={`text-[12px] md:text-[14px] font-black font-mono px-2 py-1 rounded-lg text-center ${isDone ? 'bg-slate-100 text-slate-400' : 'bg-indigo-100 text-indigo-600'}`}>
                              {t.time} {t.endTime && <><br/><span className="text-[9px]">{t.endTime}</span></>}
                            </div>
                            <div className={`text-[13px] md:text-[14px] font-bold flex-1 ${isDone ? 'line-through text-slate-400' : 'text-slate-700'}`}>{t.task}</div>
                            {isDone && <span className="text-emerald-500 text-lg font-black mr-2">✔</span>}
                          </div>
                          
                          {/* 🔥 BỘ TƯƠNG TÁC CẢM XÚC THÔNG MINH - MOBILE SAFE */}
                          <div className="flex items-center gap-2 mt-3">
                            {Object.keys(reactionCounts).length > 0 && (
                              <div className="flex gap-1.5 bg-slate-50 px-2 py-1.5 rounded-xl border border-slate-100">
                                {Object.keys(reactionCounts).map(emo => (
                                  <div key={emo} className="flex items-center gap-0.5 text-[11px] font-black text-slate-600">
                                    <span>{emo}</span>
                                    <span className="text-indigo-500">{reactionCounts[emo]}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            <div className="relative">
                              <button onClick={() => setActiveReactionId(activeReactionId === t.id ? null : t.id)}
                                className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-colors cursor-pointer ${myReaction ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                                {myReaction ? `${myReaction} Đã thả` : '🤍 Thả cảm xúc'}
                              </button>
                              
                              {activeReactionId === t.id && (
                                <div className="absolute bottom-full left-0 mb-2 flex bg-white shadow-[0_10px_40px_rgba(0,0,0,0.2)] border border-slate-200 rounded-full p-2 gap-1.5 z-50">
                                  {REACTIONS.map(emo => (
                                    <button key={emo} onClick={() => { handleInteract(viewingFriendFeed.uid, t.id, 'daily', 'reaction', emo, null, viewingFriendFeed.viewDate); setActiveReactionId(null); }}
                                      className="text-xl hover:scale-125 transition-transform cursor-pointer px-1 active:scale-95">
                                      {emo}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* COMMENTS UI */}
                          {t.comments && t.comments.length > 0 && (
                            <div className="mt-3 space-y-3 max-h-48 overflow-y-auto custom-scrollbar bg-slate-50 p-3 rounded-xl">
                              {t.comments.map(c => (
                                <div key={c.id} className="flex gap-2">
                                  <img src={c.avatar} alt="av" className="w-7 h-7 rounded-full object-cover shrink-0 border border-slate-200" />
                                  <div className="flex-1 min-w-0 bg-white p-2.5 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm">
                                    <div className="text-[11px] font-black text-indigo-900">{c.displayName} <span className="text-slate-400 font-normal ml-1 text-[9px]">{new Date(c.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div>
                                    <div className="text-[12px] text-slate-700 mt-1 break-words leading-relaxed">
                                      {c.replyToName && <span className="font-bold text-indigo-500 mr-1.5">@{c.replyToName}</span>}
                                      {c.text}
                                    </div>
                                    <button onClick={() => setReplyingTo(p => ({...p, [t.id]: { uid: c.uid, displayName: c.displayName }}))} 
                                      className="text-[10px] text-slate-400 font-bold hover:text-indigo-600 mt-1.5 transition-colors cursor-pointer inline-block">Phản hồi</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="mt-3 flex flex-col">
                            {replyingTo[t.id] && (
                              <div className="flex items-center justify-between bg-indigo-50 px-3 py-1.5 rounded-t-xl text-[10px] text-indigo-600 font-bold border border-b-0 border-indigo-100">
                                <span>Đang trả lời @{replyingTo[t.id].displayName}</span>
                                <button onClick={() => setReplyingTo(p => { const newP = {...p}; delete newP[t.id]; return newP; })} className="hover:text-red-500 cursor-pointer">✕</button>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <input type="text" placeholder="Viết bình luận..." value={commentInputs[t.id] || ''} onChange={e => setCommentInputs(p => ({...p, [t.id]: e.target.value}))}
                                className={`flex-1 bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] font-medium outline-none focus:border-indigo-300 ${replyingTo[t.id] ? 'rounded-b-xl rounded-tr-xl' : 'rounded-xl'}`} 
                                onKeyDown={e => { if(e.key==='Enter' && (commentInputs[t.id] || '').trim()){ handleInteract(viewingFriendFeed.uid, t.id, 'daily', 'comment', commentInputs[t.id], replyingTo[t.id], viewingFriendFeed.viewDate); } }}/>
                              <button onClick={() => { if((commentInputs[t.id] || '').trim()){ handleInteract(viewingFriendFeed.uid, t.id, 'daily', 'comment', commentInputs[t.id], replyingTo[t.id], viewingFriendFeed.viewDate); } }}
                                className={`px-4 py-2 bg-indigo-500 text-white text-[11px] font-black hover:bg-indigo-600 transition-colors cursor-pointer shadow-sm ${replyingTo[t.id] ? 'rounded-b-xl rounded-tr-xl' : 'rounded-xl'}`}>Gửi</button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* SỰ KIỆN DÀI HẠN PUBLIC */}
              <div className="pt-4 border-t-2 border-dashed border-pink-200">
                <h4 className="text-[11px] font-black text-pink-500 uppercase mb-4 flex items-center gap-1.5 ml-2">
                  <span className="text-sm">📅</span> Sự kiện lớn
                </h4>
                {viewingFriendFeed.events.length === 0 ? (
                  <div className="text-center py-8 bg-white rounded-3xl border-2 border-dashed border-pink-100">
                    <div className="text-4xl mb-3">💤</div>
                    <div className="text-[12px] font-bold text-slate-400">Người dùng này chưa chia sẻ sự kiện nào.</div>
                  </div>
                ) : (
                  <div className="relative border-l-[3px] border-pink-200 ml-4 space-y-6">
                    {viewingFriendFeed.events.map(ev => {
                      const cat = getCat(ev.category);
                      const myReaction = (ev.reactions || {})[user?.uid];

                      const reactionCounts = {};
                      REACTIONS.forEach(emo => {
                        const count = Object.values(ev.reactions || {}).filter(r => r === emo).length;
                        if (count > 0) reactionCounts[emo] = count;
                      });

                      return (
                        <div key={ev.id} id={`public-item-${ev.id}`} className="relative pl-7 scroll-mt-20">
                          <div className="absolute -left-[11px] top-4 w-5 h-5 bg-pink-400 rounded-full border-[4px] border-white shadow-md flex items-center justify-center"></div>
                          
                          <div className="bg-white border-2 border-pink-100 rounded-3xl p-4 shadow-sm hover:shadow-md transition-shadow hover:-translate-y-0.5">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="text-[10px] font-black text-white bg-pink-400 inline-block px-2.5 py-1 rounded-lg shadow-sm">{ev.dateStr}</div>
                              <div className="text-[10px] font-black px-2 py-1 rounded-lg bg-slate-50 text-slate-500 border border-slate-100">{cat.icon} {cat.label}</div>
                            </div>
                            <h4 className="font-black text-slate-800 text-lg mb-3 leading-tight">{ev.title}</h4>
                            <img src={ev.image} alt="ev-img" className="w-full h-36 md:h-44 object-cover rounded-2xl border border-slate-100 shadow-sm" />
                            {ev.rewards && (
                              <p className="mt-3 text-[12px] text-amber-700 font-bold bg-amber-50 p-2.5 rounded-xl border border-amber-100 flex items-center gap-2 shadow-inner"><span className="text-lg">⭐</span> {ev.rewards}</p>
                            )}

                            {/* 🔥 BỘ TƯƠNG TÁC CẢM XÚC THÔNG MINH - EVENT */}
                            <div className="flex items-center gap-2 mt-4">
                              {Object.keys(reactionCounts).length > 0 && (
                                <div className="flex gap-1.5 bg-pink-50 px-2 py-1.5 rounded-xl border border-pink-100">
                                  {Object.keys(reactionCounts).map(emo => (
                                    <div key={emo} className="flex items-center gap-0.5 text-[11px] font-black text-pink-600">
                                      <span>{emo}</span>
                                      <span className="text-pink-500">{reactionCounts[emo]}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              <div className="relative">
                                <button onClick={() => setActiveReactionId(activeReactionId === ev.id ? null : ev.id)}
                                  className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-colors cursor-pointer ${myReaction ? 'bg-pink-50 text-pink-600 border-pink-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                                  {myReaction ? `${myReaction} Đã thả` : '🤍 Thả cảm xúc'}
                                </button>
                                
                                {activeReactionId === ev.id && (
                                  <div className="absolute bottom-full left-0 mb-2 flex bg-white shadow-[0_10px_40px_rgba(0,0,0,0.2)] border border-slate-200 rounded-full p-2 gap-1.5 z-50">
                                    {REACTIONS.map(emo => (
                                      <button key={emo} onClick={() => { handleInteract(viewingFriendFeed.uid, ev.id, 'event', 'reaction', emo, null); setActiveReactionId(null); }}
                                        className="text-xl hover:scale-125 transition-transform cursor-pointer px-1 active:scale-95">
                                        {emo}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* COMMENTS EVENT */}
                            {ev.comments && ev.comments.length > 0 && (
                              <div className="mt-3 space-y-3 max-h-48 overflow-y-auto custom-scrollbar bg-slate-50 p-3 rounded-xl">
                                {ev.comments.map(c => (
                                  <div key={c.id} className="flex gap-2">
                                    <img src={c.avatar} alt="av" className="w-7 h-7 rounded-full object-cover shrink-0 border border-slate-200" />
                                    <div className="flex-1 min-w-0 bg-white p-2.5 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm">
                                      <div className="text-[11px] font-black text-pink-900">{c.displayName} <span className="text-slate-400 font-normal ml-1 text-[9px]">{new Date(c.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div>
                                      <div className="text-[12px] text-slate-700 mt-1 break-words leading-relaxed">
                                        {c.replyToName && <span className="font-bold text-pink-500 mr-1.5">@{c.replyToName}</span>}
                                        {c.text}
                                      </div>
                                      <button onClick={() => setReplyingTo(p => ({...p, [ev.id]: { uid: c.uid, displayName: c.displayName }}))} 
                                        className="text-[10px] text-slate-400 font-bold hover:text-pink-600 mt-1.5 transition-colors cursor-pointer inline-block">Phản hồi</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="mt-3 flex flex-col">
                              {replyingTo[ev.id] && (
                                <div className="flex items-center justify-between bg-pink-50 px-3 py-1.5 rounded-t-xl text-[10px] text-pink-600 font-bold border border-b-0 border-pink-100">
                                  <span>Đang trả lời @{replyingTo[ev.id].displayName}</span>
                                  <button onClick={() => setReplyingTo(p => { const newP = {...p}; delete newP[ev.id]; return newP; })} className="hover:text-red-500 cursor-pointer">✕</button>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <input type="text" placeholder="Viết bình luận..." value={commentInputs[ev.id] || ''} onChange={e => setCommentInputs(p => ({...p, [ev.id]: e.target.value}))}
                                  className={`flex-1 bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] font-medium outline-none focus:border-pink-300 ${replyingTo[ev.id] ? 'rounded-b-xl rounded-tr-xl' : 'rounded-xl'}`} 
                                  onKeyDown={e => { if(e.key==='Enter' && (commentInputs[ev.id] || '').trim()){ handleInteract(viewingFriendFeed.uid, ev.id, 'event', 'comment', commentInputs[ev.id], replyingTo[ev.id]); } }}/>
                                <button onClick={() => { if((commentInputs[ev.id] || '').trim()){ handleInteract(viewingFriendFeed.uid, ev.id, 'event', 'comment', commentInputs[ev.id], replyingTo[ev.id]); } }}
                                  className={`px-4 py-2 bg-pink-500 text-white text-[11px] font-black hover:bg-pink-600 transition-colors cursor-pointer shadow-sm ${replyingTo[ev.id] ? 'rounded-b-xl rounded-tr-xl' : 'rounded-xl'}`}>Gửi</button>
                              </div>
                            </div>

                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* SCROLLBAR STYLES */}
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(244,114,182,0.4); border-radius: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(236,72,153,0.6); }
        .style-date::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.6; transition: opacity 0.2s; }
        .style-date::-webkit-calendar-picker-indicator:hover { opacity: 1; }
        input[type=range]::-webkit-slider-thumb { cursor: pointer; }
        input[type="time"]::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.6; transition: opacity 0.2s; }
        input[type="time"]::-webkit-calendar-picker-indicator:hover { opacity: 1; }
        input[type="date"]::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.6; transition: opacity 0.2s; }
        input[type="date"]::-webkit-calendar-picker-indicator:hover { opacity: 1; }
        .scroll-mt-20 { scroll-margin-top: 5rem; }
      ` }} />
    </div>
  );
};

export default GameRoadmap;