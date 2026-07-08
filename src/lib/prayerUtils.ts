import { PrayerTimes } from '../types';

export interface PrayerInfo {
  name: string;
  time: string;
  minutes: number;
}

export interface NextPrevPrayerResult {
  next: {
    name: string;
    time: string;
    formattedTime: string;
  } | null;
  prev: {
    name: string;
    time: string;
    formattedTime: string;
    minutesAgo: number;
    formattedMinutesAgo: string;
    isFresh: boolean; // less than 30 mins ago
  } | null;
}

export const formatTime12h = (time24: string | null): string => {
  if (!time24) return '--:--';
  const [hoursStr, minutesStr] = time24.split(':');
  let hours = parseInt(hoursStr);
  const minutes = minutesStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${period}`;
};

export const timeToMinutes = (timeStr: string | null): number => {
  if (!timeStr) return 0;
  
  // Handle space separated like "05:30 AM" or raw "05:30"
  const [time, period] = timeStr.trim().split(' ');
  const timeParts = time.split(':');
  if (timeParts.length < 2) return 0;
  
  let [hours, minutes] = timeParts.map(Number);
  
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  
  return hours * 60 + minutes;
};

export const getNextAndPrevPrayer = (times: PrayerTimes | null): NextPrevPrayerResult => {
  if (!times) return { next: null, prev: null };

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const isFriday = now.getDay() === 5;

  const prayers: PrayerInfo[] = [
    { name: 'Fajr', time: times.fajr, minutes: timeToMinutes(times.fajr) },
    ...(isFriday && times.jumua ? [{ name: "Jumu'ah", time: times.jumua, minutes: timeToMinutes(times.jumua) }] : []),
    { name: 'Dhuhr', time: times.dhuhr, minutes: timeToMinutes(times.dhuhr) },
    { name: 'Asr', time: times.asr, minutes: timeToMinutes(times.asr) },
    { name: 'Maghrib', time: times.maghrib, minutes: timeToMinutes(times.maghrib) },
    { name: 'Isha', time: times.isha, minutes: timeToMinutes(times.isha) },
  ].filter(p => !!p.time); // Filter out any empty/null prayer times

  if (prayers.length === 0) {
    return { next: null, prev: null };
  }

  // Find next prayer index
  let nextIndex = prayers.findIndex(p => p.minutes > currentMinutes);
  let nextPrayer: PrayerInfo;
  let prevPrayer: PrayerInfo;

  if (nextIndex !== -1) {
    nextPrayer = prayers[nextIndex];
    if (nextIndex > 0) {
      prevPrayer = prayers[nextIndex - 1];
    } else {
      prevPrayer = prayers[prayers.length - 1];
    }
  } else {
    nextPrayer = prayers[0];
    prevPrayer = prayers[prayers.length - 1];
  }

  // Calculate minutes ago for the previous prayer
  let minutesAgo = 0;
  if (prevPrayer.minutes <= currentMinutes) {
    minutesAgo = currentMinutes - prevPrayer.minutes;
  } else {
    // If the previous prayer occurred yesterday
    minutesAgo = (24 * 60 - prevPrayer.minutes) + currentMinutes;
  }

  // Format the minutes ago string
  let formattedMinutesAgo = '';
  if (minutesAgo < 60) {
    formattedMinutesAgo = `${minutesAgo} min${minutesAgo === 1 ? '' : 's'} ago`;
  } else {
    const hrs = Math.floor(minutesAgo / 60);
    const mins = minutesAgo % 60;
    if (mins === 0) {
      formattedMinutesAgo = `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
    } else {
      formattedMinutesAgo = `${hrs} hr${hrs === 1 ? '' : 's'} ${mins} min${mins === 1 ? '' : 's'} ago`;
    }
  }

  return {
    next: {
      name: nextPrayer.name,
      time: nextPrayer.time,
      formattedTime: formatTime12h(nextPrayer.time),
    },
    prev: {
      name: prevPrayer.name,
      time: prevPrayer.time,
      formattedTime: formatTime12h(prevPrayer.time),
      minutesAgo,
      formattedMinutesAgo,
      isFresh: minutesAgo < 30,
    }
  };
};

export type PrayerStatus = 'passed' | 'just_started' | 'upcoming';

export interface PrayerStatusInfo {
  status: PrayerStatus;
  badgeText?: string;
  badgeClass: string;
}

export const getPrayerStatus = (
  label: string, 
  timeStr: string | null
): PrayerStatusInfo => {
  if (!timeStr) {
    return { status: 'passed', badgeClass: 'bg-slate-100 text-slate-400' };
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const isFriday = now.getDay() === 5;

  // Handle Jumua differently if today is not Friday
  if (label.toLowerCase() === 'jumua' && !isFriday) {
    return { 
      status: 'passed', 
      badgeText: 'Friday Only', 
      badgeClass: 'bg-slate-100 text-slate-400' 
    };
  }

  const prayerMinutes = timeToMinutes(timeStr);

  if (prayerMinutes > currentMinutes) {
    return {
      status: 'upcoming',
      badgeText: 'Upcoming',
      badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    };
  } else {
    const diff = currentMinutes - prayerMinutes;
    if (diff >= 0 && diff <= 15) {
      return {
        status: 'just_started',
        badgeText: `Started ${diff} min${diff === 1 ? '' : 's'} ago — you may still catch it!`,
        badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
      };
    } else {
      return {
        status: 'passed',
        badgeText: 'Already passed',
        badgeClass: 'bg-slate-100 text-slate-400'
      };
    }
  }
};
