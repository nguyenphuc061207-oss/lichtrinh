import React, { useState, useRef, useEffect } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { db, auth } from './firebase'; 
import { doc, setDoc, onSnapshot } from "firebase/firestore";
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
  
  // Quản lý trạng thái hiển thị giao diện trên Mobile
  const [showMobileMap, setShowMobileMap] = useState(false);
  
  // Quản lý bảng chi tiết sự kiện và bảng Deadline
  const [selectedEventDetail, setSelectedEventDetail] = useState(null); 
  const [isDeadlineModalOpen, setIsDeadlineModalOpen] = useState(false);

  // Khởi tạo state với dữ liệu mặc định ban đầu
  const [profile, setProfile] = useState({
    avatar: "https://images.unsplash.com/photo-1541562232579-512a21360020?q=80&w=800",
    title: "TỔNG QUAN PHIÊN BẢN", 
    subtitle: "v7.3"
  });
  
  const [events, setEvents] = useState([]);

  // Lắng nghe thay đổi dữ liệu từ Firestore dựa trên ID của người dùng đang đăng nhập
  useEffect(() => {
    if (!user) return;
    
    // onSnapshot cung cấp khả năng cập nhật thời gian thực từ Firestore
    const unsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.profile) setProfile(data.profile);
        if (data.events) {
          const cloudEvents = data.events.map(ev => ({
            ...ev,
            start: ev.start.toDate ? ev.start.toDate() : new Date(ev.start),
            end: ev.end.toDate ? ev.end.toDate() : new Date(ev.end)
          }));
          setEvents(cloudEvents);
        }
      } else {
        saveToCloud(profile, events);
      }
    });
    
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const saveToCloud = async (newProfile, newEvents) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), {
        profile: newProfile,
        events: newEvents
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
  // 4. CẮT ẢNH VÀ XỬ LÝ HÌNH ẢNH
  // ==========================================
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [upImg, setUpImg] = useState(); 
  const [crop, setCrop] = useState({ unit: '%', width: 50, x: 25, y: 25 });
  const [cropAspectRatio, setCropAspectRatio] = useState(9/16); 
  const [completedCrop, setCompletedCrop] = useState(null);
  const imgRef = useRef(null);
  const [cropTarget, setCropTarget] = useState(''); 

  const onSelectFile = (e, target) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => setUpImg(reader.result));
      reader.readAsDataURL(e.target.files[0]);
      setCropTarget(target);
      
      if (target === 'profile') {
        setCropAspectRatio(9 / 16); 
        setCrop({ unit: '%', width: 50, aspect: 9/16 });
      } else {
        setCropAspectRatio(21 / 9); 
        setCrop({ unit: '%', width: 80, aspect: 21/9 });
      }
      setIsCropModalOpen(true);
      e.target.value = ''; 
    }
  };

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
    } else if (cropTarget === 'profile') {
      setProfileFormData({ ...profileFormData, avatar: croppedImageUrl });
    }
    setIsCropModalOpen(false);
    setUpImg(null);
  };

  // ==========================================
  // 5. CÁC HÀM XỬ LÝ NGƯỜI DÙNG TƯƠNG TÁC
  // ==========================================
  
  const handleSaveProfile = () => {
    const updatedProfile = {
      avatar: profileFormData.avatar,
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
      trackRow: assignedRow 
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
          
          <div className="bg-[#06b6d4] h-[120%] min-w-[200px] md:min-w-[280px] absolute -top-1 -left-2 flex items-center px-4 md:px-6 pl-6 md:pl-8 z-10 shadow-lg" style={{ clipPath: 'polygon(0 0, 90% 0, 100% 100%, 0% 100%)' }}>
            <div className="flex items-center gap-2 md:gap-3 mt-1">
              <div className="w-6 h-6 md:w-8 md:h-8 bg-white/20 rounded flex items-center justify-center border border-white/50">
                <div className="w-3 md:w-5 h-1.5 md:h-2 bg-white rounded-sm relative"><div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 md:w-2 h-1 bg-white"></div></div>
              </div>
              <div className="truncate pr-4">
                <h1 className="text-white font-black text-[13px] md:text-[18px] leading-tight drop-shadow-md truncate max-w-[120px] md:max-w-full">{profile.title}</h1>
                <span className="text-white/90 text-[9px] md:text-[11px] font-bold">{profile.subtitle}</span>
              </div>
            </div>
          </div>

          {/* CÁC NÚT BẤM TRÊN HEADER */}
          <div className="ml-auto relative z-10 mb-1.5 md:mb-2 mr-2 md:mr-4 flex gap-1.5 md:gap-2">
             <button 
                onClick={() => setIsDeadlineModalOpen(true)}
                className="bg-yellow-400 text-yellow-900 font-black px-3 md:px-5 py-1 md:py-1.5 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.6)] hover:scale-105 transition-transform text-[10px] md:text-sm tracking-wide border-2 border-white hover:border-yellow-200 whitespace-nowrap"
              >
                ⏰ Deadline
              </button>
             <button 
                onClick={() => { setProfileFormData(profile); setIsSettingsOpen(true); }}
                className="bg-white text-[#4f46e5] font-black px-3 md:px-5 py-1 md:py-1.5 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)] hover:scale-105 transition-transform text-[10px] md:text-sm tracking-wide border-2 border-transparent hover:border-[#38bdf8] whitespace-nowrap"
              >
                Cài Đặt
              </button>
              <button 
                onClick={handleLogout}
                className="bg-red-500 text-white font-black px-3 md:px-4 py-1 md:py-1.5 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)] hover:bg-red-400 hover:scale-105 transition-transform text-[10px] md:text-sm tracking-wide border-2 border-transparent whitespace-nowrap"
              >
                Thoát
              </button>
          </div>
        </div>

        {/* NỘI DUNG CHÍNH (CỘT AVATAR VÀ DÒNG THỜI GIAN) */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden bg-[#e0e7ff] p-2 gap-2 relative">
          
          {/* CỘT TRÁI (AVATAR) - LÀM MÀN HÌNH CHỜ TRÊN MOBILE */}
          <div className={`w-full h-full md:w-[320px] md:h-full shrink-0 bg-white rounded-lg border-2 border-[#bfdbfe] relative flex-col justify-between z-20 shadow-sm p-2 md:p-3 ${showMobileMap ? 'hidden md:flex' : 'flex'}`}>
            <div className="w-full h-full relative rounded-md border-[3px] border-[#60a5fa] overflow-hidden shadow-[0_0_15px_rgba(96,165,250,0.3)] bg-slate-900">
              <img src={profile.avatar} alt="Avatar" className="w-full h-full object-cover object-center opacity-80 md:opacity-100" />
              
              {/* NÚT BẤM VÀ LỚP PHỦ CHỈ HIỆN TRÊN MOBILE */}
              <div className="absolute inset-0 flex md:hidden flex-col items-center justify-center p-4 bg-gradient-to-t from-black/80 via-black/30 to-transparent">
                 <button
                    onClick={() => setShowMobileMap(true)}
                    className="bg-cyan-500 hover:bg-cyan-400 text-[#0f172a] font-black px-8 py-4 rounded-full border-2 border-white shadow-[0_0_30px_rgba(6,182,212,0.8)] animate-pulse text-lg tracking-wider mt-32"
                 >
                    XEM LỊCH TRÌNH
                 </button>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI (ROADMAP CUỘN NGANG) */}
          <div className={`flex-1 flex-col overflow-x-auto relative custom-scrollbar bg-white rounded-lg border-2 border-[#bfdbfe] shadow-inner ${showMobileMap ? 'flex' : 'hidden md:flex'}`} ref={scrollContainerRef}>
            
            {/* NÚT QUAY LẠI ẢNH NỀN (CHỈ TRÊN MOBILE) */}
            <div className="md:hidden sticky left-0 top-0 z-50 w-full bg-white border-b-2 border-slate-200 p-2 shadow-sm flex justify-center">
               <button
                 onClick={() => setShowMobileMap(false)}
                 className="bg-slate-700 text-white px-6 py-2 rounded-full font-bold text-xs shadow-md hover:bg-slate-600 uppercase tracking-widest flex items-center gap-2"
               >
                 <span>⬅</span> QUAY LẠI HÌNH NỀN
               </button>
            </div>

            {/* ĐÂY LÀ CHỖ TÍNH CHIỀU RỘNG TỰ ĐỘNG: Mỗi ngày = 100px */}
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
                    // Hiển thị mốc ngày mỗi 2 ngày để thanh kéo dài không bị trống trải
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
                    <div className="absolute top-1 left-2 bg-[#ef4444] text-white text-[9px] md:text-[11px] font-black px-2 md:px-3 py-0.5 md:py-1 rounded shadow-md whitespace-nowrap">
                      {todayLabel}
                    </div>
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
                        className="absolute h-[64px] bg-white border-2 border-[#cbd5e1] rounded-lg shadow-sm flex items-center pr-1 md:pr-2 z-20 cursor-pointer hover:shadow-md hover:border-[#3b82f6] hover:scale-[1.01] transition-all" 
                        style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, top: `${topPosition}px` }}
                      >
                        
                        <div className="absolute left-[-6px] md:left-[-8px] top-1/2 -translate-y-1/2 w-3 md:w-3.5 h-3 md:h-3.5 bg-white border-[2px] md:border-[3px] border-[#3b82f6] rounded-full z-10 shadow-sm"></div>

                        <div className="w-[80px] md:w-[110px] h-full relative shrink-0 bg-slate-100 mr-2 md:mr-3 rounded-l-md overflow-hidden">
                          <img src={event.image} alt="event" className="w-full h-full object-cover" />
                        </div>

                        <div className="flex-1 min-w-0 py-1 flex flex-col justify-center h-full">
                          {/* Đã xóa lệnh truncate, thêm line-clamp-2 để chữ tự rớt xuống dòng */}
                          <h4 className="font-bold text-[#1e3a8a] text-[11px] md:text-[13px] line-clamp-2 leading-tight break-words" title={event.title}>{event.title}</h4>
                          <div className="text-[9px] md:text-[11px] text-slate-500 font-bold flex items-center gap-1 mt-1 bg-slate-100 w-fit px-1.5 md:px-2 py-0.5 rounded-full shrink-0">
                             <span className="text-[#d97706]">🕒</span> {event.dateStr}
                          </div>
                        </div>

                        {event.rewards && (
                          <div className="shrink-0 flex items-center justify-end ml-1 md:ml-2 h-[80%] min-w-[60px] md:min-w-[80px] border-l border-slate-200 pl-1.5 md:pl-3 hidden sm:flex">
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
      {/* MODAL SỰ KIỆN SẮP HẾT HẠN (DEADLINE <= 3 NGÀY) */}
      {/* ========================================== */}
      {isDeadlineModalOpen && (
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4 backdrop-blur-sm" 
          onClick={() => setIsDeadlineModalOpen(false)}
        >
          <div 
            className="bg-white border-4 border-red-400 rounded-2xl w-full max-w-[400px] max-h-[80vh] flex flex-col shadow-[0_0_30px_rgba(248,113,113,0.5)] animate-[fadeIn_0.2s_ease-out]" 
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-red-500 p-3 text-center rounded-t-lg relative">
              <h2 className="text-white font-black text-lg drop-shadow-md">🚨 BÁO ĐỘNG DEADLINE</h2>
              <button 
                onClick={() => setIsDeadlineModalOpen(false)} 
                className="absolute top-1/2 -translate-y-1/2 right-3 w-7 h-7 bg-white hover:bg-slate-200 text-red-600 rounded-full font-black flex items-center justify-center transition-colors shadow-sm"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3">
              {(() => {
                // Lọc ra các sự kiện còn từ 0 đến 3 ngày
                const urgentEvents = events.filter(ev => {
                  const daysLeft = Math.ceil((ev.end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  return daysLeft >= 0 && daysLeft <= 3;
                });

                // Nếu không có sự kiện nào sắp hết hạn
                if (urgentEvents.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <p className="text-4xl mb-2">☕</p>
                      <p className="text-slate-500 font-bold text-sm">Chưa có deadline nào trong 3 ngày tới!<br/>Cứ thong thả chill nhé!</p>
                    </div>
                  );
                }

                // Nếu có sự kiện, sắp xếp theo thời gian tăng dần (cái nào gấp nhất lên đầu)
                return urgentEvents
                  .sort((a, b) => a.end - b.end)
                  .map(ev => {
                    const daysLeft = Math.ceil((ev.end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <div 
                        key={ev.id} 
                        className="border-2 border-red-200 bg-red-50 rounded-xl p-3 flex gap-3 hover:border-red-500 hover:bg-red-100 cursor-pointer transition-colors" 
                        onClick={() => { setIsDeadlineModalOpen(false); setSelectedEventDetail(ev); }}
                      >
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
      {/* MODAL CÀI ĐẶT (ĐỔI GIAO DIỆN / QUẢN LÝ LỊCH) */}
      {/* ========================================== */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm p-2 md:p-4">
          <div className="w-full max-w-[800px] h-[90vh] md:h-[600px] bg-[#1e293b] border-2 border-[#3b82f6] rounded-xl flex flex-col shadow-[0_0_40px_rgba(59,130,246,0.6)] relative overflow-hidden">
            
            <div className="h-auto md:h-14 border-b border-slate-600 flex flex-col md:flex-row items-start md:items-center justify-between px-4 md:px-6 py-2 md:py-0 bg-[#0f172a] gap-2 md:gap-0">
              <div className="flex gap-4 md:gap-6 w-full md:w-auto overflow-x-auto custom-scrollbar pb-1 md:pb-0">
                <button className={`text-xs md:text-sm font-bold uppercase whitespace-nowrap transition-all ${activeTab === 'profile' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-white'}`} onClick={() => setActiveTab('profile')}>Đổi Giao Diện</button>
                <button className={`text-xs md:text-sm font-bold uppercase whitespace-nowrap transition-all ${activeTab === 'events' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-white'}`} onClick={() => setActiveTab('events')}>Quản Lý Lịch</button>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="absolute top-2 right-4 md:relative md:top-auto md:right-auto text-slate-400 hover:text-red-400 font-black text-lg md:text-xl bg-slate-800 rounded-full w-6 h-6 md:w-8 md:h-8 flex items-center justify-center">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
              
              {activeTab === 'profile' && (
                <div className="space-y-4 md:space-y-6">
                  <div><label className="text-cyan-400 text-[10px] md:text-xs font-bold block mb-1 md:mb-2 uppercase">Tiêu đề lớn:</label><input type="text" className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-2 md:p-3 text-sm focus:outline-none focus:border-cyan-400" value={profileFormData.title} onChange={e => setProfileFormData({...profileFormData, title: e.target.value})} /></div>
                  <div><label className="text-cyan-400 text-[10px] md:text-xs font-bold block mb-1 md:mb-2 uppercase">Tiêu đề phụ:</label><input type="text" className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-2 md:p-3 text-sm focus:outline-none focus:border-cyan-400" value={profileFormData.subtitle} onChange={e => setProfileFormData({...profileFormData, subtitle: e.target.value})} /></div>
                  <div>
                    <label className="text-cyan-400 text-[10px] md:text-xs font-bold block mb-1 md:mb-2 uppercase">Ảnh Nền (Khung 9:16):</label>
                    <input type="file" accept="image/*" onChange={(e) => onSelectFile(e, 'profile')} className="text-xs md:text-sm text-slate-300 w-full file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:font-bold file:bg-[#3b82f6] file:text-white cursor-pointer" />
                  </div>
                  <div className="pt-2 md:pt-4 border-t border-slate-600 mt-4 md:mt-6">
                    <button onClick={handleSaveProfile} className="bg-cyan-500 hover:bg-cyan-400 text-[#0f172a] font-black px-4 md:px-8 py-2.5 md:py-3 rounded uppercase w-full shadow-[0_0_15px_rgba(6,182,212,0.5)] text-sm md:text-base">Lưu Cấu Hình</button>
                  </div>
                </div>
              )}

              {activeTab === 'events' && (
                <div className="flex flex-col h-full">
                  <div className="mb-4 md:mb-6 border-b border-slate-600 pb-4 md:pb-6">
                    <h3 className="text-cyan-400 font-bold mb-2 md:mb-3 uppercase text-[11px] md:text-sm border-l-4 border-cyan-400 pl-2">Lịch Đang Có</h3>
                    <div className="space-y-2 max-h-[120px] md:max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                      {events.length === 0 && <p className="text-slate-400 text-xs md:text-sm italic">Hệ thống đang trống.</p>}
                      {events.map(ev => (
                        <div key={ev.id} className="flex justify-between items-center bg-[#0f172a] border border-slate-600 rounded p-2 md:p-3">
                          <span className="text-white font-bold text-xs md:text-sm truncate mr-2">{ev.title}</span>
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
                      <input type="file" accept="image/*" onChange={(e) => onSelectFile(e, 'event')} className="text-xs md:text-sm text-slate-300 w-full file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-[#3b82f6] file:text-white cursor-pointer" />
                    </div>
                    <button type="submit" className="w-full bg-green-500 hover:bg-green-400 text-[#0f172a] font-black px-4 md:px-8 py-2.5 md:py-3 rounded uppercase transition-colors shadow-[0_0_15px_rgba(34,197,94,0.4)] text-sm md:text-base">Tạo Mới</button>
                  </form>
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
            <ReactCrop 
              crop={crop} 
              onChange={c => setCrop(c)} 
              onComplete={c => setCompletedCrop(c)}
              aspect={cropAspectRatio} 
            >
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
      {/* MODAL XEM CHI TIẾT SỰ KIỆN (CHUẨN ANIME) */}
      {/* ========================================== */}
      {selectedEventDetail && (
        <div 
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[120] p-4 backdrop-blur-md" 
          onClick={() => setSelectedEventDetail(null)}
        >
          <div 
            className="bg-white border-[4px] border-pink-300 rounded-[2rem] w-full max-w-[400px] overflow-hidden shadow-[0_0_40px_rgba(236,72,153,0.5)] animate-[fadeIn_0.2s_ease-out] relative" 
            onClick={e => e.stopPropagation()}
          >
            {/* Nút Tắt */}
            <button 
              onClick={() => setSelectedEventDetail(null)} 
              className="absolute top-4 right-4 w-8 h-8 bg-white hover:bg-pink-500 text-pink-500 hover:text-white border-2 border-pink-200 hover:border-pink-500 rounded-full flex items-center justify-center font-black shadow-md transition-all text-sm z-10"
            >
              ✕
            </button>

            {/* Phần ảnh bìa */}
            <div className="w-full h-40 md:h-52 bg-pink-50 relative p-2">
              <div className="w-full h-full rounded-2xl overflow-hidden border-2 border-pink-200 shadow-inner">
                <img src={selectedEventDetail.image} alt="Event Cover" className="w-full h-full object-cover" />
              </div>
            </div>
            
            {/* Phần thông tin chi tiết với tông màu sáng */}
            <div className="p-6 md:p-8 bg-gradient-to-b from-white to-pink-50/50">
              <h3 className="text-[#4c1d95] font-black text-xl md:text-2xl mb-5 leading-tight break-words text-center drop-shadow-sm">
                ✨ {selectedEventDetail.title} ✨
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-xl border border-blue-100 shadow-sm">
                  <span className="text-2xl drop-shadow-sm">🌸</span>
                  <div>
                    <p className="text-blue-400 text-[10px] font-black uppercase mb-0.5 tracking-wider">Thời gian</p>
                    <p className="text-blue-800 font-bold text-sm">
                      {selectedEventDetail.dateStr}
                    </p>
                  </div>
                </div>

                {selectedEventDetail.rewards && (
                  <div className="flex items-center gap-3 bg-amber-50 p-3 rounded-xl border border-amber-100 shadow-sm">
                    <span className="text-2xl drop-shadow-sm">⭐</span>
                    <div>
                      <p className="text-amber-400 text-[10px] font-black uppercase mb-0.5 tracking-wider">Ghi chú / Thưởng</p>
                      <p className="text-amber-700 font-bold text-sm break-words">
                        {selectedEventDetail.rewards}
                      </p>
                    </div>
                  </div>
                )}
              </div>
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