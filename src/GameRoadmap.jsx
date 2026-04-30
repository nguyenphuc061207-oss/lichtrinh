import React, { useState, useRef, useEffect } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

const GameRoadmap = () => {
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
  // 2. STATE DỮ LIỆU CỐT LÕI
  // ==========================================
  const [profile, setProfile] = useState({
    avatar: "https://images.unsplash.com/photo-1541562232579-512a21360020?q=80&w=800",
    title: "TỔNG QUAN PHIÊN BẢN", 
    subtitle: "v7.3"
  });
  
  const [events, setEvents] = useState([
    {
      id: "ev1",
      title: "ĐẠI SỐ TUYẾN TÍNH",
      dateStr: "22/04 - 01/05",
      start: new Date(currentYear, 3, 22),
      end: new Date(currentYear, 4, 1),
      image: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=200&q=80",
      rewards: "EXP x20 | Crystals x1600",
      trackRow: 0
    }
  ]);

  // ==========================================
  // 3. HỆ THỐNG MENU CÀI ĐẶT
  // ==========================================
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('profile'); 
  
  const [profileFormData, setProfileFormData] = useState(profile);
  // ĐÃ BỎ BIẾN trackRow KHỎI FORM VÌ BÂY GIỜ HỆ THỐNG SẼ TỰ TÍNH TOÁN
  const [eventFormData, setEventFormData] = useState({ title: '', startDate: '', endDate: '', rewards: '' });

  // ==========================================
  // 4. HỆ THỐNG CẮT ẢNH (FIXED ASPECT RATIO)
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

    const croppedImageUrl = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(URL.createObjectURL(blob)), 'image/png');
    });

    if (cropTarget === 'event') {
      setEventFormData({ ...eventFormData, croppedImage: croppedImageUrl });
    } else if (cropTarget === 'profile') {
      setProfileFormData({ ...profileFormData, avatar: croppedImageUrl });
    }
    setIsCropModalOpen(false);
    setUpImg(null);
  };

  const handleSaveProfile = () => {
    setProfile({
      avatar: profileFormData.avatar,
      title: profileFormData.title.toUpperCase(),
      subtitle: profileFormData.subtitle.toUpperCase()
    });
    alert("Đã lưu thiết lập!");
  };

  const handleAddEvent = (e) => {
    e.preventDefault();
    const startObj = new Date(eventFormData.startDate);
    const endObj = new Date(eventFormData.endDate);
    
    // Đảm bảo EndDate bao phủ hết ngày đó (đến 23:59:59) để tính toán chuẩn xác
    endObj.setHours(23, 59, 59, 999);

    const dateStr = `${startObj.getDate().toString().padStart(2, '0')}/${(startObj.getMonth() + 1).toString().padStart(2, '0')} - ${endObj.getDate().toString().padStart(2, '0')}/${(endObj.getMonth() + 1).toString().padStart(2, '0')}`;

    // =================================================================
    // THUẬT TOÁN TÍNH TOÁN DÒNG TỰ ĐỘNG (AUTO-ROW ALLOCATION)
    // =================================================================
    let assignedRow = 0;
    let isRowOccupied = true;

    while (isRowOccupied) {
      // Tìm xem trên dòng 'assignedRow' có sự kiện nào đụng thời gian không
      const overlappingEvent = events.find(ev => {
        if (ev.trackRow !== assignedRow) return false;
        // Công thức giao nhau: (Start A <= End B) VÀ (End A >= Start B)
        return (startObj <= ev.end) && (endObj >= ev.start);
      });

      if (overlappingEvent) {
         // Nếu đụng hàng, tăng số dòng lên 1 và vòng lặp sẽ kiểm tra lại
         assignedRow++; 
      } else {
         // Không đụng hàng ai trên dòng này, chốt dòng này!
         isRowOccupied = false; 
      }
    }

    const newEvent = {
      id: "ev_" + Date.now(),
      title: eventFormData.title,
      dateStr: dateStr,
      start: startObj, 
      end: endObj,
      image: eventFormData.croppedImage || "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=200&q=80",
      rewards: eventFormData.rewards,
      trackRow: assignedRow // Áp dụng dòng đã được máy tính tự động
    };

    setEvents([...events, newEvent]);
    setEventFormData({ title: '', startDate: '', endDate: '', rewards: '', croppedImage: null });
  };

  const handleDeleteEvent = (idToRemove) => {
    setEvents(events.filter(e => e.id !== idToRemove));
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 font-sans select-none bg-[#f1f5f9] bg-cover bg-center">
      
      {/* KHUNG MAIN APP */}
      <div className="w-full max-w-[1400px] h-[780px] bg-white rounded-xl flex flex-col relative z-10 overflow-hidden shadow-[0_10px_40px_rgba(41,92,232,0.15)] border-[6px] border-[#e2e8f0]">
        
        {/* TOP HEADER */}
        <div className="bg-[#4f46e5] bg-[url('https://www.transparenttextures.com/patterns/az-subtle.png')] h-16 flex justify-between items-end relative overflow-hidden border-b-[4px] border-[#38bdf8]">
          
          <div className="bg-[#06b6d4] h-[120%] min-w-[280px] absolute -top-1 -left-2 flex items-center px-6 pl-8 z-10 shadow-lg" style={{ clipPath: 'polygon(0 0, 90% 0, 100% 100%, 0% 100%)' }}>
            <div className="flex items-center gap-3 mt-1">
              <div className="w-8 h-8 bg-white/20 rounded flex items-center justify-center border border-white/50">
                <div className="w-5 h-2 bg-white rounded-sm relative"><div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-1 bg-white"></div></div>
              </div>
              <div>
                <h1 className="text-white font-black text-[18px] leading-tight drop-shadow-md">{profile.title}</h1>
                <span className="text-white/90 text-[11px] font-bold">{profile.subtitle}</span>
              </div>
            </div>
          </div>

          <div className="ml-auto relative z-10 mb-2 mr-4">
             <button 
                onClick={() => { setProfileFormData(profile); setIsSettingsOpen(true); }}
                className="bg-white text-[#4f46e5] font-black px-6 py-1.5 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)] hover:scale-105 transition-transform text-sm tracking-wide border-2 border-transparent hover:border-[#38bdf8]"
              >
                Cài Đặt Lịch
              </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden bg-[#e0e7ff] p-2 gap-2">
          
          {/* PANEL TRÁI */}
          <div className="w-[320px] bg-white rounded-lg border-2 border-[#bfdbfe] relative flex flex-col justify-between z-20 shadow-sm p-3">
            <div className="w-full h-full relative rounded-md border-[3px] border-[#60a5fa] overflow-hidden shadow-[0_0_15px_rgba(96,165,250,0.3)] bg-slate-100">
              <img src={profile.avatar} alt="Avatar" className="w-full h-full object-cover object-center" />
            </div>
          </div>

          {/* PANEL PHẢI (ROADMAP CUỘN NGANG) */}
          <div className="flex-1 flex flex-col overflow-x-auto relative custom-scrollbar bg-white rounded-lg border-2 border-[#bfdbfe] shadow-inner" ref={scrollContainerRef}>
            <div className="min-w-[22000px] flex flex-col h-full relative">
              
              <div className="sticky top-0 z-40 bg-white shadow-sm border-b-2 border-[#e2e8f0]">
                <div className="bg-[#1e40af] h-5 flex text-white/70 font-bold text-[9px] tracking-widest uppercase">
                  {yearsData.map((y, idx) => (
                    <div key={idx} className="flex items-center justify-center border-r border-[#3b82f6]/30" style={{ width: `${(y.count / totalDays) * 100}%` }}>NĂM {y.year}</div>
                  ))}
                </div>
                
                <div className="bg-[#2563eb] h-8 flex text-white font-bold text-[13px]">
                  {monthsData.map((m, idx) => (
                    <div key={idx} className="flex items-center justify-center border-r border-white/20" style={{ width: `${(m.count / totalDays) * 100}%` }}>
                       <span className="opacity-70 mx-2 text-xs">◆</span> Tháng {m.month} <span className="opacity-70 mx-2 text-xs">◆</span>
                    </div>
                  ))}
                </div>

                <div className="h-8 flex relative bg-white">
                  {daysArray.map((date, idx) => {
                    if (idx % 5 === 0 || idx === totalDays) {
                      return (
                        <div key={idx} className="absolute top-0 flex flex-col items-center justify-start pt-1" style={{ left: `${(idx / totalDays) * 100}%`, transform: 'translateX(-50%)' }}>
                          <span className="text-[#1e40af] font-black text-[11px] leading-none">{date.getDate()}</span>
                          <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[4px] border-t-[#94a3b8] mt-1"></div>
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
                    <div className="absolute top-1 left-2 bg-[#ef4444] text-white text-[11px] font-black px-3 py-1 rounded shadow-md whitespace-nowrap">
                      {todayLabel}
                    </div>
                  </div>
                )}

                <div className="relative w-full h-full pt-4">
                  {events.map((event) => {
                    const leftPercent = Math.max(0, ((event.start.getTime() - startDate.getTime()) / totalDuration) * 100);
                    const rawWidth = ((event.end.getTime() - event.start.getTime()) / totalDuration) * 100;
                    const widthPercent = Math.min(rawWidth, 100 - leftPercent);
                    
                    // Khoảng cách theo chiều dọc được nhân với số Row hệ thống cấp
                    const topPosition = event.trackRow * 80;

                    return (
                      <div key={event.id} className="absolute h-[64px] bg-white border-2 border-[#cbd5e1] rounded-lg shadow-sm flex items-center pr-2 z-20" style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, top: `${topPosition}px` }}>
                        
                        <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white border-[3px] border-[#3b82f6] rounded-full z-10 shadow-sm"></div>

                        <div className="w-[110px] h-full relative shrink-0 bg-slate-100 mr-3 rounded-l-md overflow-hidden">
                          <img src={event.image} alt="event" className="w-full h-full object-cover" />
                        </div>

                        <div className="flex-1 min-w-0 py-1">
                          <h4 className="font-bold text-[#1e3a8a] text-[13px] truncate">{event.title}</h4>
                          <div className="text-[11px] text-slate-500 font-bold flex items-center gap-1 mt-1 bg-slate-100 w-fit px-2 py-0.5 rounded-full">
                             <span className="text-[#d97706]">🕒</span> {event.dateStr}
                          </div>
                        </div>

                        {event.rewards && (
                          <div className="shrink-0 flex items-center justify-end ml-2 h-[80%] min-w-[80px] border-l border-slate-200 pl-3">
                             <div className="bg-[#f0f9ff] px-2 py-1.5 rounded-md border border-[#bae6fd] flex flex-col items-center shadow-inner">
                                <span className="text-[14px]">💎</span>
                                <span className="text-[10px] font-black text-[#0284c7] mt-0.5 whitespace-nowrap">{event.rewards}</span>
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

        {/* Họa tiết Icon */}
        <div className="absolute bottom-2 right-2 flex gap-1 z-30 pointer-events-none">
           <div className="w-10 h-10 bg-[#06b6d4] rounded-md rotate-12 opacity-80 flex items-center justify-center shadow-lg"><div className="w-2 h-2 bg-white rounded-full"></div></div>
           <div className="w-12 h-12 bg-[#f472b6] rounded-md -rotate-6 opacity-80 flex items-center justify-center shadow-lg"><div className="text-white font-black text-xl">^.^</div></div>
        </div>
      </div>

      {/* ========================================== */}
      {/* MENU CÀI ĐẶT TỔNG */}
      {/* ========================================== */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="w-full max-w-[800px] h-[600px] bg-[#1e293b] border-2 border-[#3b82f6] rounded-xl flex flex-col shadow-[0_0_40px_rgba(59,130,246,0.6)] relative overflow-hidden">
            
            <div className="h-14 border-b border-slate-600 flex items-center justify-between px-6 bg-[#0f172a]">
              <div className="flex gap-6">
                <button className={`text-sm font-bold uppercase transition-all ${activeTab === 'profile' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-white'}`} onClick={() => setActiveTab('profile')}>Đổi Tiêu Đề & Hình Nền</button>
                <button className={`text-sm font-bold uppercase transition-all ${activeTab === 'events' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-white'}`} onClick={() => setActiveTab('events')}>Quản Lý Lịch Trình</button>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-red-400 font-black text-xl bg-slate-800 rounded-full w-8 h-8 flex items-center justify-center">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <div><label className="text-cyan-400 text-xs font-bold block mb-2 uppercase">Tiêu đề lớn:</label><input type="text" className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-3 focus:outline-none focus:border-cyan-400" value={profileFormData.title} onChange={e => setProfileFormData({...profileFormData, title: e.target.value})} /></div>
                  <div><label className="text-cyan-400 text-xs font-bold block mb-2 uppercase">Tiêu đề phụ:</label><input type="text" className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-3 focus:outline-none focus:border-cyan-400" value={profileFormData.subtitle} onChange={e => setProfileFormData({...profileFormData, subtitle: e.target.value})} /></div>
                  <div>
                    <label className="text-cyan-400 text-xs font-bold block mb-2 uppercase">Tải Ảnh Nền Giao Diện (Bị khóa khung 9:16):</label>
                    <input type="file" accept="image/*" onChange={(e) => onSelectFile(e, 'profile')} className="text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:font-bold file:bg-[#3b82f6] file:text-white cursor-pointer hover:file:bg-[#2563eb]" />
                  </div>
                  <div className="pt-4 border-t border-slate-600 mt-6">
                    <button onClick={handleSaveProfile} className="bg-cyan-500 hover:bg-cyan-400 text-[#0f172a] font-black px-8 py-3 rounded uppercase w-full shadow-[0_0_15px_rgba(6,182,212,0.5)]">Lưu Cấu Hình</button>
                  </div>
                </div>
              )}

              {activeTab === 'events' && (
                <div className="flex flex-col h-full">
                  <div className="mb-6 border-b border-slate-600 pb-6">
                    <h3 className="text-cyan-400 font-bold mb-3 uppercase text-sm border-l-4 border-cyan-400 pl-2">Lịch Trình Đang Có</h3>
                    <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                      {events.length === 0 && <p className="text-slate-400 text-sm italic">Hệ thống đang trống.</p>}
                      {events.map(ev => (
                        <div key={ev.id} className="flex justify-between items-center bg-[#0f172a] border border-slate-600 rounded p-3">
                          <span className="text-white font-bold text-sm">{ev.title} <span className="text-slate-400 text-xs ml-2">({ev.dateStr})</span></span>
                          <button onClick={() => handleDeleteEvent(ev.id)} className="text-red-400 hover:text-white hover:bg-red-500 px-3 py-1 rounded font-bold text-xs uppercase transition-colors">Gỡ Bỏ</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <form onSubmit={handleAddEvent}>
                    <h3 className="text-green-400 font-bold mb-4 uppercase text-sm border-l-4 border-green-400 pl-2">Thêm Mới Lịch Trình (Hệ thống sẽ tự động cấp dòng)</h3>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="col-span-2"><input required type="text" placeholder="Tên sự kiện / Môn học..." className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-3 text-sm focus:border-green-400 focus:outline-none" value={eventFormData.title} onChange={e => setEventFormData({...eventFormData, title: e.target.value})} /></div>
                      <div><label className="text-slate-400 text-[10px] font-bold block mb-1">TỪ NGÀY:</label><input required type="date" className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-2 text-sm style-date" value={eventFormData.startDate} onChange={e => setEventFormData({...eventFormData, startDate: e.target.value})} /></div>
                      <div><label className="text-slate-400 text-[10px] font-bold block mb-1">ĐẾN NGÀY:</label><input required type="date" className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-2 text-sm style-date" value={eventFormData.endDate} onChange={e => setEventFormData({...eventFormData, endDate: e.target.value})} /></div>
                      
                      {/* ĐÃ ẨN Ô NHẬP "DÒNG HIỂN THỊ", thay bằng 1 ô trống để giữ layout form */}
                      <div className="col-span-2"><input type="text" placeholder="Mục tiêu (nếu có)" className="w-full bg-[#0f172a] text-white border border-slate-600 rounded p-3 text-sm" value={eventFormData.rewards} onChange={e => setEventFormData({...eventFormData, rewards: e.target.value})} /></div>
                    </div>
                    <div className="mb-6">
                      <label className="text-green-400 text-[10px] font-bold block mb-2 uppercase">Ảnh Thumbnail thẻ (Bị khóa khung 21:9):</label>
                      <input type="file" accept="image/*" onChange={(e) => onSelectFile(e, 'event')} className="text-sm text-slate-300 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-[#3b82f6] file:text-white cursor-pointer" />
                    </div>
                    <button type="submit" className="w-full bg-green-500 hover:bg-green-400 text-[#0f172a] font-black px-8 py-3 rounded uppercase transition-colors shadow-[0_0_15px_rgba(34,197,94,0.4)]">Tạo Nhiệm Vụ Mới</button>
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
        <div className="fixed inset-0 bg-[#0f172a]/95 flex flex-col items-center justify-center z-[100] p-4 backdrop-blur-md">
          <div className="text-center mb-6">
            <h2 className="text-white font-black text-2xl uppercase">CẮT ẢNH TIÊU CHUẨN</h2>
            <p className="text-yellow-400 font-bold text-sm mt-2 bg-yellow-400/10 px-4 py-1 rounded-full border border-yellow-400/30 inline-block">Khung cắt đã bị khóa tỉ lệ để tránh vỡ giao diện.</p>
          </div>
          
          <div className="relative border-4 border-cyan-500 rounded-lg bg-black overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.6)] p-2">
            <ReactCrop 
              crop={crop} 
              onChange={c => setCrop(c)} 
              onComplete={c => setCompletedCrop(c)}
              aspect={cropAspectRatio} 
            >
              <img ref={imgRef} src={upImg} alt="Cắt ảnh" className="max-h-[50vh] object-contain opacity-80" />
            </ReactCrop>
          </div>

          <div className="flex gap-6 mt-8 w-[500px]">
            <button onClick={() => { setIsCropModalOpen(false); setUpImg(null); }} className="flex-1 py-3 bg-slate-700 text-white font-bold rounded hover:bg-slate-600 transition-colors">HỦY BỎ</button>
            <button onClick={handleCropComplete} className="flex-1 py-3 bg-cyan-500 text-[#0f172a] font-black rounded hover:bg-cyan-400 transition-colors shadow-[0_0_15px_rgba(6,182,212,0.5)]">XÁC NHẬN LƯU</button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; background-color: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }
        .style-date::-webkit-calendar-picker-indicator { filter: invert(1); cursor: pointer; }
      `}} />
    </div>
  );
};

export default GameRoadmap;