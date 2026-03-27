import React, { useState, useEffect } from 'react';
import { Mosque, PrayerTimes, PrayerName, COUNTRY_NAME } from '../types';
import { mosqueService } from '../services/mosqueService';
import { Clock, MapPin, ChevronRight, X, AlertCircle } from 'lucide-react';
import { format, parse, addMinutes, isAfter, differenceInMinutes } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

interface RadarProps {
  userLocation: [number, number];
  nearbyMosques: Mosque[];
}

interface NextJamat {
  mosque: Mosque;
  prayerName: string;
  time: string;
  minutesRemaining: number;
}

const Radar: React.FC<RadarProps> = ({ userLocation, nearbyMosques }) => {
  const [nextJamat, setNextJamat] = useState<NextJamat | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isOutside, setIsOutside] = useState(false);

  useEffect(() => {
    const checkLocation = async () => {
      const { isInBounds, COUNTRY_NAME } = await import('../types');
      if (userLocation && !isInBounds(userLocation[0], userLocation[1])) {
        setIsOutside(true);
      } else {
        setIsOutside(false);
      }
    };
    checkLocation();
    findNextJamat();
    const interval = setInterval(findNextJamat, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [nearbyMosques, userLocation]);

  const findNextJamat = async () => {
    if (nearbyMosques.length === 0) {
      setLoading(false);
      return;
    }

    const now = new Date();
    const currentTimeStr = format(now, 'HH:mm');
    
    let closest: NextJamat | null = null;

    for (const mosque of nearbyMosques.slice(0, 5)) { // Check top 5 closest
      const times = await mosqueService.getPrayerTimes(mosque.id);
      if (!times) continue;

      const prayerList: { name: PrayerName; time: string }[] = [
        { name: 'fajr', time: times.fajr },
        { name: 'dhuhr', time: times.dhuhr },
        { name: 'asr', time: times.asr },
        { name: 'maghrib', time: times.maghrib },
        { name: 'isha', time: times.isha },
      ];

      for (const p of prayerList) {
        try {
          const prayerTime = parse(p.time, 'HH:mm', now);
          if (isAfter(prayerTime, now)) {
            const diff = differenceInMinutes(prayerTime, now);
            if (!closest || diff < closest.minutesRemaining) {
              closest = {
                mosque,
                prayerName: p.name,
                time: p.time,
                minutesRemaining: diff
              };
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    setNextJamat(closest);
    setLoading(false);
  };

  if (loading || isDismissed) return null;

  return (
    <AnimatePresence>
      {isOutside && !isDismissed && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-4 left-4 right-4 z-[400] pointer-events-none"
        >
          <div className="max-w-md mx-auto bg-amber-50/90 backdrop-blur-md rounded-2xl shadow-xl border border-amber-200 p-4 pointer-events-auto relative">
            <button 
              onClick={() => setIsDismissed(true)}
              className="absolute top-2 right-2 p-1 text-amber-400 hover:text-amber-600 transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-0.5">Location Notice</div>
                <div className="text-sm font-bold text-amber-900">You are outside {COUNTRY_NAME}</div>
                <div className="text-[10px] text-amber-700">App features are limited to this region.</div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
      {nextJamat && !isOutside && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-4 left-4 right-4 z-[400] pointer-events-none"
        >
          <div className="max-w-md mx-auto bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-4 pointer-events-auto overflow-hidden relative">
            <button 
              onClick={() => setIsDismissed(true)}
              className="absolute top-2 right-2 p-1 text-slate-400 hover:text-slate-600 transition-colors z-10"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Clock className="w-16 h-16 text-[#0F7A5C]" />
            </div>
            
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0F7A5C] mb-1">
                  Next Jamat Near You
                </div>
                <h2 className="text-2xl font-black text-slate-900 capitalize">
                  {nextJamat.prayerName} <span className="text-[#D4AF37]">Prayer</span>
                </h2>
              </div>
              <div className="bg-[#0F7A5C] text-white px-3 py-1 rounded-full text-xs font-bold">
                {nextJamat.minutesRemaining}m left
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-[#0F7A5C]">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800">{nextJamat.mosque.name}</div>
                  <div className="text-xs text-slate-500">Starts at {nextJamat.time}</div>
                </div>
              </div>
              <button className="p-2 rounded-full bg-slate-50 text-slate-400 hover:text-[#0F7A5C] transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Radar;
