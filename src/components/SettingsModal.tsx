import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Settings, Ruler, Info } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  radius: number;
  onRadiusChange: (radius: number) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, radius, onRadiusChange }) => {
  const radiusOptions = [
    { label: '500m', value: 500 },
    { label: '1km', value: 1000 },
    { label: '1.5km', value: 1500 },
    { label: '2km', value: 2000 },
    { label: '3km', value: 3000 },
    { label: '5km', value: 5000 },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[800] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="relative w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] pointer-events-auto"
          >
            <div className="flex justify-between items-center p-6 pb-2 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600">
                  <Settings className="w-5 h-5" />
                </div>
                <h2 className="text-2xl font-black text-slate-900">Settings</h2>
              </div>
              <button 
                onClick={onClose}
                className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-8 pb-[calc(3rem+env(safe-area-inset-bottom))]">
              {/* Search Radius Section */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Ruler className="w-4 h-4 text-[#0F7A5C]" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Search Radius</h3>
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  {radiusOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onRadiusChange(opt.value)}
                      className={`py-4 rounded-2xl font-bold text-sm transition-all border-2 ${
                        radius === opt.value
                          ? 'bg-[#0F7A5C] text-white border-[#0F7A5C] shadow-lg shadow-[#0F7A5C]/20'
                          : 'bg-white text-slate-600 border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-4 flex items-start gap-2">
                  <Info className="w-3 h-3 shrink-0 mt-0.5" />
                  Increasing the radius will show more mosques but might take longer to load and clutter the map.
                </p>
              </section>

              {/* About Section */}
              <section className="pt-6 border-t border-slate-50">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">About Mosque Finder</h3>
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    This app helps you find nearby mosques and accurate jamat times in Bangladesh. 
                    Data is sourced from OpenStreetMap and updated by the community.
                  </p>
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Developer</span>
                      <span className="text-[10px] font-bold text-slate-800">Md. Istiak Adnan</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Version</span>
                      <span className="text-[10px] font-bold text-slate-600">1.2.0</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;
