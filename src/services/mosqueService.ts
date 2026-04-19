import { Mosque, PrayerTimes, getDistance } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const LOCAL_MOSQUES_KEY = 'mosque_finder_local_mosques';
const LOCAL_TIMES_KEY = 'mosque_finder_local_times';
const LOCAL_FAVORITES_KEY = 'mosque_finder_favorites';
const DEVICE_ID_KEY = 'mosque_finder_device_id';

const getDeviceId = () => {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  // Check if it's a valid UUID v4 format
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '');
  
  if (!id || !isUuid) {
    // Generate a valid UUID v4 for database compatibility
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};

// Simple in-memory cache for OSM results
const osmCache = new Map<string, { data: Mosque[], timestamp: number }>();

// Load cache from localStorage on initialization
try {
  const savedCache = localStorage.getItem('mosque_finder_osm_cache');
  if (savedCache) {
    const parsed = JSON.parse(savedCache);
    Object.entries(parsed).forEach(([key, value]: [string, any]) => {
      osmCache.set(key, value);
    });
  }
} catch (e) {
  console.error('Error loading OSM cache:', e);
}

const saveCacheToLocal = () => {
  try {
    const obj: Record<string, any> = {};
    osmCache.forEach((value, key) => {
      obj[key] = value;
    });
    localStorage.setItem('mosque_finder_osm_cache', JSON.stringify(obj));
  } catch (e) {
    console.error('Error saving OSM cache:', e);
  }
};

// Master List for all mosques encountered
let masterMosqueList: Mosque[] = [];
const MASTER_LIST_KEY = 'mosque_finder_master_list';

// Load master list from localStorage
try {
  const savedMaster = localStorage.getItem(MASTER_LIST_KEY);
  if (savedMaster) {
    masterMosqueList = JSON.parse(savedMaster);
  }
} catch (e) {
  console.error('Error loading Master List:', e);
}

const saveMasterList = () => {
  try {
    // Keep only unique mosques by ID
    const unique = masterMosqueList.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
    masterMosqueList = unique;
    localStorage.setItem(MASTER_LIST_KEY, JSON.stringify(masterMosqueList));
  } catch (e) {
    console.error('Error saving Master List:', e);
  }
};

