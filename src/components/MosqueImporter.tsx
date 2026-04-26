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
    <div className="fixed bottom-24 left-4 z-[99999] flex flex-col items-start gap-2">
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
        className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] transition-all border-4 border-white ${
          isImporting 
            ? 'bg-slate-300 text-slate-600 cursor-not-allowed' 
            : 'bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-110 active:scale-95'
        }`}
        title="Admin: Import OSM export.json"
      >
        {isImporting ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : result?.success ? (
          <Check className="w-6 h-6" />
        ) : (
          <Download className="w-6 h-6" />
        )}
        <div className="flex flex-col items-start leading-tight">
          <span className="text-sm font-bold uppercase tracking-wider">
            {isImporting ? 'Processing Database...' : result?.success ? `Success!` : 'Bulk Import Data'}
          </span>
          <span className="text-[10px] opacity-80 font-medium">
            {result?.success ? `${result.count} mosques added` : 'Select OSM .json file'}
          </span>
        </div>
      </button>

      {result?.success === false && (
        <div className="absolute bottom-full mb-2 flex items-center gap-2 px-3 py-1 bg-red-100 text-red-600 rounded-md text-xs whitespace-nowrap">
          <AlertCircle className="w-3 h-3" /> Failed to parse JSON
        </div>
      )}
    </div>
  );
};
