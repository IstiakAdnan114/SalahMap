import React, { useState, useEffect } from 'react';
import { Mosque, PrayerTimes } from '../types';
import { mosqueService } from '../services/mosqueService';
import { ThumbsUp, ThumbsDown, Clock, MapPin, CheckCircle2, AlertCircle, Trash2, Save, X as CloseIcon } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';

interface MosquePopupProps {
  mosque: Mosque;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<Mosque>) => void;
}

const MosquePopup: React.FC<MosquePopupProps> = ({ mosque, onClose, onDelete, onUpdate }) => {
  const [times, setTimes] = useState<PrayerTimes | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  const [votingFor, setVotingFor] = useState<string | null>(null);
  
  // Name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(mosque.name);
  const [isSavingName, setIsSavingName] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    fajr: '',
    dhuhr: '',
    asr: '',
    maghrib: '',
    isha: ''
  });

  useEffect(() => {
    loadTimes();
    setEditedName(mosque.name);
    setIsEditingName(false);
  }, [mosque.id, mosque.name]);

  const loadTimes = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Ensure mosque exists in our DB if it's an OSM mosque
      await mosqueService.ensureMosqueExists(mosque);
      
      const data = await mosqueService.getPrayerTimes(mosque.id);
      setTimes(data);
      if (data) {
        const votes = await mosqueService.getUserVotes(mosque.id);
        const votesMap: Record<string, 'up' | 'down'> = {};
        votes.forEach(v => {
          votesMap[v.prayer_name] = v.vote_type as 'up' | 'down';
        });
        setUserVotes(votesMap);
      }
    } catch (err) {
      console.error('Error loading times:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (times) {
      setFormData({
        fajr: times.fajr,
        dhuhr: times.dhuhr,
        asr: times.asr,
        maghrib: times.maghrib,
        isha: times.isha
      });
    }
  }, [times]);

  const handleVote = async (prayerName: string, type: 'up' | 'down') => {
    if (!times?.id || votingFor) return;
    
    setVotingFor(prayerName);
    
    // Optimistic update for scores
    const scoreField = `${prayerName}_score` as keyof PrayerTimes;
    const upvotesField = `${prayerName}_upvotes` as keyof PrayerTimes;
    const downvotesField = `${prayerName}_downvotes` as keyof PrayerTimes;

    const oldScore = times[scoreField] as number;
    const oldUpvotes = (times[upvotesField] as number) || 0;
    const oldDownvotes = (times[downvotesField] as number) || 0;
    const currentVote = userVotes[prayerName];
    
    let diff = 0;
    let upDiff = 0;
    let downDiff = 0;
    let newVote: 'up' | 'down' | undefined = type;

    if (currentVote === type) {
      // Removing vote
      diff = type === 'up' ? -1 : 1;
      if (type === 'up') upDiff = -1; else downDiff = -1;
      newVote = undefined;
    } else if (currentVote) {
      // Changing vote (e.g. from up to down)
      diff = type === 'up' ? 2 : -2;
      if (type === 'up') { upDiff = 1; downDiff = -1; } else { upDiff = -1; downDiff = 1; }
    } else {
      // New vote
      diff = type === 'up' ? 1 : -1;
      if (type === 'up') upDiff = 1; else downDiff = 1;
    }
    
    // Update scores optimistically
    setTimes(prev => prev ? {
      ...prev,
      [scoreField]: ((prev[scoreField] as number) || 0) + diff,
      [upvotesField]: ((prev[upvotesField] as number) || 0) + upDiff,
      [downvotesField]: ((prev[downvotesField] as number) || 0) + downDiff
    } : null);

    // Update user votes optimistically
    setUserVotes(prev => {
      const next = { ...prev };
      if (newVote) {
        next[prayerName] = newVote;
      } else {
        delete next[prayerName];
      }
      return next;
    });

    try {
      const result = await mosqueService.vote(times.id, prayerName, type);
      
      // Update with exact values from server
      if (result) {
        setTimes(prev => prev ? {
          ...prev,
          [scoreField]: result.score,
          [upvotesField]: result.upvotes,
          [downvotesField]: result.downvotes
        } : null);
      }
    } catch (error) {
      console.error('Vote failed:', error);
      // Rollback on error
      setTimes(prev => prev ? {
        ...prev,
        [scoreField]: oldScore,
        [upvotesField]: oldUpvotes,
        [downvotesField]: oldDownvotes
      } : null);
      setUserVotes(prev => {
        const next = { ...prev };
        if (currentVote) {
          next[prayerName] = currentVote;
        } else {
          delete next[prayerName];
        }
        return next;
      });
    } finally {
      setVotingFor(null);
    }
  };

  const handleUpdateTimes = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await mosqueService.updatePrayerTimes({
        mosque_id: mosque.id,
        ...formData
      });
      setTimes(updated);
      setIsUpdating(false);
      // We don't need to call loadTimes() again because we have the updated data
      // but we might want to refresh votes if they were reset
      if (updated) {
        // Reset user votes locally for this set of times since they are new
        setUserVotes({});
      }
    } catch (error) {
      console.error(error);
      alert('Failed to update times. Please check your connection and try again.');
    }
  };

  const handleSaveName = async () => {
    if (!editedName.trim() || editedName === mosque.name) {
      setIsEditingName(false);
      return;
    }

    setIsSavingName(true);
    try {
      await mosqueService.updateMosque(mosque.id, { name: editedName });
      if (onUpdate) {
        onUpdate(mosque.id, { name: editedName });
      }
      setIsEditingName(false);
    } catch (error) {
      console.error('Error updating name:', error);
      alert('Failed to update mosque name');
    }
    setIsSavingName(false);
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = async () => {
    if (onDelete) {
      onDelete(mosque.id);
      onClose();
    }
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

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh]">
        {/* Fixed Header */}
        <div className="p-6 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex justify-between items-start">
            <div className="flex-1 pr-4">
              {isEditingName ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xl font-black text-[#0F7A5C] focus:ring-2 focus:ring-[#0F7A5C] outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') setIsEditingName(false);
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveName}
                      disabled={isSavingName}
                      className="text-[10px] font-bold uppercase tracking-widest bg-[#0F7A5C] text-white px-3 py-1 rounded-lg flex items-center gap-1"
                    >
                      {isSavingName ? 'Saving...' : <><CheckCircle2 className="w-3 h-3" /> Save</>}
                    </button>
                    <button
                      onClick={() => setIsEditingName(false)}
                      className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 px-3 py-1 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="group flex items-center gap-2">
                  <h3 
                    className="text-2xl font-black text-[#0F7A5C] leading-tight cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setIsEditingName(true)}
                  >
                    {mosque.name}
                  </h3>
                  <button 
                    onClick={() => setIsEditingName(true)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-[#0F7A5C] transition-all"
                    title="Edit Name"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="flex items-center text-sm text-slate-500 mt-2">
                <MapPin className="w-4 h-4 mr-1.5 text-slate-400" />
                <span className="line-clamp-1">{mosque.address}</span>
              </div>
            </div>
            <div className="flex gap-2">
              {!mosque.id.startsWith('osm-') && (
                <button 
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2.5 text-rose-500 hover:bg-rose-50 rounded-2xl transition-colors"
                  title="Delete Mosque"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              <button 
                onClick={onClose}
                className="p-2.5 text-slate-400 hover:bg-slate-100 rounded-2xl transition-colors"
              >
                <CloseIcon className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 pt-4 pb-12">
          {showDeleteConfirm ? (
            <div className="py-8 px-6 bg-rose-50 rounded-3xl border border-rose-100 text-center">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-rose-900 mb-2">Delete Mosque?</h4>
              <p className="text-sm text-rose-700 mb-6">This action cannot be undone. All prayer times and data will be lost.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 bg-white border border-rose-200 text-rose-700 rounded-xl text-sm font-bold"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDelete}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-200"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#0F7A5C]/20 border-t-[#0F7A5C] mb-4"></div>
              <p className="text-slate-500 font-medium">Loading times...</p>
            </div>
          ) : times ? (
            <div className="space-y-6 pb-4">
              <div className="grid grid-cols-1 gap-4">
                {[
                  { label: 'fajr', time: times.fajr, score: times.fajr_score || 0, up: times.fajr_upvotes || 0, down: times.fajr_downvotes || 0 },
                  { label: 'dhuhr', time: times.dhuhr, score: times.dhuhr_score || 0, up: times.dhuhr_upvotes || 0, down: times.dhuhr_downvotes || 0 },
                  { label: 'asr', time: times.asr, score: times.asr_score || 0, up: times.asr_upvotes || 0, down: times.asr_downvotes || 0 },
                  { label: 'maghrib', time: times.maghrib, score: times.maghrib_score || 0, up: times.maghrib_upvotes || 0, down: times.maghrib_downvotes || 0 },
                  { label: 'isha', time: times.isha, score: times.isha_score || 0, up: times.isha_upvotes || 0, down: times.isha_downvotes || 0 },
                ].map((p) => {
                  const total = p.up + p.down;
                  const confidence = total > 0 ? (p.up / total) * 100 : 50;
                  const isVerified = p.score >= 5;
                  const isDoubtful = p.score <= -3;

                  return (
                    <div key={p.label} className="bg-slate-50 p-5 rounded-3xl border border-slate-100 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100">
                            <Clock className="w-5 h-5 text-indigo-600" />
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-black mb-0.5">{p.label}</div>
                            <div className="text-xl font-black text-slate-800">{formatTime12h(p.time)}</div>
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex items-center gap-2">
                            {isVerified && (
                              <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500 text-white text-[9px] font-black rounded-lg shadow-lg shadow-emerald-100">
                                <CheckCircle2 className="w-3 h-3" />
                                VERIFIED
                              </div>
                            )}
                            {isDoubtful && (
                              <div className="flex items-center gap-1 px-2 py-1 bg-rose-500 text-white text-[9px] font-black rounded-lg shadow-lg shadow-rose-100">
                                <AlertCircle className="w-3 h-3" />
                                UNRELIABLE
                              </div>
                            )}
                            <div className={`text-[10px] font-black px-2 py-1 rounded-lg ${p.score >= 3 ? 'bg-emerald-100 text-emerald-700' : p.score <= -3 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>
                              {p.score > 0 ? `+${p.score}` : (p.score || 0)}
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold">
                            {p.up} Correct · {p.down} Incorrect
                          </div>
                        </div>
                      </div>

                      {/* Confidence Bar */}
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden mb-5">
                        <div 
                          className={`h-full transition-all duration-700 ease-out ${p.score >= 3 ? 'bg-emerald-500' : p.score <= -3 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                          style={{ width: `${confidence}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <button 
                          onClick={() => handleVote(p.label, 'up')}
                          disabled={votingFor !== null}
                          className={`flex-1 flex items-center justify-center gap-2 py-3 border rounded-2xl font-black text-xs transition-all active:scale-95 ${userVotes[p.label] === 'up' ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-white border-slate-200 text-emerald-600 hover:bg-emerald-50'} ${votingFor === p.label ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                          {votingFor === p.label ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <ThumbsUp className="w-4 h-4" />
                          )}
                          Correct
                        </button>
                        <button 
                          onClick={() => handleVote(p.label, 'down')}
                          disabled={votingFor !== null}
                          className={`flex-1 flex items-center justify-center gap-2 py-3 border rounded-2xl font-black text-xs transition-all active:scale-95 ${userVotes[p.label] === 'down' ? 'bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-200' : 'bg-white border-slate-200 text-rose-600 hover:bg-rose-50'} ${votingFor === p.label ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                          {votingFor === p.label ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <ThumbsDown className="w-4 h-4" />
                          )}
                          Incorrect
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button 
                  onClick={() => setIsUpdating(true)}
                  className="w-full flex items-center justify-center gap-3 py-4 bg-[#0F7A5C] text-white rounded-2xl hover:bg-[#0D6B50] transition-all text-sm font-black shadow-xl shadow-[#0F7A5C]/20 active:scale-[0.98]"
                >
                  <Clock className="w-5 h-5" />
                  Update All Prayer Times
                </button>
                
                <div className="flex items-center gap-2 mt-4 px-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="text-xs text-slate-500">
                    Last updated <span className="font-bold text-slate-700">{format(new Date(times.updated_at), 'MMM d, hh:mm a')}</span>
                  </div>
                </div>
              </div>

              {isUpdating && (
                <div className="mt-6 p-6 bg-slate-50 rounded-[32px] border border-slate-200 shadow-inner">
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">Update Prayer Times</h4>
                    <button onClick={() => setIsUpdating(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-white transition-all">
                      <CloseIcon className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <form onSubmit={handleUpdateTimes} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      {['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map((p) => (
                        <div key={p}>
                          <label 
                            htmlFor={`time-${p}`}
                            className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest"
                          >
                            {p}
                          </label>
                          <input
                            id={`time-${p}`}
                            type="time"
                            required
                            aria-label={`Set ${p} prayer time`}
                            value={(formData as any)[p]}
                            onChange={(e) => setFormData(prev => ({ ...prev, [p]: e.target.value }))}
                            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-base font-bold text-slate-700 focus:ring-4 focus:ring-[#0F7A5C]/10 focus:border-[#0F7A5C] outline-none transition-all shadow-sm"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-[#0F7A5C] text-white rounded-2xl py-4 font-black text-sm shadow-xl shadow-[#0F7A5C]/20 hover:bg-[#0D6B50] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4"
                    >
                      <Save className="w-5 h-5" />
                      Save Prayer Times
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Clock className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium mb-6">No prayer times reported yet.</p>
              <button 
                onClick={() => setIsUpdating(true)}
                className="w-full flex items-center justify-center gap-3 py-4 bg-[#0F7A5C] text-white rounded-2xl hover:bg-[#0D6B50] transition-all text-sm font-black shadow-xl shadow-[#0F7A5C]/20 active:scale-[0.98]"
              >
                <Clock className="w-5 h-5" />
                Add Prayer Times
              </button>

              {isUpdating && (
                <div className="mt-8 p-6 bg-white rounded-3xl border border-slate-200 shadow-inner text-left">
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">Add Prayer Times</h4>
                    <button onClick={() => setIsUpdating(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 transition-all">
                      <CloseIcon className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <form onSubmit={handleUpdateTimes} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      {['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map((p) => (
                        <div key={p}>
                          <label 
                            htmlFor={`add-time-${p}`}
                            className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest"
                          >
                            {p}
                          </label>
                          <input
                            id={`add-time-${p}`}
                            type="time"
                            required
                            value={(formData as any)[p]}
                            onChange={(e) => setFormData(prev => ({ ...prev, [p]: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-base font-bold text-slate-700 focus:ring-4 focus:ring-[#0F7A5C]/10 focus:border-[#0F7A5C] outline-none transition-all shadow-sm"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-[#0F7A5C] text-white rounded-2xl py-4 font-black text-sm shadow-xl shadow-[#0F7A5C]/20 hover:bg-[#0D6B50] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4"
                    >
                      <Save className="w-5 h-5" />
                      Save Prayer Times
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MosquePopup;
