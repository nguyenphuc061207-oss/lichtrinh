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

const getCat  = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[5];
const getStat = (id) => STATUSES.find(s => s.id === id)   || STATUSES[0];
const getPri  = (id) => PRIORITIES.find(p => p.id === id) || PRIORITIES[1];

// Helper: Format Date to YYYY-MM-DD
const formatYYYYMMDD = (d) => {
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ============================================================
// COMPONENT CHÍNH
// ============================================================
const GameRoadmap = ({ user }) => {

  // ── 1. THIẾT LẬP THỜI GIAN CHUNG ───────────────────────────
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

  // ── 2. STATE DỮ LIỆU & FIRESTORE ───────────────────────────
  const [showMobileMap,       setShowMobileMap]       = useState(false);
  const [selectedEventDetail, setSelectedEventDetail] = useState(null);
  const [isDeadlineModalOpen, setIsDeadlineModalOpen] = useState(false);
  const [isStatsOpen,         setIsStatsOpen]         = useState(false);
  
  // State quản lý Lịch Trong Ngày
  const [selectedDailyDate, setSelectedDailyDate] = useState(null);
  const [dailyFormData, setDailyFormData] = useState({ time: '08:00', title: '', isShared: false });

  const generateID = () => Math.floor(10000000 + Math.random() * 90000000).toString();

  const [profile, setProfile] = useState({
    avatar:      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200",
    background:  "https://images.unsplash.com/photo-1541562232579-512a21360020?q=80&w=800",
    title:       "HỆ THỐNG QUẢN LÝ",
    subtitle:    "Lịch Trình Cá Nhân",
    displayName: "Người dùng mới",
    shortId:     "........",
    bio:         "",
  });

  const [events,      setEvents]      = useState([]);
  const [dailyTasks,  setDailyTasks]  = useState([]); // Mảng lưu lịch trình theo ngày
  const [friendsList, setFriendsList] = useState([]);
  const [friendsData, setFriendsData] = useState([]);
  const [searchFriendId,    setSearchFriendId]    = useState('');
  
  // State xem Feed của bạn bè
  const [viewingFriendFeed, setViewingFriendFeed] = useState(null);
  const [feedCommentInput, setFeedCommentInput] = useState({});
  const [isLoading,         setIsLoading]         = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let loadedProfile = data.profile ? { ...data.profile } : { ...profile };
        let needsSave = false;
        
        if (!loadedProfile.shortId || loadedProfile.shortId === "........") { loadedProfile.shortId = generateID(); needsSave = true; }
        if (!loadedProfile.displayName) { loadedProfile.displayName = "Người dùng mới"; needsSave = true; }
        if (!loadedProfile.background)  { loadedProfile.background  = loadedProfile.avatar || profile.background; needsSave = true; }
        
        setProfile(loadedProfile);

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
            reactions: ev.reactions || {},
            comments:  ev.comments  || []
          })));
        }

        if (data.dailyTasks) {
           setDailyTasks(data.dailyTasks);
        }
        
        if (data.friends) setFriendsList(data.friends);

        if (needsSave) {
          setDoc(doc(db, "users", user.uid), { profile: loadedProfile, events: data.events || [], dailyTasks: data.dailyTasks || [], friends: data.friends || [] }, { merge: true });
        }
      } else {
        const newProfile = { ...profile, shortId: generateID() };
        setProfile(newProfile);
        saveToCloud(newProfile, events, dailyTasks, []);
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

  const saveToCloud = async (newProfile, newEvents, newDailyTasks = dailyTasks, newFriends = friendsList) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), { profile: newProfile, events: newEvents, dailyTasks: newDailyTasks, friends: newFriends });
    } catch (error) { console.error("Lỗi đồng bộ:", error); }
  };

  // ── 3. STATISTICS & FILTERS ────────────────────────────────
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

  const filteredEvents = useMemo(() => events.filter(ev => {
    const matchCat   = filterCat  === 'all' || ev.category === filterCat;
    const matchStat  = filterStat === 'all' || ev.status   === filterStat;
    const matchSearch = !searchQuery || ev.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchStat && matchSearch;
  }), [events, filterCat, filterStat, searchQuery]);

  // ── 4. SETTINGS & FORMS ────────────────────────────────────
  const [isSettingsOpen,   setIsSettingsOpen]   = useState(false);
  const [activeTab,        setActiveTab]        = useState('profile');
  const [profileFormData,  setProfileFormData]  = useState(profile);
  
  // Thêm tùy chọn lặp lại vào form
  const [eventFormData,    setEventFormData]    = useState({
    title: '', startDate: '', endDate: '', rewards: '', notes: '',
    category: 'study', status: 'todo', priority: 'medium', progress: 0,
    isRecurring: false, recurType: 'weekly', recurCount: 1
  });

  // ── 5. CẮT ẢNH ─────────────────────────────────────────────
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [upImg,           setUpImg]           = useState();
  const [crop,            setCrop]            = useState({ unit: '%', width: 50, x: 25, y: 25 });
  const [cropAspectRatio, setCropAspectRatio] = useState(16/9);
  const [completedCrop,   setCompletedCrop]   = useState(null);
  const imgRef    = useRef(null);
  const [cropTarget, setCropTarget] = useState('');

  const processImageBlob = (blob, target) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => setUpImg(reader.result));
    reader.readAsDataURL(blob);
    setCropTarget(target);
    // CHỈNH SỬA: Ảnh nền dùng tỷ lệ 16:9 để ngang và đẹp hơn
    if      (target === 'avatar')     { setCropAspectRatio(1/1);   setCrop({ unit: '%', width: 60, aspect: 1/1 }); }
    else if (target === 'background') { setCropAspectRatio(16/9);  setCrop({ unit: '%', width: 80, aspect: 16/9 }); }
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
      alert('Không tìm thấy hình ảnh trong bộ nhớ tạm (Clipboard).');
    } catch { alert('Trình duyệt chặn truy cập Clipboard. Vui lòng ấn Ctrl+V để dán.'); }
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
    // Nâng chất lượng ảnh khi vẽ
    canvas.getContext('2d').drawImage(image,
      completedCrop.x * scaleX, completedCrop.y * scaleY,
      completedCrop.width * scaleX, completedCrop.height * scaleY,
      0, 0, completedCrop.width, completedCrop.height);
    
    // Đặt quality 0.95 để nét hơn
    const url = canvas.toDataURL('image/jpeg', 0.95);
    
    if      (cropTarget === 'event')      setEventFormData(p => ({ ...p, croppedImage: url }));
    else if (cropTarget === 'avatar')     setProfileFormData(p => ({ ...p, avatar: url }));
    else if (cropTarget === 'background') setProfileFormData(p => ({ ...p, background: url }));
    setIsCropModalOpen(false); setUpImg(null);
  };

  // ── 6. CÁC HÀM XỬ LÝ SỰ KIỆN ───────────────────────────────
  
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
    setProfile(upd); saveToCloud(upd, events, dailyTasks);
    alert("Cập nhật thông tin thành công.");
  };

  const handleAddEvent = (e) => {
    e.preventDefault();
    const pad = n => n.toString().padStart(2, '0');
    
    let generatedEvents = [];
    const count = eventFormData.isRecurring ? parseInt(eventFormData.recurCount) : 1;
    
    // Tìm TrackRow trống để tránh đè lên nhau
    let assignedRow = 0;
    
    for (let i = 0; i < count; i++) {
        let startObj = new Date(eventFormData.startDate);
        let endObj   = new Date(eventFormData.endDate);
        
        if (eventFormData.isRecurring) {
            if (eventFormData.recurType === 'weekly') {
                startObj.setDate(startObj.getDate() + (i * 7));
                endObj.setDate(endObj.getDate() + (i * 7));
            } else if (eventFormData.recurType === 'yearly') {
                startObj.setFullYear(startObj.getFullYear() + i);
                endObj.setFullYear(endObj.getFullYear() + i);
            }
        }
        endObj.setHours(23, 59, 59, 999);
        const dateStr = `${pad(startObj.getDate())}/${pad(startObj.getMonth()+1)} — ${pad(endObj.getDate())}/${pad(endObj.getMonth()+1)}`;

        // Tính Row cho event hiện tại
        let isRowOccupied = true;
        let tempRow = assignedRow;
        while (isRowOccupied) {
          const overlap = [...events, ...generatedEvents].find(ev => ev.trackRow === tempRow && startObj <= ev.end && endObj >= ev.start);
          if (overlap) tempRow++; else isRowOccupied = false;
        }

        generatedEvents.push({
          id:       "ev_" + Date.now() + "_" + i,
          title:    eventFormData.title,
          dateStr,
          start:    startObj,
          end:      endObj,
          image:    eventFormData.croppedImage || "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400&q=80",
          rewards:  eventFormData.rewards,
          notes:    eventFormData.notes,
          trackRow: tempRow,
          isShared: false,
          category: eventFormData.category,
          status:   eventFormData.status,
          priority: eventFormData.priority,
          progress: Number(eventFormData.progress),
          reactions: {},
          comments: []
        });
    }

    const updated = [...events, ...generatedEvents];
    setEvents(updated); saveToCloud(profile, updated, dailyTasks);
    
    setEventFormData({ title: '', startDate: '', endDate: '', rewards: '', notes: '', category: 'study', status: 'todo', priority: 'medium', progress: 0, croppedImage: null, isRecurring: false, recurType: 'weekly', recurCount: 1 });
    alert(`Đã thêm ${count} lịch trình thành công.`);
  };

  const handleUpdateEventField = (eventId, field, value) => {
    const updated = events.map(ev => ev.id === eventId ? { ...ev, [field]: value } : ev);
    setEvents(updated);
    saveToCloud(profile, updated, dailyTasks);
    setSelectedEventDetail(updated.find(e => e.id === eventId));
  };

  const handleDeleteEvent = (id) => {
    const updated = events.filter(e => e.id !== id);
    setEvents(updated); saveToCloud(profile, updated, dailyTasks);
    setSelectedEventDetail(null);
  };

  const handleToggleShareEvent = (eventId) => {
    const updated = events.map(ev => ev.id === eventId ? { ...ev, isShared: !ev.isShared } : ev);
    setEvents(updated); saveToCloud(profile, updated, dailyTasks);
    setSelectedEventDetail(updated.find(e => e.id === eventId));
  };

  // ── 7. LỊCH TRÌNH TRONG NGÀY (DAILY TASKS) ─────────────────
  const handleAddDailyTask = (e) => {
      e.preventDefault();
      const dateStr = formatYYYYMMDD(selectedDailyDate);
      const newTask = {
          id: "dt_" + Date.now(),
          dateStr: dateStr,
          time: dailyFormData.time,
          title: dailyFormData.title,
          isShared: dailyFormData.isShared,
          reactions: {},
          comments: []
      };
      const updated = [...dailyTasks, newTask];
      setDailyTasks(updated);
      saveToCloud(profile, events, updated);
      setDailyFormData({ ...dailyFormData, title: '' });
  };

  const handleDeleteDailyTask = (id) => {
      const updated = dailyTasks.filter(t => t.id !== id);
      setDailyTasks(updated);
      saveToCloud(profile, events, updated);
  };

  const handleToggleShareDaily = (id) => {
      const updated = dailyTasks.map(t => t.id === id ? { ...t, isShared: !t.isShared } : t);
      setDailyTasks(updated);
      saveToCloud(profile, events, updated);
  };

  // ── 8. XỬ LÝ MẠNG XÃ HỘI (BẠN BÈ & TƯƠNG TÁC) ──────────────
  const handleAddFriend = async (e) => {
    e.preventDefault();
    if (searchFriendId === profile.shortId) { alert("Không thể tự kết bạn với tài khoản của bạn."); return; }
    if (friendsList.includes(searchFriendId)) { alert("Người dùng này đã nằm trong danh sách bạn bè."); return; }
    const q = query(collection(db, "users"), where("profile.shortId", "==", searchFriendId));
    const snap = await getDocs(q);
    if (snap.empty) { alert("Không tìm thấy người dùng trùng khớp với ID này."); return; }
    let foundUid = ""; snap.forEach(d => { foundUid = d.id; });
    const newList = [...friendsList, foundUid];
    setFriendsList(newList); saveToCloud(profile, events, dailyTasks, newList); setSearchFriendId('');
    alert("Thêm bạn bè thành công.");
  };

  const handleViewFriendFeed = async (friendUid) => {
    const fDoc = await getDoc(doc(db, "users", friendUid));
    if (!fDoc.exists()) return;
    const fData = fDoc.data(); let fProfile = fData.profile;
    if (!fProfile.background) fProfile.background = fProfile.avatar;
    
    // Gộp chung Event Dài hạn và Lịch trong ngày đã chia sẻ
    const sharedEvents = (fData.events || []).filter(ev => ev.isShared).map(ev => ({
        ...ev, type: 'roadmap',
        start: ev.start.toDate ? ev.start.toDate() : new Date(ev.start),
        end:   ev.end.toDate   ? ev.end.toDate()   : new Date(ev.end),
    }));

    const sharedDaily = (fData.dailyTasks || []).filter(t => t.isShared).map(t => ({
        ...t, type: 'daily',
        // Tạo object Date ảo để sort chung
        start: new Date(`${t.dateStr}T${t.time}:00`),
    }));

    const allFeed = [...sharedEvents, ...sharedDaily].sort((a, b) => b.start - a.start); // Mới nhất lên đầu

    setViewingFriendFeed({
      uid: friendUid,
      profile: fProfile,
      feed: allFeed
    });
    setIsSettingsOpen(false);
  };

  // Tương tác: Thả cảm xúc và Bình luận
  const handleInteract = async (eventId, type, itemType, actionData) => {
      // Vì firebase rules cho phép mọi user ghi, ta sẽ kéo document của bạn bè về và cập nhật mảng
      if (!viewingFriendFeed) return;
      const targetUid = viewingFriendFeed.uid;
      
      try {
          const fRef = doc(db, "users", targetUid);
          const fDoc = await getDoc(fRef);
          if (!fDoc.exists()) return;
          const fData = fDoc.data();
          
          let targetArray = itemType === 'roadmap' ? fData.events : fData.dailyTasks;
          
          const updatedArray = targetArray.map(item => {
              if (item.id === eventId) {
                  let updatedItem = { ...item };
                  if (type === 'reaction') {
                      const currentReact = updatedItem.reactions[user.uid];
                      if (currentReact === actionData) {
                          delete updatedItem.reactions[user.uid]; // Bỏ react
                      } else {
                          updatedItem.reactions[user.uid] = actionData;
                      }
                  } else if (type === 'comment') {
                      updatedItem.comments = [...(updatedItem.comments || []), {
                          uid: user.uid,
                          name: profile.displayName,
                          avatar: profile.avatar,
                          text: actionData,
                          timestamp: Date.now()
                      }];
                  }
                  return updatedItem;
              }
              return item;
          });

          // Cập nhật lên Firestore
          if (itemType === 'roadmap') {
              await setDoc(fRef, { events: updatedArray }, { merge: true });
          } else {
              await setDoc(fRef, { dailyTasks: updatedArray }, { merge: true });
          }

          // Cập nhật giao diện Local lập tức để không phải fetch lại
          const newFeed = viewingFriendFeed.feed.map(item => {
             if (item.id === eventId) {
                 if (type === 'reaction') {
                    const newReactions = { ...item.reactions };
                    if (newReactions[user.uid] === actionData) delete newReactions[user.uid];
                    else newReactions[user.uid] = actionData;
                    return { ...item, reactions: newReactions };
                 }
                 if (type === 'comment') {
                     return { ...item, comments: [...(item.comments||[]), { uid: user.uid, name: profile.displayName, avatar: profile.avatar, text: actionData, timestamp: Date.now() }] };
                 }
             }
             return item;
          });
          setViewingFriendFeed({ ...viewingFriendFeed, feed: newFeed });
          setFeedCommentInput({ ...feedCommentInput, [eventId]: '' });

      } catch (err) {
          alert("Lỗi tương tác. Vui lòng kiểm tra lại quyền Firebase Rules (BƯỚC 1).");
          console.error(err);
      }
  };

  const handleLogout = () => signOut(auth).catch(console.error);

  // ── 9. HELPERS ─────────────────────────────────────────────
  const getDaysLeft = (ev) => Math.ceil((ev.end.getTime() - now.getTime()) / 86400000);
  const getEventProgress = (ev) => {
    if (ev.status === 'done') return 100;
    if (ev.status === 'todo') return 0;
    return ev.progress || 0;
  };

  const urgentEvents = events.filter(ev => { const d = getDaysLeft(ev); return d >= 0 && d <= 3; });

  // ── 10. RENDER ──────────────────────────────────────────────
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-pink-50">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-pink-600 font-bold text-sm tracking-widest uppercase">Đang đồng bộ dữ liệu...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-2 md:p-4 font-sans select-none" style={{ background: 'linear-gradient(135deg, #fdf2f8 0%, #eff6ff 50%, #fdf2f8 100%)' }}>

      {/* ══ KHUNG APP CHÍNH ══════════════════════════════════════════ */}
      <div className="w-full max-w-[1500px] h-[96vh] md:h-[820px] rounded-3xl flex flex-col relative overflow-hidden"
        style={{ background: 'rgba(255, 255, 255, 0.95)', border: '2px solid #fbcfe8', boxShadow: '0 10px 40px rgba(236, 72, 153, 0.15)' }}>

        {/* ═══ HEADER ═══════════════════════════════════════════ */}
        <div className="h-16 flex items-center justify-between px-4 border-b shrink-0 shadow-sm z-10"
          style={{ background: 'linear-gradient(90deg, #fce7f3, #e0e7ff)', borderColor: '#fbcfe8' }}>

          <div className="flex items-center gap-3">
            <div className="relative">
              <img src={profile.avatar} alt="avatar" className="w-10 h-10 rounded-full object-cover border-2 shadow-sm" style={{ borderColor: '#ec4899', background: '#fff' }} />
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white"></div>
            </div>
            <div>
              <div className="text-indigo-900 font-black text-[14px] leading-tight drop-shadow-sm">{profile.displayName}</div>
              <div className="text-[10px] font-bold mt-0.5 px-1.5 py-0.5 rounded-full inline-block" style={{ color: '#be185d', background: 'rgba(236, 72, 153, 0.15)' }}>ID: {profile.shortId}</div>
            </div>
            <div className="hidden md:flex items-center gap-1.5 ml-4">
              <div className="h-6 w-px bg-pink-200"></div>
              <div className="flex gap-2 text-[11px] font-bold ml-2">
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 shadow-sm border border-emerald-200">✅ {stats.done} Xong</span>
                <span className="px-2.5 py-1 rounded-full bg-pink-100 text-pink-700 shadow-sm border border-pink-200">⏳ {stats.inProg} Đang làm</span>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 shadow-sm border border-slate-200">📅 {stats.upcoming} Sắp tới</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setIsStatsOpen(true)} className="hidden md:flex items-center gap-1.5 text-[11px] font-black uppercase px-4 py-2 rounded-xl transition-all shadow-sm hover:scale-105 hover:shadow-md" style={{ background: '#e0e7ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}>
              📊 Thống kê
            </button>
            <button onClick={() => setIsDeadlineModalOpen(true)} className="relative flex items-center gap-1.5 text-[11px] font-black uppercase px-4 py-2 rounded-xl transition-all shadow-sm hover:scale-105 hover:shadow-md" style={{ background: urgentEvents.length > 0 ? '#fee2e2' : '#fef3c7', color: urgentEvents.length > 0 ? '#dc2626' : '#d97706', border: `1px solid ${urgentEvents.length > 0 ? '#fecaca' : '#fde68a'}` }}>
              ⏰ Cảnh Báo
              {urgentEvents.length > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-bounce shadow-md">{urgentEvents.length}</span>}
            </button>
            <button onClick={() => { setProfileFormData(profile); setIsSettingsOpen(true); }} className="flex items-center gap-1.5 text-[11px] font-black uppercase px-4 py-2 rounded-xl transition-all shadow-sm hover:scale-105 hover:shadow-md" style={{ background: '#ffffff', color: '#db2777', border: '1px solid #fbcfe8' }}>
              ⚙️ Cài đặt
            </button>
            <button onClick={handleLogout} className="flex items-center justify-center w-8 h-8 rounded-xl transition-all shadow-sm hover:scale-105" style={{ background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca' }}>⏏</button>
          </div>
        </div>

        {/* ═══ BODY ══════════════════════════════════════════════ */}
        <div className="flex flex-1 overflow-hidden gap-3 p-3 bg-slate-50">

          {/* ── SIDEBAR BÊN TRÁI ─────────────────────────────────────────── */}
          <div className={`w-full md:w-[280px] shrink-0 flex flex-col gap-3 ${showMobileMap ? 'hidden md:flex' : 'flex'}`}>

            {/* Thẻ Cá Nhân */}
            <div className="relative rounded-2xl overflow-hidden flex-none h-[200px] shadow-sm border-2 border-pink-100 bg-white">
              <img src={profile.background} alt="bg" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0.3) 60%, transparent 100%)' }}></div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="text-indigo-900 font-black text-[17px] leading-tight drop-shadow-sm">{profile.title}</div>
                <div className="text-[12px] font-bold mt-0.5 text-pink-500 drop-shadow-sm">{profile.subtitle}</div>
                {profile.bio && <div className="text-[11px] font-medium text-slate-600 mt-1.5 line-clamp-2 bg-white/60 p-1.5 rounded-lg backdrop-blur-sm border border-white">{profile.bio}</div>}
              </div>
              <div className="md:hidden absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-sm">
                <button onClick={() => setShowMobileMap(true)} className="bg-pink-500 text-white font-black px-6 py-3 rounded-full text-sm shadow-[0_4px_15px_rgba(236,72,153,0.4)] border-2 border-white hover:scale-105 transition-transform">
                  MỞ BẢNG ĐIỀU KHIỂN
                </button>
              </div>
            </div>

            {/* Thẻ Thống kê */}
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Tổng số',   val: stats.total,    color: '#6366f1', bg: '#e0e7ff', icon: '📋' },
                  { label: 'Hoàn thành', val: stats.done,    color: '#10b981', bg: '#d1fae5', icon: '✅' },
                  { label: 'Đang làm',  val: stats.inProg,   color: '#ec4899', bg: '#fce7f3', icon: '⏳' },
                  { label: 'Sắp tới',   val: stats.upcoming, color: '#f59e0b', bg: '#fef3c7', icon: '📅' },
                ].map(s => (
                  <div key={s.label} className="p-3 rounded-2xl text-center bg-white shadow-sm" style={{ border: `1px solid ${s.bg}` }}>
                    <div className="text-xl mb-1">{s.icon}</div>
                    <div className="font-black text-2xl" style={{ color: s.color }}>{s.val}</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl p-4 bg-white shadow-sm border border-slate-100">
                <div className="text-[11px] font-black text-pink-400 uppercase tracking-widest mb-3 flex items-center gap-1"><span>📑</span> Phân loại</div>
                <div className="space-y-2">
                  {stats.catBreakdown.filter(c => c.count > 0).map(cat => (
                    <div key={cat.id} className="flex items-center gap-2.5">
                      <div className="text-[13px] shrink-0">{cat.icon}</div>
                      <div className="text-[12px] font-bold text-slate-600 flex-1 truncate">{cat.label}</div>
                      <div className="text-[12px] font-black bg-slate-50 px-2 py-0.5 rounded-md" style={{ color: cat.color }}>{cat.count}</div>
                    </div>
                  ))}
                  {stats.catBreakdown.every(c => c.count === 0) && <div className="text-[12px] text-slate-400 italic font-medium">Chưa có dữ liệu.</div>}
                </div>
              </div>

              <div className="rounded-2xl p-4 bg-white shadow-sm border border-slate-100">
                <div className="text-[11px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-1"><span>📆</span> Tuần này</div>
                {(() => {
                  const weekEnd = new Date(now.getTime() + 7 * 86400000);
                  const thisWeek = events.filter(e => e.end >= now && e.start <= weekEnd).sort((a, b) => a.end - b.end).slice(0, 3);
                  if (thisWeek.length === 0) return <div className="text-[12px] text-slate-400 italic font-medium">Không có lịch trình sắp tới.</div>;
                  return thisWeek.map(ev => {
                    const cat = getCat(ev.category);
                    return (
                      <div key={ev.id} onClick={() => setSelectedEventDetail(ev)} className="flex items-center gap-3 py-2 cursor-pointer group hover:bg-slate-50 rounded-xl px-2 -mx-2 transition-colors">
                        <div className="text-lg">{cat.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-black text-slate-700 truncate group-hover:text-indigo-600 transition-colors">{ev.title}</div>
                          <div className="text-[10px] font-bold mt-0.5" style={{ color: cat.color }}>{ev.dateStr}</div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          {/* ── TIMELINE BÊN PHẢI ────────────────────────────────────────── */}
          <div className={`flex-1 flex flex-col rounded-2xl overflow-hidden shadow-sm bg-white border border-slate-200 ${showMobileMap ? 'flex' : 'hidden md:flex'}`}>

            {/* Thanh công cụ */}
            <div className="shrink-0 px-4 py-3 flex flex-wrap items-center gap-3 bg-white border-b border-slate-100 z-10">
              <button onClick={() => setShowMobileMap(false)} className="md:hidden text-[10px] font-black px-3 py-1.5 rounded-lg bg-pink-100 text-pink-600 border border-pink-200 shadow-sm">← Quay lại</button>

              <div className="relative flex-1 min-w-[140px] max-w-[220px]">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="🔍 Tìm kiếm sự kiện..." className="w-full text-[12px] font-medium py-2 pl-3 pr-3 rounded-xl outline-none bg-slate-50 border border-slate-200 text-slate-700 focus:border-pink-300 focus:bg-white transition-all shadow-inner" />
              </div>

              <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1 md:pb-0">
                <button onClick={() => setFilterCat('all')} className={`shrink-0 text-[11px] font-black px-3 py-1.5 rounded-xl transition-all shadow-sm ${filterCat === 'all' ? 'bg-pink-100 text-pink-600 border-pink-300' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>Tất cả</button>
                {CATEGORIES.map(cat => (
                  <button key={cat.id} onClick={() => setFilterCat(cat.id === filterCat ? 'all' : cat.id)} className="shrink-0 text-[11px] font-black px-3 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1" style={{ background: filterCat === cat.id ? cat.bg : '#ffffff', color: filterCat === cat.id ? cat.text : '#64748b', border: `1px solid ${filterCat === cat.id ? cat.border : '#e2e8f0'}` }}>
                    <span>{cat.icon}</span> <span>{cat.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-1.5">
                {[{ id: 'all', label: '⭐ Tất cả', icon: '' }, ...STATUSES].map(s => (
                  <button key={s.id} onClick={() => setFilterStat(s.id === filterStat ? 'all' : s.id)} className="shrink-0 text-[11px] font-black px-3 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1" style={{ background: filterStat === s.id ? '#e0e7ff' : '#ffffff', color: filterStat === s.id ? '#4f46e5' : '#64748b', border: `1px solid ${filterStat === s.id ? '#c7d2fe' : '#e2e8f0'}` }}>
                    {s.icon && <span>{s.icon}</span>} <span>{s.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 ml-auto bg-slate-50 p-1 rounded-xl border border-slate-200 shadow-inner">
                <button onClick={() => setZoomLevel(z => Math.max(0.4, +(z - 0.3).toFixed(1)))} className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-sm font-black text-slate-500 hover:text-pink-500 shadow-sm border border-slate-200">−</button>
                <span className="text-[11px] font-black w-12 text-center text-indigo-600">{Math.round(zoomLevel * 100)}%</span>
                <button onClick={() => setZoomLevel(z => Math.min(3, +(z + 0.3).toFixed(1)))} className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-sm font-black text-slate-500 hover:text-pink-500 shadow-sm border border-slate-200">+</button>
                <button onClick={() => setZoomLevel(1)} className="text-[10px] px-3 h-7 rounded-lg font-black bg-pink-100 text-pink-600 shadow-sm border border-pink-200 ml-1">Mặc định</button>
              </div>
            </div>

            {/* Vùng bản đồ thời gian */}
            <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar" ref={scrollContainerRef}>
              <div className="flex flex-col h-full relative" style={{ minWidth: `${totalDays * dayWidth}px` }}>

                {/* Các hàng mốc thời gian */}
                <div className="sticky top-0 z-40 shadow-sm">
                  <div className="h-6 flex text-[10px] font-black tracking-widest uppercase bg-pink-100 text-pink-600 border-b border-pink-200">
                    {yearsData.map((y, i) => <div key={i} className="flex items-center justify-center border-r border-pink-200" style={{ width: `${(y.count / totalDays) * 100}%` }}>NĂM {y.year}</div>)}
                  </div>
                  <div className="h-8 flex text-[12px] font-black bg-indigo-50 text-indigo-600 border-b border-indigo-100">
                    {monthsData.map((m, i) => <div key={i} className="flex items-center justify-center border-r border-indigo-100" style={{ width: `${(m.count / totalDays) * 100}%` }}>THÁNG {m.month}</div>)}
                  </div>
                  <div className="h-9 flex relative bg-white border-b border-slate-100">
                    {daysArray.map((date, idx) => {
                      if (idx % Math.max(1, Math.round(2 / zoomLevel)) !== 0 && idx !== totalDays) return null;
                      const hasDaily = dailyTasks.some(t => t.dateStr === formatYYYYMMDD(date));
                      return (
                        <div key={idx} onClick={() => setSelectedDailyDate(date)} className="absolute top-0 flex flex-col items-center cursor-pointer hover:bg-pink-50 rounded px-1 transition-colors h-full justify-center" style={{ left: `${(idx / totalDays) * 100}%`, transform: 'translateX(-50%)' }} title="Nhấn để xem lịch trình ngày">
                          <span className="text-[10px] font-black text-slate-500">{date.getDate()}</span>
                          {hasDaily ? <div className="w-1.5 h-1.5 rounded-full bg-pink-500 mt-0.5 shadow-sm"></div> : <div className="w-0.5 h-1.5 mt-0.5 bg-slate-200 rounded-full"></div>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Vùng sự kiện dải ngang */}
                <div className="flex-1 relative overflow-hidden bg-white" style={{ backgroundImage: `repeating-linear-gradient(to right, #f8fafc 0px, #f8fafc 1px, transparent 1px, transparent ${dayWidth * 7}px)`, backgroundSize: `${(7 / totalDays) * 100}% 100%` }}>
                  {isNowVisible && (
                    <div className="absolute top-0 bottom-0 z-30 flex flex-col items-center" style={{ left: `${nowOffsetPercent}%` }}>
                      <div className="w-0.5 h-full bg-pink-400 shadow-[0_0_8px_rgba(244,114,182,0.6)]"></div>
                      <div className="absolute top-2 text-[10px] font-black px-3 py-1 rounded-full whitespace-nowrap bg-pink-500 text-white shadow-md border-2 border-white">{todayLabel}</div>
                    </div>
                  )}

                  {filteredEvents.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center bg-white/60 p-6 rounded-3xl backdrop-blur-sm border border-slate-100 shadow-sm">
                        <div className="text-5xl mb-3">📭</div>
                        <div className="text-[14px] font-black text-slate-500">{events.length === 0 ? 'Vui lòng thiết lập sự kiện tại mục Cài Đặt.' : 'Không tìm thấy kết quả.'}</div>
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
                      const daysLeft = getDaysLeft(event);
                      const isUrgent = daysLeft >= 0 && daysLeft <= 3 && event.status !== 'done';

                      return (
                        <div key={event.id} onClick={() => setSelectedEventDetail(event)} className="absolute h-[62px] flex items-center z-20 cursor-pointer group transition-all duration-200 hover:-translate-y-0.5 bg-white" style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: 'max-content', top: `${top}px`, border: `2px solid ${isUrgent ? '#f43f5e' : cat.border}`, borderRadius: '16px', boxShadow: isUrgent ? `0 4px 15px rgba(244,63,94,0.3)` : '0 2px 10px rgba(0,0,0,0.05)' }}>
                          <div className="absolute left-0 top-0 bottom-0 w-2 rounded-l-xl" style={{ background: cat.color }}></div>
                          <div className="w-[72px] md:w-[90px] h-full relative shrink-0 pl-3.5 pr-2 py-1.5">
                            <img src={event.image} alt="" className="w-full h-full object-cover rounded-xl shadow-sm border border-slate-100" style={{ opacity: event.status === 'done' ? 0.6 : 1 }} />
                            {event.status === 'done' && <div className="absolute inset-0 flex items-center justify-center"><span className="text-2xl drop-shadow-md">✅</span></div>}
                          </div>
                          <div className="flex-1 min-w-0 py-1 flex flex-col justify-center pr-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[10px]">{getPri(event.priority).icon}</span>
                              <span className="text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider flex items-center gap-1" style={{ background: cat.bg, color: cat.text, border: `1px solid ${cat.border}` }}>
                                {cat.icon} {cat.label}
                              </span>
                              {isUrgent && <span className="text-[9px] px-2 py-0.5 rounded-full font-black animate-pulse bg-red-100 text-red-600 border border-red-200">🔥 {daysLeft === 0 ? 'Hôm nay' : `Còn ${daysLeft} ngày`}</span>}
                              {event.isShared && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-black bg-pink-100 text-pink-500 border border-pink-200" title="Đã chia sẻ">📢</span>}
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
                          {event.rewards && (
                            <div className="hidden md:flex shrink-0 items-center h-[70%] border-l border-slate-100 px-3">
                              <div className="px-2.5 py-1.5 rounded-xl text-center bg-amber-50 border border-amber-100 shadow-inner">
                                <div className="text-sm leading-none">🏆</div>
                                <div className="text-[10px] font-black mt-1 max-w-[80px] truncate text-amber-600">{event.rewards}</div>
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
          MODAL LỊCH TRÌNH TRONG NGÀY (DAILY TASKS)
      ════════════════════════════════════════════════════════ */}
      {selectedDailyDate && (
        <div className="fixed inset-0 flex items-center justify-center z-[120] p-4" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)' }} onClick={() => setSelectedDailyDate(null)}>
          <div className="w-full max-w-[480px] rounded-[2rem] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.15)] bg-white relative flex flex-col border-[3px] border-indigo-100" onClick={e => e.stopPropagation()}>
             <div className="px-6 py-4 flex items-center justify-between bg-indigo-50 border-b border-indigo-100">
               <h2 className="font-black text-lg text-indigo-900 flex items-center gap-2"><span>📅</span> Lịch Trình Ngày: {formatYYYYMMDD(selectedDailyDate)}</h2>
               <button onClick={() => setSelectedDailyDate(null)} className="font-black text-slate-400 hover:text-indigo-600 bg-white w-8 h-8 rounded-full shadow-sm border border-slate-200 flex items-center justify-center transition-colors">✕</button>
             </div>
             
             <div className="p-5 overflow-y-auto max-h-[50vh] custom-scrollbar bg-slate-50/50 space-y-3">
                {(() => {
                   const dayTasks = dailyTasks.filter(t => t.dateStr === formatYYYYMMDD(selectedDailyDate)).sort((a,b) => a.time.localeCompare(b.time));
                   if (dayTasks.length === 0) return <div className="text-center py-6 text-slate-400 font-bold text-sm">Chưa có lịch trình chi tiết nào cho ngày này.</div>;
                   return dayTasks.map(t => (
                      <div key={t.id} className="bg-white border-2 border-slate-100 rounded-2xl p-3 flex items-center gap-3 shadow-sm hover:border-indigo-200 transition-colors">
                         <div className="bg-indigo-100 text-indigo-600 font-black px-3 py-1.5 rounded-xl border border-indigo-200">{t.time}</div>
                         <div className="flex-1 font-bold text-slate-700">{t.title}</div>
                         <button onClick={() => handleToggleShareDaily(t.id)} className={`text-[10px] font-black px-2.5 py-1.5 rounded-lg border ${t.isShared ? 'bg-pink-100 text-pink-600 border-pink-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{t.isShared ? 'Đang Chia sẻ' : 'Riêng tư'}</button>
                         <button onClick={() => handleDeleteDailyTask(t.id)} className="text-red-500 bg-red-50 w-8 h-8 rounded-xl font-black border border-red-100 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors">✕</button>
                      </div>
                   ));
                })()}
             </div>

             <div className="p-5 bg-white border-t-2 border-slate-100">
                <form onSubmit={handleAddDailyTask} className="flex gap-2 items-center">
                   <input type="time" required value={dailyFormData.time} onChange={e => setDailyFormData({...dailyFormData, time: e.target.value})} className="bg-slate-50 border-2 border-slate-200 rounded-xl px-2 py-2.5 font-black text-indigo-600 outline-none focus:border-indigo-400" />
                   <input type="text" required placeholder="Nội dung công việc..." value={dailyFormData.title} onChange={e => setDailyFormData({...dailyFormData, title: e.target.value})} className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 font-bold text-slate-700 outline-none focus:border-indigo-400" />
                   <button type="submit" className="bg-indigo-500 text-white font-black px-4 py-3 rounded-xl shadow-md hover:bg-indigo-600 transition-colors">THÊM</button>
                </form>
             </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          MODAL CÀI ĐẶT HỆ THỐNG
      ════════════════════════════════════════════════════════ */}
      {isSettingsOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-2 md:p-4" style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)' }}>
          <div className="w-full max-w-[860px] h-[92vh] md:h-[680px] rounded-[2rem] flex flex-col overflow-hidden relative bg-white border-[3px] border-pink-200 shadow-[0_20px_60px_rgba(236,72,153,0.15)]">

            <div className="h-16 flex items-center justify-between px-6 shrink-0 bg-pink-50 border-b border-pink-100">
              <div className="flex gap-2">
                {[
                  { id: 'profile', label: 'Tài Khoản',     icon: '⚙️' },
                  { id: 'events',  label: 'Quản Lý Lịch',  icon: '📅' },
                  { id: 'friends', label: 'Bạn Bè',        icon: '👥' },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="px-5 py-2 rounded-xl text-[12px] font-black uppercase tracking-wide transition-all shadow-sm flex items-center gap-1.5" style={{ background: activeTab === tab.id ? '#fbcfe8' : '#ffffff', color: activeTab === tab.id ? '#be185d' : '#64748b', border: activeTab === tab.id ? '2px solid #f9a8d4' : '2px solid #f1f5f9' }}>
                    <span>{tab.icon}</span> {tab.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-all bg-white text-slate-400 hover:bg-pink-500 hover:text-white border-2 border-slate-200 hover:border-pink-500 shadow-sm">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 md:p-8 custom-scrollbar bg-slate-50/50">

              {/* ── TAB: TÀI KHOẢN ── */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <div className="relative h-32 rounded-3xl overflow-hidden border-[3px] border-white shadow-md bg-white">
                    <img src={profileFormData.background} alt="bg" className="absolute inset-0 w-full h-full object-cover opacity-80" />
                    <div className="absolute inset-0 bg-gradient-to-r from-white/90 to-transparent"></div>
                    <div className="absolute inset-0 flex items-center gap-5 px-6">
                      <img src={profileFormData.avatar} alt="av" className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-md bg-white" />
                      <div>
                        <div className="font-black text-indigo-900 text-2xl drop-shadow-sm">{profileFormData.displayName || "Người dùng mới"}</div>
                        <div className="text-[12px] font-black font-mono px-3 py-1 rounded-full mt-2 inline-block bg-pink-100 text-pink-600 border border-pink-200 shadow-sm">ID: {profile.shortId}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {[
                      { key: 'displayName', label: 'Tên hiển thị', placeholder: 'Nhập tên hiển thị' },
                      { key: 'title',       label: 'Tiêu đề lớn',  placeholder: 'TỔNG QUAN LỊCH TRÌNH' },
                      { key: 'subtitle',    label: 'Tiêu đề phụ',  placeholder: 'Thông tin bổ sung' },
                      { key: 'bio',         label: 'Giới thiệu',   placeholder: 'Mô tả ngắn gọn về bạn...' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-[11px] font-black uppercase mb-2 block text-indigo-500">{f.label}</label>
                        <input type="text" placeholder={f.placeholder} className="w-full rounded-2xl px-4 py-3 text-sm font-semibold outline-none transition-all bg-white border-2 border-slate-200 text-slate-700 focus:border-pink-400 focus:shadow-[0_0_0_4px_rgba(244,114,182,0.1)]" value={profileFormData[f.key] || ''} onChange={e => setProfileFormData(p => ({ ...p, [f.key]: e.target.value }))} />
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {[
                      { key: 'avatar',     label: 'Ảnh đại diện (1:1)',  target: 'avatar' },
                      { key: 'background', label: 'Ảnh nền (16:9)',      target: 'background' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-[11px] font-black uppercase mb-2 block text-pink-500">{f.label}</label>
                        <div className="flex gap-2 items-center bg-white p-2 rounded-2xl border-2 border-slate-200 shadow-sm">
                          <input type="file" accept="image/*" onChange={e => onSelectFile(e, f.target)} className="flex-1 text-xs px-2 cursor-pointer file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 transition-colors text-slate-500" />
                          <button type="button" onClick={() => handlePasteButtonClick(f.target)} className="shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all bg-indigo-500 text-white shadow-[0_4px_10px_rgba(99,102,241,0.3)] hover:scale-105">📋 Dán</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-6 mt-4 border-t-2 border-slate-100">
                    <button onClick={handleSaveProfile} className="w-full py-4 rounded-2xl font-black uppercase text-sm tracking-wider transition-all hover:-translate-y-1 bg-gradient-to-r from-pink-400 to-indigo-400 text-white shadow-[0_10px_20px_rgba(236,72,153,0.3)]">💾 LƯU THÔNG TIN</button>
                  </div>
                </div>
              )}

              {/* ── TAB: QUẢN LÝ LỊCH TRÌNH ── */}
              {activeTab === 'events' && (
                <div className="space-y-6">
                  <div className="rounded-3xl p-4 space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar bg-white border-2 border-slate-100 shadow-sm">
                    <div className="text-[11px] font-black uppercase mb-3 text-indigo-500 flex items-center gap-2"><span className="text-lg">📚</span> Danh sách hiện có ({events.length})</div>
                    {events.length === 0 && <div className="text-[13px] italic text-slate-400 text-center py-4">Chưa có sự kiện nào được tạo.</div>}
                    {events.map(ev => {
                      const cat = getCat(ev.category);
                      return (
                        <div key={ev.id} className="flex items-center gap-3 rounded-2xl px-4 py-3 bg-slate-50 border border-slate-200 hover:border-pink-200 hover:bg-pink-50 transition-colors">
                          <div className="w-2 h-8 rounded-full" style={{ background: cat.color }}></div>
                          <span className="text-xl">{getStat(ev.status).icon}</span>
                          <span className="text-[13px] font-black flex-1 truncate text-slate-700">{ev.title}</span>
                          <span className="text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1" style={{ background: cat.bg, color: cat.text, border: `1px solid ${cat.border}` }}><span>{cat.icon}</span> {cat.label}</span>
                          {ev.isShared && <span className="text-[10px] bg-pink-100 text-pink-600 px-2 py-1 rounded-lg border border-pink-200 font-bold shrink-0">Công khai</span>}
                          <button onClick={() => handleDeleteEvent(ev.id)} className="text-[10px] font-black px-3 py-1.5 rounded-lg transition-all hover:scale-105 bg-red-100 text-red-600 border border-red-200">Xóa</button>
                        </div>
                      );
                    })}
                  </div>

                  <form onSubmit={handleAddEvent} className="space-y-4 bg-white p-5 rounded-3xl border-2 border-slate-100 shadow-sm">
                    <div className="text-[13px] font-black uppercase text-pink-500 flex items-center gap-2 mb-2"><span className="text-xl">✏️</span> Thêm lịch trình mới</div>

                    <input required type="text" placeholder="Tên sự kiện / môn học / dự án..." className="w-full rounded-2xl px-4 py-3 text-sm font-semibold outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-pink-400 focus:bg-white transition-all" value={eventFormData.title} onChange={e => setEventFormData(p => ({ ...p, title: e.target.value }))} />

                    <div className="grid grid-cols-2 gap-4">
                      {[{ key: 'startDate', label: 'Từ ngày' }, { key: 'endDate', label: 'Đến ngày' }].map(f => (
                        <div key={f.key}>
                          <label className="text-[10px] font-black uppercase mb-1.5 block text-indigo-400">{f.label}</label>
                          <input required type="date" className="w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-indigo-400 focus:bg-white transition-all" value={eventFormData[f.key]} onChange={e => setEventFormData(p => ({ ...p, [f.key]: e.target.value }))} />
                        </div>
                      ))}
                    </div>

                    {/* Cấu hình lặp lại */}
                    <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-200">
                       <label className="flex items-center gap-2 cursor-pointer mb-3">
                          <input type="checkbox" className="w-4 h-4 accent-pink-500" checked={eventFormData.isRecurring} onChange={e => setEventFormData({...eventFormData, isRecurring: e.target.checked})} />
                          <span className="text-sm font-black text-slate-700">Lặp lại sự kiện này</span>
                       </label>
                       {eventFormData.isRecurring && (
                          <div className="flex flex-col md:flex-row gap-3">
                             <select className="flex-1 rounded-xl px-3 py-2 text-sm font-bold outline-none bg-white border-2 border-slate-200 focus:border-pink-400" value={eventFormData.recurType} onChange={e => setEventFormData({...eventFormData, recurType: e.target.value})}>
                                <option value="weekly">Lặp lại mỗi Tuần</option>
                                <option value="yearly">Lặp lại mỗi Năm</option>
                             </select>
                             <div className="flex-1 flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500">Số lượng:</span>
                                <input type="number" min="2" max="50" className="w-20 rounded-xl px-3 py-2 text-sm font-bold outline-none bg-white border-2 border-slate-200 focus:border-pink-400" value={eventFormData.recurCount} onChange={e => setEventFormData({...eventFormData, recurCount: e.target.value})} />
                                <span className="text-xs font-bold text-slate-500">lần.</span>
                             </div>
                          </div>
                       )}
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase mb-2 block text-indigo-400">Danh mục</label>
                      <div className="flex flex-wrap gap-2">
                        {CATEGORIES.map(cat => (
                          <button key={cat.id} type="button" onClick={() => setEventFormData(p => ({ ...p, category: cat.id }))} className="text-[11px] font-black px-3 py-1.5 rounded-xl transition-all shadow-sm hover:scale-105 flex items-center gap-1" style={{ background: eventFormData.category === cat.id ? cat.bg : '#f8fafc', color: eventFormData.category === cat.id ? cat.text : '#64748b', border: `2px solid ${eventFormData.category === cat.id ? cat.color : '#e2e8f0'}` }}>
                            <span>{cat.icon}</span> {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black uppercase mb-2 block text-indigo-400">Độ ưu tiên</label>
                        <div className="flex gap-1.5 bg-slate-50 p-1.5 rounded-2xl border-2 border-slate-200">
                          {PRIORITIES.map(p => (
                            <button key={p.id} type="button" onClick={() => setEventFormData(f => ({ ...f, priority: p.id }))} className="flex-1 text-[11px] font-black py-1.5 rounded-xl transition-all shadow-sm" style={{ background: eventFormData.priority === p.id ? '#ffffff' : 'transparent', color: eventFormData.priority === p.id ? '#1e293b' : '#94a3b8', border: eventFormData.priority === p.id ? '1px solid #e2e8f0' : '1px solid transparent' }}>
                              {p.icon} {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase mb-2 block text-indigo-400">Trạng thái ban đầu</label>
                        <select className="w-full rounded-2xl px-3 py-2.5 text-[12px] font-black outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-indigo-400" value={eventFormData.status} onChange={e => setEventFormData(p => ({ ...p, status: e.target.value }))}>
                          {STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <input type="text" placeholder="🏆 Mục tiêu / Kết quả" className="rounded-2xl px-4 py-3 text-sm font-semibold outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-amber-400 focus:bg-white transition-all" value={eventFormData.rewards} onChange={e => setEventFormData(p => ({ ...p, rewards: e.target.value }))} />
                      <input type="text" placeholder="📝 Ghi chú chi tiết" className="rounded-2xl px-4 py-3 text-sm font-semibold outline-none bg-slate-50 border-2 border-slate-200 text-slate-700 focus:border-blue-400 focus:bg-white transition-all" value={eventFormData.notes} onChange={e => setEventFormData(p => ({ ...p, notes: e.target.value }))} />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase mb-2 block text-pink-500">Ảnh minh họa (21:9)</label>
                      <div className="flex gap-2 items-center bg-slate-50 p-2 rounded-2xl border-2 border-slate-200 shadow-sm">
                        <input type="file" accept="image/*" onChange={e => onSelectFile(e, 'event')} className="flex-1 text-xs px-2 cursor-pointer file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-pink-100 file:text-pink-600 hover:file:bg-pink-200 transition-colors text-slate-500" />
                        <button type="button" onClick={() => handlePasteButtonClick('event')} className="shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all bg-pink-500 text-white shadow-[0_4px_10px_rgba(236,72,153,0.3)] hover:scale-105">📋 Dán</button>
                      </div>
                      {eventFormData.croppedImage && (
                        <div className="mt-3 relative inline-block">
                          <img src={eventFormData.croppedImage} alt="preview" className="h-16 rounded-xl border-4 border-white shadow-md" />
                          <button type="button" onClick={() => setEventFormData(p => ({ ...p, croppedImage: null }))} className="absolute -top-2 -right-2 w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center bg-red-500 text-white shadow-sm border-2 border-white hover:scale-110 transition-transform">✕</button>
                        </div>
                      )}
                    </div>

                    <button type="submit" className="w-full py-4 mt-2 rounded-2xl font-black uppercase text-sm tracking-wider transition-all hover:-translate-y-1 bg-gradient-to-r from-emerald-400 to-teal-500 text-white shadow-[0_10px_20px_rgba(16,185,129,0.3)]">
                      THÊM LỊCH TRÌNH
                    </button>
                  </form>
                </div>
              )}

              {/* ── TAB: BẠN BÈ ── */}
              {activeTab === 'friends' && (
                <div className="space-y-6">
                  <form onSubmit={handleAddFriend} className="bg-white p-5 rounded-3xl border-[3px] border-pink-100 shadow-sm flex flex-col md:flex-row gap-3 items-end">
                    <div className="flex-1 w-full">
                      <label className="text-[11px] font-black uppercase mb-2 block text-pink-500">Nhập ID kết nối (8 chữ số)</label>
                      <input required type="text" maxLength="8" pattern="\d{8}" placeholder="Ví dụ: 12345678" className="w-full rounded-2xl px-4 py-3 text-lg font-black font-mono tracking-[4px] outline-none bg-slate-50 border-2 border-pink-200 text-slate-700 focus:border-pink-500 focus:bg-white transition-all text-center md:text-left" value={searchFriendId} onChange={e => setSearchFriendId(e.target.value)} />
                    </div>
                    <button type="submit" className="w-full md:w-auto px-8 py-3.5 rounded-2xl font-black text-sm transition-all hover:-translate-y-1 shadow-[0_10px_20px_rgba(236,72,153,0.3)] bg-gradient-to-r from-pink-500 to-rose-500 text-white h-auto">
                      KẾT NỐI
                    </button>
                  </form>

                  <div className="p-5 rounded-3xl text-center bg-gradient-to-br from-indigo-50 to-pink-50 border-2 border-dashed border-indigo-200 shadow-inner">
                    <div className="text-[11px] font-black uppercase mb-2 text-indigo-500">Mã ID Hệ Thống Của Bạn</div>
                    <div className="font-black text-3xl tracking-[8px] font-mono text-indigo-600 drop-shadow-sm bg-white inline-block px-6 py-2 rounded-2xl border-2 border-white shadow-sm">{profile.shortId}</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {friendsData.length === 0 && <div className="col-span-2 text-center py-8 text-[14px] font-bold text-slate-400 bg-white rounded-3xl border-2 border-slate-100 border-dashed">Danh sách bạn bè trống. Hãy chia sẻ ID để kết nối!</div>}
                    {friendsData.map(friend => (
                      <div key={friend.uid} className="rounded-2xl p-4 flex items-center gap-4 transition-all bg-white border-2 border-slate-100 shadow-sm hover:border-pink-300 hover:shadow-md">
                        <img src={friend.avatar} alt="" className="w-14 h-14 rounded-2xl object-cover border-2 border-pink-100 shadow-sm" />
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-[15px] text-indigo-900 truncate">{friend.displayName}</div>
                          <div className="text-[11px] font-black font-mono text-pink-400 mt-0.5">ID: {friend.shortId}</div>
                        </div>
                        <button onClick={() => handleViewFriendFeed(friend.uid)} className="px-4 py-2 rounded-xl text-[11px] font-black transition-all hover:scale-105 bg-indigo-50 text-indigo-600 border border-indigo-200 uppercase">Xem trang</button>
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
          CROP MODAL (CẮT ẢNH)
      ════════════════════════════════════════════════════════ */}
      {isCropModalOpen && upImg && (
        <div className="fixed inset-0 flex flex-col items-center justify-center z-[100] p-4" style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(15px)' }}>
          <div className="text-center mb-6">
            <h2 className="text-indigo-900 font-black text-2xl uppercase tracking-wide drop-shadow-sm">CẮT CHỈNH HÌNH ẢNH</h2>
            <p className="text-[11px] mt-2 px-4 py-1.5 rounded-full inline-block font-bold bg-indigo-50 text-indigo-500 border border-indigo-200 shadow-sm">
              Khung hình đã được thiết lập tỷ lệ tiêu chuẩn.
            </p>
          </div>
          <div className="rounded-3xl overflow-hidden p-2 bg-white shadow-[0_20px_50px_rgba(99,102,241,0.15)] border-[3px] border-indigo-100" style={{ maxWidth: '95%' }}>
            <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)} aspect={cropAspectRatio}>
              <img ref={imgRef} src={upImg} alt="crop" className="max-h-[50vh] max-w-full object-contain rounded-2xl" />
            </ReactCrop>
          </div>
          <div className="flex gap-4 mt-8 w-full max-w-[400px]">
            <button onClick={() => { setIsCropModalOpen(false); setUpImg(null); }} className="flex-1 py-3.5 rounded-2xl font-black text-sm bg-white text-slate-500 border-2 border-slate-200 hover:bg-slate-50 hover:text-slate-700 shadow-sm transition-all">Hủy bỏ</button>
            <button onClick={handleCropComplete} className="flex-1 py-3.5 rounded-2xl font-black text-sm bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_10px_20px_rgba(99,102,241,0.3)] hover:-translate-y-1 transition-all">Xác nhận lưu</button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          MODAL XEM FEED BẠN BÈ (CÓ BÌNH LUẬN & REACT)
      ════════════════════════════════════════════════════════ */}
      {viewingFriendFeed && (
        <div className="fixed inset-0 flex items-center justify-center z-[130] p-2 md:p-4" style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)' }} onClick={() => setViewingFriendFeed(null)}>
          <div className="w-full max-w-[600px] h-[95vh] rounded-[2.5rem] flex flex-col overflow-hidden bg-white border-[4px] border-pink-200 shadow-[0_20px_60px_rgba(236,72,153,0.15)] relative" onClick={e => e.stopPropagation()}>

            <div className="relative h-48 shrink-0 bg-pink-50 p-2">
              <div className="w-full h-full rounded-[2rem] overflow-hidden relative border-2 border-white shadow-inner">
                <img src={viewingFriendFeed.profile.background} alt="bg" className="absolute inset-0 w-full h-full object-cover opacity-60 blur-[2px]" />
                <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/20 to-transparent"></div>
              </div>
              <button onClick={() => setViewingFriendFeed(null)} className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center font-black bg-white/80 text-slate-500 hover:bg-white hover:text-pink-500 border-2 border-white shadow-md backdrop-blur-sm transition-all z-20">✕</button>
              
              <div className="absolute -bottom-10 left-6 flex items-end gap-4 z-10">
                <img src={viewingFriendFeed.profile.avatar} alt="" className="w-24 h-24 rounded-[1.5rem] border-4 object-cover shadow-lg bg-white" style={{ borderColor: 'white' }} />
                <div className="pb-10 drop-shadow-md">
                  <div className="font-black text-2xl text-indigo-900 bg-white/60 px-2 py-0.5 rounded-lg backdrop-blur-sm inline-block">{viewingFriendFeed.profile.displayName}</div>
                  <div className="text-[11px] font-black font-mono text-pink-600 bg-pink-100 border border-pink-200 px-3 py-1 rounded-full mt-1.5 shadow-sm inline-block">ID: {viewingFriendFeed.profile.shortId}</div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pt-16 px-4 md:px-6 pb-6 custom-scrollbar space-y-4 bg-slate-50/50">
              {viewingFriendFeed.feed.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-3xl border-2 border-dashed border-pink-100">
                  <div className="text-5xl mb-4">📭</div>
                  <div className="text-[14px] font-black text-slate-400">Người dùng này chưa chia sẻ lịch trình nào.</div>
                </div>
              ) : (
                <div className="relative border-l-[3px] border-pink-200 ml-4 space-y-8">
                  {viewingFriendFeed.feed.map(item => {
                    const isRoadmap = item.type === 'roadmap';
                    const myReaction = item.reactions?.[user.uid];
                    
                    return (
                      <div key={item.id} className="relative pl-7">
                        <div className="absolute -left-[11px] top-4 w-5 h-5 bg-pink-400 rounded-full border-[4px] border-white shadow-md flex items-center justify-center"></div>
                        
                        <div className="bg-white border-2 border-pink-100 rounded-3xl p-4 shadow-sm hover:shadow-md transition-shadow">
                          {/* Header Thẻ */}
                          <div className="flex items-center justify-between mb-3">
                             <div className="flex items-center gap-2">
                                <div className="text-[10px] font-black text-white bg-pink-400 inline-block px-2.5 py-1 rounded-lg shadow-sm">{isRoadmap ? item.dateStr : `${item.dateStr} | ${item.time}`}</div>
                                <div className="text-[10px] font-black px-2 py-1 rounded-lg bg-slate-50 text-slate-500 border border-slate-100 uppercase">{isRoadmap ? 'Sự kiện' : 'Lịch ngày'}</div>
                             </div>
                          </div>
                          
                          {/* Nội dung Thẻ */}
                          <h4 className="font-black text-slate-800 text-lg mb-3 leading-tight">{item.title}</h4>
                          {isRoadmap && <img src={item.image} alt="ev-img" className="w-full h-36 md:h-44 object-cover rounded-2xl border border-slate-100 shadow-sm mb-3" />}
                          {isRoadmap && item.rewards && <p className="mt-2 text-[12px] text-amber-700 font-bold bg-amber-50 p-2.5 rounded-xl border border-amber-100 flex items-center gap-2 shadow-inner mb-3"><span className="text-lg">⭐</span> {item.rewards}</p>}
                          
                          {/* Khu vực Mạng Xã Hội */}
                          <div className="border-t border-slate-100 pt-3 mt-2">
                             {/* Thanh chức năng Tương tác */}
                             <div className="flex gap-2 mb-3">
                                {['👍', '❤️', '🔥', '👏'].map(emoji => (
                                   <button key={emoji} onClick={() => handleInteract(item.id, 'reaction', item.type, emoji)} className={`text-lg px-2 py-1 rounded-lg border transition-all ${myReaction === emoji ? 'bg-pink-100 border-pink-300 scale-110' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                                      {emoji}
                                   </button>
                                ))}
                             </div>

                             {/* Hiển thị số lượng React */}
                             {Object.keys(item.reactions || {}).length > 0 && (
                                <div className="flex gap-1 text-[11px] font-bold text-slate-500 mb-3 bg-slate-50 px-2 py-1 rounded-lg w-fit">
                                   {Object.values(item.reactions).join('')} ({Object.keys(item.reactions).length})
                                </div>
                             )}

                             {/* Danh sách Bình Luận */}
                             {(item.comments || []).length > 0 && (
                                <div className="space-y-2 mb-3 bg-slate-50 p-3 rounded-2xl border border-slate-100 max-h-[150px] overflow-y-auto custom-scrollbar">
                                   {item.comments.map((cmt, idx) => (
                                      <div key={idx} className="flex gap-2">
                                         <img src={cmt.avatar} alt="av" className="w-6 h-6 rounded-full border border-slate-200" />
                                         <div className="bg-white px-3 py-1.5 rounded-xl rounded-tl-none border border-slate-200 shadow-sm">
                                            <span className="text-[10px] font-black text-indigo-700 block">{cmt.name}</span>
                                            <span className="text-[12px] text-slate-700">{cmt.text}</span>
                                         </div>
                                      </div>
                                   ))}
                                </div>
                             )}

                             {/* Khung Nhập Bình Luận */}
                             <form onSubmit={(e) => { e.preventDefault(); const text = feedCommentInput[item.id]; if(text) handleInteract(item.id, 'comment', item.type, text); }} className="flex gap-2">
                                <input type="text" placeholder="Viết bình luận..." className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-pink-300 transition-colors" value={feedCommentInput[item.id] || ''} onChange={e => setFeedCommentInput({...feedCommentInput, [item.id]: e.target.value})} />
                                <button type="submit" className="bg-pink-500 text-white font-black text-[10px] uppercase px-3 py-2 rounded-xl shadow-sm hover:bg-pink-600 transition-colors">Gửi</button>
                             </form>
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
      )}

      {/* STYLES CỤC BỘ */}
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(244,114,182,0.4); border-radius: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(236,72,153,0.6); }
        .style-date::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.6; transition: opacity 0.2s; }
        .style-date::-webkit-calendar-picker-indicator:hover { opacity: 1; }
      ` }} />
    </div>
  );
};

export default GameRoadmap;