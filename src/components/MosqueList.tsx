import React, { useState, useEffect } from 'react';
import { Mosque, getDistance, PrayerTimes, PrayerName } from '../types';
import { MapPin, Navigation, Clock, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { mosqueService } from '../services/mosqueService';

interface MosqueListProps {
  mosques: Mosque[];
  mapCenter: [number, number];
  searchRadius: number;
  onSelect: (mosque: Mosque) => void;
  onBack: () => void;
}

const MosqueList: React.FC<MosqueListProps> = ({ mosques, mapCenter, searchRadius, onSelect, onBack }) => {
  const [prayerTimesMap, setPrayerTimesMap] = useState<Record<string, PrayerTimes>>({});

  useEffect(() => {
    const fetchAllTimes = async () => {
      const times: Record<string, PrayerTimes> = {};
      await Promise.all(
        mosques.map(async (m) => {
          const pt = await mosqueService.getPrayerTimes(m.id);
          if (pt) times[m.id] = pt;
        })
      );
      setPrayerTimesMap(times);
    };

    if (mosques.length > 0) {
      fetchAllTimes();
    }
  }, [mosques]);

  const getNextJamat = (mosqueId: string) => {
    const times = prayerTimesMap[mosqueId];
    if (!times) return null;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const isFriday = now.getDay() === 5;
    const prayers: { name: string; time: string; minutes: number }[] = [
      { name: 'Fajr', time: times.fajr, minutes: timeToMinutes(times.fajr) },
      ...(isFriday ? [{ name: "Jumu'ah", time: times.jumua, minutes: timeToMinutes(times.jumua) }] : []),
      { name: 'Dhuhr', time: times.dhuhr, minutes: timeToMinutes(times.dhuhr) },
      { name: 'Asr', time: times.asr, minutes: timeToMinutes(times.asr) },
      { name: 'Maghrib', time: times.maghrib, minutes: timeToMinutes(times.maghrib) },
      { name: 'Isha', time: times.isha, minutes: timeToMinutes(times.isha) },
    ];

    // Find the first prayer that is after now
    let next = prayers.find(p => p.minutes > currentMinutes);
    
    // If no prayer left today, next is Fajr tomorrow
    if (!next) {
      next = prayers[0];
    }

    return {
      ...next,
      formattedTime: formatTime12h(next.time)
    };
  };

  const formatTime12h = (time24: string) => {
    if (!time24) return '--:--';
    const [hoursStr, minutesStr] = time24.split(':');
    let hours = parseInt(hoursStr);
    const minutes = minutesStr;
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${period}`;
  };

  const timeToMinutes = (timeStr: string) => {
    const [time, period] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    return hours * 60 + minutes;
  };

  const sortedMosques = [...mosques]
    .map(m => ({
      ...m,
      distance: getDistance(mapCenter[0], mapCenter[1], m.latitude, m.longitude)
    }))
    .sort((a, b) => (a.distance || 0) - (b.distance || 0));

  return (
    <div className="flex-1 overflow-y-auto bg-white flex flex-col h-full pt-[calc(5rem+env(safe-area-inset-top))]">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Navigation className="w-4 h-4" />
            Nearest Mosques
          </h2>
          <p className="text-[10px] text-slate-400 mt-1">
            Within {searchRadius >= 1000 ? `${(searchRadius / 1000).toFixed(1)}km` : `${searchRadius}m`} of map center
          </p>
        </div>
        <button 
          onClick={onBack}
          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-[#0F7A5C] uppercase tracking-wider shadow-sm hover:bg-slate-50 transition-colors"
        >
          Back to Map
        </button>
      </div>

      <div className="divide-y divide-slate-50 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {sortedMosques.length === 0 ? (
          <div className="p-12 text-center">
            <MapPin className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-400 font-medium">No mosques found in this area.</p>
            <p className="text-xs text-slate-300 mt-1">Try moving the map or searching another area.</p>
          </div>
        ) : (
          sortedMosques.map((mosque, index) => {
            const nextJamat = getNextJamat(mosque.id);
            return (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                key={mosque.id}
                onClick={() => onSelect(mosque)}
                className="w-full p-4 flex items-start gap-4 hover:bg-slate-50 transition-colors text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0 group-hover:bg-emerald-100 transition-colors">
                  <MapPin className="w-5 h-5" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-bold text-slate-900 truncate">{mosque.name}</h3>
                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {mosque.distance ? (mosque.distance < 1 ? `${(mosque.distance * 1000).toFixed(0)}m` : `${mosque.distance.toFixed(1)}km`) : '0m'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{mosque.address || 'Address not available'}</p>
                  
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                      <Clock className="w-3.5 h-3.5 text-emerald-500" />
                      Next Jamat: 
                      {nextJamat ? (
                        <span className="text-emerald-600 font-black">
                          {nextJamat.name} @ {nextJamat.formattedTime}
                        </span>
                      ) : (
                        <span className="text-slate-300 italic">Not available</span>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
                  </div>
                </div>
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MosqueList;
