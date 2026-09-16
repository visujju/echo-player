app.listen(3000, () => console.log('Echo running at http://localhost:3000'));const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Echo running on port ${PORT}`);
});const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execFile } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const downloadDir = path.join(__dirname, 'public', 'downloads');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}

// Auto-cleanup downloads older than 1 hour to save storage
setInterval(() => {
  fs.readdir(downloadDir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(downloadDir, file);
      fs.stat(filePath, (err, stat) => {
        if (!err && (Date.now() - stat.mtimeMs > 3600000)) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}, 3600000);

const extensions = {};
fs.readdirSync('./extensions').forEach(file => {
  if (file.endsWith('.js')) {
    const ext = require(`./extensions/${file}`);
    extensions[ext.id] = ext;
  }
});

app.get('/api/search', async (req, res) => {
  const { ext, q } = req.query;
  const plugin = extensions[ext] || extensions['saavn'];
  try {
    const results = await plugin.search(q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stream', async (req, res) => {
  const { ext, id } = req.query;
  const plugin = extensions[ext] || extensions['saavn'];
  try {
    const directUrl = await plugin.getStream(id);
    res.redirect(directUrl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Step 1: Prepare Download Endpoint
app.get('/api/prepare-download', async (req, res) => {
  const { ext, id, title } = req.query;
  if (!id) return res.status(400).json({ error: "Missing track ID" });

  const cleanTitle = (title || 'track').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 50);
  const fileName = `${cleanTitle}.m4a`;
  const filePath = path.join(downloadDir, fileName);

  // If already downloaded recently, serve immediately
  if (fs.existsSync(filePath)) {
    return res.json({ url: `/downloads/${encodeURIComponent(fileName)}`, fileName });
  }

  try {
    if (ext === 'youtube') {
      const cleanId = id.includes('v=') ? id.split('v=')[1].split('&')[0] : id;
      const videoUrl = `https://www.youtube.com/watch?v=${cleanId}`;

      // Force m4a/aac extraction to ensure Android compatibility
      const args = ['-f', 'ba[ext=m4a]/ba', '-o', filePath, videoUrl];

      execFile('yt-dlp', args, { timeout: 60000 }, (err) => {
        if (err || !fs.existsSync(filePath)) {
          console.error("yt-dlp extraction failed:", err);
          return res.status(500).json({ error: "YouTube extraction failed" });
        }
        res.json({ url: `/downloads/${encodeURIComponent(fileName)}`, fileName });
      });
    } else {
      // JioSaavn Download
      const plugin = extensions['saavn'];
      const streamUrl = await plugin.getStream(id);
      
      const response = await axios({
        method: 'GET',
        url: streamUrl,
        responseType: 'stream',
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      writer.on('finish', () => {
        res.json({ url: `/downloads/${encodeURIComponent(fileName)}`, fileName });
      });

      writer.on('error', () => {
        res.status(500).json({ error: "File saving failed" });
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/lyrics', async (req, res) => {
  const { track_name, artist_name } = req.query;
  try {
    const response = await axios.get('https://lrclib.net/api/get', {
      params: { track_name, artist_name },
      headers: { 'User-Agent': 'EchoMobilePlayer/1.0.0' }
    });
    res.json(response.data);
  } catch (err) {
    res.status(404).json({ error: "Lyrics unavailable" });
  }
});

app.listen(3000, () => console.log('Echo running at http://localhost:3000'));