export const mosqueService = {
  // New method to search the local master list instantly
  searchMasterList(lat: number, lon: number, radiusMeters: number): Mosque[] {
    return masterMosqueList.filter(m => {
      const dist = getDistance(lat, lon, m.latitude, m.longitude);
      return dist * 1000 <= radiusMeters;
    });
  },

  // Add mosques to the master list
  addToMasterList(mosques: Mosque[]) {
    masterMosqueList = [...masterMosqueList, ...mosques];
    saveMasterList();
  },

  async fetchNearbyFromOSM(lat: number, lon: number, radius: number = 500, forceRefresh: boolean = false): Promise<Mosque[]> {
    // Round coordinates to ~50m to increase cache hits (0.0005 is roughly 50m)
    const cacheKey = `${lat.toFixed(4)}_${lon.toFixed(4)}_${radius}`;
    
    if (!forceRefresh) {
      // 1. Check permanent cache
      const cached = osmCache.get(cacheKey);
      if (cached) {
        console.log('Returning cached OSM data (Permanent)');
        return cached.data;
      }

      // 2. Check if master list already has 5+ mosques in this area
      // This fulfills the requirement: "Skip the OSM call entirely if the master list already has 5 or more mosques"
      const localResults = this.searchMasterList(lat, lon, radius);
      if (localResults.length >= 5) {
        console.log('Skipping OSM call: Master list already has 5+ mosques');
        // Still mark as cached so we don't keep checking this area
        osmCache.set(cacheKey, { data: localResults, timestamp: Date.now() });
        saveCacheToLocal();
        return localResults;
      }
    }

    // Faster query: limit to nodes and ways (relations are rare for mosques and slow to process)
    // Also use a shorter timeout
    const query = `
      [out:json][timeout:5];
      (
        node["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${lat},${lon});
        way["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${lat},${lon});
      );
      out center;
    `;
    
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.osm.ch/api/interpreter'
    ];

    const fetchWithRetry = async (endpointIndex: number, retryCount: number): Promise<Mosque[]> => {
      const url = `${endpoints[endpointIndex]}?data=${encodeURIComponent(query)}`;
      
      try {
        const response = await fetch(url);
        
        if (response.status === 504 || response.status === 429) {
          if (retryCount < 2) {
            const nextIndex = (endpointIndex + 1) % endpoints.length;
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return fetchWithRetry(nextIndex, retryCount + 1);
          }
        }

        if (!response.ok) {
          throw new Error(`Overpass API responded with status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Overpass API returned non-JSON response');
        }

        const data = await response.json();
        console.log(`OSM API returned ${data.elements?.length || 0} elements`);
        
        if (!data.elements) {
          return [];
        }

        const mosques = data.elements.map((el: any) => ({
          id: `osm-${el.id}`,
          name: el.tags?.name || 'Unnamed Mosque',
          latitude: el.lat || el.center?.lat,
          longitude: el.lon || el.center?.lon,
          address: el.tags?.['addr:full'] || el.tags?.['addr:street'] || 'Address unknown',
        })).filter((m: Mosque) => m.latitude && m.longitude);

        // Cache the result
        osmCache.set(cacheKey, { data: mosques, timestamp: Date.now() });
        saveCacheToLocal();
        
        // Add to master list
        this.addToMasterList(mosques);
        
        return mosques;
      } catch (error) {
        if (retryCount < 2) {
          const nextIndex = (endpointIndex + 1) % endpoints.length;
          return fetchWithRetry(nextIndex, retryCount + 1);
        }
        console.error('Error fetching from Overpass after retries:', error);
        return [];
      }
    };

    return fetchWithRetry(0, 0);
  },

  async ensureMosqueExists(mosque: Mosque) {
    if (isSupabaseConfigured && mosque.id.startsWith('osm-')) {
      try {
        const { data: existing, error: checkError } = await supabase
          .from('mosques')
          .select('id')
          .eq('id', mosque.id)
          .maybeSingle();
        
        if (checkError) {
          console.error('Error checking mosque existence:', checkError);
          return false;
        }

        if (!existing) {
          const { error: insertError } = await supabase
            .from('mosques')
            .insert([{
              id: mosque.id,
              name: mosque.name,
              latitude: mosque.latitude,
              longitude: mosque.longitude,
              address: mosque.address
            }]);
          
          if (insertError) {
            console.error('Error inserting OSM mosque into DB:', insertError);
            return false;
          }
        }
        return true;
      } catch (e) {
        console.error('Error ensuring mosque exists:', e);
        return false;
      }
    }
    return true;
  },

  async getPrayerTimes(mosqueId: string): Promise<PrayerTimes | null> {
    if (isSupabaseConfigured && !mosqueId.startsWith('local-')) {
      try {
        // 1. Try to get existing prayer times
        const { data, error } = await supabase
          .from('prayer_times')
          .select('*')
          .eq('mosque_id', mosqueId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          // We trust the counts stored in the prayer_times table for performance and to avoid RLS issues on the votes table
          // The vote function is responsible for keeping these counts in sync
          const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
          prayers.forEach(p => {
            data[`${p}_upvotes`] = data[`${p}_upvotes`] || 0;
            data[`${p}_downvotes`] = data[`${p}_downvotes`] || 0;
            data[`${p}_score`] = data[`${p}_score`] || 0;
          });
          return data;
        }
        
        if (error) {
          // Only log if it's not a configuration error (Invalid API Key)
          if (!error.message?.includes('Invalid API key')) {
            console.error('Error fetching prayer times:', error);
          }
        } else if (!data) {
          // 2. No record exists. 
          // Note: ensureMosqueExists should have been called by the component
          // but we'll try to insert default times anyway.
          const defaultTimes = {
            mosque_id: mosqueId,
            fajr: '05:30',
            dhuhr: '13:15',
            asr: '16:45',
            maghrib: '18:30',
            isha: '20:00',
            updated_at: new Date().toISOString(),
            fajr_score: 0,
            dhuhr_score: 0,
            asr_score: 0,
            maghrib_score: 0,
            isha_score: 0,
            fajr_upvotes: 0,
            fajr_downvotes: 0,
            dhuhr_upvotes: 0,
            dhuhr_downvotes: 0,
            asr_upvotes: 0,
            asr_downvotes: 0,
            maghrib_upvotes: 0,
            maghrib_downvotes: 0,
            isha_upvotes: 0,
            isha_downvotes: 0
          };
          
          const { data: newData, error: insertError } = await supabase
            .from('prayer_times')
            .insert([defaultTimes])
            .select()
            .maybeSingle();
            
          if (!insertError && newData) {
            const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
            prayers.forEach(p => {
              newData[`${p}_upvotes`] = 0;
              newData[`${p}_downvotes`] = 0;
              newData[`${p}_score`] = 0;
            });
            return newData;
          } else if (insertError) {
            console.error('Error creating default prayer times:', insertError);
          }
        }
      } catch (e) {
        console.error('Supabase getPrayerTimes error:', e);
      }
    }

    // Fallback to localStorage
    const localTimes = JSON.parse(localStorage.getItem(LOCAL_TIMES_KEY) || '[]');
    const mosqueTimes = localTimes
      .filter((t: PrayerTimes) => t.mosque_id === mosqueId)
      .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    
    return mosqueTimes[0] || null;
  },

  async updatePrayerTimes(times: Partial<PrayerTimes> & { mosque_id: string }): Promise<PrayerTimes> {
    if (isSupabaseConfigured && !times.mosque_id.startsWith('local-')) {
      try {
        // 1. Get the current latest record to compare
        const { data: current } = await supabase
          .from('prayer_times')
          .select('*')
          .eq('mosque_id', times.mosque_id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const hasChanges = current && (
          current.fajr !== times.fajr ||
          current.dhuhr !== times.dhuhr ||
          current.asr !== times.asr ||
          current.maghrib !== times.maghrib ||
          current.isha !== times.isha
        );

        if (current && !hasChanges) {
          // No changes in times, just update the timestamp of the existing record to show it's "fresh"
          const { data, error } = await supabase
            .from('prayer_times')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', current.id)
            .select()
            .single();
          
          if (error) throw error;
          return data;
        }

        // If times changed or no record exists, insert a new one
        // This resets the votes for the new set of times
        const { data, error } = await supabase
          .from('prayer_times')
          .insert([{
            ...times,
            updated_at: new Date().toISOString(),
            fajr_score: 0,
            dhuhr_score: 0,
            asr_score: 0,
            maghrib_score: 0,
            isha_score: 0,
            fajr_upvotes: 0,
            fajr_downvotes: 0,
            dhuhr_upvotes: 0,
            dhuhr_downvotes: 0,
            asr_upvotes: 0,
            asr_downvotes: 0,
            maghrib_upvotes: 0,
            maghrib_downvotes: 0,
            isha_upvotes: 0,
            isha_downvotes: 0
          }])
          .select()
          .single();

        if (error) throw error;
        return data;
      } catch (e) {
        console.error('Supabase updatePrayerTimes error:', e);
        // Fall back to local storage instead of throwing
      }
    }

    // Local update fallback
    const newTime: PrayerTimes = {
      ...times,
      id: `local-pt-${Date.now()}`,
      updated_at: new Date().toISOString(),
      fajr_score: 0,
      dhuhr_score: 0,
      asr_score: 0,
      maghrib_score: 0,
      isha_score: 0,
      fajr_upvotes: 0,
      fajr_downvotes: 0,
      dhuhr_upvotes: 0,
      dhuhr_downvotes: 0,
      asr_upvotes: 0,
      asr_downvotes: 0,
      maghrib_upvotes: 0,
      maghrib_downvotes: 0,
      isha_upvotes: 0,
      isha_downvotes: 0
    } as PrayerTimes;

    const localTimes = JSON.parse(localStorage.getItem(LOCAL_TIMES_KEY) || '[]');
    localTimes.push(newTime);
    localStorage.setItem(LOCAL_TIMES_KEY, JSON.stringify(localTimes));
    return newTime;
  },

  async vote(prayerTimeId: string, prayerName: string, voteType: 'up' | 'down') {
    // If it's a local ID, we must use local logic even if Supabase is configured
    // because Supabase won't recognize the local ID.
    if (isSupabaseConfigured && !prayerTimeId.startsWith('local-')) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || getDeviceId();
        
        console.log(`Voting for ${prayerName} (${voteType}) on ${prayerTimeId} by ${userId}`);

        // 1. Check for existing vote
        const { data: existingVote, error: fetchError } = await supabase
          .from('votes')
          .select('id, vote_type')
          .eq('prayer_time_id', prayerTimeId)
          .eq('user_id', userId)
          .eq('prayer_name', prayerName)
          .maybeSingle();

        if (fetchError) console.error('Error fetching existing vote:', fetchError);

        if (existingVote) {
          if (existingVote.vote_type === voteType) {
            // Toggle off: remove vote if same type
            const { error: deleteError } = await supabase
              .from('votes')
              .delete()
              .eq('id', existingVote.id);
            if (deleteError) throw deleteError;
          } else {
            // Change vote: update to new type
            const { error: updateError } = await supabase
              .from('votes')
              .update({ vote_type: voteType })
              .eq('id', existingVote.id);
            if (updateError) throw updateError;
          }
        } else {
          // New vote
          const { error: insertError } = await supabase
            .from('votes')
            .insert([{
              prayer_time_id: prayerTimeId,
              prayer_name: prayerName,
              user_id: userId,
              vote_type: voteType
            }]);
          if (insertError) throw insertError;
        }

        // 2. Recalculate counts for this prayer
        // We fetch all votes for this specific prayer to get accurate counts
        // NOTE: This requires the 'votes' table to have a SELECT policy for authenticated/anon users
        const { data: allVotes, error: countError } = await supabase
          .from('votes')
          .select('vote_type')
          .eq('prayer_time_id', prayerTimeId)
          .eq('prayer_name', prayerName);

        if (countError) {
          console.error('Error recalculating votes:', countError);
          // If we can't read all votes, we might need to rely on the current state and increment/decrement
          // But for now let's assume we can read them.
          throw countError;
        }

        const upvotes = (allVotes || []).filter(v => v.vote_type === 'up').length;
        const downvotes = (allVotes || []).filter(v => v.vote_type === 'down').length;
        const score = upvotes - downvotes;

        console.log(`New counts for ${prayerName}: up=${upvotes}, down=${downvotes}, score=${score}`);

        // 3. Update the main record with full counts
        // We update both the score and the individual up/down counts for consistency
        const { error: ptUpdateError } = await supabase
          .from('prayer_times')
          .update({ 
            [`${prayerName}_score`]: score,
            [`${prayerName}_upvotes`]: upvotes,
            [`${prayerName}_downvotes`]: downvotes,
            updated_at: new Date().toISOString()
          })
          .eq('id', prayerTimeId);
        
        if (ptUpdateError) console.error('Error updating prayer_times record:', ptUpdateError);

        return { score, upvotes, downvotes };
      } catch (e) {
        console.error('Supabase vote error:', e);
        throw e;
      }
    }

    // Local voting logic (improved to handle toggling)
    const localTimes = JSON.parse(localStorage.getItem(LOCAL_TIMES_KEY) || '[]');
    const timeIndex = localTimes.findIndex((t: PrayerTimes) => t.id === prayerTimeId);
    if (timeIndex !== -1) {
      const scoreField = `${prayerName}_score` as keyof PrayerTimes;
      const upvotesField = `${prayerName}_upvotes` as keyof PrayerTimes;
      const downvotesField = `${prayerName}_downvotes` as keyof PrayerTimes;
      
      // Track local user votes
      const localUserVotesKey = `mosque_finder_votes_${getDeviceId()}`;
      const userVotes = JSON.parse(localStorage.getItem(localUserVotesKey) || '{}');
      const currentVote = userVotes[`${prayerTimeId}_${prayerName}`];

      let upvotes = (localTimes[timeIndex][upvotesField] as number) || 0;
      let downvotes = (localTimes[timeIndex][downvotesField] as number) || 0;

      if (currentVote === voteType) {
        // Toggle off
        if (voteType === 'up') upvotes--; else downvotes--;
        delete userVotes[`${prayerTimeId}_${prayerName}`];
      } else if (currentVote) {
        // Change vote
        if (voteType === 'up') { upvotes++; downvotes--; } else { upvotes--; downvotes++; }
        userVotes[`${prayerTimeId}_${prayerName}`] = voteType;
      } else {
        // New vote
        if (voteType === 'up') upvotes++; else downvotes++;
        userVotes[`${prayerTimeId}_${prayerName}`] = voteType;
      }

      const score = upvotes - downvotes;
      localTimes[timeIndex][scoreField] = score;
      localTimes[timeIndex][upvotesField] = upvotes;
      localTimes[timeIndex][downvotesField] = downvotes;
      
      localStorage.setItem(LOCAL_TIMES_KEY, JSON.stringify(localTimes));
      localStorage.setItem(localUserVotesKey, JSON.stringify(userVotes));
      
      return { score, upvotes, downvotes };
    }
    return { score: 0, upvotes: 0, downvotes: 0 };
  },

  async createMosque(mosque: Omit<Mosque, 'id'>) {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('mosques')
          .insert([mosque])
          .select()
          .single();

        if (!error) {
          this.addToMasterList([data]);
          return data;
        }
        console.error('Supabase create mosque error:', error);
      } catch (e) {
        console.error('Supabase error:', e);
      }
    }

    // Local mosque creation
    const newMosque: Mosque = {
      ...mosque,
      id: `local-m-${Date.now()}`
    };
    const localMosques = JSON.parse(localStorage.getItem(LOCAL_MOSQUES_KEY) || '[]');
    localMosques.push(newMosque);
    localStorage.setItem(LOCAL_MOSQUES_KEY, JSON.stringify(localMosques));
    this.addToMasterList([newMosque]);
    return newMosque;
  },

  async deleteMosque(id: string) {
    if (id.startsWith('osm-')) return true;

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('mosques')
          .delete()
          .eq('id', id);

        if (!error) return true;
      } catch (e) {
        console.error('Supabase delete error:', e);
      }
    }

    // Local delete
    const localMosques = JSON.parse(localStorage.getItem(LOCAL_MOSQUES_KEY) || '[]');
    const filtered = localMosques.filter((m: Mosque) => m.id !== id);
    localStorage.setItem(LOCAL_MOSQUES_KEY, JSON.stringify(filtered));
    return true;
  },

  async toggleFavorite(mosque: Mosque) {
    const favorites = JSON.parse(localStorage.getItem(LOCAL_FAVORITES_KEY) || '[]');
    const index = favorites.findIndex((m: Mosque) => m.id === mosque.id);
    if (index === -1) {
      favorites.push(mosque);
    } else {
      favorites.splice(index, 1);
    }
    localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(favorites));
    return index === -1; // returns true if added, false if removed
  },

  async getFavorites(): Promise<Mosque[]> {
    return JSON.parse(localStorage.getItem(LOCAL_FAVORITES_KEY) || '[]');
  },

  async isFavorite(id: string): Promise<boolean> {
    const favorites = JSON.parse(localStorage.getItem(LOCAL_FAVORITES_KEY) || '[]');
    return favorites.some((m: Mosque) => m.id === id);
  },

  async updateMosque(id: string, updates: Partial<Mosque>) {
    if (isSupabaseConfigured) {
      try {
        // If it's an OSM mosque being updated for the first time, we need to UPSERT it
        // so it becomes a "community" mosque in our database.
        const { data, error } = await supabase
          .from('mosques')
          .upsert({ ...updates, id: id }, { onConflict: 'id' })
          .select()
          .single();

        if (!error) return data;
        console.error('Supabase sync mosque error:', error);
      } catch (e) {
        console.error('Supabase error:', e);
      }
    }

    // Local update fallback if Supabase is offline or fails
    const localMosques = JSON.parse(localStorage.getItem(LOCAL_MOSQUES_KEY) || '[]');
    const index = localMosques.findIndex((m: Mosque) => m.id === id);
    if (index !== -1) {
      localMosques[index] = { ...localMosques[index], ...updates };
      localStorage.setItem(LOCAL_MOSQUES_KEY, JSON.stringify(localMosques));
      return localMosques[index];
    }
    
    // If it's an OSM mosque being "updated" locally (since we can't update OSM)
    // We treat it as a local override if we were building a more complex system,
    // but for now let's just return the updated object as if it worked.
    return { id, ...updates } as Mosque;
  },

  async getLocalMosques(): Promise<Mosque[]> {
    return JSON.parse(localStorage.getItem(LOCAL_MOSQUES_KEY) || '[]');
  },

  async getUserVotes(mosqueId: string, userId?: string) {
    if (isSupabaseConfigured) {
      try {
        const effectiveUserId = userId || getDeviceId();
        // First get the latest prayer_times record for this mosque
        const { data: pt, error: ptError } = await supabase
          .from('prayer_times')
          .select('id')
          .eq('mosque_id', mosqueId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ptError) {
          if (!ptError.message?.includes('Invalid API key')) {
            console.error('Error fetching prayer times for user votes:', ptError);
          }
          return [];
        }

        if (pt) {
          const { data, error } = await supabase
            .from('votes')
            .select('prayer_name, vote_type')
            .eq('prayer_time_id', pt.id)
            .eq('user_id', effectiveUserId);
          
          if (error) {
            console.error('Error fetching user votes:', error);
            return [];
          }
          return data || [];
        }
      } catch (e) {
        console.error('Supabase getUserVotes error:', e);
      }
    }
    return [];
  }
};
