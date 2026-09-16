const { execFile } = require('child_process');

module.exports = {
  id: "youtube",
  name: "YouTube Music",
  icon: "🔴",

  // 1. Search directly via yt-dlp JSON dump
  async search(query) {
    return new Promise((resolve) => {
      const args = [
        `ytsearch15:${query}`,
        '--dump-single-json',
        '--flat-playlist',
        '--no-warnings',
        '--default-search', 'ytsearch'
      ];

      execFile('yt-dlp', args, { timeout: 10000, maxBuffer: 1024 * 1024 * 5 }, (err, stdout) => {
        if (err || !stdout) {
          console.error("yt-dlp search error:", err ? err.message : "Empty response");
          return resolve([]);
        }

        try {
          const parsed = JSON.parse(stdout);
          const entries = parsed.entries || [];
          const tracks = entries
            .filter(e => e && e.id && (e.title || e.url))
            .map(e => ({
              id: e.id,
              title: typeof e.title === 'string' ? e.title : "YouTube Track",
              artist: e.uploader || e.channel || "YouTube Artist",
              image: (e.thumbnails && e.thumbnails.length > 0) 
                ? e.thumbnails[e.thumbnails.length - 1].url 
                : `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`
            }));
          resolve(tracks);
        } catch (parseErr) {
          console.error("Search JSON parse error:", parseErr.message);
          resolve([]);
        }
      });
    });
  },

  // 2. Direct Audio Stream Extraction
  async getStream(id) {
    let cleanId = id;
    if (cleanId.includes('v=')) {
      cleanId = cleanId.split('v=')[1].split('&')[0];
    } else if (cleanId.includes('youtu.be/')) {
      cleanId = cleanId.split('youtu.be/')[1].split('?')[0];
    }

    const videoUrl = `https://www.youtube.com/watch?v=${cleanId}`;

    return new Promise((resolve, reject) => {
      execFile('yt-dlp', ['-g', '-f', 'ba/b', videoUrl], { timeout: 12000 }, (err, stdout) => {
        if (err || !stdout.trim()) {
          console.error("Stream extraction error:", err ? err.message : "Empty stream");
          return reject(new Error("Unable to extract YouTube stream"));
        }
        const streamUrl = stdout.trim().split('\n')[0];
        resolve(streamUrl);
      });
    });
  }
};
