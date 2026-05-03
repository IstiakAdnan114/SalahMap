import React, { useState, useEffect, useRef } from 'react';
import Map from './components/Map';
import AddMosqueModal from './components/AddMosqueModal';
import { Mosque, COUNTRY_CENTER, COUNTRY_NAME, isInBounds, getDistance } from './types';
import { mosqueService } from './services/mosqueService';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { Search, Navigation, Plus, Eye, EyeOff, MapPin, MapPinned, RefreshCw, Cloud, CloudOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import MosquePopup from './components/MosquePopup';
import MosqueList from './components/MosqueList';
import SavedView from './components/SavedView';
import SettingsModal from './components/SettingsModal';
import { MosqueImporter } from './components/MosqueImporter';
import { Map as MapIcon, List, Bookmark, Settings } from 'lucide-react';

export default function App() {
  const [mapCenter, setMapCenter] = useState<[number, number]>(COUNTRY_CENTER);
  const [activeTab, setActiveTab] = useState<'map' | 'list' | 'saved'>('map');
  const [searchRadius, setSearchRadius] = useState(500);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mosques, setMosques] = useState<Mosque[]>([]);
  const [syncedDeletedIds, setSyncedDeletedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    console.log('Mosques state updated:', mosques.length);
  }, [mosques]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [geoStatus, setGeoStatus] = useState<'prompt' | 'granted' | 'denied' | 'error' | 'timeout'>('prompt');
  const [forceRecenter, setForceRecenter] = useState(0);
  const [lastFetchedLocation, setLastFetchedLocation] = useState<[number, number]>(COUNTRY_CENTER);
  const [lastFetchedRadius, setLastFetchedRadius] = useState(500);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const fetchIdRef = useRef(0);
  const [showLabels, setShowLabels] = useState(true);
  const [mosquesVisible, setMosquesVisible] = useState(true);
  const [selectedMosque, setSelectedMosque] = useState<ActiveMosque | null>(null);

  // Real-time Supabase Listener for Global Mosque Updates
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('public:mosques_global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mosques' }, (payload) => {
        console.log('Real-time mosque update:', payload.eventType, payload.new);
        
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newMosque = payload.new as Mosque;
          
          if (newMosque.is_deleted) {
            setMosques(prev => prev.filter(m => m.id !== newMosque.id));
            setSyncedDeletedIds(prev => new Set([...Array.from(prev), newMosque.id]));
            setSelectedMosque(curr => (curr?.id === newMosque.id ? null : curr));
          } else {
            setMosques(prev => {
              const index = prev.findIndex(m => m.id === newMosque.id);
              if (index !== -1) {
                const next = [...prev];
                next[index] = { ...next[index], ...newMosque };
                return next;
              } else {
                return [newMosque, ...prev];
              }
            });
            // Update selected mosque if it matches
            setSelectedMosque(curr => (curr?.id === newMosque.id ? { ...curr, ...newMosque } : curr));
          }
        } else if (payload.eventType === 'DELETE') {
          const id = (payload.old as any).id;
          setMosques(prev => prev.filter(m => m.id !== id));
          setSelectedMosque(curr => (curr?.id === id ? null : curr));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // Remove dependency to avoid re-subscribing, use functional updates

  type ActiveMosque = Mosque;

  const isAnyModalOpen = isAddModalOpen || !!selectedMosque;

  const geoOptions = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
  };

  useEffect(() => {
    // Get location
    const getLocation = () => {
      if (!navigator.geolocation) {
        setGeoStatus('error');
        fetchMosques(COUNTRY_CENTER[0], COUNTRY_CENTER[1]);
        return;
      }

      setLoading(true);
      
      // Set a fallback timeout in case geolocation hangs
      const timeoutId = setTimeout(() => {
        if (isInitialLoading) {
          console.log('Geolocation timeout, using fallback');
          setGeoStatus('timeout');
        }
      }, 10000);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          const { latitude, longitude } = position.coords;
          setGeoStatus('granted');
          setUserLocation([latitude, longitude]);
          
          // Only center on user if they are within the country
          if (isInBounds(latitude, longitude)) {
            setMapCenter([latitude, longitude]);
            setForceRecenter(prev => prev + 1);
          } else {
            console.log('User outside country, staying at country center');
          }
        },
        (error) => {
          clearTimeout(timeoutId);
          console.error('Geolocation error:', error);
          
          if (error.code === error.PERMISSION_DENIED) {
            setGeoStatus('denied');
          } else if (error.code === error.TIMEOUT) {
            setGeoStatus('timeout');
          } else {
            setGeoStatus('error');
          }
        },
        geoOptions
      );
    };

    getLocation();

    return () => {};
  }, []);

  // Fetch mosques when map moves significantly or radius changes
  useEffect(() => {
    const dist = getDistance(mapCenter[0], mapCenter[1], lastFetchedLocation[0], lastFetchedLocation[1]);
    
    // If moved more than 30% of the search radius, or if radius changed, or if this is the first fetch
    if (dist * 1000 > searchRadius * 0.3 || searchRadius !== lastFetchedRadius || isInitialLoading) {
      const timer = setTimeout(() => {
        fetchMosques(mapCenter[0], mapCenter[1], searchRadius);
      }, 300); // Small debounce for smoother movement
      return () => clearTimeout(timer);
    }
  }, [mapCenter, searchRadius]);

  const fetchMosques = async (lat: number, lon: number, radius: number = searchRadius, forceRefresh: boolean = false) => {
    const currentFetchId = ++fetchIdRef.current;
    setLastFetchedLocation([lat, lon]);
    setLastFetchedRadius(radius);
    
    if (isInitialLoading || forceRefresh) setLoading(true);
    setIsSyncing(true);
    
    // Reset mosques for the new location to avoid confusion, 
    // but we'll fill them back in incrementally
    if (!forceRefresh) setMosques([]);

    const updateMosques = (newMosques: Mosque[]) => {
      if (currentFetchId !== fetchIdRef.current) return;
      
      // Update our session-level blacklist with any deleted IDs found from Supabase
      const deletedInBatch = newMosques.filter(m => m.is_deleted).map(m => m.id);
      if (deletedInBatch.length > 0) {
        setSyncedDeletedIds(prev => {
          const next = new Set(prev);
          deletedInBatch.forEach(id => next.add(id));
          return next;
        });
      }

      setMosques(prev => {
        const localRemovedIds = JSON.parse(localStorage.getItem('mosque_finder_removed_ids') || '[]');
        
        // Strategy: We want LATEST data to win.
        // We put newMosques (fetched from DB/OSM) first so they overwrite older data,
        // BUT we must be careful not to overwrite a RECENT local edit that hasn't synced yet.
        // For now, let's stick to: new fetched data wins over current state for de-duplication.
        const combined = [...newMosques, ...prev];
        
        const filtered = combined.filter((m, i, a) => {
          if (localRemovedIds.includes(m.id)) return false;
          if (m.is_deleted) return false;
          if (syncedDeletedIds.has(m.id) || deletedInBatch.includes(m.id)) return false;

          // De-duplication: pick the first one found in combined array
          return a.findIndex(t => t.id === m.id) === i;
        });

        return filtered.filter(m => {
          const dist = getDistance(lat, lon, m.latitude, m.longitude);
          return dist * 1000 <= radius;
        });
      });
    };

    try {
      // 0. Instant search from Master List (Your "extra file" idea)
      if (!forceRefresh) {
        const masterResults = mosqueService.searchMasterList(lat, lon, radius);
        if (masterResults.length > 0) {
          updateMosques(masterResults);
          setLoading(false);
          setIsInitialLoading(false);
        }
      }

      // 1. Local mosques (Instant)
      const localPromise = forceRefresh ? Promise.resolve() : mosqueService.getLocalMosques().then(updateMosques);

      // 2. Supabase mosques (Fast)
      const supabasePromise = (isSupabaseConfigured && !forceRefresh)
        ? supabase
          .from('mosques')
          .select('*')
          .gte('latitude', lat - 0.1)
          .lte('latitude', lat + 0.1)
          .gte('longitude', lon - 0.1)
          .lte('longitude', lon + 0.1)
          .then(result => {
            if (result.data) updateMosques(result.data);
          })
        : Promise.resolve();

      // 3. OSM mosques (Only if forced, because it is slow)
      const osmPromise = (forceRefresh)
        ? mosqueService.fetchNearbyFromOSM(lat, lon, radius, forceRefresh)
            .then(updateMosques)
        : Promise.resolve();

      // Hide initial loading screen as soon as local or supabase finish
      // or after a short timeout (1s) to keep the app responsive
      if (!forceRefresh) {
        await Promise.race([
          Promise.all([localPromise, supabasePromise]),
          new Promise(resolve => setTimeout(resolve, 1000))
        ]);
      }
      
      if (currentFetchId === fetchIdRef.current) {
        setLoading(false);
        setIsInitialLoading(false);
      }

      // Wait for all remote fetches to complete to stop the syncing indicator
      await Promise.allSettled([supabasePromise, osmPromise]);
      if (currentFetchId === fetchIdRef.current) {
        setIsSyncing(false);
      }
      
    } catch (err) {
      console.error('Fetch mosques error:', err);
      if (currentFetchId === fetchIdRef.current) {
        setLoading(false);
        setIsInitialLoading(false);
        setIsSyncing(false);
      }
    }
  };

  const [isLocating, setIsLocating] = useState(false);

  const handleRecenter = () => {
    if (navigator.geolocation) {
      setIsLocating(true);
      
      // Use watchPosition briefly to get a more accurate lock
      const id = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          console.log(`Location found with accuracy: ${accuracy}m`);
          
          setGeoStatus('granted');
          setUserLocation([latitude, longitude]);
          setMapCenter([latitude, longitude]);
          setForceRecenter(prev => prev + 1);
          
          // If accuracy is good enough (e.g. < 20m) or after a few seconds, we stop
          if (accuracy < 20) {
            navigator.geolocation.clearWatch(id);
            setIsLocating(false);
          }
        },
        (error) => {
          console.error('Recenter error:', error);
          setIsLocating(false);
          if (error.code === error.PERMISSION_DENIED) setGeoStatus('denied');
          if (error.code === error.TIMEOUT) setGeoStatus('timeout');
          navigator.geolocation.clearWatch(id);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000
        }
      );

      // Safety timeout to stop watching
      setTimeout(() => {
        navigator.geolocation.clearWatch(id);
        setIsLocating(false);
      }, 8000);
    }
  };

  const handleToggleMosques = () => {
    if (!mosquesVisible) {
      setMosquesVisible(true);
      // Ensure we have data for the current area
      fetchMosques(mapCenter[0], mapCenter[1], searchRadius);
    } else {
      setMosquesVisible(false);
    }
  };
  const handleAddMosque = async (newMosque: Partial<Mosque>) => {
    const { isInBounds } = await import('./types');
    if (!isInBounds(newMosque.latitude!, newMosque.longitude!)) {
      alert(`Sorry, this app is currently restricted to ${COUNTRY_NAME} only.`);
      return;
    }

    const mosqueData = {
      name: newMosque.name || 'New Mosque',
      address: newMosque.address || 'Address unknown',
      latitude: newMosque.latitude!,
      longitude: newMosque.longitude!,
    };

    try {
      const savedMosque = await mosqueService.createMosque(mosqueData);
      setMosques(prev => [savedMosque, ...prev]);
    } catch (error) {
      console.error('Error adding mosque:', error);
      alert('Failed to add mosque. Please try again.');
    }
  };

  const handleDeleteMosque = async (id: string) => {
    try {
      const fullMosque = mosques.find(m => m.id === id) || (selectedMosque?.id === id ? selectedMosque : null);
      // Optimistically add to shared session blacklist
      setSyncedDeletedIds(prev => new Set([...Array.from(prev), id]));
      await mosqueService.deleteMosque(id, fullMosque || undefined);
      setMosques(prev => prev.filter(m => m.id !== id));
    } catch (error) {
      console.error('Error deleting mosque:', error);
      alert('Failed to delete mosque.');
    }
  };

  const handleUpdateMosque = async (id: string, updates: Partial<Mosque>) => {
    // 1. Calculate the updated object using the latest available data
    const current = mosques.find(m => m.id === id) || (selectedMosque?.id === id ? selectedMosque : null);
    if (!current) return;
    
    const fullyUpdated = { ...current, ...updates };

    // 2. Optimistic update in UI
    setMosques(prev => {
      const index = prev.findIndex(m => m.id === id);
      if (index !== -1) {
        const next = [...prev];
        next[index] = fullyUpdated;
        return next;
      }
      return [fullyUpdated, ...prev];
    });

    if (selectedMosque && selectedMosque.id === id) {
      setSelectedMosque(fullyUpdated);
    }

    try {
      // 3. Persist to database
      const result = await mosqueService.updateMosque(id, updates);
      
      // If we got a result (successful sync), update again with any server-side defaults
      if (result) {
        setMosques(prev => prev.map(m => m.id === id ? { ...m, ...result } : m));
        if (selectedMosque && selectedMosque.id === id) {
          setSelectedMosque(curr => curr ? { ...curr, ...result } : null);
        }
      }
    } catch (error) {
      console.error('Failed to persist mosque update:', error);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=bd`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        const newLat = parseFloat(lat);
        const newLon = parseFloat(lon);
        setMapCenter([newLat, newLon]);
        setForceRecenter(prev => prev + 1);
      }
    } catch (error) {
      console.error('Search error:', error);
    }
    setLoading(false);
  };

  return (
    <div className="h-full w-full bg-[#F8F9FA] overflow-hidden flex flex-col font-sans">
      {/* Header / Search Bar */}
      <div className="absolute top-0 left-0 right-0 z-[700] p-4 pt-[calc(1rem+env(safe-area-inset-top))] pointer-events-none">
        <form onSubmit={handleSearch} className="max-w-md mx-auto flex gap-2 pointer-events-auto">
          <div className="flex-1 bg-white rounded-2xl shadow-xl flex items-center px-4 py-3 border border-slate-100">
            <Search className="w-5 h-5 text-slate-400 mr-3" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search city or area..." 
              className="bg-transparent border-none outline-none text-slate-800 w-full font-medium"
            />
            <button
              type="submit"
              className="p-1 hover:bg-slate-50 rounded-lg transition-colors text-[#0F7A5C]"
              title="Search"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>

      {/* Geolocation Status Banner */}
      <AnimatePresence>
        {!isSupabaseConfigured && !isAnyModalOpen && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="absolute top-[calc(5rem+env(safe-area-inset-top))] left-4 right-4 z-[400] pointer-events-none"
          >
            <div className="max-w-md mx-auto bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-lg flex items-center gap-3 pointer-events-auto">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                <CloudOff className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">Local Mode Active</p>
                <p className="text-[10px] text-slate-500 font-medium">
                  Database keys are missing on this device. Changes will not sync.
                  <button 
                    onClick={() => alert("To fix this:\n1. Open Vercel/Netlify Dashboard\n2. Go to Settings > Environment Variables\n3. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY")}
                    className="ml-2 text-[#0F7A5C] underline font-bold"
                  >
                    How to fix?
                  </button>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-slate-400"></div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {geoStatus !== 'granted' && geoStatus !== 'prompt' && !isAnyModalOpen && isSupabaseConfigured && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="absolute top-[calc(5rem+env(safe-area-inset-top))] left-4 right-4 z-[400] pointer-events-none"
          >
            <div className="max-w-md mx-auto bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-lg flex items-center gap-3 pointer-events-auto">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <Navigation className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-900">
                  {geoStatus === 'denied' ? 'Location Access Denied' : 
                   geoStatus === 'timeout' ? 'Location Timeout' : 'Location Error'}
                </p>
                <p className="text-[10px] text-amber-700">
                  {geoStatus === 'denied' ? 'Please enable GPS for better results. Using fallback location.' : 
                   'We couldn\'t get your precise location. Try searching manually.'}
                </p>
              </div>
              <button 
                onClick={() => setGeoStatus('prompt')}
                className="text-amber-400 hover:text-amber-600"
              >
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Syncing Indicator */}
      <AnimatePresence>
        {isSyncing && !loading && !isAnyModalOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-[600] pointer-events-none"
          >
            <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg border border-slate-100 flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-[#0F7A5C] border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Updating...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className={`flex-1 relative ${isAddModalOpen ? 'z-[550]' : 'z-0'} overflow-hidden`}>
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'map' ? (
            <motion.div
              key="map"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 flex flex-col"
            >
              <Map 
                center={mapCenter} 
                userLocation={userLocation}
                mosques={mosquesVisible ? mosques : []} 
                showLabels={showLabels}
                onMosqueSelect={(m) => setSelectedMosque(m)} 
                onCenterChange={(newCenter) => setMapCenter(newCenter)}
                onDeleteMosque={handleDeleteMosque}
                forceRecenter={forceRecenter}
                isAdding={isAddModalOpen}
              />

              {/* Map Target Indicator (Vibrant) */}
              {!selectedMosque && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[800]">
                  <div className="relative w-12 h-12 flex items-center justify-center">
                    {/* Pulsing Ring */}
                    <div className={`absolute w-full h-full rounded-full border-2 animate-pulse transition-colors ${isAddModalOpen ? 'border-amber-400/40' : 'border-emerald-400/40'}`}></div>
                    
                    {/* Crosshair Lines */}
                    <div className={`absolute w-full h-[2px] transition-colors ${isAddModalOpen ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                    <div className={`absolute h-full w-[2px] transition-colors ${isAddModalOpen ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                    
                    {/* Center Dot */}
                    <div className={`w-3 h-3 rounded-full border-2 border-white shadow-lg transition-colors ${isAddModalOpen ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>

                    <AnimatePresence>
                      {isAddModalOpen && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute bottom-16 bg-amber-500 text-white text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest whitespace-nowrap shadow-xl border-2 border-white"
                        >
                          Pin Mosque Here
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
              
              <AnimatePresence>
                {!isAnyModalOpen && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="absolute bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-10 flex flex-col gap-3 items-end"
                  >
                    <div className="bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-slate-100 text-[10px] font-mono text-slate-500 mb-1">
                      {mapCenter[0].toFixed(4)}, {mapCenter[1].toFixed(4)}
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={handleToggleMosques}
                      className={`h-12 px-4 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-100 font-bold text-sm transition-all ${
                        mosquesVisible ? 'bg-[#0F7A5C] text-white' : 'bg-white text-slate-600'
                      }`}
                      title={mosquesVisible ? "Hide Mosques" : "Show Mosques"}
                    >
                      {loading ? (
                        <div className={`w-5 h-5 border-2 ${mosquesVisible ? 'border-white' : 'border-[#0F7A5C]'} border-t-transparent rounded-full animate-spin`} />
                      ) : (
                        mosquesVisible ? <MapPinned className="w-5 h-5" /> : <MapPin className="w-5 h-5" />
                      )}
                      {mosquesVisible ? 'Hide Mosques' : 'Show Mosques'}
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setShowLabels(!showLabels)}
                      className={`h-12 px-4 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-100 font-bold text-sm transition-all ${
                        showLabels ? 'bg-[#0F7A5C] text-white' : 'bg-white text-slate-600'
                      }`}
                      title={showLabels ? "Hide Labels" : "Show Labels"}
                    >
                      {showLabels ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      {showLabels ? 'Hide Labels' : 'Show Labels'}
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => fetchMosques(mapCenter[0], mapCenter[1], searchRadius, true)}
                      disabled={isSyncing}
                      className={`h-12 px-4 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-100 font-bold text-sm transition-all ${
                        isSyncing ? 'bg-slate-50 text-slate-400' : 'bg-white text-[#0F7A5C]'
                      }`}
                      title="Sync from Web (Overpass API)"
                    >
                      <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? 'Syncing...' : 'Sync Web Data'}
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={handleRecenter}
                      disabled={isLocating}
                      className={`h-12 px-4 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-100 font-bold text-sm transition-all ${
                        isLocating ? 'bg-slate-50 text-slate-400' : 'bg-white text-[#0F7A5C]'
                      }`}
                    >
                      <Navigation className={`w-5 h-5 ${isLocating ? 'animate-pulse' : ''}`} />
                      {isLocating ? 'Locating...' : 'Locate Me'}
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setIsAddModalOpen(true)}
                      className="w-12 h-12 bg-[#0F7A5C] rounded-2xl shadow-xl flex items-center justify-center text-white"
                      title="Add Mosque"
                    >
                      <Plus className="w-6 h-6" />
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : activeTab === 'list' ? (
            <motion.div
              key="list"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 flex flex-col"
            >
              <MosqueList 
                mosques={mosques} 
                mapCenter={mapCenter} 
                searchRadius={searchRadius}
                onBack={() => setActiveTab('map')}
                onSelect={(m) => {
                  setMapCenter([m.latitude, m.longitude]);
                  setForceRecenter(prev => prev + 1);
                  setActiveTab('map');
                }} 
              />
            </motion.div>
          ) : (
            <motion.div
              key="saved"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 flex flex-col"
            >
              <SavedView onSelectMosque={(m) => {
                setMapCenter([m.latitude, m.longitude]);
                setForceRecenter(prev => prev + 1);
                setActiveTab('map');
                setSelectedMosque(m);
              }} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Navigation (Mobile) */}
      <div className="bg-white border-t border-slate-100 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex justify-between items-center z-[700] shrink-0">
        <button 
          onClick={() => setActiveTab('map')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'map' ? 'text-[#0F7A5C]' : 'text-slate-400'}`}
        >
          <div className={`w-1.5 h-1.5 rounded-full transition-all ${activeTab === 'map' ? 'bg-[#0F7A5C] scale-100' : 'bg-transparent scale-0'}`}></div>
          <MapIcon className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Map</span>
        </button>
        <button 
          onClick={() => setActiveTab('list')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'list' ? 'text-[#0F7A5C]' : 'text-slate-400'}`}
        >
          <div className={`w-1.5 h-1.5 rounded-full transition-all ${activeTab === 'list' ? 'bg-[#0F7A5C] scale-100' : 'bg-transparent scale-0'}`}></div>
          <List className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-bold uppercase tracking-widest">List</span>
        </button>
        <button 
          onClick={() => setActiveTab('saved')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'saved' ? 'text-[#0F7A5C]' : 'text-slate-400'}`}
        >
          <div className={`w-1.5 h-1.5 rounded-full transition-all ${activeTab === 'saved' ? 'bg-[#0F7A5C] scale-100' : 'bg-transparent scale-0'}`}></div>
          <Bookmark className={`w-5 h-5 mb-0.5 ${activeTab === 'saved' ? 'fill-current' : ''}`} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Saved</span>
        </button>
        <button 
          onClick={() => setIsSettingsModalOpen(true)}
          className={`flex flex-col items-center gap-1 transition-colors ${isSettingsModalOpen ? 'text-[#0F7A5C]' : 'text-slate-400'}`}
        >
          <div className={`w-1.5 h-1.5 rounded-full transition-all ${isSettingsModalOpen ? 'bg-[#0F7A5C] scale-100' : 'bg-transparent scale-0'}`}></div>
          <Settings className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Settings</span>
        </button>
      </div>

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        radius={searchRadius}
        onRadiusChange={(newRadius) => {
          setSearchRadius(newRadius);
        }}
      />

      {selectedMosque && (
        <MosquePopup 
          mosque={selectedMosque} 
          onClose={() => setSelectedMosque(null)}
          onDelete={handleDeleteMosque}
          onUpdate={handleUpdateMosque}
        />
      )}

      <AddMosqueModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        userLocation={mapCenter}
        onAdd={handleAddMosque}
      />
      
      <MosqueImporter />

      {loading && mosques.length === 0 && (
        <motion.div 
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[1000] bg-white flex flex-col items-center justify-center p-8 text-center"
        >
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center"
          >
            <div className="w-24 h-24 bg-[#0F7A5C] rounded-3xl shadow-2xl shadow-emerald-200 flex items-center justify-center mb-8 relative">
              <MapPinned className="w-12 h-12 text-white" />
              <div className="absolute inset-0 rounded-3xl border-4 border-white/20 animate-ping opacity-20"></div>
            </div>
            
            <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">SalahMap</h1>
            <p className="text-slate-400 font-medium max-w-xs mb-12">Connecting the Ummah to the nearest Masjid</p>
          </motion.div>

          <div className="flex flex-col items-center gap-6">
            <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-full border border-slate-100">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-[#0F7A5C] border-t-transparent rounded-full"
              />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Locating Mosques</span>
            </div>

            <button 
              onClick={() => setLoading(false)}
              className="px-8 py-3 bg-white text-slate-400 rounded-2xl font-bold text-xs uppercase tracking-widest border border-slate-100 hover:bg-slate-50 hover:text-slate-600 transition-all active:scale-95"
            >
              Skip to Map
            </button>
          </div>
          
          <div className="absolute bottom-12 left-0 right-0">
            <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.4em]">Community Driven</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
