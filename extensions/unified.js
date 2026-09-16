const fs = require('fs');
const path = require('path');

module.exports = {
  id: "unified",
  name: "Unified Extension",
  icon: "✨",

  async search(query) {
    const extDir = path.join(__dirname);
    const files = fs.readdirSync(extDir).filter(f => f.endsWith('.js') && f !== 'unified.js');
    
    // Execute search across all other active extensions simultaneously
    const tasks = files.map(async file => {
      try {
        const ext = require(path.join(extDir, file));
        if (typeof ext.search === 'function') {
          const results = await ext.search(query);
          return results.map(r => ({ ...r, source: ext.id, sourceName: ext.name }));
        }
      } catch (e) {
        return [];
      }
      return [];
    });

    const nested = await Promise.all(tasks);
    return nested.flat();
  },

  async getStream(id, extHint) {
    const targetExt = extHint || "saavn";
    const ext = require(path.join(__dirname, `${targetExt}.js`));
    return ext.getStream(id);
  }
};
