import React, { useState, useRef, useEffect } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { db, auth } from './firebase'; 
import { doc, setDoc, getDoc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { signOut } from "firebase/auth";

// GameRoadmap nhận đối tượng 'user' từ component cha (thường là App.jsx)
const GameRoadmap = ({ user }) => {
  // ==========================================
  // 1. CẤU HÌNH THỜI GIAN (3 NĂM & HÔM NAY)
  // ==========================================
  const now = new Date();
  const currentYear = now.getFullYear();
  const startDate = new Date(currentYear - 1, 0, 1);
  const endDate = new Date(currentYear + 1, 11, 31, 23, 59, 59);
  const totalDuration = endDate.getTime() - startDate.getTime();
  const totalDays = Math.round(totalDuration / (1000 * 60 * 60 * 24));
  
  const daysArray = Array.from({ length: totalDays + 1 }, (_, i) => new Date(startDate.getTime() + i * 86400000));
  
  const yearsData = [];
  const monthsData = [];
  let tempYear = -1;
  let tempMonthStr = "";

  daysArray.forEach((date) => {
    if (date.getFullYear() !== tempYear) {
      yearsData.push({ year: date.getFullYear(), count: 1 });
      tempYear = date.getFullYear();
    } else {
      yearsData[yearsData.length - 1].count++;
    }
    const mStr = `${date.getFullYear()}-${date.getMonth()}`;
    if (mStr !== tempMonthStr) {
      monthsData.push({ month: date.getMonth() + 1, year: date.getFullYear(), count: 1 });
      tempMonthStr = mStr;
    } else {
      monthsData[monthsData.length - 1].count++;
    }
  });

  const isNowVisible = now >= startDate && now <= endDate;
  const nowOffsetPercent = ((now.getTime() - startDate.getTime()) / totalDuration) * 100;
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (scrollContainerRef.current && isNowVisible) {
      const containerWidth = scrollContainerRef.current.clientWidth;
      const totalScrollWidth = scrollContainerRef.current.scrollWidth;
      const scrollToX = (nowOffsetPercent / 100) * totalScrollWidth - (containerWidth / 2);
      scrollContainerRef.current.scrollLeft = scrollToX;
    }
  }, [nowOffsetPercent, isNowVisible]);

  const todayLabel = `HÔM NAY (${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')})`;

  // ==========================================
  // 2. STATE DỮ LIỆU CỐT LÕI VÀ ĐỒNG BỘ FIRESTORE
  // ==========================================
  const [showMobileMap, setShowMobileMap] = useState(false);
  const [selectedEventDetail, setSelectedEventDetail] = useState(null); 
  const [isDeadlineModalOpen, setIsDeadlineModalOpen] = useState(false);

  const generateID = () => Math.floor(10000000 + Math.random() * 90000000).toString();
  
  const [profile, setProfile] = useState({
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200", 
    background: "https://images.unsplash.com/photo-1541562232579-512a21360020?q=80&w=800", 
    title: "TỔNG QUAN PHIÊN BẢN", 
    subtitle: "v7.3",
    displayName: "Nhà Khai Phá",
    shortId: "........" // BÍ QUYẾT LÀ ĐÂY: Hiển thị chấm chấm lúc đang chờ tải
  });
  
  const [events, setEvents] = useState([]);
  const [friendsList, setFriendsList] = useState([]); 
  
  const [searchFriendId, setSearchFriendId] = useState('');
  const [friendsData, setFriendsData] = useState([]); 
  const [viewingFriendFeed, setViewingFriendFeed] = useState(null); 

  useEffect(() => {
    if (!user) return;
    
    const unsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let loadedProfile = data.profile ? { ...data.profile } : { ...profile };
        let needsSave = false;
        
        // Chỉ cấp ID và lưu 1 LẦN DUY NHẤT nếu Firestore chưa có
        if (!loadedProfile.shortId || loadedProfile.shortId === "........") {
          loadedProfile.shortId = generateID();
          needsSave = true;
        }
        if (!loadedProfile.displayName) {
          loadedProfile.displayName = "Nhà Khai Phá";
          needsSave = true;
        }
        if (!loadedProfile.background) {
          loadedProfile.background = loadedProfile.avatar || profile.background;
          needsSave = true;
        }

        setProfile(loadedProfile);

        if (needsSave) {
          setDoc(doc(db, "users", user.uid), { profile: loadedProfile }, { merge: true });
        }

        if (data.events) {
          const cloudEvents = data.events.map(ev => ({
            ...ev,
            start: ev.start.toDate ? ev.start.toDate() : new Date(ev.start),
            end: ev.end.toDate ? ev.end.toDate() : new Date(ev.end),
            isShared: ev.isShared || false 
          }));
          setEvents(cloudEvents);
        }
        
        if (data.friends) {
          setFriendsList(data.friends);
        }
      } else {
        // Tài khoản cực mới (Khách vừa vào), tạo trắng và cấp ID ngay
        const newProfile = { ...profile, shortId: generateID() };
        setProfile(newProfile);
        saveToCloud(newProfile, events, []);
      }
    });
    
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const fetchFriendsData = async () => {
      if (friendsList.length === 0) {
        setFriendsData([]);
        return;
      }
      const dataArr = [];
      for (const fUid of friendsList) {
        const fDoc = await getDoc(doc(db, "users", fUid));
        if (fDoc.exists()) {
          const fProfile = fDoc.data().profile;
          if(!fProfile.background) fProfile.background = fProfile.avatar; 
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
      await setDoc(doc(db, "users", user.uid), {
        profile: newProfile,
        events: newEvents,
        friends: newFriends
      });
    } catch (error) {
      console.error("Lỗi đồng bộ mây:", error);
    }
  };

  // ==========================================
  // 3. HỆ THỐNG MENU CÀI ĐẶT VÀ BIỂU MẪU
  // ==========================================
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('profile'); 
  const [profileFormData, setProfileFormData] = useState(profile);
  const [eventFormData, setEventFormData] = useState({ title: '', startDate: '', endDate: '', rewards: '' });

  // ==========================================
  // 4. CẮT ẢNH VÀ XỬ LÝ DÁN ẢNH TỪ CLIPBOARD
  // ==========================================
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [upImg, setUpImg] = useState(); 
  const [crop, setCrop] = useState({ unit: '%', width: 50, x: 25, y: 25 });
  const [cropAspectRatio, setCropAspectRatio] = useState(9/16); 
  const [completedCrop, setCompletedCrop] = useState(null);
  const imgRef = useRef(null);
  const [cropTarget, setCropTarget] = useState(''); 

  const processImageBlob = (blob, target) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => setUpImg(reader.result));
    reader.readAsDataURL(blob);
    setCropTarget(target);
    
    if (target === 'avatar') {
      setCropAspectRatio(1 / 1); 
      setCrop({ unit: '%', width: 50, aspect: 1/1 });
    } else if (target === 'background') {
      setCropAspectRatio(9 / 16); 
      setCrop({ unit: '%', width: 50, aspect: 9/16 });
    } else {
      setCropAspectRatio(21 / 9); 
      setCrop({ unit: '%', width: 80, aspect: 21/9 });
    }
    setIsCropModalOpen(true);
  };

  const onSelectFile = (e, target) => {
    if (e.target.files && e.target.files.length > 0) {
      processImageBlob(e.target.files[0], target);
      e.target.value = ''; 
    }
  };

  const handlePasteButtonClick = async (target) => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        const imageTypes = clipboardItem.types.filter(type => type.startsWith('image/'));
        if (imageTypes.length > 0) {
          const blob = await clipboardItem.getType(imageTypes[0]);
          processImageBlob(blob, target);
          return;
        }
      }
      alert('Không tìm thấy ảnh nào trong bộ nhớ tạm (Clipboard)!');
    } catch (err) {
      alert('Trình duyệt chặn quyền truy cập Clipboard. Bấm Ctrl+V để dán nhé!');
    }
  };

  useEffect(() => {
    const handleGlobalPaste = (e) => {
      if (!isSettingsOpen || isCropModalOpen || activeTab === 'friends') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault(); 
          const blob = items[i].getAsFile();
          const currentTarget = activeTab === 'profile' ? 'background' : 'event';
          processImageBlob(blob, currentTarget);
          break;
        }
      }
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [isSettingsOpen, isCropModalOpen, activeTab]);

  const handleCropComplete = async () => {
    if (!completedCrop || !imgRef.current) return;
    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(
      image,
      completedCrop.x * scaleX, completedCrop.y * scaleY,
      completedCrop.width * scaleX, completedCrop.height * scaleY,
      0, 0, completedCrop.width, completedCrop.height
    );

    const croppedImageUrl = canvas.toDataURL('image/jpeg', 0.8);

    if (cropTarget === 'event') {
      setEventFormData({ ...eventFormData, croppedImage: croppedImageUrl });
    } else if (cropTarget === 'avatar') {
      setProfileFormData({ ...profileFormData, avatar: croppedImageUrl });
    } else if (cropTarget === 'background') {
      setProfileFormData({ ...profileFormData, background: croppedImageUrl });
    }
    
    setIsCropModalOpen(false);
    setUpImg(null);
  };

  // ==========================================
  // 5. CÁC HÀM XỬ LÝ NGƯỜI DÙNG & BẠN BÈ
  // ==========================================
  
  const handleSaveProfile = () => {
    const updatedProfile = {
      ...profile, 
      displayName: profileFormData.displayName,
      avatar: profileFormData.avatar,
      background: profileFormData.background, 
      title: profileFormData.title.toUpperCase(),
      subtitle: profileFormData.subtitle.toUpperCase()
    };
    setProfile(updatedProfile); 
    saveToCloud(updatedProfile, events); 
    alert("Đã đồng bộ thiết lập lên Cloud!");
  };

  const handleAddEvent = (e) => {
    e.preventDefault();
    const startObj = new Date(eventFormData.startDate);
    const endObj = new Date(eventFormData.endDate);
    endObj.setHours(23, 59, 59, 999);

    const dateStr = `${startObj.getDate().toString().padStart(2, '0')}/${(startObj.getMonth() + 1).toString().padStart(2, '0')} - ${endObj.getDate().toString().padStart(2, '0')}/${(endObj.getMonth() + 1).toString().padStart(2, '0')}`;

    let assignedRow = 0;
    let isRowOccupied = true;
    while (isRowOccupied) {
      const overlappingEvent = events.find(ev => {
        if (ev.trackRow !== assignedRow) return false;
        return (startObj <= ev.end) && (endObj >= ev.start);
      });
      if (overlappingEvent) { assignedRow++; } 
      else { isRowOccupied = false; }
    }

    const newEvent = {
      id: "ev_" + Date.now(),
      title: eventFormData.title,
      dateStr: dateStr,
      start: startObj, 
      end: endObj,
      image: eventFormData.croppedImage || "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=200&q=80",
      rewards: eventFormData.rewards,
      trackRow: assignedRow,
      isShared: false 
    };

    const updatedEvents = [...events, newEvent];
    setEvents(updatedEvents); 
    saveToCloud(profile, updatedEvents); 
    setEventFormData({ title: '', startDate: '', endDate: '', rewards: '', croppedImage: null }); 
  };

  const handleDeleteEvent = (idToRemove) => { 
    const updatedEvents = events.filter(e => e.id !== idToRemove);
    setEvents(updatedEvents); 
    saveToCloud(profile, updatedEvents); 
  };

  const handleToggleShareEvent = (eventId) => {
    const updatedEvents = events.map(ev => {
      if (ev.id === eventId) return { ...ev, isShared: !ev.isShared };
      return ev;
    });
    setEvents(updatedEvents);
    saveToCloud(profile, updatedEvents);
    setSelectedEventDetail(updatedEvents.find(e => e.id === eventId)); 
  };

  const handleAddFriend = async (e) => {
    e.preventDefault();
    if (searchFriendId === profile.shortId) {
      alert("Bạn không thể tự kết bạn với chính mình!");
      return;
    }
    if (friendsList.includes(searchFriendId)) {
       alert("Người này đã có trong danh sách bạn bè!");
       return;
    }

    const usersRef = collection(db, "users");
    const q = query(usersRef, where("profile.shortId", "==", searchFriendId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      alert("Không tìm thấy người dùng với ID này!");
    } else {
      let foundUid = "";
      querySnapshot.forEach((doc) => { foundUid = doc.id; });
      
      const newFriendsList = [...friendsList, foundUid];
      setFriendsList(newFriendsList);
      saveToCloud(profile, events, newFriendsList);
      setSearchFriendId('');
      alert("Kết bạn thành công!");
    }
  };

  const handleViewFriendFeed = async (friendUid) => {
    const fDoc = await getDoc(doc(db, "users", friendUid));
    if (fDoc.exists()) {
      const fData = fDoc.data();
      let fProfile = fData.profile;
      if(!fProfile.background) fProfile.background = fProfile.avatar;

      const sharedEvents = (fData.events || [])
        .filter(ev => ev.isShared) 
        .map(ev => ({
           ...ev,
           start: ev.start.toDate ? ev.start.toDate() : new Date(ev.start),
           end: ev.end.toDate ? ev.end.toDate() : new Date(ev.end)
        }))
        .sort((a, b) => a.start - b.start);
      
      setViewingFriendFeed({
        profile: fProfile,
        events: sharedEvents
      });
      setIsSettingsOpen(false); 
    }
  };

  const handleLogout = () => {
    signOut(auth).catch((error) => console.error("Lỗi đăng xuất:", error));
  };

  // ==========================================
  // 6. RENDER GIAO DIỆN CHÍNH
  // ==========================================
  return (
    <div className="min-h-screen flex items-center justify-center p-2 md:p-4 font-sans select-none bg-[#f1f5f9] bg-cover bg-center">
      
      {/* KHUNG APP CHÍNH */}
      <div className="w-full max-w-[1400px] h-[95vh] md:h-[780px] bg-white rounded-xl flex flex-col relative z-10 overflow-hidden shadow-[0_10px_40px_rgba(41,92,232,0.15)] border-[3px] md:border-[6px] border-[#e2e8f0]">
        
        {/* HEADER */}
        <div className="bg-[#4f46e5] bg-[url('https://www.transparenttextures.com/patterns/az-subtle.png')] h-14 md:h-16 flex justify-between items-end relative overflow-hidden border-b-[3px] md:border-b-[4px] border-[#38bdf8]">
          
          <div className="bg-[#06b6d4] h-[120%] min-w-[200px] md:min-w-[300px] absolute -top-1 -left-2 flex items-center px-4 md:px-6 pl-6 md:pl-8 z-10 shadow-lg" style={{ clipPath: 'polygon(0 0, 90% 0, 100% 100%, 0% 100%)' }}>
            <div className="flex items-center gap-2 md:gap-3 mt-1">
              <div className="w-6 h-6 md:w-8 md:h-8 bg-white/20 rounded-full overflow-hidden flex items-center justify-center border-2 border-white">
                <img src={profile.avatar} alt="user" className="w-full h-full object-cover" />
              </div>
              <div className="truncate pr-4">
                <h1 className="text-white font-black text-[13px] md:text-[16px] leading-tight drop-shadow-md truncate max-w-[120px] md:max-w-[180px]">{profile.displayName}</h1>
                <span className="text-white/90 text-[9px] md:text-[10px] font-bold bg-white/20 px-1.5 rounded-sm">ID: {profile.shortId}</span>
              </div>
            </div>
          </div>

          <div className="ml-auto relative z-10 mb-1.5 md:mb-2 mr-2 md:mr-4 flex gap-1.5 md:gap-2">
             <button onClick={() => setIsDeadlineModalOpen(true)} className="bg-yellow-400 text-yellow-900 font-black px-3 md:px-5 py-1 md:py-1.5 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.6)] hover:scale-105 transition-transform text-[10px] md:text-sm tracking-wide border-2 border-white hover:border-yellow-200 whitespace-nowrap">⏰ Deadline</button>
             <button onClick={() => { setProfileFormData(profile); setIsSettingsOpen(true); }} className="bg-white text-[#4f46e5] font-black px-3 md:px-5 py-1 md:py-1.5 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)] hover:scale-105 transition-transform text-[10px] md:text-sm tracking-wide border-2 border-transparent hover:border-[#38bdf8] whitespace-nowrap">Cài Đặt</button>
             <button onClick={handleLogout} className="bg-red-500 text-white font-black px-3 md:px-4 py-1 md:py-1.5 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)] hover:bg-red-400 hover:scale-105 transition-transform text-[10px] md:text-sm tracking-wide border-2 border-transparent whitespace-nowrap">Thoát</button>
          </div>
        </div>

        {/* NỘI DUNG CHÍNH */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden bg-[#e0e7ff] p-2 gap-2 relative">
          
          <div className={`w-full h-full md:w-[320px] md:h-full shrink-0 bg-white rounded-lg border-2 border-[#bfdbfe] relative flex-col justify-between z-20 shadow-sm p-2 md:p-3 ${showMobileMap ? 'hidden md:flex' : 'flex'}`}>
            <div className="w-full h-full relative rounded-md border-[3px] border-[#60a5fa] overflow-hidden shadow-[0_0_15px_rgba(96,165,250,0.3)] bg-slate-900 flex flex-col justify-end">
              <img src={profile.background} alt="Background" className="absolute inset-0 w-full h-full object-cover object-center opacity-80 md:opacity-100" />
              
              <div className="relative z-10 p-3 bg-gradient-to-t from-black/80 to-transparent text-white">
                <h2 className="font-black text-lg md:text-xl drop-shadow-md leading-none">{profile.title}</h2>
                <p className="font-bold text-xs md:text-sm text-cyan-300 drop-shadow-sm">{profile.subtitle}</p>
              </div>

              <div className="absolute inset-0 flex md:hidden flex-col items-center justify-center p-4 bg-black/40">
                 <button onClick={() => setShowMobileMap(true)} className="bg-cyan-500 hover:bg-cyan-400 text-[#0f172a] font-black px-8 py-4 rounded-full border-2 border-white shadow-[0_0_30px_rgba(6,182,212,0.8)] animate-pulse text-lg tracking-wider">XEM LỊCH TRÌNH</button>
              </div>
            </div>
          </div>

          <div className={`flex-1 flex-col overflow-x-auto relative custom-scrollbar bg-white rounded-lg border-2 border-[#bfdbfe] shadow-inner ${showMobileMap ? 'flex' : 'hidden md:flex'}`} ref={scrollContainerRef}>
            
            <div className="md:hidden sticky left-0 top-0 z-50 w-full bg-white border-b-2 border-slate-200 p-2 shadow-sm flex justify-center">
               <button onClick={() => setShowMobileMap(false)} className="bg-slate-700 text-white px-6 py-2 rounded-full font-bold text-xs shadow-md hover:bg-slate-600 uppercase tracking-widest flex items-center gap-2"><span>⬅</span> QUAY LẠI HÌNH NỀN</button>
            </div>

            <div className="flex flex-col h-full relative" style={{ minWidth: `${totalDays * 100}px` }}>
              
              <div className="sticky top-0 z-40 bg-white shadow-sm border-b-2 border-[#e2e8f0]">
                <div className="bg-[#1e40af] h-4 md:h-5 flex text-white/70 font-bold text-[8px] md:text-[9px] tracking-widest uppercase">
                  {yearsData.map((y, idx) => (
                    <div key={idx} className="flex items-center justify-center border-r border-[#3b82f6]/30" style={{ width: `${(y.count / totalDays) * 100}%` }}>NĂM {y.year}</div>
                  ))}
                </div>
                
                <div className="bg-[#2563eb] h-6 md:h-8 flex text-white font-bold text-[11px] md:text-[13px]">
                  {monthsData.map((m, idx) => (
                    <div key={idx} className="flex items-center justify-center border-r border-white/20" style={{ width: `${(m.count / totalDays) * 100}%` }}>
                       <span className="opacity-70 mx-1 md:mx-2 text-[8px] md:text-xs">◆</span> Tháng {m.month} <span className="opacity-70 mx-1 md:mx-2 text-[8px] md:text-xs">◆</span>
                    </div>
                  ))}
                </div>

                <div className="h-6 md:h-8 flex relative bg-white">
                  {daysArray.map((date, idx) => {
                    if (idx % 2 === 0 || idx === totalDays) {
                      return (
                        <div key={idx} className="absolute top-0 flex flex-col items-center justify-start pt-0.5 md:pt-1" style={{ left: `${(idx / totalDays) * 100}%`, transform: 'translateX(-50%)' }}>
                          <span className="text-[#1e40af] font-black text-[9px] md:text-[11px] leading-none">{date.getDate()}</span>
                          <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[3px] md:border-t-[4px] border-t-[#94a3b8] mt-0.5 md:mt-1"></div>
                        </div>
                      )
                    }
                    return null;
                  })}
                </div>
              </div>

              <div className="flex-1 relative overflow-hidden" style={{ backgroundImage: 'linear-gradient(to right, #f1f5f9 2px, transparent 2px), linear-gradient(to bottom, #f8fafc 1px, transparent 1px)', backgroundSize: `${(1 / totalDays) * 100}% 80px` }}>
                
                {isNowVisible && (
                  <div className="absolute top-0 bottom-0 w-[2px] bg-[#ef4444] z-30 shadow-[0_0_10px_rgba(239,68,68,0.5)]" style={{ left: `${nowOffsetPercent}%` }}>
                    <div className="absolute top-1 left-2 bg-[#ef4444] text-white text-[9px] md:text-[11px] font-black px-2 md:px-3 py-0.5 md:py-1 rounded shadow-md whitespace-nowrap">{todayLabel}</div>
                  </div>
                )}

                <div className="relative w-full h-full pt-4">
                  {events.map((event) => {
                    const leftPercent = Math.max(0, ((event.start.getTime() - startDate.getTime()) / totalDuration) * 100);
                    const rawWidth = ((event.end.getTime() - event.start.getTime()) / totalDuration) * 100;
                    const widthPercent = Math.min(rawWidth, 100 - leftPercent);
                    const topPosition = event.trackRow * 80;

                    return (
                      <div 
                        key={event.id} 
                        onClick={() => setSelectedEventDetail(event)} 
                        className="absolute h-[64px] bg-white border-2 border-[#cbd5e1] rounded-lg shadow-sm flex items-center pr-3 md:pr-4 z-20 cursor-pointer hover:shadow-md hover:border-[#3b82f6] hover:scale-[1.01] transition-all overflow-visible" 
                        style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, minWidth: 'max-content', top: `${topPosition}px` }}
                      >
                        <div className={`absolute left-[-6px] md:left-[-8px] top-1/2 -translate-y-1/2 w-3 md:w-3.5 h-3 md:h-3.5 bg-white border-[2px] md:border-[3px] ${event.isShared ? 'border-pink-500' : 'border-[#3b82f6]'} rounded-full z-10 shadow-sm`}></div>
                        <div className="w-[80px] md:w-[110px] h-full relative shrink-0 bg-slate-100 mr-2 md:mr-3 rounded-l-md overflow-hidden">
                          <img src={event.image} alt="event" className="w-full h-full object-cover" />
                          {event.isShared && <div className="absolute bottom-0 right-0 bg-pink-500 text-white text-[8px] px-1 font-bold rounded-tl-md">Công khai</div>}
                        </div>
                        <div className="flex-1 min-w-0 py-1 flex flex-col justify-center h-full mr-2">
                          <h4 className="font-bold text-[#1e3a8a] text-[11px] md:text-[13px] whitespace-nowrap">{event.title}</h4>
                          <div className="text-[9px] md:text-[11px] text-slate-500 font-bold flex items-center gap-1 mt-1 bg-slate-100 w-fit px-1.5 md:px-2 py-0.5 rounded-full shrink-0">
                             <span className="text-[#d97706]">🕒</span> {event.dateStr}
                          </div>
                        </div>
                        {event.rewards && (
                          <div className="shrink-0 flex items-center justify-end ml-1 md:ml-2 h-[80%] border-l border-slate-200 pl-2 md:pl-3 hidden sm:flex">
                             <div className="bg-[#f0f9ff] px-1.5 md:px-2 py-1 md:py-1.5 rounded-md border border-[#bae6fd] flex flex-col items-center shadow-inner">
                                <span className="text-[10px] md:text-[14px]">💎</span>
                                <span className="text-[8px] md:text-[10px] font-black text-[#0284c7] mt-0.5 whitespace-nowrap">{event.rewards}</span>
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

      {/* ========================================== */}
      {/* MODAL CÀI ĐẶT (GIAO DIỆN / LỊCH / BẠN BÈ) */}
      {/* ========================================== */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm p-2 md:p-4">
          <div className="w-full max-w-[800px] h-[90vh] md:h-[600px] bg-[#1e293b] border-2 border-[#3b82f6] rounded-xl flex flex-col shadow-[0_0_40px_rgba(59,130,246,0.6)] relative overflow-hidden">
            
            <div className="h-auto md:h-14 border-b border-slate-600 flex flex-col md:flex-row items-start md:items-center justify-between px-4 md:px-6 py-2 md:py-0 bg-[#0f172a] gap-2 md:gap-0">
              <div className="flex gap-4 md:gap-6 w-full md:w-auto overflow-x-auto custom-scrollbar pb-1 md:pb-0">
                <button className={`text-xs md:text-sm font-bold uppercase whitespace-nowrap transition-all ${activeTab === 'profile' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-white'}`} onClick={() => setActiveTab('profile')}>Tài Khoản</button>
                <button className={`text-xs md:text-sm font-bold uppercase whitespace-nowrap transition-all ${activeTab === 'events' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-white'}`} onClick={() => setActiveTab('events')}>Quản Lý Lịch</button>
                <button className={`text-xs md:text-sm font-bold uppercase whitespace-nowrap transition-all ${activeTab === 'friends' ? 'text-pink-400 border-b-2 border-pink-400' : 'text-slate-400 hover:text-white'}`} onClick={() => setActiveTab('friends')}>Tương Tác Bạn Bè</button>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="absolute top-2 right-4 md:relative md:top-auto md:right-auto text-slate-400 hover:text-red-400 font-black text-lg md:text-xl bg-slate-800 rounded-full w-6 h-6 md:w-8 md:h-8 flex items-center justify-center">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
              
              {/* TAB TÀI KHOẢN (GIAO DIỆN & TÊN) */}
              {activeTab === 'profile' && (
                <div className="space-y-4 md:space-y-6">
                  {/* BẢNG PREVIEW - Ép dùng profile.shortId trực tiếp để luôn luôn đúng ID */}
                  <div className="flex gap-4 mb-6 bg-slate-800 p-4 rounded-lg border border-slate-600 items-center relative overflow-hidden">
                    <img src={profileFormData.background} alt="bg" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                    <div className="relative z-10 flex gap-4 items-center">
                      <img src={profileFormData.avatar} alt="avatar" className="w-16 h-16 rounded-full border-2 border-cyan-400 object-cover bg-white" />
                      <div>
                        <h3 className="text-white font-black text-lg">{profileFormData.displayName}</h3>
                        <p className="text-cyan-400 text-xs font-bold font-mono bg-cyan-900/30 px-2 py-0.5 rounded inline-block mt-1">ID: {profile.shortId}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div><label className="text-cyan-400 text-[10px] md:text-xs font-bold block mb-1 md:mb-2 uppercase">Tên hiển thị (Tự đặt):</label><input type="text" className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-2 md:p-3 text-sm focus:outline-none focus:border-cyan-400" value={profileFormData.displayName} onChange={e => setProfileFormData({...profileFormData, displayName: e.target.value})} /></div>
                     
                     {/* CỘT NHẬP ẢNH ĐẠI DIỆN */}
                     <div>
                       <label className="text-cyan-400 text-[10px] md:text-xs font-bold block mb-1 md:mb-2 uppercase">Ảnh Đại Diện (Vuông 1:1):</label>
                       <div className="flex gap-2 items-center">
                         <input type="file" accept="image/*" onChange={(e) => onSelectFile(e, 'avatar')} className="text-xs md:text-sm text-slate-300 w-full file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:font-bold file:bg-[#3b82f6] file:text-white cursor-pointer" />
                         <button type="button" onClick={() => handlePasteButtonClick('avatar')} className="shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded font-bold text-xs shadow-[0_0_10px_rgba(79,70,229,0.5)] border border-indigo-400 transition-colors flex items-center gap-1" title="Dán ảnh đã copy">📋 Dán</button>
                       </div>
                     </div>

                     <div><label className="text-slate-400 text-[10px] md:text-xs font-bold block mb-1 md:mb-2 uppercase">Tiêu đề lớn:</label><input type="text" className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-2 md:p-3 text-sm focus:outline-none focus:border-cyan-400" value={profileFormData.title} onChange={e => setProfileFormData({...profileFormData, title: e.target.value})} /></div>
                     
                     {/* CỘT NHẬP ẢNH NỀN */}
                     <div>
                       <label className="text-cyan-400 text-[10px] md:text-xs font-bold block mb-1 md:mb-2 uppercase">Ảnh Nền (Khung 9:16):</label>
                       <div className="flex gap-2 items-center">
                         <input type="file" accept="image/*" onChange={(e) => onSelectFile(e, 'background')} className="text-xs md:text-sm text-slate-300 w-full file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:font-bold file:bg-[#3b82f6] file:text-white cursor-pointer" />
                         <button type="button" onClick={() => handlePasteButtonClick('background')} className="shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded font-bold text-xs shadow-[0_0_10px_rgba(79,70,229,0.5)] border border-indigo-400 transition-colors flex items-center gap-1" title="Dán ảnh đã copy">📋 Dán</button>
                       </div>
                     </div>

                     <div><label className="text-slate-400 text-[10px] md:text-xs font-bold block mb-1 md:mb-2 uppercase">Tiêu đề phụ:</label><input type="text" className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-2 md:p-3 text-sm focus:outline-none focus:border-cyan-400" value={profileFormData.subtitle} onChange={e => setProfileFormData({...profileFormData, subtitle: e.target.value})} /></div>
                  </div>

                  <div className="pt-2 md:pt-4 border-t border-slate-600 mt-4 md:mt-6">
                    <button onClick={handleSaveProfile} className="bg-cyan-500 hover:bg-cyan-400 text-[#0f172a] font-black px-4 md:px-8 py-2.5 md:py-3 rounded uppercase w-full shadow-[0_0_15px_rgba(6,182,212,0.5)] text-sm md:text-base">Lưu Cấu Hình</button>
                  </div>
                </div>
              )}

              {/* TAB QUẢN LÝ LỊCH VÀ BẠN BÈ GIỮ NGUYÊN BÊN DƯỚI... */}
              {activeTab === 'events' && (
                <div className="flex flex-col h-full">
                  <div className="mb-4 md:mb-6 border-b border-slate-600 pb-4 md:pb-6">
                    <h3 className="text-cyan-400 font-bold mb-2 md:mb-3 uppercase text-[11px] md:text-sm border-l-4 border-cyan-400 pl-2">Lịch Đang Có</h3>
                    <div className="space-y-2 max-h-[120px] md:max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                      {events.length === 0 && <p className="text-slate-400 text-xs md:text-sm italic">Hệ thống đang trống.</p>}
                      {events.map(ev => (
                        <div key={ev.id} className="flex justify-between items-center bg-[#0f172a] border border-slate-600 rounded p-2 md:p-3">
                          <div className="flex items-center gap-2 overflow-hidden">
                             {ev.isShared && <span className="text-[10px] bg-pink-500/20 text-pink-400 px-1.5 py-0.5 rounded border border-pink-500/50 shrink-0">Công khai</span>}
                             <span className="text-white font-bold text-xs md:text-sm truncate">{ev.title}</span>
                          </div>
                          <button onClick={() => handleDeleteEvent(ev.id)} className="text-red-400 hover:text-white hover:bg-red-500 px-2 md:px-3 py-1 rounded font-bold text-[10px] md:text-xs uppercase whitespace-nowrap shrink-0">Xóa</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <form onSubmit={handleAddEvent}>
                    <h3 className="text-green-400 font-bold mb-3 md:mb-4 uppercase text-[11px] md:text-sm border-l-4 border-green-400 pl-2">Thêm Lịch Mới</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-3 md:mb-4">
                      <div className="col-span-1 md:col-span-2"><input required type="text" placeholder="Tên sự kiện / Môn học..." className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-2 md:p-3 text-xs md:text-sm focus:border-green-400 focus:outline-none" value={eventFormData.title} onChange={e => setEventFormData({...eventFormData, title: e.target.value})} /></div>
                      <div><label className="text-slate-400 text-[9px] md:text-[10px] font-bold block mb-1">TỪ NGÀY:</label><input required type="date" className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-1.5 md:p-2 text-xs md:text-sm style-date" value={eventFormData.startDate} onChange={e => setEventFormData({...eventFormData, startDate: e.target.value})} /></div>
                      <div><label className="text-slate-400 text-[9px] md:text-[10px] font-bold block mb-1">ĐẾN NGÀY:</label><input required type="date" className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-1.5 md:p-2 text-xs md:text-sm style-date" value={eventFormData.endDate} onChange={e => setEventFormData({...eventFormData, endDate: e.target.value})} /></div>
                      <div className="col-span-1 md:col-span-2"><input type="text" placeholder="Mục tiêu (nếu có)" className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-2 md:p-3 text-xs md:text-sm" value={eventFormData.rewards} onChange={e => setEventFormData({...eventFormData, rewards: e.target.value})} /></div>
                    </div>
                    <div className="mb-4 md:mb-6">
                      <label className="text-green-400 text-[9px] md:text-[10px] font-bold block mb-1 md:mb-2 uppercase">Ảnh Thumbnail (Khung 21:9):</label>
                      <div className="flex gap-2 items-center">
                        <input type="file" accept="image/*" onChange={(e) => onSelectFile(e, 'event')} className="text-xs md:text-sm text-slate-300 w-full file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-[#3b82f6] file:text-white cursor-pointer" />
                        <button type="button" onClick={() => handlePasteButtonClick('event')} className="shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded font-bold text-xs shadow-[0_0_10px_rgba(79,70,229,0.5)] border border-indigo-400 transition-colors flex items-center gap-1" title="Dán ảnh đã copy">📋 Dán</button>
                      </div>
                      {eventFormData.croppedImage && (
                        <div className="mt-3 relative inline-block">
                           <img src={eventFormData.croppedImage} alt="preview" className="h-12 rounded border-2 border-green-400 shadow-md" />
                           <button type="button" onClick={() => setEventFormData({...eventFormData, croppedImage: null})} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-400 text-white w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold shadow-sm transition-transform hover:scale-110">✕</button>
                        </div>
                      )}
                    </div>
                    <button type="submit" className="w-full bg-green-500 hover:bg-green-400 text-[#0f172a] font-black px-4 md:px-8 py-2.5 md:py-3 rounded uppercase transition-colors shadow-[0_0_15px_rgba(34,197,94,0.4)] text-sm md:text-base">Tạo Mới</button>
                  </form>
                </div>
              )}

              {activeTab === 'friends' && (
                <div className="flex flex-col h-full space-y-6">
                  <form onSubmit={handleAddFriend} className="bg-slate-800 p-4 rounded-lg border border-slate-600 flex gap-3 items-end">
                     <div className="flex-1">
                       <label className="text-pink-400 text-[10px] md:text-xs font-bold block mb-1 uppercase">Nhập ID Bạn Bè (8 số):</label>
                       <input required type="text" maxLength="8" pattern="\d{8}" placeholder="VD: 12345678" className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-2 md:p-3 text-sm focus:outline-none focus:border-pink-400 font-mono tracking-widest" value={searchFriendId} onChange={e => setSearchFriendId(e.target.value)} />
                     </div>
                     <button type="submit" className="bg-pink-500 hover:bg-pink-400 text-white font-black px-6 py-2.5 md:py-3 rounded shadow-[0_0_15px_rgba(236,72,153,0.4)] transition-colors h-[42px] md:h-[46px]">THÊM</button>
                  </form>

                  <div className="flex-1">
                     <h3 className="text-white font-bold mb-3 uppercase text-[11px] md:text-sm border-l-4 border-pink-400 pl-2">Danh Sách Bạn Bè ({friendsData.length})</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {friendsData.length === 0 && <p className="text-slate-400 text-sm italic col-span-2">Chưa có bạn bè nào. Gửi ID của bạn cho bạn bè để kết nối nhé!</p>}
                        {friendsData.map(friend => (
                           <div key={friend.uid} className="bg-[#0f172a] border border-slate-600 rounded-lg p-3 flex items-center gap-3">
                              <img src={friend.avatar} alt="f-avatar" className="w-12 h-12 rounded-full border border-slate-500 object-cover bg-white" />
                              <div className="flex-1 min-w-0">
                                 <h4 className="text-white font-bold text-sm truncate">{friend.displayName}</h4>
                                 <span className="text-slate-400 text-[10px] font-mono">ID: {friend.shortId}</span>
                              </div>
                              <button onClick={() => handleViewFriendFeed(friend.uid)} className="bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500 hover:text-[#0f172a] px-3 py-1.5 rounded font-bold text-[10px] md:text-xs border border-cyan-500/50 transition-colors uppercase">
                                 Xem Lịch
                              </button>
                           </div>
                        ))}
                     </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL CẮT ẢNH TIÊU CHUẨN */}
      {/* ========================================== */}
      {isCropModalOpen && upImg && (
        <div className="fixed inset-0 bg-[#0f172a]/95 flex flex-col items-center justify-center z-[100] p-2 md:p-4 backdrop-blur-md">
          <div className="text-center mb-4 md:mb-6 px-4">
            <h2 className="text-white font-black text-lg md:text-2xl uppercase">CẮT ẢNH TIÊU CHUẨN</h2>
            <p className="text-yellow-400 font-bold text-[10px] md:text-sm mt-2 bg-yellow-400/10 px-2 md:px-4 py-1 rounded-full border border-yellow-400/30 inline-block">Khung cắt đã bị khóa tỉ lệ để tránh vỡ giao diện.</p>
          </div>
          <div className="relative border-2 md:border-4 border-cyan-500 rounded-lg bg-black overflow-hidden shadow-[0_0_30px_rgba(6,182,212,0.6)] p-1 md:p-2 w-full max-w-[95%] md:max-w-auto flex justify-center">
            <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)} aspect={cropAspectRatio}>
              <img ref={imgRef} src={upImg} alt="Cắt ảnh" className="max-h-[40vh] md:max-h-[50vh] max-w-full object-contain opacity-80" />
            </ReactCrop>
          </div>
          <div className="flex gap-3 md:gap-6 mt-6 md:mt-8 w-full max-w-[400px] md:max-w-[500px] px-4">
            <button onClick={() => { setIsCropModalOpen(false); setUpImg(null); }} className="flex-1 py-2 md:py-3 bg-slate-700 text-white font-bold rounded hover:bg-slate-600 transition-colors text-xs md:text-base">HỦY</button>
            <button onClick={handleCropComplete} className="flex-1 py-2 md:py-3 bg-cyan-500 text-[#0f172a] font-black rounded hover:bg-cyan-400 transition-colors shadow-[0_0_15px_rgba(6,182,212,0.5)] text-xs md:text-base">XÁC NHẬN</button>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL XEM CHI TIẾT SỰ KIỆN CỦA BẢN THÂN */}
      {/* ========================================== */}
      {selectedEventDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[120] p-4 backdrop-blur-md" onClick={() => setSelectedEventDetail(null)}>
          <div className="bg-white border-[4px] border-pink-300 rounded-[2rem] w-full max-w-[400px] overflow-hidden shadow-[0_0_40px_rgba(236,72,153,0.5)] animate-[fadeIn_0.2s_ease-out] relative flex flex-col" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedEventDetail(null)} className="absolute top-4 right-4 w-8 h-8 bg-white hover:bg-pink-500 text-pink-500 hover:text-white border-2 border-pink-200 hover:border-pink-500 rounded-full flex items-center justify-center font-black shadow-md transition-all text-sm z-10">✕</button>
            
            <div className="w-full h-40 md:h-52 bg-pink-50 relative p-2">
              <div className="w-full h-full rounded-2xl overflow-hidden border-2 border-pink-200 shadow-inner relative">
                <img src={selectedEventDetail.image} alt="Event Cover" className="w-full h-full object-cover" />
                {selectedEventDetail.isShared && <div className="absolute top-2 left-2 bg-pink-500 text-white text-[10px] font-black px-2 py-1 rounded shadow-md uppercase tracking-wider">Đang Công Khai</div>}
              </div>
            </div>
            
            <div className="p-6 md:p-8 bg-gradient-to-b from-white to-pink-50/50 flex-1 flex flex-col">
              <h3 className="text-[#4c1d95] font-black text-xl md:text-2xl mb-5 leading-tight break-words text-center drop-shadow-sm">✨ {selectedEventDetail.title} ✨</h3>
              
              <div className="space-y-4 mb-6 flex-1">
                <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-xl border border-blue-100 shadow-sm">
                  <span className="text-2xl drop-shadow-sm">🌸</span>
                  <div>
                    <p className="text-blue-400 text-[10px] font-black uppercase mb-0.5 tracking-wider">Thời gian</p>
                    <p className="text-blue-800 font-bold text-sm">{selectedEventDetail.dateStr}</p>
                  </div>
                </div>

                {selectedEventDetail.rewards && (
                  <div className="flex items-center gap-3 bg-amber-50 p-3 rounded-xl border border-amber-100 shadow-sm">
                    <span className="text-2xl drop-shadow-sm">⭐</span>
                    <div>
                      <p className="text-amber-400 text-[10px] font-black uppercase mb-0.5 tracking-wider">Ghi chú / Thưởng</p>
                      <p className="text-amber-700 font-bold text-sm break-words">{selectedEventDetail.rewards}</p>
                    </div>
                  </div>
                )}
              </div>

              <button 
                onClick={() => handleToggleShareEvent(selectedEventDetail.id)} 
                className={`w-full py-3 rounded-xl font-black uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 border-2 ${selectedEventDetail.isShared ? 'bg-white text-pink-500 border-pink-200 hover:border-pink-500' : 'bg-pink-500 text-white border-pink-500 hover:bg-pink-400'}`}
              >
                <span className="text-lg">📢</span> 
                {selectedEventDetail.isShared ? 'Bỏ Chia Sẻ Sự Kiện Này' : 'Chia Sẻ Lên Dòng Bạn Bè'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL SỰ KIỆN SẮP HẾT HẠN (DEADLINE <= 3 NGÀY) */}
      {/* ========================================== */}
      {isDeadlineModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4 backdrop-blur-sm" onClick={() => setIsDeadlineModalOpen(false)}>
          <div className="bg-white border-4 border-red-400 rounded-2xl w-full max-w-[400px] max-h-[80vh] flex flex-col shadow-[0_0_30px_rgba(248,113,113,0.5)] animate-[fadeIn_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="bg-red-500 p-3 text-center rounded-t-lg relative">
              <h2 className="text-white font-black text-lg drop-shadow-md">🚨 BÁO ĐỘNG DEADLINE</h2>
              <button onClick={() => setIsDeadlineModalOpen(false)} className="absolute top-1/2 -translate-y-1/2 right-3 w-7 h-7 bg-white hover:bg-slate-200 text-red-600 rounded-full font-black flex items-center justify-center transition-colors shadow-sm">✕</button>
            </div>
            <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3">
              {(() => {
                const urgentEvents = events.filter(ev => {
                  const daysLeft = Math.ceil((ev.end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  return daysLeft >= 0 && daysLeft <= 3;
                });

                if (urgentEvents.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <p className="text-4xl mb-2">☕</p>
                      <p className="text-slate-500 font-bold text-sm">Chưa có deadline nào trong 3 ngày tới!<br/>Cứ thong thả chill nhé!</p>
                    </div>
                  );
                }

                return urgentEvents.sort((a, b) => a.end - b.end).map(ev => {
                    const daysLeft = Math.ceil((ev.end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <div key={ev.id} className="border-2 border-red-200 bg-red-50 rounded-xl p-3 flex gap-3 hover:border-red-500 hover:bg-red-100 cursor-pointer transition-colors" onClick={() => { setIsDeadlineModalOpen(false); setSelectedEventDetail(ev); }}>
                         <img src={ev.image} className="w-12 h-12 rounded-lg object-cover shadow-sm" alt="thumb"/>
                         <div className="flex-1">
                           <h4 className="font-bold text-slate-800 text-sm leading-tight mb-1">{ev.title}</h4>
                           <span className="text-[10px] font-black bg-red-500 text-white px-2 py-0.5 rounded shadow-sm animate-pulse">
                             {daysLeft === 0 ? 'HẾT HẠN HÔM NAY 🔥' : `CÒN ĐÚNG ${daysLeft} NGÀY ⏳`}
                           </span>
                         </div>
                      </div>
                    )
                  });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL XEM DÒNG THỜI GIAN CỦA BẠN BÈ */}
      {/* ========================================== */}
      {viewingFriendFeed && (
        <div className="fixed inset-0 bg-[#0f172a]/95 flex items-center justify-center z-[130] p-4 backdrop-blur-md" onClick={() => setViewingFriendFeed(null)}>
          <div className="w-full max-w-[600px] h-[90vh] bg-white rounded-3xl flex flex-col shadow-[0_0_50px_rgba(236,72,153,0.3)] border-[4px] border-pink-300 overflow-hidden relative animate-[fadeIn_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
            
            <div className="relative h-48 bg-pink-100 flex-shrink-0">
               <img src={viewingFriendFeed.profile.background} alt="cover" className="absolute inset-0 w-full h-full object-cover opacity-50 blur-sm" />
               <div className="absolute inset-0 bg-gradient-to-t from-pink-500/90 to-transparent"></div>
               <button onClick={() => setViewingFriendFeed(null)} className="absolute top-4 right-4 w-10 h-10 bg-white/30 hover:bg-white text-white hover:text-pink-600 rounded-full flex items-center justify-center font-black shadow-lg backdrop-blur-sm transition-all z-20">✕</button>
               
               <div className="absolute -bottom-10 left-6 flex items-end gap-4">
                  <img src={viewingFriendFeed.profile.avatar} alt="avatar" className="w-24 h-24 rounded-2xl border-4 border-white object-cover shadow-xl bg-white" />
                  <div className="pb-12 text-white drop-shadow-md">
                     <h2 className="font-black text-2xl">{viewingFriendFeed.profile.displayName}</h2>
                     <p className="text-pink-100 font-bold text-sm">ID: {viewingFriendFeed.profile.shortId}</p>
                  </div>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50 pt-16 px-4 pb-6 custom-scrollbar space-y-4">
               {viewingFriendFeed.events.length === 0 ? (
                 <div className="text-center py-10">
                   <span className="text-5xl drop-shadow-sm">💤</span>
                   <p className="text-slate-500 font-bold mt-4">Người này chưa chia sẻ sự kiện nào cả!</p>
                 </div>
               ) : (
                 <div className="relative border-l-4 border-pink-200 ml-4 space-y-6">
                    {viewingFriendFeed.events.map(ev => (
                      <div key={ev.id} className="relative pl-6">
                         <div className="absolute -left-[14px] top-4 w-6 h-6 bg-pink-500 rounded-full border-4 border-white shadow-sm flex items-center justify-center"></div>
                         
                         <div className="bg-white border-2 border-pink-100 rounded-2xl p-3 shadow-sm hover:shadow-md transition-shadow">
                            <div className="text-xs font-bold text-pink-500 bg-pink-50 inline-block px-2 py-1 rounded-md mb-2">{ev.dateStr}</div>
                            <h4 className="font-black text-slate-800 text-base mb-3 leading-tight">{ev.title}</h4>
                            <img src={ev.image} alt="ev-img" className="w-full h-32 md:h-40 object-cover rounded-xl border border-slate-200" />
                            {ev.rewards && (
                              <p className="mt-3 text-sm text-amber-600 font-bold bg-amber-50 p-2 rounded-lg border border-amber-100"><span className="mr-1">⭐</span> {ev.rewards}</p>
                            )}
                         </div>
                      </div>
                    ))}
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* STYLES CỤC BỘ DÀNH CHO THANH CUỘN VÀ INPUT DATE */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; background-color: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }
        .style-date::-webkit-calendar-picker-indicator { filter: invert(1); cursor: pointer; }
      `}} />
    </div>
  );
};

export default GameRoadmap;