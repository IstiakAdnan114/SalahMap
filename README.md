# SalahMap 🕌

SalahMap is a community-driven, real-time platform designed to help Muslims in Bangladesh find nearby mosques and accurate Jamat (prayer) times. By combining official OpenStreetMap data with local community contributions, SalahMap ensures that you always know where and when to pray.

## ✨ Key Features

- **Find Nearby Mosques** — Instantly discover mosques around you using real OpenStreetMap data
- **Community Prayer Times** — View and contribute accurate Jamat times for any mosque
- **Crowdsourced Accuracy** — Upvote or downvote prayer times to build community trust scores
- **Jumua Support** — See which mosques offer Friday prayers and their specific times
- **Community Editing** — Help improve mosque names and details for everyone
- **Works Offline** — Cached data means the app works even with poor connectivity
- **Real-Time Sync** — Changes by any user instantly reflect for everyone
- **One-Tap Navigation** — Open Google Maps directions to any mosque instantly

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
   git clone https://github.com/IstiakAdnan114/SalahMap.git
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
  mosque_id TEXT REFERENCES mosques(id) ON DELETE CASCADE,
  fajr TEXT,
  dhuhr TEXT,
  asr TEXT,
  maghrib TEXT,
  isha TEXT,
  jumua TEXT, -- Nullable if not offered
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
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## 📱 Mobile Experience

SalahMap is designed to be added to your home screen. It uses:
- `100dvh` for a perfect fit on mobile browsers.
- `safe-area-inset` CSS constants to avoid UI overlaps with phone notches.
- `overscroll-behavior: none` to prevent unwanted browser bouncing.

## 👨‍💻 Developer

**Md. Istiak Adnan**
- Email: adnanistiak111@gmail.com
- Built with ❤️ for the Ummah.

## 🤝 Contributing

Contributions are welcome! Whether it's fixing a bug, adding a new feature, or improving the design, feel free to fork the repo and submit a PR.

---

**SalahMap** — *Never miss a salah — and help others never miss theirs.*
