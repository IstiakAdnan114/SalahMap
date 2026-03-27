import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MapPin, Check } from 'lucide-react';
import { Mosque } from '../types';

interface AddMosqueModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation: [number, number];
  onAdd: (mosque: Partial<Mosque>) => void;
}

const AddMosqueModal: React.FC<AddMosqueModalProps> = ({ isOpen, onClose, userLocation, onAdd }) => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call or handle logic
    onAdd({
      name,
      address,
      latitude: userLocation[0],
      longitude: userLocation[1],
    });
    
    setIsSubmitting(false);
    onClose();
    setName('');
    setAddress('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[650] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/10"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="relative w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[85vh] pointer-events-auto"
          >
            <div className="flex justify-between items-center p-6 pb-2 shrink-0">
              <h2 className="text-2xl font-black text-slate-900">Add Mosque</h2>
              <button 
                onClick={onClose}
                className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 pt-2">
              <form onSubmit={handleSubmit} className="space-y-6 pb-6">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Mosque Name</label>
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Masjid Al-Haram"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-4 text-slate-800 font-medium focus:ring-2 focus:ring-[#0F7A5C] outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Address / Location Description</label>
                  <textarea
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street name, area, or landmarks..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-4 text-slate-800 font-medium focus:ring-2 focus:ring-[#0F7A5C] outline-none transition-all h-24 resize-none"
                  />
                </div>

                <div className="bg-emerald-50 rounded-2xl p-4 flex items-start gap-3 border border-emerald-100 relative">
                  <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-emerald-900 uppercase tracking-tight">Current Location</p>
                    <p className="text-[10px] text-emerald-700 mt-0.5">
                      Lat: {userLocation[0].toFixed(4)}, Lon: {userLocation[1].toFixed(4)}
                    </p>
                    <p className="text-[10px] text-emerald-600 mt-1">The mosque will be pinned here.</p>
                  </div>
                </div>

                <button
                  disabled={isSubmitting}
                  type="submit"
                  className="w-full bg-[#0F7A5C] text-white rounded-2xl py-4 font-bold text-lg shadow-lg shadow-emerald-900/20 hover:bg-[#0D6B50] transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-6 h-6" />
                      Confirm & Add
                    </>
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AddMosqueModal;
