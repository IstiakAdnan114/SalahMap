import { Mosque, PrayerTimes, getDistance } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import staticMosques from '../data/mosques.json';

const LOCAL_MOSQUES_KEY = 'mosque_finder_local_mosques';
const LOCAL_TIMES_KEY = 'mosque_finder_local_times';
const LOCAL_FAVORITES_KEY = 'mosque_finder_favorites';
const LOCAL_REMOVED_KEY = 'mosque_finder_removed_ids';
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
    // We reverse the list first so that findIndex finds the LATEST (most recently added/edited) version
    const reversed = [...masterMosqueList].reverse();
    const unique = reversed.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
    // Reverse back to maintain some semblance of order if needed, or just use as is
    masterMosqueList = unique.reverse();
    localStorage.setItem(MASTER_LIST_KEY, JSON.stringify(masterMosqueList));
  } catch (e) {
    console.error('Error saving Master List:', e);
  }
};

export const mosqueService = {
  // New method to search the local master list instantly
  searchMasterList(lat: number, lon: number, radiusMeters: number): Mosque[] {
    const removedIds = JSON.parse(localStorage.getItem(LOCAL_REMOVED_KEY) || '[]');
    // Combine static DB with the dynamically discovered master list
    const combinedList = [...(staticMosques as Mosque[]), ...masterMosqueList];
    
    // Use a Map for de-duplication (prefer Master list data if IDs overlap)
    const uniqueMap = new Map<string, Mosque>();
    combinedList.forEach(m => uniqueMap.set(m.id, m));

    return Array.from(uniqueMap.values()).filter(m => {
      if (removedIds.includes(m.id) || m.is_deleted) return false;
      const dist = getDistance(lat, lon, m.latitude, m.longitude);
      return dist * 1000 <= radiusMeters;
    });
  },

  // Add or update mosques in the master list
  addToMasterList(mosques: Mosque[]) {
    const nextList = [...masterMosqueList];
    let changed = false;

    mosques.forEach(newMosque => {
      const index = nextList.findIndex(m => m.id === newMosque.id);
      if (index !== -1) {
        // Update existing (only if data is different)
        if (JSON.stringify(nextList[index]) !== JSON.stringify(newMosque)) {
          nextList[index] = { ...nextList[index], ...newMosque };
          changed = true;
        }
      } else {
        // Add new
        nextList.push(newMosque);
        changed = true;
      }
    });
    
    if (changed) {
      masterMosqueList = nextList;
      saveMasterList();
    }
  },

  /**
   * Fast Import: Processes the OSM export.json format directly.
   * You can call this from the browser console to bulk-import your data.
   */
  async importOsmJson(jsonData: any) {
    if (!jsonData || !jsonData.elements) {
      console.error('Invalid JSON format. Expected Overpass API "elements" array.');
      return 0;
    }

    const mosques: Mosque[] = jsonData.elements.map((el: any) => ({
      id: `osm-${el.id}`,
      name: el.tags?.name || el.tags?.['name:en'] || el.tags?.['name:bn'] || 'Unnamed Mosque',
      latitude: el.lat || el.center?.lat,
      longitude: el.lon || el.center?.lon,
      address: el.tags?.['addr:full'] || el.tags?.['addr:street'] || el.tags?.['addr:city'] || 'Address unknown',
    })).filter((m: any) => m.latitude && m.longitude);

    console.log(`Processing ${mosques.length} mosques from JSON...`);

    // 1. Add to local Master List for instant display
    this.addToMasterList(mosques);

    // 2. Sync to Supabase in chunks (if configured)
    if (isSupabaseConfigured && mosques.length > 0) {
      console.log('Syncing to Supabase database...');
      const chunkSize = 50;
      for (let i = 0; i < mosques.length; i += chunkSize) {
        const chunk = mosques.slice(i, i + chunkSize).map(m => ({
          id: m.id,
          name: m.name,
          latitude: m.latitude,
          longitude: m.longitude,
          address: m.address
        }));
        
        try {
          const { error } = await supabase
            .from('mosques')
            .upsert(chunk, { onConflict: 'id' });
          
          if (error) console.error(`Chunk sync error (${i}):`, error);
          else console.log(`Synced ${Math.min(i + chunkSize, mosques.length)} / ${mosques.length}`);
        } catch (e) {
          console.error('Sync failed:', e);
        }
      }
    }

    return mosques.length;
  },

  async fetchNearbyFromOSM(lat: number, lon: number, radius: number = 500, forceRefresh: boolean = false): Promise<Mosque[]> {
    const removedIds = JSON.parse(localStorage.getItem(LOCAL_REMOVED_KEY) || '[]');
    const cacheKey = `${lat.toFixed(4)}_${lon.toFixed(4)}_${radius}`;
    
    if (!forceRefresh) {
      // 1. Check permanent cache
      const cached = osmCache.get(cacheKey);
      if (cached) {
        return cached.data.filter(m => !removedIds.includes(m.id));
      }

      // 2. Check if master list already has enough mosques
      const localResults = this.searchMasterList(lat, lon, radius);
      if (localResults.length >= 5) {
        return localResults.filter(m => !removedIds.includes(m.id));
      }

      // 3. NEW: Check Supabase First (This is the speed boost!)
      if (isSupabaseConfigured) {
        try {
          // Approximate bounding box search for speed
          const latMargin = radius / 111320; 
          const lonMargin = radius / (111320 * Math.cos(lat * (Math.PI / 180)));
          
          const { data: dbMosques, error } = await supabase
            .from('mosques')
            .select('*')
            .eq('is_deleted', false)
            .gte('latitude', lat - latMargin)
            .lte('latitude', lat + latMargin)
            .gte('longitude', lon - lonMargin)
            .lte('longitude', lon + lonMargin)
            .limit(100);

          if (dbMosques && dbMosques.length > 0) {
            console.log(`Supabase returned ${dbMosques.length} mosques in range`);
            // Format to match Mosque type
            const formatted = dbMosques.map(m => ({
              id: m.id,
              name: m.name,
              latitude: m.latitude,
              longitude: m.longitude,
              address: m.address
            }));
            
            this.addToMasterList(formatted);
            return formatted.filter(m => !removedIds.includes(m.id));
          }
        } catch (e) {
          console.error('Supabase fetch error, falling back to OSM:', e);
        }
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
        
        const removedIds = JSON.parse(localStorage.getItem(LOCAL_REMOVED_KEY) || '[]');
        return mosques.filter(m => !removedIds.includes(m.id));
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
          const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumua'] as const;
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
        }
        
        return null;
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
          current.isha !== times.isha ||
          current.jumua !== times.jumua
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
            jumua_score: 0,
            fajr_upvotes: 0,
            fajr_downvotes: 0,
            dhuhr_upvotes: 0,
            dhuhr_downvotes: 0,
            asr_upvotes: 0,
            asr_downvotes: 0,
            maghrib_upvotes: 0,
            maghrib_downvotes: 0,
            isha_upvotes: 0,
            isha_downvotes: 0,
            jumua_upvotes: 0,
            jumua_downvotes: 0
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
      jumua_score: 0,
      fajr_upvotes: 0,
      fajr_downvotes: 0,
      dhuhr_upvotes: 0,
      dhuhr_downvotes: 0,
      asr_upvotes: 0,
      asr_downvotes: 0,
      maghrib_upvotes: 0,
      maghrib_downvotes: 0,
      isha_upvotes: 0,
      isha_downvotes: 0,
      jumua_upvotes: 0,
      jumua_downvotes: 0
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

  async deleteMosque(id: string, fullMosque?: Mosque) {
    // Hidden blacklist to prevent OSM data from reappearing locally immediately
    const removedIds = JSON.parse(localStorage.getItem(LOCAL_REMOVED_KEY) || '[]');
    if (!removedIds.includes(id)) {
      removedIds.push(id);
      localStorage.setItem(LOCAL_REMOVED_KEY, JSON.stringify(removedIds));
    }

    // Remove from in-memory master list immediately
    masterMosqueList = masterMosqueList.filter(m => m.id !== id);
    saveMasterList();

    if (isSupabaseConfigured) {
      try {
        // Soft delete for community syncing: mark as is_deleted instead of hard deleting
        // We try to find it in our master list if fullMosque wasn't provided, to satisfy NOT NULL constraints on upsert
        const mosqueToSync = fullMosque || masterMosqueList.find(m => m.id === id);
        
        const payload: any = { id, is_deleted: true };
        if (mosqueToSync) {
          payload.name = mosqueToSync.name;
          payload.latitude = mosqueToSync.latitude;
          payload.longitude = mosqueToSync.longitude;
          payload.address = mosqueToSync.address;
        }

        // Safety check for delete-sync: Supabase needs lat/lon for the INSERT part of UPSERT
        if (!payload.latitude || !payload.longitude) {
          console.warn(`Cannot sync soft-delete for ${id} to Supabase: missing required coordinates.`);
          return true;
        }

        const { error } = await supabase
          .from('mosques')
          .upsert(payload, { onConflict: 'id' });

        if (error) {
          // If we failed because we don't have enough data to INSERT a new record, 
          // we at least mark it deleted locally (done above).
          console.error('Supabase soft-delete sync error:', error);
        }
      } catch (e) {
        console.error('Supabase delete catch:', e);
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
    // 0. Find current data to ensure we have required fields (lat/lon) for upsert
    // We check master list first (most recent), then static list, then local storage
    let currentData = masterMosqueList.find(m => m.id === id);
    
    if (!currentData) {
      currentData = (staticMosques as Mosque[]).find(m => m.id === id);
    }
    
    if (!currentData) {
      const localMosques = JSON.parse(localStorage.getItem(LOCAL_MOSQUES_KEY) || '[]');
      currentData = localMosques.find((m: Mosque) => m.id === id);
    }

    // fallback: if updates itself has what we need
    if (!currentData && updates.latitude && updates.longitude) {
      currentData = { ...updates, id } as Mosque;
    }
    
    // Final merge
    const fullyUpdatedLocally = { 
      ...(currentData || {}), 
      ...updates, 
      id: id 
    } as Mosque;

    // 1. Update locally for instant feedback
    this.addToMasterList([fullyUpdatedLocally]);
    
    // Update local storage fallback
    const localMosques = JSON.parse(localStorage.getItem(LOCAL_MOSQUES_KEY) || '[]');
    const index = localMosques.findIndex((m: Mosque) => m.id === id);
    if (index !== -1) {
      localMosques[index] = fullyUpdatedLocally;
      localStorage.setItem(LOCAL_MOSQUES_KEY, JSON.stringify(localMosques));
    } else {
      localMosques.push(fullyUpdatedLocally);
      localStorage.setItem(LOCAL_MOSQUES_KEY, JSON.stringify(localMosques));
    }

    if (isSupabaseConfigured) {
      try {
        console.log(`Syncing update for mosque ${id} to Supabase...`);
        
        // Supabase needs latitude/longitude for the INSERT part of an UPSERT to work
        // if this is the first time this mosque is hitting the DB.
        const payload: any = {
          id: id,
          name: fullyUpdatedLocally.name,
          latitude: fullyUpdatedLocally.latitude,
          longitude: fullyUpdatedLocally.longitude,
          address: fullyUpdatedLocally.address || 'Address unknown',
        };

        // If we still don't have lat/lon (unlikely but safe check), we might have to abort
        if (payload.latitude === undefined || payload.latitude === null || 
            payload.longitude === undefined || payload.longitude === null) {
          console.warn(`Aborting sync for mosque ${id}: Missing coordinates.`, payload);
          return fullyUpdatedLocally;
        }

        // Only include is_deleted if explicitly provided
        if (updates.is_deleted !== undefined) {
          payload.is_deleted = updates.is_deleted;
        }

        const { data, error } = await supabase
          .from('mosques')
          .upsert(payload, { onConflict: 'id' })
          .select()
          .maybeSingle();

        if (error) {
          console.error('Supabase sync mosque error:', error);
        } else if (data) {
          console.log('Successfully synced mosque update to Supabase');
          this.addToMasterList([data]);
          return data;
        }
      } catch (e) {
        console.error('Supabase error:', e);
      }
    }

    return fullyUpdatedLocally;
  },

  async getLocalMosques(): Promise<Mosque[]> {
    const removedIds = JSON.parse(localStorage.getItem(LOCAL_REMOVED_KEY) || '[]');
    const local = JSON.parse(localStorage.getItem(LOCAL_MOSQUES_KEY) || '[]');
    return local.filter((m: Mosque) => !removedIds.includes(m.id) && !m.is_deleted);
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
