const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execFile } = require('child_process');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --------------------------------------------------
// DOWNLOAD DIRECTORY
// --------------------------------------------------

const downloadDir = path.join(__dirname, 'public', 'downloads');

if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
}

// --------------------------------------------------
// LOAD EXTENSIONS
// --------------------------------------------------

const extensions = {};
const extensionsDir = path.join(__dirname, 'extensions');

if (fs.existsSync(extensionsDir)) {
    fs.readdirSync(extensionsDir).forEach(file => {
        if (file.endsWith('.js')) {
            try {
                const ext = require(path.join(extensionsDir, file));

                if (ext.id) {
                    extensions[ext.id] = ext;
                    console.log(`Loaded extension: ${ext.id}`);
                }
            } catch (err) {
                console.error(`Failed to load extension ${file}:`, err.message);
            }
        }
    });
}

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get('/', (req, res) => {
    res.json({
        name: 'Echo Music Player',
        status: 'online',
        message: 'Echo server is running'
    });
});

// --------------------------------------------------
// SEARCH
// --------------------------------------------------

app.get('/api/search', async (req, res) => {
    const { ext, q } = req.query;

    if (!q) {
        return res.status(400).json({
            error: 'Missing search query'
        });
    }

    try {
        const plugin = extensions[ext] || extensions['youtube'] || extensions['saavn'];

        if (!plugin || typeof plugin.search !== 'function') {
            return res.status(500).json({
                error: 'No search extension available'
            });
        }

        const results = await plugin.search(q);

        res.json(results);

    } catch (err) {
        console.error('Search error:', err);

        res.status(500).json({
            error: err.message
        });
    }
});

// --------------------------------------------------
// STREAM
// --------------------------------------------------

app.get('/api/stream', async (req, res) => {
    const { ext, id } = req.query;

    if (!id) {
        return res.status(400).json({
            error: 'Missing track ID'
        });
    }

    try {
        const plugin = extensions[ext] || extensions['youtube'] || extensions['saavn'];

        if (!plugin || typeof plugin.getStream !== 'function') {
            return res.status(500).json({
                error: 'Streaming extension unavailable'
            });
        }

        const directUrl = await plugin.getStream(id);

        if (!directUrl) {
            return res.status(404).json({
                error: 'Stream URL unavailable'
            });
        }

        res.redirect(directUrl);

    } catch (err) {
        console.error('Stream error:', err);

        res.status(500).json({
            error: err.message
        });
    }
});

// --------------------------------------------------
// PREPARE DOWNLOAD
// --------------------------------------------------

app.get('/api/prepare-download', async (req, res) => {
    const { ext, id, title } = req.query;

    if (!id) {
        return res.status(400).json({
            error: 'Missing track ID'
        });
    }

    const cleanTitle = (title || 'track')
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .trim()
        .substring(0, 50) || 'track';

    const fileName = `${cleanTitle}.m4a`;
    const filePath = path.join(downloadDir, fileName);

    // Return existing file
    if (fs.existsSync(filePath)) {
        return res.json({
            url: `/downloads/${encodeURIComponent(fileName)}`,
            fileName
        });
    }

    try {

        // --------------------------------------------------
        // YOUTUBE DOWNLOAD
        // --------------------------------------------------

        if (ext === 'youtube') {

            let cleanId = id;

            if (id.includes('v=')) {
                cleanId = id.split('v=')[1].split('&')[0];
            }

            const videoUrl = `https://www.youtube.com/watch?v=${cleanId}`;

            const args = [
                '-f',
                'ba[ext=m4a]/ba',
                '--no-playlist',
                '-o',
                filePath,
                videoUrl
            ];

            console.log('Starting yt-dlp:', videoUrl);

            execFile(
                'yt-dlp',
                args,
                {
                    timeout: 120000
                },
                (err, stdout, stderr) => {

                    if (err || !fs.existsSync(filePath)) {

                        console.error('yt-dlp failed:', err);
                        console.error(stderr);

                        return res.status(500).json({
                            error: 'YouTube extraction failed'
                        });
                    }

                    console.log('Download complete:', fileName);

                    res.json({
                        url: `/downloads/${encodeURIComponent(fileName)}`,
                        fileName
                    });
                }
            );

            return;
        }

        // --------------------------------------------------
        // JIOSAAVN DOWNLOAD
        // --------------------------------------------------

        const plugin = extensions['saavn'];

        if (!plugin || typeof plugin.getStream !== 'function') {
            return res.status(500).json({
                error: 'Saavn extension unavailable'
            });
        }

        const streamUrl = await plugin.getStream(id);

        const response = await axios({
            method: 'GET',
            url: streamUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        const writer = fs.createWriteStream(filePath);

        response.data.pipe(writer);

        writer.on('finish', () => {
            res.json({
                url: `/downloads/${encodeURIComponent(fileName)}`,
                fileName
            });
        });

        writer.on('error', err => {

            console.error('File save error:', err);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            res.status(500).json({
                error: 'File saving failed'
            });
        });

    } catch (err) {

        console.error('Download error:', err);

        res.status(500).json({
            error: err.message
        });
    }
});

// --------------------------------------------------
// LYRICS
// --------------------------------------------------

app.get('/api/lyrics', async (req, res) => {

    const { track_name, artist_name } = req.query;

    if (!track_name) {
        return res.status(400).json({
            error: 'Missing track name'
        });
    }

    try {

        const response = await axios.get(
            'https://lrclib.net/api/get',
            {
                params: {
                    track_name,
                    artist_name
                },
                headers: {
                    'User-Agent': 'EchoMobilePlayer/1.0.0'
                }
            }
        );

        res.json(response.data);

    } catch (err) {

        console.error('Lyrics error:', err.message);

        res.status(404).json({
            error: 'Lyrics unavailable'
        });
    }
});

// --------------------------------------------------
// DOWNLOAD CLEANUP
// --------------------------------------------------

setInterval(() => {

    fs.readdir(downloadDir, (err, files) => {

        if (err) return;

        files.forEach(file => {

            const filePath = path.join(downloadDir, file);

            fs.stat(filePath, (err, stat) => {

                if (!err && Date.now() - stat.mtimeMs > 3600000) {

                    fs.unlink(filePath, () => {});

                    console.log(`Deleted old file: ${file}`);
                }
            });
        });
    });

}, 3600000);

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {

    console.log(`Echo running on port ${PORT}`);

});
