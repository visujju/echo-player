const axios = require('axios');
const CryptoJS = require('crypto-js');

module.exports = {
  id: "saavn",
  name: "Saavn Music",
  icon: "🎵",

  // Live Top Played & Latest Releases from Launch Feed
  async getLaunchData() {
    const url = "https://www.jiosaavn.com/api.php?__call=content.getLaunchData&api_version=4&_format=json&_marker=0&ctx=android";
    try {
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile)' }
      });
      const data = res.data || {};

      // 1. New Releases / Latest Songs
      const latestRaw = data.new_trending || data.new_albums || [];
      const latest = latestRaw.slice(0, 10).map(song => ({
        id: song.id,
        title: (song.title || song.name || "").replace(/&quot;/g, '"').replace(/&#039;/g, "'"),
        artist: song.more_info?.singers || song.header_desc || song.subtitle || "Latest Release",
        image: (song.image || "").replace("150x150", "500x500")
      }));

      // 2. Top Charts / Top Played Songs
      const topPlaylists = data.top_playlists || [];
      const topChart = topPlaylists[0]?.more_info?.contents || [];
      const topPlayed = (topChart.length ? topChart : latestRaw.slice(10, 20)).map(song => ({
        id: song.id,
        title: (song.title || song.name || "").replace(/&quot;/g, '"').replace(/&#039;/g, "'"),
        artist: song.more_info?.singers || song.header_desc || song.subtitle || "Top Chart",
        image: (song.image || "").replace("150x150", "500x500")
      }));

      return { latest, topPlayed };
    } catch (e) {
      console.error("Launch data error:", e.message);
      return { latest: [], topPlayed: [] };
    }
  },

  async search(query) {
    const url = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&query=${encodeURIComponent(query)}&_format=json&_marker=0&ctx=android`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const songs = res.data?.songs?.data || [];

    return songs.map(song => ({
      id: song.id,
      title: (song.title || "").replace(/&quot;/g, '"').replace(/&#039;/g, "'"),
      artist: song.more_info?.singers || song.description || "",
      image: song.image ? song.image.replace("50x50", "500x500") : ""
    }));
  },

  async getStream(id) {
    const url = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${id}&_format=json&_marker=0&api_version=4&ctx=android`;
    const res = await axios.get(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile)', 'Accept': 'application/json' } 
    });

    const songData = res.data?.songs?.[0] || res.data?.[id];
    if (!songData) throw new Error("Track not found");

    const directAuthUrl = songData.more_info?.auth_url;
    if (directAuthUrl) return directAuthUrl;

    const encUrl = songData.more_info?.encrypted_media_url;
    if (encUrl) {
      const key = CryptoJS.enc.Utf8.parse("38346591");
      const decrypted = CryptoJS.DES.decrypt(
        { ciphertext: CryptoJS.enc.Base64.parse(encUrl) },
        key,
        { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
      );
      let streamUrl = decrypted.toString(CryptoJS.enc.Utf8).trim();
      return streamUrl.replace('_96_p.mp4', '_96.mp4');
    }

    const previewUrl = songData.more_info?.media_preview_url || songData.media_preview_url;
    if (previewUrl) {
      return previewUrl.replace("preview.saavncdn.com", "aac.saavncdn.com").replace('_96_p.mp4', '_96.mp4');
    }

    throw new Error("No playable stream found");
  }
};
