import React, { useState, useEffect } from 'react';
import { Mosque } from '../types';
import { mosqueService } from '../services/mosqueService';
import { Bookmark, MapPin, ChevronRight, Search } from 'lucide-react';
import { motion } from 'motion/react';

interface SavedViewProps {
  onSelectMosque: (mosque: Mosque) => void;
}

const SavedView: React.FC<SavedViewProps> = ({ onSelectMosque }) => {
  const [savedMosques, setSavedMosques] = useState<Mosque[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSaved();
  }, []);

  const loadSaved = async () => {
    setLoading(true);
    const favorites = await mosqueService.getFavorites();
    setSavedMosques(favorites);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-[#0F7A5C] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (savedMosques.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 text-center">
        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
          <Bookmark className="w-10 h-10 text-[#0F7A5C] opacity-20" />
        </div>
        <h3 className="text-xl font-black text-slate-900 mb-2">No Saved Mosques</h3>
        <p className="text-slate-500 max-w-xs">
          Your favorite mosques will appear here. Tap the heart icon on any mosque to save it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-50 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[calc(5rem+env(safe-area-inset-top))]">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black text-slate-900">Saved Mosques</h2>
          <span className="bg-[#0F7A5C]/10 text-[#0F7A5C] text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
            {savedMosques.length} {savedMosques.length === 1 ? 'Mosque' : 'Mosques'}
          </span>
        </div>

        <div className="grid gap-4">
          {savedMosques.map((mosque) => (
            <motion.button
              key={mosque.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => onSelectMosque(mosque)}
              className="w-full bg-white p-5 rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-4 text-left hover:border-emerald-200 transition-all hover:shadow-md group"
            >
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-[#0F7A5C] transition-colors">
                <Bookmark className="w-6 h-6 text-[#0F7A5C] group-hover:text-white transition-colors" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h4 className="font-black text-slate-900 truncate">{mosque.name}</h4>
                <div className="flex items-center text-slate-400 mt-1">
                  <MapPin className="w-3.5 h-3.5 mr-1 shrink-0" />
                  <p className="text-xs font-medium truncate">{mosque.address}</p>
                </div>
              </div>

              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#0F7A5C] transition-colors" />
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SavedView;
