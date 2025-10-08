// musicLibrary.js - ColecoVision Music Library Parser
// Parses OS7 sound bank format from cvbanks/*.txt.gz files

const MusicLibrary = (() => {

  // Parse OS7 sound bank format (@N format)
  // @1 = individual sound effects
  // @2-4 = multi-channel music (all labels under same @N are channels of one song)
  function parseOS7Bank(text, gameName) {
    const lines = text.split('\n');
    const soundEffects = []; // @1 entries (individual SFX)
    const music = []; // @2, @3, @4 entries (multi-channel music)

    let currentType = null; // 1=SFX, 2-4=Music
    let currentSectionLabel = null; // First label in @2/@3/@4 section
    let currentChannels = []; // Array of channel data for multi-channel music
    let currentLabel = null;
    let currentData = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and full comments
      if (!line || line.startsWith(';')) continue;

      // Check for @N marker
      const atMatch = line.match(/^@(\d+)$/);
      if (atMatch) {
        // Save previous section BEFORE starting new one
        // (even if same @N number - each @N starts a new song)
        if (currentType === 1 && currentLabel && currentData.length > 0) {
          // Save individual SFX
          soundEffects.push({
            game: gameName,
            label: currentLabel,
            data: currentData,
            type: currentType
          });
        } else if (currentType >= 2) {
          // Save last channel if any
          if (currentLabel && currentData.length > 0) {
            currentChannels.push({
              label: currentLabel,
              data: currentData
            });
          }

          // Save multi-channel music if we have channels
          if (currentChannels.length > 0) {
            const totalBytes = currentChannels.reduce((sum, ch) => sum + ch.data.length, 0);

            music.push({
              game: gameName,
              label: currentSectionLabel || currentChannels[0].label,
              channelData: currentChannels, // Keep separate for multi-table playback
              channels: currentChannels.length,
              totalBytes: totalBytes,
              type: currentType
            });
          }
        }

        // Start new @N section
        currentType = parseInt(atMatch[1]);
        currentLabel = null;
        currentData = [];
        currentSectionLabel = null;
        currentChannels = [];
        continue;
      }

      // Check for label
      const labelMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*):$/);
      if (labelMatch) {
        // Save previous pattern in current section
        if (currentType === 1 && currentLabel && currentData.length > 0) {
          // @1: Each label is a separate SFX
          soundEffects.push({
            game: gameName,
            label: currentLabel,
            data: currentData,
            type: currentType
          });
        } else if (currentType >= 2 && currentLabel && currentData.length > 0) {
          // @2-4: Each label is a channel, save to channels array
          currentChannels.push({
            label: currentLabel,
            data: currentData
          });
        }

        // Start new pattern
        currentLabel = labelMatch[1];
        currentData = [];

        // For @2-4, track the first label as the section name
        if (currentType >= 2 && !currentSectionLabel) {
          currentSectionLabel = currentLabel;
        }

        continue;
      }

      // Parse data line (.XXh,YYh,...)
      const dataMatch = line.match(/^\.(.+)$/);
      if (dataMatch && currentType !== null) {
        // Strip comments
        const dataStr = dataMatch[1].split(';')[0].trim();

        // Parse hex bytes
        const bytes = dataStr.split(',').map(b => {
          const cleaned = b.trim();
          // Handle 0XXh format
          if (cleaned.match(/^0?[0-9a-f]+h$/i)) {
            return parseInt(cleaned.slice(0, -1), 16);
          }
          // Handle 0xXX format
          if (cleaned.startsWith('0x')) {
            return parseInt(cleaned, 16);
          }
          return null;
        }).filter(b => b !== null);

        currentData.push(...bytes);
      }
    }

    // Save final section
    if (currentType === 1 && currentLabel && currentData.length > 0) {
      soundEffects.push({
        game: gameName,
        label: currentLabel,
        data: currentData,
        type: currentType
      });
    } else if (currentType >= 2) {
      // Save last channel
      if (currentLabel && currentData.length > 0) {
        currentChannels.push({
          label: currentLabel,
          data: currentData
        });
      }

      // Save multi-channel music (keep channels separate)
      if (currentChannels.length > 0) {
        const totalBytes = currentChannels.reduce((sum, ch) => sum + ch.data.length, 0);

        music.push({
          game: gameName,
          label: currentSectionLabel || currentChannels[0].label,
          channelData: currentChannels, // Keep separate for multi-table playback
          channels: currentChannels.length,
          totalBytes: totalBytes,
          type: currentType
        });
      }
    }

    return { soundEffects, music };
  }

  // Load and parse a gzipped file
  async function loadGzipFile(url) {
    try {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();

      // Decompress using pako (needs to be included)
      if (typeof pako === 'undefined') {
        throw new Error('pako library not loaded - needed for gzip decompression');
      }

      const decompressed = pako.inflate(buffer, { to: 'string' });
      return decompressed;
    } catch (error) {
      console.error('Error loading gzip file:', url, error);
      throw error;
    }
  }

  // Load and parse a text file
  async function loadTextFile(url) {
    const response = await fetch(url);
    return await response.text();
  }

  // Parse the os7snd.txt index file
  function parseIndex(text) {
    const entries = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split('|');
      if (parts.length === 2) {
        entries.push({
          title: parts[0].trim(),
          filename: parts[1].trim()
        });
      }
    }

    return entries;
  }

  // Load entire music library
  async function loadLibrary(baseUrl = 'cvbanks/') {
    try {
      // Load index
      const indexText = await loadTextFile(baseUrl + 'os7snd.txt');
      const index = parseIndex(indexText);

      console.log(`Found ${index.length} games in library`);
      console.log('Debug: Starting library load...');

      const library = {
        games: [],
        allMusic: [],
        allSoundEffects: []
      };

      // Load each game
      for (const entry of index) {
        try {
          console.log(`Loading ${entry.title}...`);

          let text;
          if (entry.filename.endsWith('.gz')) {
            text = await loadGzipFile(baseUrl + entry.filename);
          } else {
            text = await loadTextFile(baseUrl + entry.filename);
          }

          const parsed = parseOS7Bank(text, entry.title);

          library.games.push({
            title: entry.title,
            filename: entry.filename,
            soundEffects: parsed.soundEffects,
            music: parsed.music,
            musicCount: parsed.music.length,
            sfxCount: parsed.soundEffects.length
          });

          // Add to global collections
          library.allMusic.push(...parsed.music);
          library.allSoundEffects.push(...parsed.soundEffects);

          console.log(`  ✓ ${entry.title}: ${parsed.music.length} music, ${parsed.soundEffects.length} SFX`);

          // Debug: Show music details
          if (parsed.music.length > 0) {
            parsed.music.forEach(m => {
              console.log(`    Music: ${m.label} - @${m.type} - ${m.channels} channels - ${m.totalBytes} bytes`);
            });
          }

        } catch (error) {
          console.error(`Failed to load ${entry.title}:`, error);
        }
      }

      console.log(`Library loaded: ${library.games.length} games, ${library.allMusic.length} total music tracks`);

      return library;

    } catch (error) {
      console.error('Failed to load library:', error);
      throw error;
    }
  }

  // Find music in a game (looks for @2, @3, @4, or longest pattern)
  function findBestMusic(game) {
    if (game.music && game.music.length > 0) {
      // Prefer @2, @3, @4 (multi-channel music)
      const multiChannel = game.music.filter(m => m.type >= 2);
      if (multiChannel.length > 0) {
        // Return the longest one
        return multiChannel.sort((a, b) => b.data.length - a.data.length)[0];
      }

      // Fallback to longest pattern
      return game.music.sort((a, b) => b.data.length - a.data.length)[0];
    }

    // No music found, look in sound effects for longest
    if (game.soundEffects && game.soundEffects.length > 0) {
      return game.soundEffects.sort((a, b) => b.data.length - a.data.length)[0];
    }

    return null;
  }

  return {
    parseOS7Bank,
    loadLibrary,
    parseIndex,
    findBestMusic
  };

})();
