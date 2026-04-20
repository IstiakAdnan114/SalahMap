# SalahMap 🕌

SalahMap is a community-driven, real-time platform designed to help Muslims in Bangladesh find nearby mosques and accurate Jamat (prayer) times. By combining official OpenStreetMap data with local community contributions, SalahMap ensures that you always know where and when to pray.

## ✨ Key Features

- **Interactive Map:** Explore mosques across Bangladesh with an intuitive, mobile-optimized map interface.
- **Community-Driven Prayer Times:** Add, update, and verify prayer times for any masjid. There are no "guesses"—times only show up once a community member confirms them.
- **Verification System:** High-confidence prayer times are marked as "Verified" based on community upvotes, while unreliable times are flagged.
- **Mobile Optimized:** A sleek, "Locked-to-Screen" mobile experience with dynamic viewport handling and safe-area inset support (notches, home bars).
- **Offline Resilience:** Local caching ensures you can see your saved mosques even with a spotty connection.
- **One-Tap Navigation:** Instantly open Google Maps for turn-by-turn directions to any masjid.
- **Real-Time Sync:** Changes made by one user are instantly visible to everyone else across the globe.

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **Styling:** Tailwind CSS 4
- **Maps:** Leaflet & React-Leaflet
- **Backend/Database:** Supabase (PostgreSQL, Realtime, RLS)
- **Animations:** motion (Framer Motion)
- **Icons:** Lucide React

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- A Supabase Project

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/salahmap.git
   cd salahmap
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file in the root directory (using `.env.example` as a template):
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anonymous-key
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

## 🗄️ Database Setup (Supabase)

To enable the full collaborative experience, you'll need the following tables in your Supabase project:

### 1. `mosques` Table
Stores masjid details and global soft-delete status.
```sql
CREATE TABLE mosques (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. `prayer_times` Table
Stores community-submitted schedules and confidence scores.
```sql
CREATE TABLE prayer_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mosque_id TEXT REFERENCES mosques(id),
  fajr TEXT,
  dhuhr TEXT,
  asr TEXT,
  maghrib TEXT,
  isha TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  fajr_score INTEGER DEFAULT 0,
  dhuhr_score INTEGER DEFAULT 0,
  asr_score INTEGER DEFAULT 0,
  maghrib_score INTEGER DEFAULT 0,
  isha_score INTEGER DEFAULT 0
  -- (Additional vote count columns recommended)
);
```

### 3. `votes` Table
Tracks individual user feedback to prevent double-voting.
```sql
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prayer_time_id UUID REFERENCES prayer_times(id),
  prayer_name TEXT NOT NULL,
  vote_type TEXT CHECK (vote_type IN ('up', 'down')),
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## 📱 Mobile Experience

SalahMap is designed to be added to your home screen. It uses:
- `100dvh` for a perfect fit on mobile browsers.
- `safe-area-inset` CSS constants to avoid UI overlaps with phone notches.
- `overscroll-behavior: none` to prevent unwanted browser bouncing.

## 🤝 Contributing

Contributions are welcome! Whether it's fixing a bug, adding a new feature, or improving the design, feel free to fork the repo and submit a PR.

---

**SalahMap** - *Connecting the Ummah, one masjid at a time.*
