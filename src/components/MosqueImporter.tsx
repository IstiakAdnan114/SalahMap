import React, { useRef, useState } from 'react';
import { Download, Check, Loader2, AlertCircle } from 'lucide-react';
import { mosqueService } from '../services/mosqueService';

export const MosqueImporter: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{count: number, success: boolean} | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setResult(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          const count = await mosqueService.importOsmJson(json);
          setResult({ count, success: true });
        } catch (err) {
          console.error('Import failed:', err);
          setResult({ count: 0, success: false });
        } finally {
          setIsImporting(false);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      setIsImporting(false);
      setResult({ count: 0, success: false });
    }
  };

  return (
    <div className="fixed bottom-24 left-4 z-[9999]">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".json"
        className="hidden"
      />
      
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isImporting}
        className={`flex items-center gap-2 px-5 py-3 rounded-2xl shadow-2xl transition-all border-2 border-white ${
          isImporting 
            ? 'bg-slate-200 text-slate-500 cursor-not-allowed' 
            : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:scale-105 active:scale-95'
        }`}
        title="Admin: Import OSM export.json"
      >
        {isImporting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : result?.success ? (
          <Check className="w-4 h-4" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        <span className="text-sm font-medium">
          {isImporting ? 'Processing Database...' : result?.success ? `Synced ${result.count} Mosques!` : 'Bulk Import (OSM JSON)'}
        </span>
      </button>

      {result?.success === false && (
        <div className="absolute bottom-full mb-2 flex items-center gap-2 px-3 py-1 bg-red-100 text-red-600 rounded-md text-xs whitespace-nowrap">
          <AlertCircle className="w-3 h-3" /> Failed to parse JSON
        </div>
      )}
    </div>
  );
};
