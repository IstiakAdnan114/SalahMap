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
   git clone https://github.com/IstiakAdnan114/salahmap.git
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
  jumua TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  fajr_score INTEGER DEFAULT 0,
  dhuhr_score INTEGER DEFAULT 0,
  asr_score INTEGER DEFAULT 0,
  maghrib_score INTEGER DEFAULT 0,
  isha_score INTEGER DEFAULT 0,
  jumua_score INTEGER DEFAULT 0,
  fajr_upvotes INTEGER DEFAULT 0,
  fajr_downvotes INTEGER DEFAULT 0,
  dhuhr_upvotes INTEGER DEFAULT 0,
  dhuhr_downvotes INTEGER DEFAULT 0,
  asr_upvotes INTEGER DEFAULT 0,
  asr_downvotes INTEGER DEFAULT 0,
  maghrib_upvotes INTEGER DEFAULT 0,
  maghrib_downvotes INTEGER DEFAULT 0,
  isha_upvotes INTEGER DEFAULT 0,
  isha_downvotes INTEGER DEFAULT 0,
  jumua_upvotes INTEGER DEFAULT 0,
  jumua_downvotes INTEGER DEFAULT 0
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
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(prayer_time_id, user_id, prayer_name)
);
```

### 4. 🔒 Security & Realtime (Crucial)

To make the app functional and collaborative, you must configure these settings in the Supabase Dashboard:

#### Enable Realtime
1. Go to **Database** > **Replication**.
2. Click on **'supabase_realtime'** (or create it).
3. Toggle the **Source** switch for `mosques`, `prayer_times`, and `votes` tables to enable live updates.

#### Configure RLS (Row Level Security)
The app uses a community-driven model. Run these queries in the **SQL Editor** to allow public interactions:

```sql
-- 1. Mosques Table Policies
ALTER TABLE mosques ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON mosques FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update" ON mosques FOR ALL USING (true) WITH CHECK (true);

-- 2. Prayer Times Table Policies
ALTER TABLE prayer_times ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON prayer_times FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update" ON prayer_times FOR ALL USING (true) WITH CHECK (true);

-- 3. Votes Table Policies
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON votes FOR SELECT USING (true);
CREATE POLICY "Allow public insert/delete" ON votes FOR ALL USING (true) WITH CHECK (true);
```

> [!NOTE]
> These policies allow anyone to contribute. For a production environment, consider hardening these to only allow logged-in users or specific verification logic.

## 🚀 Deployment

The app is ready to be deployed to **Vercel**, **Netlify**, or any static site host. 

### Deployment Steps:
1. Push your code to a GitHub repository.
2. Connect the repository to your hosting provider.
3. Add the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Environment Variables in the hosting dashboard.
4. The build command is `npm run build` and the output directory is `dist`.

## 📱 Mobile Experience

SalahMap is designed to be added to your home screen. It uses:
- `100dvh` for a perfect fit on mobile browsers.
- `safe-area-inset` CSS constants to avoid UI overlaps with phone notches.
- `overscroll-behavior: none` to prevent unwanted browser bouncing.

## 👨‍💻 Developer

**Md. Istiak Adnan**
- **Email:** [adnanistiak111@gmail.com](mailto:adnanistiak111@gmail.com)
- **GitHub:** [IstiakAdnan114](https://github.com/IstiakAdnan114)

## 🤝 Contributing

Contributions are welcome! Whether it's fixing a bug, adding a new feature, or improving the design, feel free to fork the repo and submit a PR.

---

**SalahMap** - *Never miss a salah — and help others never miss theirs.*
