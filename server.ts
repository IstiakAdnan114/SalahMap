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

  app.get("/api/overpass", async (req, res) => {
    const data = req.query.data as string;
    console.log(`[Proxy] Incoming Overpass request, data length: ${data?.length || 0}`);
    
    if (!data) {
      return res.status(400).json({ error: "Missing query data" });
    }

    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.osm.ch/api/interpreter'
    ];

    for (const endpoint of endpoints) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        console.log(`[Proxy] Trying endpoint: ${endpoint}`);
        const url = `${endpoint}?data=${encodeURIComponent(data)}`;
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'SalahMap/1.0 (https://salahmap.com)'
          }
        });
        
        clearTimeout(timeoutId);

        if (response.ok) {
          const contentType = response.headers.get('content-type');
          console.log(`[Proxy] ${endpoint} returned status ${response.status}, contentType: ${contentType}`);
          
          if (contentType && contentType.includes('application/json')) {
            const body = await response.json();
            if (body && Array.isArray(body.elements)) {
              console.log(`[Proxy] Success from ${endpoint}, elements: ${body.elements.length}`);
              return res.json(body);
            } else {
              console.warn(`[Proxy] ${endpoint} returned JSON but it doesn't look like Overpass format`);
            }
          } else {
            console.warn(`[Proxy] ${endpoint} returned non-JSON. Likely a redirect or error page.`);
          }
        } else {
          // If 429 or 504, it might be busy, we can try next endpoint
          console.warn(`[Proxy] ${endpoint} failed with status: ${response.status}`);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        const errName = err instanceof Error ? err.name : 'Unknown';
        console.error(`[Proxy] Error for ${endpoint}:`, errName);
      }
    }

    console.error("[Proxy] All Overpass endpoints failed or returned unusable data");
    res.status(504).json({ 
      error: "Overpass servers are currently overloaded. Please try again in 10-15 seconds.",
      code: "OVERPASS_BUSY",
      elements: [] // Return an empty elements array so client processing doesn't crash
    });
  });

  app.get("/api/search", async (req, res) => {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: "Missing search query" });

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=bd`, {
        headers: {
          'User-Agent': 'SalahMap/1.0 (info@salahmap.com)' // Nominatim requires a User-Agent
        }
      });
      if (response.ok) {
        const body = await response.json();
        return res.json(body);
      }
      res.status(response.status).json({ error: "Search API failed" });
    } catch (err) {
      console.error('Search proxy error:', err);
      res.status(500).json({ error: "Server error" });
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
