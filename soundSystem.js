// soundSystem.js — Complete ColecoVision Audio Development System
// Handles 3-level architecture: Patterns -> Sound Table -> Music Sequences

const SoundSystem = (() => {
  const RAM_BASE = 0x702b;
  const CHANNEL_OFFSETS = {
    0: 0x00,  // Noise - music priority ($702B + 0 = $702B)
    3: 10,    // Tone3 - music priority ($702B + 10 = $7035)
    2: 20,    // Tone2 - music priority ($702B + 20 = $703F)
    1: 30,    // Tone1 - music priority ($702B + 30 = $7049)
    'sfx1': 40,  // High priority SFX slot ($702B + 40 = $7053)
    'sfx2': 50,  // High priority SFX slot ($702B + 50 = $705D)
    'sfx3': 60   // High priority SFX slot ($702B + 60 = $7067)
  };

  // Sound Table Manager
  class SoundTable {
    constructor(parent = null) {
      this.parent = parent; // Reference to CVSoundSystem
      this.entries = new Map();
      this.nextIndex = 1;
      // Entry 0 is always the RAM base address
      this.entries.set(0, {
        type: 'ram_base',
        address: RAM_BASE,
        name: 'RAM_BASE',
        data: null
      });
    }

    addPattern(name, data, description = '') {
      const index = this.nextIndex++;
      const format = this.detectFormat(data);
      this.entries.set(index, {
        type: 'pattern',
        name,
        data: [...data],
        description,
        format,
        channels: this.analyzeChannels(data, format)
      });
      return index;
    }

    getPattern(index) {
      return this.entries.get(index);
    }

    getAllPatterns() {
      return Array.from(this.entries.values()).filter(e => e.type === 'pattern');
    }

    detectFormat(data = []) {
      if (!data || data.length === 0) return 'legacy';
      const opcode = data[0] & 0x3f;
      if (opcode === 0x04) {
        return 'tiny';
      }
      return 'legacy';
    }

    analyzeChannels(data, format = 'legacy') {
      const channels = new Set();
      if (format === 'tiny') {
        if (data && data.length) {
          channels.add((data[0] >>> 6) & 3);
        }
        return Array.from(channels);
      }
      let i = 0;
      while (i < data.length) {
        const b0 = data[i++] & 0xFF;
        const ch = (b0 >>> 6) & 3;
        const code = b0 & 0x3F;

        if (code === 0x10 || code === 0x18) break; // END/REPEAT
        if ((code & 0x20) === 0x20) continue; // REST
        if (code === 0x04) {
          channels.add(ch);
          break;
        }

        channels.add(ch);

        // Skip pattern data based on type
        const type = code & 3;
        if (ch === 0) { // noise
          if (type === 0) i++; // filler byte
          i += 2; // b2, length
          if (type === 1 || type === 3) i += 2; // freq sweep
          if (type === 2 || type === 3) i += 2; // vol sweep
        } else { // tone
          i += 3; // low, mix, length
          if (type === 1 || type === 3) i += 2; // freq sweep
          if (type === 2 || type === 3) i += 2; // vol sweep
        }
      }
      return Array.from(channels);
    }

    exportAsm() {
      let output = '_snd_table:\n';
      output += `    dw 0x${RAM_BASE.toString(16)}\n`;

      for (let i = 1; i < this.nextIndex; i++) {
        const entry = this.entries.get(i);
        if (entry) {
          output += `    dw ${entry.name}\n`;
        }
      }
      output += '\n';

      // Export all patterns
      for (const entry of this.entries.values()) {
        if (entry.type === 'pattern') {
          output += ASM.dumpOne(entry.data, {}, entry.name) + '\n';
        }
      }

      return output;
    }
  }

  // Music Sequencer for arranging patterns
  class MusicSequencer {
    constructor(soundTable) {
      this.soundTable = soundTable;
      this.sequences = new Map();
    }

    createSequence(name) {
      this.sequences.set(name, {
        name,
        steps: [],
        loopPoint: null
      });
      return this.sequences.get(name);
    }

    addStep(sequenceName, duration, channels) {
      const sequence = this.sequences.get(sequenceName);
      if (!sequence) return false;

      // Validate channel indices
      const validChannels = {};
      for (const [ch, index] of Object.entries(channels)) {
        if (this.soundTable.getPattern(index)) {
          validChannels[ch] = index;
        }
      }

      // Encode channel count in high bits
      const channelCount = Object.keys(validChannels).length;
      const encoding = [0x00, 0x40, 0x80, 0xC0][Math.min(channelCount, 3)];

      sequence.steps.push({
        duration,
        channels: validChannels,
        encoding
      });

      return true;
    }

    setLoop(sequenceName, stepIndex) {
      const sequence = this.sequences.get(sequenceName);
      if (sequence && stepIndex < sequence.steps.length) {
        sequence.loopPoint = stepIndex;
        return true;
      }
      return false;
    }

    exportSequence(sequenceName) {
      const sequence = this.sequences.get(sequenceName);
      if (!sequence) return null;

      let output = `_${sequenceName}_music:\n`;

      sequence.steps.forEach((step, index) => {
        if (sequence.loopPoint === index) {
          output += `${sequenceName}_loop:\n`;
        }

        const channels = Object.values(step.channels);
        const firstChannel = channels[0] || 0;
        const encodedFirst = step.encoding | (firstChannel & 0x3F);

        let bytes = [step.duration & 0xFF, (step.duration >> 8) & 0xFF, encodedFirst];
        channels.slice(1).forEach(ch => bytes.push(ch & 0x3F));

        output += `    db ${bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}\n`;
      });

      if (sequence.loopPoint !== null) {
        output += `    dw ${sequenceName}_loop\n`;
      } else {
        output += '    db 0x00, 0x00  ; end\n';
      }

      return output;
    }

    getAllSequences() {
      return Array.from(this.sequences.values());
    }
  }

  // Priority System Manager
  class PriorityManager {
    constructor() {
      this.ramLayout = new Map();
      this.activeSounds = {
        music: { 0: null, 1: null, 2: null, 3: null },
        sfx: { sfx1: null, sfx2: null, sfx3: null }
      };
    }

    getRamAddress(channel, type = 'music') {
      const offset = type === 'music' ? CHANNEL_OFFSETS[channel] : CHANNEL_OFFSETS[type];
      return RAM_BASE + offset;
    }

    setActive(channel, patternIndex, type = 'music') {
      if (type === 'music') {
        this.activeSounds.music[channel] = patternIndex;
      } else {
        this.activeSounds.sfx[type] = patternIndex;
      }
    }

    clear(type = 'both') {
      if (type === 'music' || type === 'both') {
        this.activeSounds.music = { 0: null, 1: null, 2: null, 3: null };
      }
      if (type === 'sfx' || type === 'both') {
        this.activeSounds.sfx = { sfx1: null, sfx2: null, sfx3: null };
      }
    }

    getLayout() {
      const layout = [];

      // Music channels
      for (const ch of [0, 3, 2, 1]) {
        layout.push({
          channel: ch,
          type: 'music',
          address: this.getRamAddress(ch),
          active: this.activeSounds.music[ch],
          priority: 'low'
        });
      }

      // SFX channels
      for (const slot of ['sfx1', 'sfx2', 'sfx3']) {
        layout.push({
          channel: slot,
          type: 'sfx',
          address: this.getRamAddress(0, slot),
          active: this.activeSounds.sfx[slot],
          priority: 'high'
        });
      }

      return layout;
    }
  }

  // Main Sound System class
  class CVSoundSystem {
    constructor() {
      this.soundTable = new SoundTable(this);
      this.sequencer = new MusicSequencer(this.soundTable);
      this.priorityManager = new PriorityManager();
      this.projects = new Map();
      this.currentProject = null;
    }

    // Project Management
    createProject(name) {
      const project = {
        name,
        soundTable: new SoundTable(this),
        sequencer: new MusicSequencer(this.soundTable),
        metadata: {
          created: new Date(),
          modified: new Date(),
          author: '',
          description: ''
        }
      };
      this.projects.set(name, project);
      return project;
    }

    loadProject(name) {
      const project = this.projects.get(name);
      if (project) {
        this.currentProject = project;
        this.soundTable = project.soundTable;
        this.sequencer = project.sequencer;
        return true;
      }
      return false;
    }

    // Import existing ASM data
    importAsmFile(asmText) {
      // Store original ASM for comparison purposes
      this.originalAsmText = asmText;
      this.originalAsmLines = asmText.split('\n');

      const lines = asmText.split('\n');
      let currentLabel = null;
      let currentData = [];
      let isSequenceData = false;
      let isSoundTable = false;
      let sequenceData = [];
      let soundTableEntries = [];
      let patterns = new Map();

      // First pass: collect all raw data by label (without end-command processing)
      let allLabelData = new Map();

      for (const line of lines) {
        // Remove inline comments first
        const noComment = line.split(';')[0];
        const trimmed = noComment.trim();

        // Skip empty lines and comments
        if (!trimmed) continue;

        // Check for labels
        const labelMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*):$/);
        if (labelMatch) {
          const labelName = labelMatch[1];

          // Check if this is a sub-label within an existing sequence
          if (isSequenceData && currentLabel) {
            // Check if this label is actually a NEW sequence (ends with _music or _commando)
            const isNewSequence = labelName.endsWith('_music') || labelName.endsWith('_commando');

            if (!isNewSequence) {
              // This is a true sub-label (loop point) within the current sequence
              sequenceData.push(['label', labelName]);
              continue; // Don't start a new section
            }
            // Otherwise fall through to save current sequence and start new one
          }

          // Save previous data
          if (currentLabel && (currentData.length > 0 || (isSoundTable && soundTableEntries.length > 0))) {
            if (isSoundTable) {
              // This was the sound table - store the entries
              this.parseSoundTable(soundTableEntries);
              soundTableEntries = []; // Clear after processing
              // Note: Patterns will be added AFTER fall-through processing
            } else if (isSequenceData) {
              // Store sequence data for later processing (after patterns are ready)
              // IMPORTANT: Make a copy of sequenceData array to avoid reference issues
              allLabelData.set(currentLabel, {type: 'sequence', data: [...sequenceData]});
            } else {
              // Store raw data for patterns
              allLabelData.set(currentLabel, [...currentData]);
            }
          }

          currentLabel = labelName;
          currentData = [];
          sequenceData = [];
          soundTableEntries = [];

          // Determine what type of data this is
          isSoundTable = (currentLabel === '_snd_table');
          isSequenceData = currentLabel.includes('_music') || currentLabel.includes('_commando');

          continue;
        }

        // Check for db statements
        const dbMatch = trimmed.match(/^\.?db\s+(.+)$/i);
        if (dbMatch && currentLabel) {
          const values = ASM.parseBytes(dbMatch[1]);
          currentData.push(...values);

          if (isSequenceData) {
            sequenceData.push(values);
          }
        }

        // Check for dw statements
        const dwMatch = trimmed.match(/^\.?dw\s+(.+)$/i);
        if (dwMatch && currentLabel) {
          let value = dwMatch[1].trim();

          if (isSoundTable) {
            // Sound table has pairs: pattern_name,ram_address
            // Format: .dw #label,address or .dw label,address
            const parts = value.split(',').map(p => p.trim());

            if (parts.length >= 2) {
              // Strip # prefix if present (immediate addressing mode indicator)
              let patternName = parts[0];
              if (patternName.startsWith('#')) {
                patternName = patternName.slice(1);
              }

              const ramAddr = parts[1];
              soundTableEntries.push({
                type: 'pattern_entry',
                pattern: patternName,
                address: ramAddr
              });
            }
          } else if (isSequenceData) {
            // Duration in sequence data (can be number or label)
            // Strip # prefix if present
            if (value.startsWith('#')) {
              value = value.slice(1);
            }

            // Try to parse as number first
            const numValue = parseInt(value.startsWith('0x') ? value : value, value.startsWith('0x') ? 16 : 10);
            if (!isNaN(numValue)) {
              // It's a number (duration)
              sequenceData.push(['dw', numValue]);
            } else {
              // It's a label (loop target)
              sequenceData.push(['dw', value]);
            }
          }
        }
      }

      // Save final data
      if (currentLabel) {
        if (isSoundTable && soundTableEntries.length > 0) {
          this.parseSoundTable(soundTableEntries);
        } else if (isSequenceData) {
          allLabelData.set(currentLabel, {type: 'sequence', data: [...sequenceData]});
        } else if (currentData.length > 0) {
          allLabelData.set(currentLabel, [...currentData]);
        }
      }

      // Second pass: Process patterns with fall-through detection
      this.processPatternFallthrough(allLabelData, patterns);

      // Third pass: Create continuous memory layout
      this.createContinuousMemoryLayout(allLabelData, patterns);

      // Fourth pass: Add processed patterns to sound table
      this.addPatternsFromSoundTable(patterns);

      // Fifth pass: Process sequences now that patterns are indexed properly
      allLabelData.forEach((data, labelName) => {
        if (data && data.type === 'sequence') {
          this.parseSequenceData(labelName, data.data);
        }
      });
    }

    // Process pattern fall-through for continuous memory simulation
    processPatternFallthrough(allLabelData, patterns) {
      const labelNames = Array.from(allLabelData.keys());

      // ColecoVision end commands: 0x18, 0x58, 0x98, 0xd8, 0x10, 0x50, 0x90, 0xd0
      const endCommands = [0x18, 0x58, 0x98, 0xd8, 0x10, 0x50, 0x90, 0xd0];

      labelNames.forEach((labelName, index) => {
        const entry = allLabelData.get(labelName);

        // Skip sequence data - only process pattern data
        if (entry && entry.type === 'sequence') {
          return;
        }

        const rawData = entry;

        // Check if this pattern ends with an end command
        const hasEndCommand = rawData.length > 0 && endCommands.includes(rawData[rawData.length - 1]);

        if (hasEndCommand) {
          // Pattern has proper end command - use as-is
          patterns.set(labelName, [...rawData]);
        } else {
          // Pattern has no end command - needs fall-through
          // Collect data from this pattern and subsequent patterns until we find an end command
          let continuousData = [...rawData];
          let foundEnd = false;

          // Look through subsequent patterns for end command
          for (let nextIndex = index + 1; nextIndex < labelNames.length && !foundEnd; nextIndex++) {
            const nextLabelName = labelNames[nextIndex];
            const nextEntry = allLabelData.get(nextLabelName);

            // Skip sequence data when looking for end commands
            if (nextEntry && nextEntry.type === 'sequence') {
              continue;
            }

            const nextData = nextEntry;

            // Add bytes from the next pattern until we find an end command
            for (let byteIndex = 0; byteIndex < nextData.length; byteIndex++) {
              const byte = nextData[byteIndex];
              continuousData.push(byte);

              if (endCommands.includes(byte)) {
                foundEnd = true;
                break;
              }
            }
          }

          if (foundEnd) {
            patterns.set(labelName, continuousData);
          } else {
            // No end command found - use original data
            patterns.set(labelName, [...rawData]);
          }
        }
      });
    }

    // Create continuous memory layout for authentic ColecoVision behavior
    createContinuousMemoryLayout(allLabelData, patterns) {
      // Create a single continuous memory space with all patterns
      let memoryOffset = 0x8000; // Start of pattern memory
      const memoryMap = new Map();
      const continuousMemory = [];

      // Get pattern labels in order (excluding sequences)
      const patternLabels = Array.from(allLabelData.keys()).filter(label => {
        const data = allLabelData.get(label);
        return !(data && data.type === 'sequence');
      });

      // Build continuous memory
      patternLabels.forEach(labelName => {
        const entry = allLabelData.get(labelName);
        if (entry && entry.type !== 'sequence') {
          const patternData = entry;

          // Record where this pattern starts in memory
          memoryMap.set(labelName, {
            startOffset: memoryOffset,
            startIndex: continuousMemory.length,
            length: patternData.length
          });

          // Add pattern data to continuous memory
          continuousMemory.push(...patternData);
          memoryOffset += patternData.length;
        }
      });

      // Store continuous memory and memory map for use by the sound engine
      this.continuousMemory = continuousMemory;
      this.memoryMap = memoryMap;

      // Now reprocess patterns with continuous memory awareness
      patternLabels.forEach(labelName => {
        const memInfo = memoryMap.get(labelName);
        if (!memInfo) return;

        // Extract pattern data from continuous memory
        let patternEnd = memInfo.startIndex + memInfo.length;

        // Check if pattern has no end command - extend into next patterns
        const patternData = continuousMemory.slice(memInfo.startIndex, patternEnd);
        const endCommands = [0x18, 0x58, 0x98, 0xd8, 0x10, 0x50, 0x90, 0xd0];
        const hasEndCommand = patternData.length > 0 && endCommands.includes(patternData[patternData.length - 1]);

        if (!hasEndCommand) {
          // Find the next end command in continuous memory
          for (let i = patternEnd; i < continuousMemory.length; i++) {
            if (endCommands.includes(continuousMemory[i])) {
              patternEnd = i + 1; // Include the end command
              break;
            }
          }
        }

        // Update pattern with continuous memory data
        const finalPatternData = continuousMemory.slice(memInfo.startIndex, patternEnd);
        patterns.set(labelName, finalPatternData);
      });
    }

    // Parse the _snd_table structure
    parseSoundTable(entries) {
      // Clear existing sound table entries but keep the object
      this.soundTable.entries.clear();
      this.soundTable.nextIndex = 1;
      this.soundTableIndex = new Map();

      entries.forEach((entry, index) => {
        if (entry.type === 'pattern_entry') {
          // Store the pattern reference with 1-based index (starts at 1, not 0)
          this.soundTableIndex.set(index + 1, entry.pattern);
        }
      });
    }

    // Add patterns using the sound table indexing
    addPatternsFromSoundTable(patterns) {
      if (!this.soundTableIndex) {
        return;
      }

      this.soundTableIndex.forEach((patternName, index) => {
        const patternData = patterns.get(patternName);

        if (patternData) {
          // Force the index to match the sound table
          const rawData = patternData.data ?? patternData;
          const format = patternData.format ?? this.soundTable.detectFormat(rawData);
          this.soundTable.entries.set(index, {
            type: 'pattern',
            name: patternName,
            data: Array.isArray(rawData) ? [...rawData] : rawData,
            description: `From _snd_table index ${index}`,
            format,
            channels: this.soundTable.analyzeChannels(rawData, format)
          });
          this.soundTable.nextIndex = Math.max(this.soundTable.nextIndex, index + 1);
        }
      });
    }

    // Parse sequence data from _commando_music format
    parseSequenceData(sequenceName, rawData) {
      const sequence = this.sequencer.createSequence(sequenceName);
      let i = 0;

      // First pass: track all labels and their step positions
      const labelMap = new Map();
      let stepIndex = 0;

      for (let pass1 = 0; pass1 < rawData.length; pass1++) {
        const data = rawData[pass1];

        // Track labels (they come before the step data)
        if (Array.isArray(data) && data[0] === 'label') {
          const labelName = data[1];
          labelMap.set(labelName, stepIndex);
          continue; // Labels don't create steps
        }

        // Count actual steps (dw followed by db)
        if (Array.isArray(data) && data[0] === 'dw') {
          const value = data[1];
          if (value === 0) break; // Stop command
          if (typeof value === 'string') break; // Loop command ends sequence
          // This is a duration, so next item should be step data
          stepIndex++;
        }
      }

      // Second pass: actually create the steps
      while (i < rawData.length) {
        const data = rawData[i];

        // Skip label markers (already processed)
        if (Array.isArray(data) && data[0] === 'label') {
          i++;
          continue;
        }

        // Handle dw (duration values)
        if (Array.isArray(data) && data[0] === 'dw') {
          const value = data[1]; // Duration value or label

          // Check for special cases
          if (value === 0) {
            // dw 0x0000 = stop music
            break; // End sequence
          } else if (typeof value === 'string') {
            // dw label = loop to label
            // Resolve label to step index
            const targetStep = labelMap.get(value);
            if (targetStep !== undefined) {
              this.sequencer.setLoop(sequenceName, targetStep);
            } else {
              console.warn(`Label "${value}" not found in sequence, defaulting to step 0`);
              this.sequencer.setLoop(sequenceName, 0);
            }
            break;
          } else {
            // Regular duration value
            i++; // Move to next data which should be the db with indices

            if (i < rawData.length) {
              const indexData = rawData[i];

                if (indexData.length >= 1) {  // Changed from >= 4 to >= 1
                  const firstByte = indexData[0];

                  // Decode channel count from high bits (bits 7-6)
                  const channelCount = ((firstByte & 0xC0) >> 6) + 1;
                  const channels = {};

                  // Extract pattern indices - first index is in low 6 bits of first byte
                  const patternIndices = [firstByte & 0x3F];

                  // Get additional pattern indices from subsequent bytes
                  for (let c = 1; c < channelCount && c < indexData.length; c++) {
                    patternIndices.push(indexData[c] & 0x3F);
                  }

                  // Map pattern indices to channels
                  patternIndices.forEach((index, pos) => {
                    if (index > 0) {
                      const pattern = this.soundTable.getPattern(index);

                      if (!pattern) {
                        // Add a placeholder so the sequence structure is preserved
                        channels[pos] = index; // Use the raw index as fallback
                        return; // Skip further processing for this index
                      }

                      if (pattern) {
                        // Determine channel from pattern name or analyze first byte
                        let targetChannel = null;

                        // Try to determine from pattern name
                        if (pattern.name.includes('_ch0_')) {
                          targetChannel = 0;
                        } else if (pattern.name.includes('_ch1_')) {
                          targetChannel = 1;
                        } else if (pattern.name.includes('_ch2_')) {
                          targetChannel = 2;
                        } else if (pattern.name.includes('_ch3_')) {
                          targetChannel = 3;
                        } else if (pattern.data && pattern.data.length > 0) {
                          // Analyze first byte to determine channel
                          const firstByte = pattern.data[0];
                          targetChannel = (firstByte >>> 6) & 3;
                        }

                        if (targetChannel !== null) {
                          channels[targetChannel] = index;
                        } else {
                          // Final fallback based on position
                          const channelMap = [0, 3, 2, 1]; // noise, tone3, tone2, tone1
                          if (pos < channelMap.length) {
                            channels[channelMap[pos]] = index;
                          }
                        }
                      }
                    }
                  });

                  this.sequencer.addStep(sequenceName, value, channels);
                }
              }
            }
          }
        i++;
      }
    }

    // Export complete project
    exportProject() {
      let output = '; Generated by CV Sound OS7 Tool\n';
      output += '; ' + new Date().toISOString() + '\n\n';

      output += this.soundTable.exportAsm();

      for (const sequence of this.sequencer.getAllSequences()) {
        output += '\n' + this.sequencer.exportSequence(sequence.name);
      }

      return output;
    }
  }

  return {
    CVSoundSystem,
    SoundTable,
    MusicSequencer,
    PriorityManager,
    RAM_BASE,
    CHANNEL_OFFSETS
  };
})();

// Global instance
window.cvSoundSystem = new SoundSystem.CVSoundSystem();