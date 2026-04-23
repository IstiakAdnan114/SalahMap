import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "SalahMap API" });
  });

  // Proxy for Overpass API to avoid CORS issues
  app.use(express.json());
  app.post("/api/overpass", async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) {
        return res.status(400).json({ error: "Missing query" });
      }

      const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.osm.ch/api/interpreter',
        'https://overpass.be/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter'
      ];

      // Use a single mirror for the proxy to keep it simple, or implement racing here too
      // For now, let's pick one or race them.
      const fetchFromMirror = async (url: string) => {
        const response = await fetch(`${url}?data=${encodeURIComponent(query)}`, {
          headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      };

      // Try mirrors in order
      let data = null;
      for (const endpoint of endpoints.sort(() => 0.5 - Math.random())) {
        try {
          data = await fetchFromMirror(endpoint);
          break;
        } catch (e) {
          console.error(`Mirror ${endpoint} failed:`, e);
        }
      }

      if (!data) {
        throw new Error("All mirrors failed");
      }

      res.json(data);
    } catch (error) {
      console.error("Overpass Proxy Error:", error);
      res.status(500).json({ error: "Failed to fetch from Overpass" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SalahMap running on http://localhost:${PORT}`);
  });
}

startServer();
