import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { db, auth } from './firebase';
import { doc, setDoc, getDoc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { signOut } from "firebase/auth";

// ============================================================
// CẤU HÌNH DANH MỤC & MÀU SẮC
// ============================================================
const CATEGORIES = [
  { id: 'study',   label: '📚 Học tập',   color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  { id: 'work',    label: '💼 Công việc',  color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9' },
  { id: 'goal',    label: '🎯 Mục tiêu',   color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
  { id: 'event',   label: '🎉 Sự kiện',   color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  { id: 'health',  label: '💪 Sức khoẻ',  color: '#ef4444', bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  { id: 'other',   label: '✨ Khác',       color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', text: '#334155' },
];

const STATUSES = [
  { id: 'todo',        label: 'Chưa bắt đầu', icon: '⬜', accent: '#94a3b8' },
  { id: 'in-progress', label: 'Đang thực hiện', icon: '🔵', accent: '#3b82f6' },
  { id: 'done',        label: 'Hoàn thành',    icon: '✅', accent: '#10b981' },
];

const PRIORITIES = [
  { id: 'low',    label: 'Thấp',   icon: '🟢' },
  { id: 'medium', label: 'Vừa',    icon: '🟡' },
  { id: 'high',   label: 'Cao',    icon: '🔴' },
];

const getCat  = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[5];
const getStat = (id) => STATUSES.find(s => s.id === id)   || STATUSES[0];
const getPri  = (id) => PRIORITIES.find(p => p.id === id) || PRIORITIES[1];

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
  const [zoomLevel, setZoomLevel]   = useState(1);      // 0.5x – 3x
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCat, setFilterCat]   = useState('all');
  const [filterStat, setFilterStat] = useState('all');

  const dayWidth = Math.max(20, 100 * zoomLevel); // px per day

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
  const [isDeadlineModalOpen, setIsDeadlineModalOpen] = useState(false);
  const [isStatsOpen,         setIsStatsOpen]         = useState(false);
  const generateID = () => Math.floor(10000000 + Math.random() * 90000000).toString();

  const [profile, setProfile] = useState({
    avatar:      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200",
    background:  "https://images.unsplash.com/photo-1541562232579-512a21360020?q=80&w=800",
    title:       "TỔNG QUAN PHIÊN BẢN",
    subtitle:    "v7.3",
    displayName: "Nhà Khai Phá",
    shortId:     "........",
    bio:         "",
  });

  const [events,      setEvents]      = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [friendsData, setFriendsData] = useState([]);
  const [searchFriendId,    setSearchFriendId]    = useState('');
  const [viewingFriendFeed, setViewingFriendFeed] = useState(null);
  const [isLoading,         setIsLoading]         = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let loadedProfile = data.profile ? { ...data.profile } : { ...profile };
        let needsSave = false;
        if (!loadedProfile.shortId || loadedProfile.shortId === "........") { loadedProfile.shortId = generateID(); needsSave = true; }
        if (!loadedProfile.displayName) { loadedProfile.displayName = "Nhà Khai Phá"; needsSave = true; }
        if (!loadedProfile.background)  { loadedProfile.background  = loadedProfile.avatar || profile.background; needsSave = true; }
        setProfile(loadedProfile);
        if (needsSave) setDoc(doc(db, "users", user.uid), { profile: loadedProfile }, { merge: true });
        if (data.events) {
          setEvents(data.events.map(ev => ({
            ...ev,
            start:    ev.start.toDate ? ev.start.toDate() : new Date(ev.start),
            end:      ev.end.toDate   ? ev.end.toDate()   : new Date(ev.end),
            isShared: ev.isShared || false,
            category: ev.category || 'other',
            status:   ev.status   || 'todo',
            priority: ev.priority || 'medium',
            progress: ev.progress ?? 0,
            notes:    ev.notes    || '',
          })));
        }
        if (data.friends) setFriendsList(data.friends);
      } else {
        const newProfile = { ...profile, shortId: generateID() };
        setProfile(newProfile);
        saveToCloud(newProfile, events, []);
      }
      setIsLoading(false);
    });
    return () => unsub();
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

  const saveToCloud = async (newProfile, newEvents, newFriends = friendsList) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), { profile: newProfile, events: newEvents, friends: newFriends });
    } catch (error) { console.error("Lỗi đồng bộ:", error); }
  };

  // ── 3. STATISTICS ──────────────────────────────────────────
  const stats = useMemo(() => {
    const total     = events.length;
    const done      = events.filter(e => e.status === 'done').length;
    const inProg    = events.filter(e => e.status === 'in-progress').length;
    const upcoming  = events.filter(e => e.start > now).length;
    const urgentCount = events.filter(e => {
      const d = Math.ceil((e.end.getTime() - now.getTime()) / 86400000);
      return d >= 0 && d <= 3;
    }).length;
    const catBreakdown = CATEGORIES.map(c => ({ ...c, count: events.filter(e => e.category === c.id).length }));
    return { total, done, inProg, upcoming, urgentCount, catBreakdown };
  }, [events]);

  // ── 4. FILTERED EVENTS ─────────────────────────────────────
  const filteredEvents = useMemo(() => events.filter(ev => {
    const matchCat   = filterCat  === 'all' || ev.category === filterCat;
    const matchStat  = filterStat === 'all' || ev.status   === filterStat;
    const matchSearch = !searchQuery || ev.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchStat && matchSearch;
  }), [events, filterCat, filterStat, searchQuery]);

  // ── 5. SETTINGS MODAL STATE ────────────────────────────────
  const [isSettingsOpen,   setIsSettingsOpen]   = useState(false);
  const [activeTab,        setActiveTab]        = useState('profile');
  const [profileFormData,  setProfileFormData]  = useState(profile);
  const [eventFormData,    setEventFormData]    = useState({
    title: '', startDate: '', endDate: '', rewards: '', notes: '',
    category: 'study', status: 'todo', priority: 'medium', progress: 0,
  });

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
    if      (target === 'avatar')     { setCropAspectRatio(1/1);   setCrop({ unit: '%', width: 50, aspect: 1/1 }); }
    else if (target === 'background') { setCropAspectRatio(9/16);  setCrop({ unit: '%', width: 50, aspect: 9/16 }); }
    else                              { setCropAspectRatio(21/9);  setCrop({ unit: '%', width: 80, aspect: 21/9 }); }
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
      alert('Không tìm thấy ảnh trong Clipboard!');
    } catch { alert('Trình duyệt chặn Clipboard. Dán bằng Ctrl+V nhé!'); }
  };

  useEffect(() => {
    const handleGlobalPaste = (e) => {
      if (!isSettingsOpen || isCropModalOpen || activeTab === 'friends') return;
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

  // ── 7. HANDLERS ────────────────────────────────────────────
  const handleSaveProfile = () => {
    const upd = {
      ...profile,
      displayName: profileFormData.displayName,
      avatar:      profileFormData.avatar,
      background:  profileFormData.background,
      title:       profileFormData.title.toUpperCase(),
      subtitle:    profileFormData.subtitle.toUpperCase(),
      bio:         profileFormData.bio || '',
    };
    setProfile(upd); saveToCloud(upd, events);
    alert("✅ Đã đồng bộ lên Cloud!");
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
    };

    const updated = [...events, newEvent];
    setEvents(updated); saveToCloud(profile, updated);
    setEventFormData({ title: '', startDate: '', endDate: '', rewards: '', notes: '', category: 'study', status: 'todo', priority: 'medium', progress: 0, croppedImage: null });
  };

  const handleUpdateEventField = (eventId, field, value) => {
    const updated = events.map(ev => ev.id === eventId ? { ...ev, [field]: value } : ev);
    setEvents(updated);
    saveToCloud(profile, updated);
    setSelectedEventDetail(updated.find(e => e.id === eventId));
  };

  const handleDeleteEvent = (id) => {
    const updated = events.filter(e => e.id !== id);
    setEvents(updated); saveToCloud(profile, updated);
    setSelectedEventDetail(null);
  };

  const handleToggleShareEvent = (eventId) => {
    const updated = events.map(ev => ev.id === eventId ? { ...ev, isShared: !ev.isShared } : ev);
    setEvents(updated); saveToCloud(profile, updated);
    setSelectedEventDetail(updated.find(e => e.id === eventId));
  };

  const handleAddFriend = async (e) => {
    e.preventDefault();
    if (searchFriendId === profile.shortId) { alert("Bạn không thể tự kết bạn!"); return; }
    if (friendsList.includes(searchFriendId)) { alert("Đã có trong danh sách!"); return; }
    const q = query(collection(db, "users"), where("profile.shortId", "==", searchFriendId));
    const snap = await getDocs(q);
    if (snap.empty) { alert("Không tìm thấy người dùng này!"); return; }
    let foundUid = ""; snap.forEach(d => { foundUid = d.id; });
    const newList = [...friendsList, foundUid];
    setFriendsList(newList); saveToCloud(profile, events, newList); setSearchFriendId('');
    alert("✅ Kết bạn thành công!");
  };

  const handleViewFriendFeed = async (friendUid) => {
    const fDoc = await getDoc(doc(db, "users", friendUid));
    if (!fDoc.exists()) return;
    const fData = fDoc.data(); let fProfile = fData.profile;
    if (!fProfile.background) fProfile.background = fProfile.avatar;
    setViewingFriendFeed({
      profile: fProfile,
      events: (fData.events || []).filter(ev => ev.isShared).map(ev => ({
        ...ev,
        start: ev.start.toDate ? ev.start.toDate() : new Date(ev.start),
        end:   ev.end.toDate   ? ev.end.toDate()   : new Date(ev.end),
      })).sort((a, b) => a.start - b.start),
    });
    setIsSettingsOpen(false);
  };

  const handleLogout = () => signOut(auth).catch(console.error);

  // ── 8. HELPERS ─────────────────────────────────────────────
  const getDaysLeft = (ev) => Math.ceil((ev.end.getTime() - now.getTime()) / 86400000);
  const getEventProgress = (ev) => {
    if (ev.status === 'done') return 100;
    if (ev.status === 'todo') return 0;
    return ev.progress || 0;
  };

  const urgentEvents = events.filter(ev => { const d = getDaysLeft(ev); return d >= 0 && d <= 3; });

  // ── 9. RENDER ──────────────────────────────────────────────
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-400 font-semibold text-sm tracking-widest uppercase">Đang tải dữ liệu...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-2 md:p-4 font-sans select-none" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>

      {/* ══ KHUNG APP ══════════════════════════════════════════ */}
      <div className="w-full max-w-[1500px] h-[96vh] md:h-[820px] rounded-2xl flex flex-col relative overflow-hidden"
        style={{ background: '#0f172a', border: '1px solid rgba(99,102,241,0.3)', boxShadow: '0 0 80px rgba(99,102,241,0.2), 0 0 0 1px rgba(255,255,255,0.05)' }}>

        {/* ═══ HEADER ═══════════════════════════════════════════ */}
        <div className="h-14 flex items-center justify-between px-4 border-b shrink-0"
          style={{ background: 'linear-gradient(90deg, #1e1b4b, #0f172a)', borderColor: 'rgba(99,102,241,0.25)' }}>

          {/* LEFT — Avatar + Name */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <img src={profile.avatar} alt="avatar"
                className="w-9 h-9 rounded-xl object-cover border-2"
                style={{ borderColor: 'rgba(99,102,241,0.8)' }} />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900"></div>
            </div>
            <div>
              <div className="text-white font-bold text-[13px] leading-tight">{profile.displayName}</div>
              <div className="text-[10px] font-mono" style={{ color: '#818cf8' }}>ID: {profile.shortId}</div>
            </div>
            <div className="hidden md:flex items-center gap-1.5 ml-4">
              <div className="h-6 w-px bg-slate-700"></div>
              <div className="flex gap-2 text-[11px] font-semibold ml-2">
                <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>
                  ✅ {stats.done} xong
                </span>
                <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>
                  🔵 {stats.inProg} đang làm
                </span>
                <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' }}>
                  📅 {stats.upcoming} sắp tới
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT — Action Buttons */}
          <div className="flex items-center gap-2">
            <button onClick={() => setIsStatsOpen(true)}
              className="hidden md:flex items-center gap-1.5 text-[11px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all hover:scale-105"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
              📊 Thống kê
            </button>

            <button onClick={() => setIsDeadlineModalOpen(true)}
              className="relative flex items-center gap-1.5 text-[11px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all hover:scale-105"
              style={{ background: urgentEvents.length > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.1)', color: urgentEvents.length > 0 ? '#fca5a5' : '#fbbf24', border: `1px solid ${urgentEvents.length > 0 ? 'rgba(239,68,68,0.4)' : 'rgba(251,191,36,0.2)'}` }}>
              ⏰ Deadline
              {urgentEvents.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-pulse">
                  {urgentEvents.length}
                </span>
              )}
            </button>

            <button onClick={() => { setProfileFormData(profile); setIsSettingsOpen(true); }}
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all hover:scale-105"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)' }}>
              ⚙️ Cài đặt
            </button>

            <button onClick={handleLogout}
              className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all hover:scale-105"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }}>
              ⏏
            </button>
          </div>
        </div>

        {/* ═══ BODY ══════════════════════════════════════════════ */}
        <div className="flex flex-1 overflow-hidden gap-2 p-2">

          {/* ── SIDEBAR ─────────────────────────────────────────── */}
          <div className={`w-full md:w-[260px] shrink-0 flex flex-col gap-2 ${showMobileMap ? 'hidden md:flex' : 'flex'}`}>

            {/* Profile Card */}
            <div className="relative rounded-xl overflow-hidden flex-none h-[180px]"
              style={{ border: '1px solid rgba(99,102,241,0.25)' }}>
              <img src={profile.background} alt="bg" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.3) 60%, transparent 100%)' }}></div>
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <div className="text-white font-black text-[15px] leading-tight drop-shadow-sm">{profile.title}</div>
                <div className="text-[11px] font-bold mt-0.5" style={{ color: '#67e8f9' }}>{profile.subtitle}</div>
                {profile.bio && <div className="text-[10px] text-slate-300 mt-1 line-clamp-2">{profile.bio}</div>}
              </div>
              <div className="md:hidden absolute inset-0 flex items-center justify-center">
                <button onClick={() => setShowMobileMap(true)}
                  className="bg-indigo-600 text-white font-black px-6 py-3 rounded-full text-sm shadow-lg border border-indigo-400">
                  XEM LỊCH TRÌNH →
                </button>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-0.5">
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'Tổng',      val: stats.total,    color: '#818cf8', bg: 'rgba(99,102,241,0.1)',   icon: '📋' },
                  { label: 'Hoàn thành', val: stats.done,    color: '#34d399', bg: 'rgba(16,185,129,0.1)',  icon: '✅' },
                  { label: 'Đang làm',  val: stats.inProg,   color: '#60a5fa', bg: 'rgba(59,130,246,0.1)',  icon: '⚡' },
                  { label: 'Sắp tới',   val: stats.upcoming, color: '#fb923c', bg: 'rgba(251,146,60,0.1)',  icon: '📅' },
                ].map(s => (
                  <div key={s.label} className="p-3 rounded-xl text-center"
                    style={{ background: s.bg, border: `1px solid ${s.color}25` }}>
                    <div className="text-lg mb-0.5">{s.icon}</div>
                    <div className="font-black text-xl" style={{ color: s.color }}>{s.val}</div>
                    <div className="text-[10px] font-semibold" style={{ color: s.color + 'bb' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Category Breakdown */}
              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>Phân loại</div>
                <div className="space-y-1.5">
                  {stats.catBreakdown.filter(c => c.count > 0).map(cat => (
                    <div key={cat.id} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.color }}></div>
                      <div className="text-[11px] text-slate-300 flex-1 truncate">{cat.label}</div>
                      <div className="text-[11px] font-bold" style={{ color: cat.color }}>{cat.count}</div>
                    </div>
                  ))}
                  {stats.catBreakdown.every(c => c.count === 0) && (
                    <div className="text-[11px] text-slate-600 italic">Chưa có sự kiện nào</div>
                  )}
                </div>
              </div>

              {/* Upcoming this week */}
              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>Tuần này</div>
                {(() => {
                  const weekEnd = new Date(now.getTime() + 7 * 86400000);
                  const thisWeek = events.filter(e => e.end >= now && e.start <= weekEnd).sort((a, b) => a.end - b.end).slice(0, 3);
                  if (thisWeek.length === 0) return <div className="text-[11px] text-slate-600 italic">Rảnh rỗi chill thôi! ☕</div>;
                  return thisWeek.map(ev => {
                    const cat = getCat(ev.category);
                    return (
                      <div key={ev.id} onClick={() => setSelectedEventDetail(ev)}
                        className="flex items-center gap-2 py-1.5 cursor-pointer group">
                        <div className="w-1.5 h-8 rounded-full shrink-0" style={{ background: cat.color }}></div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-semibold text-slate-200 truncate group-hover:text-white">{ev.title}</div>
                          <div className="text-[9px]" style={{ color: cat.color }}>{ev.dateStr}</div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          {/* ── TIMELINE ────────────────────────────────────────── */}
          <div className={`flex-1 flex flex-col rounded-xl overflow-hidden ${showMobileMap ? 'flex' : 'hidden md:flex'}`}
            style={{ background: '#0a0f1e', border: '1px solid rgba(99,102,241,0.2)' }}>

            {/* Timeline Toolbar */}
            <div className="shrink-0 px-3 py-2 flex flex-wrap items-center gap-2"
              style={{ background: 'rgba(15,23,42,0.8)', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>

              {/* Back button mobile */}
              <button onClick={() => setShowMobileMap(false)}
                className="md:hidden text-[10px] font-bold px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                ← Back
              </button>

              {/* Search */}
              <div className="relative flex-1 min-w-[120px] max-w-[200px]">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="🔍 Tìm kiếm..."
                  className="w-full text-[11px] py-1.5 pl-3 pr-3 rounded-lg outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }} />
              </div>

              {/* Category Filter */}
              <div className="flex gap-1 overflow-x-auto custom-scrollbar">
                <button onClick={() => setFilterCat('all')}
                  className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-md transition-all"
                  style={{ background: filterCat === 'all' ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.05)', color: filterCat === 'all' ? '#c7d2fe' : '#64748b', border: `1px solid ${filterCat === 'all' ? 'rgba(99,102,241,0.6)' : 'transparent'}` }}>
                  Tất cả
                </button>
                {CATEGORIES.map(cat => (
                  <button key={cat.id} onClick={() => setFilterCat(cat.id === filterCat ? 'all' : cat.id)}
                    className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-md transition-all"
                    style={{ background: filterCat === cat.id ? cat.color + '33' : 'rgba(255,255,255,0.04)', color: filterCat === cat.id ? cat.color : '#64748b', border: `1px solid ${filterCat === cat.id ? cat.color + '66' : 'transparent'}` }}>
                    {cat.label.split(' ')[0]}
                  </button>
                ))}
              </div>

              {/* Status Filter */}
              <div className="flex gap-1">
                {[{ id: 'all', label: '⬛ All' }, ...STATUSES.map(s => ({ id: s.id, label: s.icon + ' ' + s.label.split(' ')[0] }))].map(s => (
                  <button key={s.id} onClick={() => setFilterStat(s.id === filterStat ? 'all' : s.id)}
                    className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-md transition-all"
                    style={{ background: filterStat === s.id ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)', color: filterStat === s.id ? '#e2e8f0' : '#475569', border: `1px solid ${filterStat === s.id ? 'rgba(255,255,255,0.2)' : 'transparent'}` }}>
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Zoom */}
              <div className="flex items-center gap-1 ml-auto">
                <button onClick={() => setZoomLevel(z => Math.max(0.4, +(z - 0.3).toFixed(1)))}
                  className="w-6 h-6 rounded flex items-center justify-center text-sm font-black"
                  style={{ background: 'rgba(255,255,255,0.07)', color: '#94a3b8' }}>−</button>
                <span className="text-[10px] font-bold w-10 text-center" style={{ color: '#818cf8' }}>{Math.round(zoomLevel * 100)}%</span>
                <button onClick={() => setZoomLevel(z => Math.min(3, +(z + 0.3).toFixed(1)))}
                  className="w-6 h-6 rounded flex items-center justify-center text-sm font-black"
                  style={{ background: 'rgba(255,255,255,0.07)', color: '#94a3b8' }}>+</button>
                <button onClick={() => setZoomLevel(1)}
                  className="text-[9px] px-2 h-6 rounded font-bold"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>Reset</button>
              </div>
            </div>

            {/* Timeline Scroll Area */}
            <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar" ref={scrollContainerRef}>
              <div className="flex flex-col h-full relative" style={{ minWidth: `${totalDays * dayWidth}px` }}>

                {/* Year Row */}
                <div className="sticky top-0 z-40">
                  <div className="h-5 flex text-[8px] font-black tracking-widest uppercase"
                    style={{ background: '#1e1b4b' }}>
                    {yearsData.map((y, i) => (
                      <div key={i} className="flex items-center justify-center border-r"
                        style={{ width: `${(y.count / totalDays) * 100}%`, borderColor: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>
                        {y.year}
                      </div>
                    ))}
                  </div>

                  {/* Month Row */}
                  <div className="h-7 flex text-[11px] font-bold"
                    style={{ background: '#1a1f3c' }}>
                    {monthsData.map((m, i) => (
                      <div key={i} className="flex items-center justify-center border-r"
                        style={{ width: `${(m.count / totalDays) * 100}%`, borderColor: 'rgba(99,102,241,0.15)', color: '#94a3b8' }}>
                        T{m.month}
                      </div>
                    ))}
                  </div>

                  {/* Day Row */}
                  <div className="h-6 flex relative" style={{ background: '#111827' }}>
                    {daysArray.map((date, idx) => {
                      if (idx % Math.max(1, Math.round(2 / zoomLevel)) !== 0 && idx !== totalDays) return null;
                      return (
                        <div key={idx} className="absolute top-0 flex flex-col items-center" style={{ left: `${(idx / totalDays) * 100}%`, transform: 'translateX(-50%)' }}>
                          <span className="text-[8px] font-black" style={{ color: '#475569' }}>{date.getDate()}</span>
                          <div className="w-px h-2 mt-0.5" style={{ background: '#334155' }}></div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Events Area */}
                <div className="flex-1 relative overflow-hidden"
                  style={{ backgroundImage: `repeating-linear-gradient(to right, rgba(99,102,241,0.04) 0px, rgba(99,102,241,0.04) 1px, transparent 1px, transparent ${dayWidth * 7}px)`, backgroundSize: `${(7 / totalDays) * 100}% 100%` }}>

                  {/* Today Line */}
                  {isNowVisible && (
                    <div className="absolute top-0 bottom-0 z-30" style={{ left: `${nowOffsetPercent}%`, width: '2px', background: 'linear-gradient(to bottom, #ef4444, rgba(239,68,68,0.2))', boxShadow: '0 0 12px rgba(239,68,68,0.6)' }}>
                      <div className="absolute top-2 left-2 text-[10px] font-black px-2 py-0.5 rounded whitespace-nowrap"
                        style={{ background: '#ef4444', color: 'white' }}>
                        {todayLabel}
                      </div>
                    </div>
                  )}

                  {/* Empty State */}
                  {filteredEvents.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-5xl mb-3 opacity-30">📭</div>
                        <div className="text-[13px] font-semibold" style={{ color: '#334155' }}>
                          {events.length === 0 ? 'Chưa có sự kiện nào. Thêm từ Cài đặt nhé!' : 'Không có kết quả phù hợp'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Event Bars */}
                  <div className="relative w-full h-full" style={{ paddingTop: '8px' }}>
                    {filteredEvents.map((event) => {
                      const leftPct  = Math.max(0, ((event.start.getTime() - startDate.getTime()) / totalDuration) * 100);
                      const rawWidth = ((event.end.getTime() - event.start.getTime()) / totalDuration) * 100;
                      const widthPct = Math.min(rawWidth, 100 - leftPct);
                      const top      = event.trackRow * 72;
                      const cat      = getCat(event.category);
                      const stat     = getStat(event.status);
                      const progress = getEventProgress(event);
                      const daysLeft = getDaysLeft(event);
                      const isUrgent = daysLeft >= 0 && daysLeft <= 3 && event.status !== 'done';

                      return (
                        <div
                          key={event.id}
                          onClick={() => setSelectedEventDetail(event)}
                          className="absolute h-[58px] flex items-center z-20 cursor-pointer group transition-all duration-150"
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            minWidth: 'max-content',
                            top: `${top}px`,
                            background: `linear-gradient(to right, ${cat.color}18, ${cat.color}08)`,
                            border: `1.5px solid ${cat.color}${isUrgent ? 'ff' : '40'}`,
                            borderRadius: '10px',
                            boxShadow: isUrgent ? `0 0 12px ${cat.color}60` : 'none',
                          }}>

                          {/* Left accent */}
                          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ background: cat.color }}></div>

                          {/* Connector dot */}
                          <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 shadow-sm z-10"
                            style={{ background: '#0a0f1e', borderColor: cat.color }}></div>

                          {/* Thumbnail */}
                          <div className="w-[72px] md:w-[90px] h-full relative shrink-0 pl-2.5 pr-2">
                            <img src={event.image} alt="" className="w-full h-[46px] object-cover rounded-md" style={{ opacity: event.status === 'done' ? 0.5 : 1 }} />
                            {event.status === 'done' && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xl drop-shadow-lg">✅</span>
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0 py-1 flex flex-col justify-center pr-2">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[8px]">{getPri(event.priority).icon}</span>
                              <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: cat.color + '25', color: cat.color }}>
                                {cat.label.split(' ')[1]}
                              </span>
                              {isUrgent && <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold animate-pulse" style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>🔥 {daysLeft === 0 ? 'Hôm nay!' : `${daysLeft}ngày`}</span>}
                              {event.isShared && <span className="text-[8px] px-1 py-0.5 rounded font-bold" style={{ background: 'rgba(236,72,153,0.2)', color: '#f472b6' }}>📢</span>}
                            </div>
                            <h4 className="font-bold text-[12px] truncate" style={{ color: event.status === 'done' ? '#64748b' : '#e2e8f0', textDecoration: event.status === 'done' ? 'line-through' : 'none' }}>
                              {event.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="text-[9px] font-semibold" style={{ color: '#64748b' }}>{event.dateStr}</div>
                              {event.status === 'in-progress' && (
                                <div className="flex-1 max-w-[80px]">
                                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: cat.color }}></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Rewards */}
                          {event.rewards && (
                            <div className="hidden md:flex shrink-0 items-center h-[70%] border-l px-2 md:px-3"
                              style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                              <div className="px-2 py-1 rounded-lg text-center" style={{ background: 'rgba(250,204,21,0.1)', border: '1px solid rgba(250,204,21,0.2)' }}>
                                <div className="text-xs">🏆</div>
                                <div className="text-[9px] font-black mt-0.5 max-w-[70px] truncate" style={{ color: '#fbbf24' }}>{event.rewards}</div>
                              </div>
                            </div>
                          )}
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
          SETTINGS MODAL
      ════════════════════════════════════════════════════════ */}
      {isSettingsOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-2 md:p-4" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
          <div className="w-full max-w-[860px] h-[92vh] md:h-[640px] rounded-2xl flex flex-col overflow-hidden relative"
            style={{ background: '#0f172a', border: '1px solid rgba(99,102,241,0.35)', boxShadow: '0 0 60px rgba(99,102,241,0.25)' }}>

            {/* Modal Header */}
            <div className="h-12 flex items-center justify-between px-6 shrink-0"
              style={{ background: '#080d1a', borderBottom: '1px solid rgba(99,102,241,0.2)' }}>
              <div className="flex gap-1">
                {[
                  { id: 'profile', label: 'Tài Khoản',     icon: '👤' },
                  { id: 'events',  label: 'Quản Lý Lịch',  icon: '📅' },
                  { id: 'friends', label: 'Bạn Bè',         icon: '👥' },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className="px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-all"
                    style={{
                      background: activeTab === tab.id ? 'rgba(99,102,241,0.25)' : 'transparent',
                      color: activeTab === tab.id ? '#a5b4fc' : '#475569',
                      border: activeTab === tab.id ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
                    }}>
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setIsSettingsOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-black transition-all"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">

              {/* ── TAB: TÀI KHOẢN ── */}
              {activeTab === 'profile' && (
                <div className="space-y-4">
                  {/* Preview */}
                  <div className="relative h-24 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(99,102,241,0.25)' }}>
                    <img src={profileFormData.background} alt="bg" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                    <div className="absolute inset-0 flex items-center gap-4 px-4">
                      <img src={profileFormData.avatar} alt="av" className="w-14 h-14 rounded-xl object-cover border-2" style={{ borderColor: '#6366f1' }} />
                      <div>
                        <div className="font-black text-white text-lg">{profileFormData.displayName || "Nhà Khai Phá"}</div>
                        <div className="text-[11px] font-mono px-2 py-0.5 rounded mt-1 inline-block" style={{ background: 'rgba(99,102,241,0.3)', color: '#a5b4fc' }}>ID: {profile.shortId}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { key: 'displayName', label: 'Tên hiển thị', placeholder: 'Nhà Khai Phá' },
                      { key: 'title',       label: 'Tiêu đề lớn',  placeholder: 'TỔNG QUAN PHIÊN BẢN' },
                      { key: 'subtitle',    label: 'Tiêu đề phụ',  placeholder: 'v7.3' },
                      { key: 'bio',         label: 'Giới thiệu',   placeholder: 'Mô tả ngắn về bạn...' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-[10px] font-bold uppercase mb-1.5 block" style={{ color: '#818cf8' }}>{f.label}</label>
                        <input type="text" placeholder={f.placeholder}
                          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.2)', color: '#e2e8f0' }}
                          value={profileFormData[f.key] || ''}
                          onChange={e => setProfileFormData(p => ({ ...p, [f.key]: e.target.value }))} />
                      </div>
                    ))}
                  </div>

                  {[
                    { key: 'avatar',     label: 'Ảnh đại diện (1:1)',  target: 'avatar' },
                    { key: 'background', label: 'Ảnh nền (9:16)',      target: 'background' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-[10px] font-bold uppercase mb-1.5 block" style={{ color: '#818cf8' }}>{f.label}</label>
                      <div className="flex gap-2 items-center">
                        <input type="file" accept="image/*" onChange={e => onSelectFile(e, f.target)}
                          className="flex-1 text-xs rounded-lg px-2 py-2 cursor-pointer"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.2)', color: '#94a3b8' }} />
                        <button type="button" onClick={() => handlePasteButtonClick(f.target)}
                          className="shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                          style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
                          📋 Dán
                        </button>
                      </div>
                    </div>
                  ))}

                  <button onClick={handleSaveProfile}
                    className="w-full py-3 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', boxShadow: '0 0 20px rgba(99,102,241,0.4)' }}>
                    💾 Lưu cấu hình
                  </button>
                </div>
              )}

              {/* ── TAB: QUẢN LÝ LỊCH ── */}
              {activeTab === 'events' && (
                <div className="space-y-4">
                  {/* Events List */}
                  <div className="rounded-xl p-3 space-y-2 max-h-[180px] overflow-y-auto custom-scrollbar"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="text-[10px] font-bold uppercase mb-2" style={{ color: '#818cf8' }}>Danh sách hiện có ({events.length})</div>
                    {events.length === 0 && <div className="text-[12px] italic" style={{ color: '#475569' }}>Hệ thống đang trống.</div>}
                    {events.map(ev => {
                      const cat = getCat(ev.category);
                      return (
                        <div key={ev.id} className="flex items-center gap-2 rounded-lg px-3 py-2"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div className="w-1.5 h-6 rounded-full" style={{ background: cat.color }}></div>
                          <span className="text-[10px]">{getStat(ev.status).icon}</span>
                          <span className="text-[12px] font-semibold flex-1 truncate" style={{ color: '#e2e8f0' }}>{ev.title}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: cat.color + '20', color: cat.color }}>{cat.label.split(' ')[0]}</span>
                          <button onClick={() => handleDeleteEvent(ev.id)}
                            className="text-[10px] font-bold px-2 py-1 rounded transition-all hover:opacity-80"
                            style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>Xóa</button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Event Form */}
                  <form onSubmit={handleAddEvent} className="space-y-3">
                    <div className="text-[10px] font-bold uppercase" style={{ color: '#34d399' }}>➕ Thêm sự kiện mới</div>

                    <input required type="text" placeholder="Tên sự kiện / môn học..."
                      className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}
                      value={eventFormData.title} onChange={e => setEventFormData(p => ({ ...p, title: e.target.value }))} />

                    <div className="grid grid-cols-2 gap-3">
                      {[{ key: 'startDate', label: 'Từ ngày' }, { key: 'endDate', label: 'Đến ngày' }].map(f => (
                        <div key={f.key}>
                          <label className="text-[9px] font-bold uppercase mb-1 block" style={{ color: '#64748b' }}>{f.label}</label>
                          <input required type="date" className="w-full rounded-lg px-2 py-2 text-sm outline-none style-date"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}
                            value={eventFormData[f.key]} onChange={e => setEventFormData(p => ({ ...p, [f.key]: e.target.value }))} />
                        </div>
                      ))}
                    </div>

                    {/* Category */}
                    <div>
                      <label className="text-[9px] font-bold uppercase mb-1.5 block" style={{ color: '#64748b' }}>Danh mục</label>
                      <div className="flex flex-wrap gap-1.5">
                        {CATEGORIES.map(cat => (
                          <button key={cat.id} type="button" onClick={() => setEventFormData(p => ({ ...p, category: cat.id }))}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg transition-all"
                            style={{ background: eventFormData.category === cat.id ? cat.color + '30' : 'rgba(255,255,255,0.04)', color: eventFormData.category === cat.id ? cat.color : '#64748b', border: `1px solid ${eventFormData.category === cat.id ? cat.color + '60' : 'transparent'}` }}>
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Priority */}
                      <div>
                        <label className="text-[9px] font-bold uppercase mb-1.5 block" style={{ color: '#64748b' }}>Độ ưu tiên</label>
                        <div className="flex gap-1">
                          {PRIORITIES.map(p => (
                            <button key={p.id} type="button" onClick={() => setEventFormData(f => ({ ...f, priority: p.id }))}
                              className="flex-1 text-[10px] font-bold py-1.5 rounded-lg transition-all"
                              style={{ background: eventFormData.priority === p.id ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)', color: eventFormData.priority === p.id ? '#e2e8f0' : '#475569' }}>
                              {p.icon} {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Status */}
                      <div>
                        <label className="text-[9px] font-bold uppercase mb-1.5 block" style={{ color: '#64748b' }}>Trạng thái</label>
                        <select className="w-full rounded-lg px-2 py-1.5 text-[11px] outline-none"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}
                          value={eventFormData.status} onChange={e => setEventFormData(p => ({ ...p, status: e.target.value }))}>
                          {STATUSES.map(s => <option key={s.id} value={s.id} style={{ background: '#0f172a' }}>{s.icon} {s.label}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" placeholder="🏆 Mục tiêu / Phần thưởng"
                        className="rounded-lg px-3 py-2 text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                        value={eventFormData.rewards} onChange={e => setEventFormData(p => ({ ...p, rewards: e.target.value }))} />
                      <input type="text" placeholder="📝 Ghi chú"
                        className="rounded-lg px-3 py-2 text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                        value={eventFormData.notes} onChange={e => setEventFormData(p => ({ ...p, notes: e.target.value }))} />
                    </div>

                    {/* Image Upload */}
                    <div>
                      <label className="text-[9px] font-bold uppercase mb-1.5 block" style={{ color: '#64748b' }}>Ảnh thumbnail (21:9)</label>
                      <div className="flex gap-2 items-center">
                        <input type="file" accept="image/*" onChange={e => onSelectFile(e, 'event')}
                          className="flex-1 text-xs rounded-lg px-2 py-2 cursor-pointer"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }} />
                        <button type="button" onClick={() => handlePasteButtonClick('event')}
                          className="shrink-0 px-3 py-2 rounded-lg text-xs font-bold"
                          style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
                          📋 Dán
                        </button>
                      </div>
                      {eventFormData.croppedImage && (
                        <div className="mt-2 relative inline-block">
                          <img src={eventFormData.croppedImage} alt="preview" className="h-12 rounded-lg border-2" style={{ borderColor: '#34d399' }} />
                          <button type="button" onClick={() => setEventFormData(p => ({ ...p, croppedImage: null }))}
                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center"
                            style={{ background: '#ef4444', color: 'white' }}>✕</button>
                        </div>
                      )}
                    </div>

                    <button type="submit"
                      className="w-full py-3 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', boxShadow: '0 0 20px rgba(16,185,129,0.3)' }}>
                      ✨ Tạo sự kiện
                    </button>
                  </form>
                </div>
              )}

              {/* ── TAB: BẠN BÈ ── */}
              {activeTab === 'friends' && (
                <div className="space-y-4">
                  <form onSubmit={handleAddFriend} className="flex gap-2 items-end p-3 rounded-xl"
                    style={{ background: 'rgba(236,72,153,0.05)', border: '1px solid rgba(236,72,153,0.2)' }}>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold uppercase mb-1.5 block" style={{ color: '#f472b6' }}>Nhập ID bạn bè (8 số)</label>
                      <input required type="text" maxLength="8" pattern="\d{8}" placeholder="12345678"
                        className="w-full rounded-lg px-3 py-2.5 text-sm font-mono tracking-widest outline-none"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(236,72,153,0.3)', color: '#e2e8f0' }}
                        value={searchFriendId} onChange={e => setSearchFriendId(e.target.value)} />
                    </div>
                    <button type="submit"
                      className="px-5 py-2.5 rounded-lg font-black text-sm transition-all"
                      style={{ background: 'linear-gradient(135deg, #ec4899, #db2777)', color: 'white' }}>
                      Thêm
                    </button>
                  </form>

                  {/* ID hiển thị */}
                  <div className="p-3 rounded-xl text-center"
                    style={{ background: 'rgba(99,102,241,0.08)', border: '1px dashed rgba(99,102,241,0.3)' }}>
                    <div className="text-[10px] font-bold uppercase mb-1" style={{ color: '#818cf8' }}>ID của bạn — chia sẻ để kết bạn</div>
                    <div className="font-black text-2xl tracking-[6px] font-mono" style={{ color: '#c7d2fe' }}>{profile.shortId}</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {friendsData.length === 0 && <div className="col-span-2 text-center py-6 text-[13px] italic" style={{ color: '#475569' }}>Chưa có bạn bè nào. Hãy chia sẻ ID và kết nối nhé! 🌐</div>}
                    {friendsData.map(friend => (
                      <div key={friend.uid} className="rounded-xl p-3 flex items-center gap-3 transition-all"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <img src={friend.avatar} alt="" className="w-12 h-12 rounded-xl object-cover border" style={{ borderColor: 'rgba(99,102,241,0.4)' }} />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[13px] text-white truncate">{friend.displayName}</div>
                          <div className="text-[10px] font-mono" style={{ color: '#64748b' }}>ID: {friend.shortId}</div>
                        </div>
                        <button onClick={() => handleViewFriendFeed(friend.uid)}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                          style={{ background: 'rgba(6,182,212,0.15)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.3)' }}>
                          Xem lịch
                        </button>
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
          STATISTICS MODAL
      ════════════════════════════════════════════════════════ */}
      {isStatsOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)' }} onClick={() => setIsStatsOpen(false)}>
          <div className="w-full max-w-[520px] rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}
            style={{ background: '#0f172a', border: '1px solid rgba(99,102,241,0.35)', boxShadow: '0 0 60px rgba(99,102,241,0.2)' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
              <h2 className="font-black text-lg text-white">📊 Thống kê tổng quan</h2>
              <button onClick={() => setIsStatsOpen(false)} className="text-slate-500 hover:text-white font-black text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Overall */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { val: stats.total,    label: 'Tổng',       color: '#818cf8', icon: '📋' },
                  { val: stats.done,     label: 'Hoàn thành', color: '#34d399', icon: '✅' },
                  { val: stats.inProg,   label: 'Đang làm',   color: '#60a5fa', icon: '⚡' },
                  { val: stats.urgentCount, label: 'Khẩn cấp', color: '#f87171', icon: '🔥' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: s.color + '12', border: `1px solid ${s.color}25` }}>
                    <div className="text-xl mb-1">{s.icon}</div>
                    <div className="font-black text-2xl" style={{ color: s.color }}>{s.val}</div>
                    <div className="text-[9px] font-semibold mt-0.5" style={{ color: s.color + 'aa' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Progress bar total */}
              {stats.total > 0 && (
                <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex justify-between text-[11px] font-bold mb-2">
                    <span style={{ color: '#94a3b8' }}>Tiến độ tổng thể</span>
                    <span style={{ color: '#34d399' }}>{Math.round((stats.done / stats.total) * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${(stats.done / stats.total) * 100}%`, background: 'linear-gradient(90deg, #10b981, #34d399)' }}></div>
                  </div>
                </div>
              )}

              {/* Category breakdown */}
              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-[10px] font-bold uppercase mb-3" style={{ color: '#475569' }}>Phân loại sự kiện</div>
                <div className="space-y-2">
                  {stats.catBreakdown.map(cat => (
                    <div key={cat.id} className="flex items-center gap-3">
                      <div className="text-[11px] w-28 truncate font-semibold" style={{ color: '#94a3b8' }}>{cat.label}</div>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full" style={{ width: stats.total > 0 ? `${(cat.count / stats.total) * 100}%` : '0%', background: cat.color }}></div>
                      </div>
                      <div className="text-[11px] font-black w-4 text-right" style={{ color: cat.color }}>{cat.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          EVENT DETAIL MODAL
      ════════════════════════════════════════════════════════ */}
      {selectedEventDetail && (
        <div className="fixed inset-0 flex items-center justify-center z-[120] p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }} onClick={() => setSelectedEventDetail(null)}>
          <div className="w-full max-w-[420px] rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}
            style={{ background: '#0f172a', border: `2px solid ${getCat(selectedEventDetail.category).color}40`, boxShadow: `0 0 40px ${getCat(selectedEventDetail.category).color}30` }}>
            {(() => {
              const cat  = getCat(selectedEventDetail.category);
              const stat = getStat(selectedEventDetail.status);
              const progress = getEventProgress(selectedEventDetail);
              return (
                <>
                  {/* Cover */}
                  <div className="relative h-40">
                    <img src={selectedEventDetail.image} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: selectedEventDetail.status === 'done' ? 0.4 : 0.8 }} />
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(15,23,42,1) 0%, rgba(15,23,42,0.3) 70%, transparent 100%)' }}></div>
                    <button onClick={() => setSelectedEventDetail(null)}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center font-black text-sm"
                      style={{ background: 'rgba(15,23,42,0.8)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }}>✕</button>
                    <div className="absolute top-3 left-3 flex gap-2">
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: cat.color + '30', color: cat.color, border: `1px solid ${cat.color}50` }}>{cat.label}</span>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.4)', color: '#e2e8f0' }}>{getPri(selectedEventDetail.priority).icon} {getPri(selectedEventDetail.priority).label}</span>
                    </div>
                    <div className="absolute bottom-3 left-4 right-4">
                      <h3 className="font-black text-xl text-white leading-tight drop-shadow-md">{selectedEventDetail.title}</h3>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    {/* Date & Status */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div className="text-[9px] font-bold uppercase mb-1" style={{ color: '#64748b' }}>Thời gian</div>
                        <div className="text-[11px] font-bold text-white">{selectedEventDetail.dateStr}</div>
                      </div>
                      <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div className="text-[9px] font-bold uppercase mb-1.5" style={{ color: '#64748b' }}>Trạng thái</div>
                        <select
                          value={selectedEventDetail.status}
                          onChange={e => handleUpdateEventField(selectedEventDetail.id, 'status', e.target.value)}
                          className="w-full text-[11px] rounded-md px-1.5 py-1 outline-none font-bold"
                          style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${stat.accent}40`, color: stat.accent }}>
                          {STATUSES.map(s => <option key={s.id} value={s.id} style={{ background: '#0f172a' }}>{s.icon} {s.label}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Progress */}
                    {selectedEventDetail.status === 'in-progress' && (
                      <div className="rounded-xl p-3" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <div className="flex justify-between text-[10px] font-bold mb-2">
                          <span style={{ color: '#94a3b8' }}>Tiến độ</span>
                          <span style={{ color: '#60a5fa' }}>{selectedEventDetail.progress || 0}%</span>
                        </div>
                        <input type="range" min="0" max="100"
                          value={selectedEventDetail.progress || 0}
                          onChange={e => handleUpdateEventField(selectedEventDetail.id, 'progress', Number(e.target.value))}
                          className="w-full accent-blue-500 h-2" />
                      </div>
                    )}

                    {/* Rewards & Notes */}
                    {selectedEventDetail.rewards && (
                      <div className="flex items-start gap-2 rounded-xl p-2.5" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                        <span className="text-base">🏆</span>
                        <div>
                          <div className="text-[9px] font-bold uppercase mb-0.5" style={{ color: '#d97706' }}>Mục tiêu</div>
                          <div className="text-[11px] font-semibold" style={{ color: '#fbbf24' }}>{selectedEventDetail.rewards}</div>
                        </div>
                      </div>
                    )}
                    {selectedEventDetail.notes && (
                      <div className="flex items-start gap-2 rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <span className="text-base">📝</span>
                        <div>
                          <div className="text-[9px] font-bold uppercase mb-0.5" style={{ color: '#64748b' }}>Ghi chú</div>
                          <div className="text-[11px]" style={{ color: '#94a3b8' }}>{selectedEventDetail.notes}</div>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button onClick={() => handleToggleShareEvent(selectedEventDetail.id)}
                        className="py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wide transition-all"
                        style={{
                          background: selectedEventDetail.isShared ? 'rgba(236,72,153,0.15)' : 'rgba(236,72,153,0.25)',
                          color: '#f472b6',
                          border: '1px solid rgba(236,72,153,0.3)',
                        }}>
                        {selectedEventDetail.isShared ? '🔒 Ẩn' : '📢 Chia sẻ'}
                      </button>
                      <button onClick={() => handleDeleteEvent(selectedEventDetail.id)}
                        className="py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wide transition-all"
                        style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
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

      {/* ════════════════════════════════════════════════════════
          DEADLINE MODAL
      ════════════════════════════════════════════════════════ */}
      {isDeadlineModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[110] p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }} onClick={() => setIsDeadlineModalOpen(false)}>
          <div className="w-full max-w-[400px] max-h-[80vh] rounded-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}
            style={{ background: '#0f172a', border: '2px solid rgba(239,68,68,0.4)', boxShadow: '0 0 40px rgba(239,68,68,0.2)' }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(239,68,68,0.15)', borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
              <h2 className="font-black text-base" style={{ color: '#fca5a5' }}>🚨 BÁO ĐỘNG DEADLINE</h2>
              <button onClick={() => setIsDeadlineModalOpen(false)} className="font-black" style={{ color: '#f87171' }}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {urgentEvents.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-2">☕</div>
                  <div className="text-[13px] font-semibold" style={{ color: '#475569' }}>Không có deadline nào trong 3 ngày tới!</div>
                </div>
              ) : urgentEvents.sort((a, b) => a.end - b.end).map(ev => {
                const daysLeft = getDaysLeft(ev);
                const cat = getCat(ev.category);
                return (
                  <div key={ev.id} onClick={() => { setIsDeadlineModalOpen(false); setSelectedEventDetail(ev); }}
                    className="flex gap-3 p-3 rounded-xl cursor-pointer transition-all hover:opacity-90"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <img src={ev.image} className="w-12 h-12 rounded-lg object-cover" alt="" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[12px] truncate text-white mb-1">{ev.title}</div>
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full animate-pulse" style={{ background: 'rgba(239,68,68,0.25)', color: '#f87171' }}>
                        {daysLeft === 0 ? '🔥 HẾT HẠN HÔM NAY' : `⏳ CÒN ${daysLeft} NGÀY`}
                      </span>
                    </div>
                    <div className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg self-center" style={{ background: cat.color + '20', color: cat.color }}>{cat.label.split(' ')[0]}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          CROP MODAL
      ════════════════════════════════════════════════════════ */}
      {isCropModalOpen && upImg && (
        <div className="fixed inset-0 flex flex-col items-center justify-center z-[100] p-4" style={{ background: 'rgba(9,9,11,0.97)', backdropFilter: 'blur(20px)' }}>
          <div className="text-center mb-6">
            <h2 className="text-white font-black text-xl uppercase tracking-wide">Cắt ảnh</h2>
            <p className="text-[11px] mt-2 px-4 py-1 rounded-full inline-block" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
              Tỉ lệ đã được khoá để tránh vỡ giao diện
            </p>
          </div>
          <div className="rounded-2xl overflow-hidden p-2" style={{ border: '2px solid rgba(99,102,241,0.5)', background: 'black', maxWidth: '95%' }}>
            <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)} aspect={cropAspectRatio}>
              <img ref={imgRef} src={upImg} alt="crop" className="max-h-[50vh] max-w-full object-contain" />
            </ReactCrop>
          </div>
          <div className="flex gap-4 mt-8 w-full max-w-[400px]">
            <button onClick={() => { setIsCropModalOpen(false); setUpImg(null); }}
              className="flex-1 py-3 rounded-xl font-bold text-sm"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }}>
              Huỷ
            </button>
            <button onClick={handleCropComplete}
              className="flex-1 py-3 rounded-xl font-black text-sm"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white' }}>
              ✅ Xác nhận
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          FRIEND FEED MODAL
      ════════════════════════════════════════════════════════ */}
      {viewingFriendFeed && (
        <div className="fixed inset-0 flex items-center justify-center z-[130] p-4" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)' }} onClick={() => setViewingFriendFeed(null)}>
          <div className="w-full max-w-[520px] h-[88vh] rounded-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}
            style={{ background: '#0f172a', border: '2px solid rgba(236,72,153,0.3)', boxShadow: '0 0 60px rgba(236,72,153,0.15)' }}>

            {/* Cover */}
            <div className="relative h-40 shrink-0">
              <img src={viewingFriendFeed.profile.background} alt="bg" className="absolute inset-0 w-full h-full object-cover opacity-40 blur-sm" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #0f172a 0%, rgba(15,23,42,0.4) 70%, transparent 100%)' }}></div>
              <button onClick={() => setViewingFriendFeed(null)}
                className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center font-black"
                style={{ background: 'rgba(15,23,42,0.7)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }}>✕</button>
              <div className="absolute -bottom-8 left-5 flex items-end gap-4">
                <img src={viewingFriendFeed.profile.avatar} alt="" className="w-20 h-20 rounded-2xl border-4 object-cover" style={{ borderColor: '#0f172a' }} />
                <div className="pb-10">
                  <div className="font-black text-xl text-white">{viewingFriendFeed.profile.displayName}</div>
                  <div className="text-[10px] font-mono" style={{ color: '#f472b6' }}>ID: {viewingFriendFeed.profile.shortId}</div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pt-12 px-5 pb-5 custom-scrollbar space-y-3">
              {viewingFriendFeed.events.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-4xl mb-3">💤</div>
                  <div className="text-[13px] font-semibold" style={{ color: '#475569' }}>Chưa có sự kiện công khai nào!</div>
                </div>
              ) : viewingFriendFeed.events.map(ev => {
                const cat = getCat(ev.category);
                return (
                  <div key={ev.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <img src={ev.image} alt="" className="w-full h-32 object-cover" />
                    <div className="p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: cat.color + '20', color: cat.color }}>{cat.label}</span>
                        <span className="text-[10px] font-bold" style={{ color: '#475569' }}>{ev.dateStr}</span>
                      </div>
                      <h4 className="font-black text-[14px] text-white">{ev.title}</h4>
                      {ev.rewards && <p className="text-[11px] mt-1.5 font-semibold" style={{ color: '#fbbf24' }}>🏆 {ev.rewards}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SCROLLBAR STYLES */}
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { height: 4px; width: 4px; background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(99,102,241,0.6); }
        .style-date::-webkit-calendar-picker-indicator { filter: invert(1); cursor: pointer; opacity: 0.5; }
        input[type=range]::-webkit-slider-thumb { cursor: pointer; }
      ` }} />
    </div>
  );
};

export default GameRoadmap;
