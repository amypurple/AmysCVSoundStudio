// soundUI.js — Advanced UI Components for Complete ColecoVision Audio Development

const SoundUI = (() => {

  // Sequence Player for real-time playback
  class SequencePlayer {
    constructor(sequence, soundTable) {
      this.sequence = sequence;
      this.soundTable = soundTable;
      this.currentStep = 0;
      this.isPlaying = false;
      this.timeoutId = null;
    }

    play() {
      if (this.isPlaying) return;

      this.isPlaying = true;
      this.currentStep = 0;
      this.playStep();

      // Initialize speakers if needed
      if (!speakers) speakers = new Speaker(soundchip);
      speakers.play();
    }

    playStep() {
      if (!this.isPlaying || this.currentStep >= this.sequence.steps.length) {
        // Check for loop
        if (this.sequence.loopPoint !== null && this.sequence.loopPoint < this.sequence.steps.length) {
          this.currentStep = this.sequence.loopPoint;
        } else {
          this.stop();
          return;
        }
      }

      const step = this.sequence.steps[this.currentStep];

      // Load patterns into sound tables
      engine.reset();
      nbrtables = 0;

      // Set up continuous memory system if available
      const soundSystem = this.soundTable.parent; // Get reference to CVSoundSystem
      if (soundSystem && soundSystem.continuousMemory && soundSystem.memoryMap) {
        engine.setContinuousMemory(soundSystem.continuousMemory, true);
      }

      Object.entries(step.channels).forEach(([channel, patternIndex]) => {
        const pattern = this.soundTable.getPattern(patternIndex);
        if (pattern && pattern.data) {
          const tableIndex = parseInt(channel);

          // Use memory pointers if continuous memory is available
          if (soundSystem && soundSystem.memoryMap && soundSystem.memoryMap.has(pattern.name)) {
            const memInfo = soundSystem.memoryMap.get(pattern.name);
            engine.setChannelMemoryPointer(tableIndex, memInfo.startIndex);
            // Use the extended pattern data that includes fall-through
            sndtable[tableIndex] = [...pattern.data];
          } else {
            // Fall back to copying pattern data
            sndtable[tableIndex] = [...pattern.data];
          }
          nbrtables = Math.max(nbrtables, tableIndex + 1);
        }
      });

      // Start playback - the engine will process pattern data frame by frame
      if (nbrtables > 0) {
        engine.play();
      }

      // Schedule next step based on duration and TV system
      // Duration is in frames - convert based on NTSC (60Hz) or PAL (50Hz)
      const frameRate = this.getCurrentFrameRate();
      const durationMs = (step.duration / frameRate) * 1000;

      this.timeoutId = setTimeout(() => {
        this.currentStep++;
        this.playStep();
      }, durationMs);
    }

    stop() {
      this.isPlaying = false;
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      engine.reset();
      setStatus('Sequence stopped');
    }

    getCurrentFrameRate() {
      // Check the TV system radio buttons
      const ntscRadio = document.querySelector('input[name="tv"][value="NTSC"]');
      const palRadio = document.querySelector('input[name="tv"][value="PAL"]');

      if (palRadio && palRadio.checked) {
        return 50; // PAL frame rate
      } else {
        return 60; // NTSC frame rate (default)
      }
    }
  }

  // Sound Table Library Panel
  class SoundTableUI {
    constructor(container, soundSystem) {
      this.container = container;
      this.soundSystem = soundSystem;
      this.selectedPattern = null;
      this.init();
    }

    init() {
      this.container.innerHTML = `
        <div class="sound-table-panel">
          <div class="panel-header">
            <h3>Sound Pattern Library</h3>
            <div class="actions">
              <button id="importPattern">Import</button>
              <button id="newPattern">New</button>
              <button id="deletePattern">Delete</button>
            </div>
          </div>
          <div class="pattern-list" id="patternList"></div>
          <div class="pattern-details" id="patternDetails">
            <div class="detail-header">Pattern Details</div>
            <div class="detail-content">
              <label>Name: <input type="text" id="patternName" placeholder="Pattern name"></label>
              <label>Description: <input type="text" id="patternDesc" placeholder="Description"></label>
              <div class="pattern-info">
                <span class="channels">Channels: <span id="patternChannels">—</span></span>
                <span class="size">Size: <span id="patternSize">—</span> bytes</span>
                <span class="format">Format: <span id="patternFormat">Legacy</span></span>
                <span class="index">Index: <span id="patternIndex">—</span></span>
              </div>
              <button id="editPattern">Edit in ASM Editor</button>
              <button id="previewPattern">Preview</button>
            </div>
          </div>
        </div>
      `;

      this.bindEvents();
      this.refresh();
    }

    bindEvents() {
      document.getElementById('newPattern').onclick = () => this.createNewPattern();
      document.getElementById('deletePattern').onclick = () => this.deletePattern();
      document.getElementById('editPattern').onclick = () => this.editPattern();
      document.getElementById('previewPattern').onclick = () => this.previewPattern();
      document.getElementById('importPattern').onclick = () => this.importFromEditor();

      // Pattern name/description changes
      document.getElementById('patternName').onblur = () => this.updatePatternInfo();
      document.getElementById('patternDesc').onblur = () => this.updatePatternInfo();
    }

    refresh() {
      const listEl = document.getElementById('patternList');
      listEl.innerHTML = '';

      const patterns = this.soundSystem.soundTable.getAllPatterns();
      patterns.forEach(pattern => {
        const item = document.createElement('div');
        item.className = 'pattern-item';
        if (this.selectedPattern === pattern) item.classList.add('selected');

        item.innerHTML = `
          <div class="pattern-header">
            <span class="name">${pattern.name}</span>
            <span class="index">#${Array.from(this.soundSystem.soundTable.entries.keys()).find(k => this.soundSystem.soundTable.entries.get(k) === pattern)}</span>
          </div>
          <div class="pattern-meta">
            <span class="channels">Ch: ${pattern.channels.join(',')}</span>
            <span class="size">${pattern.data.length}b</span>
            <span class="format">${pattern.format === 'tiny' ? 'Tiny' : 'Legacy'}</span>
          </div>
          <div class="pattern-desc">${pattern.description || 'No description'}</div>
        `;

        item.onclick = () => this.selectPattern(pattern);
        item.ondragstart = (e) => {
          e.dataTransfer.setData('application/x-cv-pattern', JSON.stringify({
            index: Array.from(this.soundSystem.soundTable.entries.keys()).find(k => this.soundSystem.soundTable.entries.get(k) === pattern),
            name: pattern.name,
            channels: pattern.channels
          }));
        };
        item.draggable = true;

        listEl.appendChild(item);
      });
    }

    selectPattern(pattern) {
      this.selectedPattern = pattern;
      this.refresh();
      this.updateDetails();
    }

    updateDetails() {
      if (!this.selectedPattern) {
        document.getElementById('patternDetails').style.display = 'none';
        return;
      }

      document.getElementById('patternDetails').style.display = 'block';
      document.getElementById('patternName').value = this.selectedPattern.name;
      document.getElementById('patternDesc').value = this.selectedPattern.description || '';
      document.getElementById('patternChannels').textContent = this.selectedPattern.channels.join(', ');
      document.getElementById('patternSize').textContent = this.selectedPattern.data.length;
      const formatLabel = this.selectedPattern.format === 'tiny' ? 'Tiny Sound (read-only)' : 'Legacy OS7';
      document.getElementById('patternFormat').textContent = formatLabel;

      const index = Array.from(this.soundSystem.soundTable.entries.keys())
        .find(k => this.soundSystem.soundTable.entries.get(k) === this.selectedPattern);
      document.getElementById('patternIndex').textContent = index;
    }

    createNewPattern() {
      const name = prompt('Pattern name:');
      if (!name) return;

      const data = [0x10]; // Empty pattern with END
      const index = this.soundSystem.soundTable.addPattern(name, data);
      this.refresh();
    }

    importFromEditor() {
      const asmText = document.getElementById('asm').value;
      if (!asmText.trim()) {
        alert('No ASM code in editor to import');
        return;
      }

      const result = ASM.assembleMulti(asmText);
      if (result.error) {
        alert('ASM Error: ' + result.error);
        return;
      }

      const name = prompt('Pattern name:') || 'Imported_Pattern';
      if (result.tables && result.tables[0]) {
        this.soundSystem.soundTable.addPattern(name, result.tables[0]);
        this.refresh();
      }
    }

    editPattern() {
      if (!this.selectedPattern) return;

      document.getElementById('asm').value = ASM.dumpOne(
        this.selectedPattern.data,
        { system: currentSystem, comments: true, lfsr: currentLFSR },
        this.selectedPattern.name
      );

      // Switch to ASM editor pane
      document.getElementById('toggleEditor').click();
    }

    previewPattern() {
      if (!this.selectedPattern) return;

      // Load pattern into engine and play
      engine.reset();
      sndtable[0] = this.selectedPattern.data;
      nbrtables = 1;
      engine.play();

      if (!speakers) speakers = new Speaker(soundchip);
      speakers.play();
      setStatus('Previewing: ' + this.selectedPattern.name);
    }

    updatePatternInfo() {
      if (!this.selectedPattern) return;

      this.selectedPattern.name = document.getElementById('patternName').value || this.selectedPattern.name;
      this.selectedPattern.description = document.getElementById('patternDesc').value || '';
      this.refresh();
    }

    deletePattern() {
      if (!this.selectedPattern) return;

      if (confirm(`Delete pattern "${this.selectedPattern.name}"?`)) {
        const index = Array.from(this.soundSystem.soundTable.entries.keys())
          .find(k => this.soundSystem.soundTable.entries.get(k) === this.selectedPattern);
        this.soundSystem.soundTable.entries.delete(index);
        this.selectedPattern = null;
        this.refresh();
        this.updateDetails();
      }
    }
  }

  // Music Sequencer UI
  class SequencerUI {
    constructor(container, soundSystem) {
      this.container = container;
      this.soundSystem = soundSystem;
      this.currentSequence = null;
      this.selectedStep = null;
      this.init();
    }

    init() {
      this.container.innerHTML = `
        <div class="sequencer-panel">
          <div class="panel-header">
            <h3>Music Sequencer</h3>
            <div class="sequence-controls">
              <select id="sequenceSelect">
                <option value="">New Sequence...</option>
              </select>
              <button id="newSequence">New</button>
              <button id="deleteSequence">Delete</button>
            </div>
          </div>

          <div class="sequence-editor" id="sequenceEditor">
            <div class="timeline-header">
              <div class="step-col">Step</div>
              <div class="duration-col">Duration</div>
              <div class="channels-col">Channels (Ch0/Ch3/Ch2/Ch1)</div>
              <div class="actions-col">Actions</div>
            </div>
            <div class="timeline-content" id="timelineContent"></div>
            <div class="timeline-footer">
              <button id="addStep">Add Step</button>
              <button id="setLoop">Set Loop Here</button>
              <button id="playSequence">Play Sequence</button>
              <button id="stopSequence">Stop</button>
              <button id="stopAll">Stop All</button>
            </div>
          </div>

          <div class="step-editor" id="stepEditor">
            <h4>Step Editor</h4>
            <div class="step-info">
              <label>Duration: <input type="number" id="stepDuration" min="1" max="65535" value="60"></label>
              <button id="previewCurrentStep" class="preview-btn">▶ Preview This Step</button>
            </div>
            <div class="channel-assignments">
              <div class="channel-row">
                <label>Ch0 (Noise):</label>
                <select class="channel-select" data-channel="0">
                  <option value="">None</option>
                </select>
              </div>
              <div class="channel-row">
                <label>Ch3 (Tone3):</label>
                <select class="channel-select" data-channel="3">
                  <option value="">None</option>
                </select>
              </div>
              <div class="channel-row">
                <label>Ch2 (Tone2):</label>
                <select class="channel-select" data-channel="2">
                  <option value="">None</option>
                </select>
              </div>
              <div class="channel-row">
                <label>Ch1 (Tone1):</label>
                <select class="channel-select" data-channel="1">
                  <option value="">None</option>
                </select>
              </div>
            </div>

            <div class="pattern-data-editor" id="patternDataEditor" style="display: none;">
              <h5>Pattern Data Editor</h5>
              <div class="selected-pattern-info">
                <strong id="selectedPatternName">No pattern selected</strong>
                <span id="selectedPatternSize"></span>
              </div>

              <div class="pattern-editor-tabs">
                <button id="hexEditorTab" class="tab-button active">Hex Editor</button>
                <button id="asmEditorTab" class="tab-button">ASM View</button>
                <button id="analysisTab" class="tab-button">Analysis</button>
              </div>

              <div id="hexEditor" class="pattern-editor-view">
                <div class="hex-editor-header">
                  <span>Byte</span><span>Hex</span><span>Dec</span><span>Interpretation</span>
                </div>
                <div id="hexEditorContent" class="hex-editor-content"></div>
              </div>

              <div id="asmEditor" class="pattern-editor-view" style="display: none;">
                <textarea id="patternAsmText" rows="12" placeholder="Original ASM will appear here..."></textarea>
              </div>

              <div id="analysisEditor" class="pattern-editor-view" style="display: none;">
                <div id="patternAnalysis" class="pattern-analysis"></div>
              </div>
              <div class="pattern-actions">
                <button id="updatePatternData">Update Pattern Data</button>
                <button id="revertPatternData">Revert Changes</button>
                <button id="previewPatternData">▶ Preview Pattern</button>
                <button id="showParsedComparison">🔍 Show Parsed vs Original</button>
                <button id="showStepComparison">🔍 Analyze Complete Step</button>
              </div>

              <div class="parsed-comparison" id="parsedComparison" style="display: none;">
                <h6>Parser Analysis</h6>
                <div class="comparison-grid">
                  <div class="original-data">
                    <h7>Original ASM</h7>
                    <textarea id="originalAsmText" rows="6" readonly></textarea>
                  </div>
                  <div class="parsed-data">
                    <h7>Parsed Data</h7>
                    <textarea id="parsedDataText" rows="6" readonly></textarea>
                  </div>
                </div>
                <div class="analysis-results" id="analysisResults"></div>
              </div>
            </div>

            <div class="step-actions">
              <button id="updateStep">Update Step</button>
              <button id="deleteStep">Delete Step</button>
            </div>
          </div>
        </div>
      `;

      this.bindEvents();
      this.refreshSequenceList();
      this.refreshChannelSelects();
    }

    bindEvents() {
      document.getElementById('newSequence').onclick = () => this.createSequence();
      document.getElementById('deleteSequence').onclick = () => this.deleteSequence();
      document.getElementById('sequenceSelect').onchange = (e) => this.loadSequence(e.target.value);
      document.getElementById('addStep').onclick = () => this.addStep();
      document.getElementById('setLoop').onclick = () => this.setLoop();
      document.getElementById('playSequence').onclick = () => this.playSequence();
      document.getElementById('stopSequence').onclick = () => this.stopSequence();
      document.getElementById('stopAll').onclick = () => this.stopAll();
      document.getElementById('updateStep').onclick = () => this.updateStep();
      document.getElementById('deleteStep').onclick = () => this.deleteStep();

      // New pattern editing functionality
      document.getElementById('previewCurrentStep').onclick = () => {
        if (this.selectedStep !== null) this.previewStep(this.selectedStep);
      };
      document.getElementById('updatePatternData').onclick = () => this.updatePatternData();
      document.getElementById('revertPatternData').onclick = () => this.revertPatternData();
      document.getElementById('previewPatternData').onclick = () => this.previewPatternData();
      document.getElementById('showParsedComparison').onclick = () => this.showParsedComparison();
      document.getElementById('showStepComparison').onclick = () => this.showStepComparison();

      // Enhanced editor tabs
      document.getElementById('hexEditorTab').onclick = () => this.switchEditorTab('hex');
      document.getElementById('asmEditorTab').onclick = () => this.switchEditorTab('asm');
      document.getElementById('analysisTab').onclick = () => this.switchEditorTab('analysis');

      // Allow dropping patterns on channel selects
      document.querySelectorAll('.channel-select').forEach(select => {
        select.ondrop = (e) => this.handlePatternDrop(e, select);
        select.ondragover = (e) => e.preventDefault();
      });
    }

    refreshSequenceList() {
      const select = document.getElementById('sequenceSelect');
      const current = select.value;

      select.innerHTML = '<option value="">New Sequence...</option>';
      this.soundSystem.sequencer.getAllSequences().forEach(seq => {
        const option = document.createElement('option');
        option.value = seq.name;
        option.textContent = seq.name;
        select.appendChild(option);
      });

      if (current) select.value = current;
    }

    refreshChannelSelects() {
      const patterns = this.soundSystem.soundTable.getAllPatterns();

      document.querySelectorAll('.channel-select').forEach(select => {
        const current = select.value;
        select.innerHTML = '<option value="">None</option>';

        this.soundSystem.soundTable.entries.forEach((pattern, index) => {
          if (pattern.type === 'pattern') {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${index}: ${pattern.name}`;
            select.appendChild(option);
          }
        });

        if (current) select.value = current;
      });
    }

    createSequence() {
      const name = prompt('Sequence name:');
      if (!name) return;

      this.soundSystem.sequencer.createSequence(name);
      this.refreshSequenceList();
      document.getElementById('sequenceSelect').value = name;
      this.loadSequence(name);
    }

    loadSequence(name) {
      if (!name) {
        this.currentSequence = null;
        this.refreshTimeline();
        return;
      }

      this.currentSequence = this.soundSystem.sequencer.sequences.get(name);
      this.refreshTimeline();
    }

    refreshTimeline() {
      const content = document.getElementById('timelineContent');
      content.innerHTML = '';

      if (!this.currentSequence) {
        content.innerHTML = '<div class="no-sequence">Select or create a sequence</div>';
        return;
      }

      this.currentSequence.steps.forEach((step, index) => {
        const row = document.createElement('div');
        row.className = 'timeline-row';
        if (this.selectedStep === index) row.classList.add('selected');

        const channelInfo = Object.entries(step.channels)
          .map(([ch, idx]) => {
            const pattern = this.soundSystem.soundTable.getPattern(idx);
            const patternName = pattern ? pattern.name : `#${idx}`;
            return `Ch${ch}:${patternName}`;
          })
          .join(' ');

        row.innerHTML = `
          <div class="step-col">${index + 1}${this.currentSequence.loopPoint === index ? ' (LOOP)' : ''}</div>
          <div class="duration-col">${step.duration}</div>
          <div class="channels-col">${channelInfo || 'None'}</div>
          <div class="actions-col">
            <button onclick="soundUI.sequencer.selectStep(${index})">Edit</button>
            <button onclick="soundUI.sequencer.previewStep(${index})" class="preview-btn">▶ Preview</button>
          </div>
        `;

        content.appendChild(row);
      });
    }

    selectStep(index) {
      this.selectedStep = index;
      this.refreshTimeline();

      if (this.currentSequence && this.currentSequence.steps[index]) {
        const step = this.currentSequence.steps[index];
        document.getElementById('stepDuration').value = step.duration;

        // Update channel selects
        document.querySelectorAll('.channel-select').forEach(select => {
          const channel = select.dataset.channel;
          select.value = step.channels[channel] || '';

          // Add change listener to show pattern data when selection changes
          select.onchange = () => this.showPatternData(select.value, channel);
        });

        // Show the first available pattern data
        const firstChannelWithPattern = Object.entries(step.channels).find(([ch, idx]) => idx);
        if (firstChannelWithPattern) {
          this.showPatternData(firstChannelWithPattern[1], firstChannelWithPattern[0]);
        }
      }
    }

    addStep() {
      if (!this.currentSequence) return;

      const duration = parseInt(document.getElementById('stepDuration').value) || 60;
      const channels = {};

      document.querySelectorAll('.channel-select').forEach(select => {
        if (select.value) {
          channels[select.dataset.channel] = parseInt(select.value);
        }
      });

      this.soundSystem.sequencer.addStep(this.currentSequence.name, duration, channels);
      this.refreshTimeline();
    }

    updateStep() {
      if (!this.currentSequence || this.selectedStep === null) return;

      const duration = parseInt(document.getElementById('stepDuration').value) || 60;
      const channels = {};

      document.querySelectorAll('.channel-select').forEach(select => {
        if (select.value) {
          channels[select.dataset.channel] = parseInt(select.value);
        }
      });

      // Update the step
      this.currentSequence.steps[this.selectedStep] = {
        duration,
        channels,
        encoding: this.currentSequence.steps[this.selectedStep].encoding
      };

      this.refreshTimeline();
    }

    deleteStep() {
      if (!this.currentSequence || this.selectedStep === null) return;

      this.currentSequence.steps.splice(this.selectedStep, 1);
      this.selectedStep = null;
      this.refreshTimeline();
    }

    setLoop() {
      if (!this.currentSequence || this.selectedStep === null) return;

      this.soundSystem.sequencer.setLoop(this.currentSequence.name, this.selectedStep);
      this.refreshTimeline();
    }

    handlePatternDrop(e, select) {
      e.preventDefault();
      const data = JSON.parse(e.dataTransfer.getData('application/x-cv-pattern'));
      select.value = data.index;
    }

    playSequence() {
      if (!this.currentSequence) return;

      // Stop any current playback first
      this.stopAll();

      // Create a sequence player
      this.sequencePlayer = new SequencePlayer(this.currentSequence, this.soundSystem.soundTable);
      this.sequencePlayer.play();

      // Update track name in player
      if (window.updateCurrentTrack) {
        window.updateCurrentTrack(this.currentSequence.name);
      }
      if (window.startMiniTimer) {
        window.startMiniTimer();
      }

      setStatus(`Playing sequence: ${this.currentSequence.name}`);
    }

    stopSequence() {
      if (this.sequencePlayer && this.sequencePlayer.isPlaying) {
        this.sequencePlayer.stop();
        if (window.stopMiniTimer) {
          window.stopMiniTimer();
        }
        setStatus('Sequence stopped');
      }
    }

    stopAll() {
      // Stop sequence player
      if (this.sequencePlayer && this.sequencePlayer.isPlaying) {
        this.sequencePlayer.stop();
      }

      // Stop speakers
      if (speakers) {
        speakers.stop();
      }

      // Reset sound engine
      engine.reset();

      // Stop timer and clear track name
      if (window.stopMiniTimer) {
        window.stopMiniTimer();
      }
      if (window.updateCurrentTrack) {
        window.updateCurrentTrack('');
      }

      setStatus('All audio stopped');
    }

    previewStep(stepIndex) {
      if (!this.currentSequence || stepIndex >= this.currentSequence.steps.length) return;

      const step = this.currentSequence.steps[stepIndex];

      // Stop any current playback
      if (speakers) speakers.stop();
      if (this.sequencePlayer && this.sequencePlayer.isPlaying) {
        this.sequencePlayer.stop();
      }
      engine.reset();

      // Load patterns for this step using continuous memory
      nbrtables = 0;

      // Set up continuous memory system if available
      if (this.soundSystem && this.soundSystem.continuousMemory && this.soundSystem.memoryMap) {
        engine.setContinuousMemory(this.soundSystem.continuousMemory, true);
      }

      Object.entries(step.channels).forEach(([channel, patternIndex]) => {
        const pattern = this.soundSystem.soundTable.getPattern(patternIndex);
        if (pattern && pattern.data) {
          const tableIndex = parseInt(channel);

          // Use memory pointers if continuous memory is available
          if (this.soundSystem && this.soundSystem.memoryMap && this.soundSystem.memoryMap.has(pattern.name)) {
            const memInfo = this.soundSystem.memoryMap.get(pattern.name);
            engine.setChannelMemoryPointer(tableIndex, memInfo.startIndex);
            // IMPORTANT: Still populate sndtable for compatibility with sound engine
            sndtable[tableIndex] = [...pattern.data];
          } else {
            // Fall back to copying pattern data
            sndtable[tableIndex] = [...pattern.data];
          }
          nbrtables = Math.max(nbrtables, tableIndex + 1);
        }
      });

      // Start playback for preview
      if (nbrtables > 0) {
        engine.play();
        if (!speakers) speakers = new Speaker(soundchip);
        speakers.play();

        // Stop preview after step duration
        const frameRate = this.getCurrentFrameRate();
        const durationMs = (step.duration / frameRate) * 1000;
        setTimeout(() => {
          if (speakers) speakers.stop();
          engine.reset();
          setStatus('Step preview complete');
        }, durationMs);

        setStatus(`Previewing Step ${stepIndex + 1} (${step.duration} frames = ${durationMs}ms)`);
      }
    }

    getCurrentFrameRate() {
      // Check the TV system radio buttons
      const palRadio = document.querySelector('input[name="tv"][value="PAL"]');
      return (palRadio && palRadio.checked) ? 50 : 60;
    }

    showPatternData(patternIndex, channel) {
      if (!patternIndex) {
        document.getElementById('patternDataEditor').style.display = 'none';
        return;
      }

      const pattern = this.soundSystem.soundTable.getPattern(parseInt(patternIndex));
      if (!pattern) {
        document.getElementById('patternDataEditor').style.display = 'none';
        return;
      }

      // Show the pattern data editor
      const editorEl = document.getElementById('patternDataEditor');
      const textArea = document.getElementById('patternDataText');
      const isTiny = pattern.format === 'tiny';

      editorEl.style.display = 'block';
      document.getElementById('selectedPatternName').textContent = `${pattern.name} (Channel ${channel})`;
      document.getElementById('selectedPatternSize').textContent = `${pattern.data.length} bytes`;

      if (isTiny) {
        textArea.value = '// Tiny Sound pattern (read-only)';
        textArea.setAttribute('readonly', 'readonly');
      } else {
        textArea.removeAttribute('readonly');
        const patternText = pattern.data.map((value, index) => {
          if (index % 8 === 0 && index > 0) return '\n' + '0x' + value.toString(16).padStart(2, '0');
          return '0x' + value.toString(16).padStart(2, '0');
        }).join(', ');
        textArea.value = patternText;
      }

      // Store current pattern for editing
      this.currentEditPattern = { pattern, patternIndex, channel };
      this.originalPatternData = [...pattern.data]; // Backup for revert
    }

    updatePatternData() {
      if (!this.currentEditPattern) return;
      if (this.currentEditPattern.pattern.format === 'tiny') {
        alert('Tiny Sound patterns are read-only.');
        return;
      }

      const text = document.getElementById('patternDataText').value;
      try {
        // Parse the hex values from the text
        const values = text.match(/0x[0-9a-fA-F]+/g);
        if (!values) throw new Error('No valid hex values found');

        const newData = values.map(hex => parseInt(hex, 16));

        // Update the pattern data
        this.currentEditPattern.pattern.data = newData;
        document.getElementById('selectedPatternSize').textContent = `${newData.length} bytes`;

        setStatus(`Pattern ${this.currentEditPattern.pattern.name} updated`);

      } catch (error) {
        alert('Error parsing pattern data: ' + error.message);
      }
    }

    revertPatternData() {
      if (!this.currentEditPattern || !this.originalPatternData) return;
      if (this.currentEditPattern.pattern.format === 'tiny') {
        alert('Tiny Sound patterns are read-only.');
        return;
      }

      // Restore original data
      this.currentEditPattern.pattern.data = [...this.originalPatternData];
      this.showPatternData(this.currentEditPattern.patternIndex, this.currentEditPattern.channel);
      setStatus('Pattern data reverted to original');
    }

    previewPatternData() {
      if (!this.currentEditPattern) return;
      if (this.currentEditPattern.pattern.format === 'tiny') {
        alert('Tiny Sound patterns are read-only.');
        return;
      }

      // Update pattern data first
      this.updatePatternData();

      // Stop any current playback
      if (speakers) speakers.stop();
      engine.reset();

      // Load just this pattern for preview
      const pattern = this.currentEditPattern.pattern;
      const channel = parseInt(this.currentEditPattern.channel);

      nbrtables = 0;
      sndtable[channel] = [...pattern.data];
      nbrtables = Math.max(nbrtables, channel + 1);

      // Start playback
      engine.play();
      if (!speakers) speakers = new Speaker(soundchip);
      speakers.play();

      setStatus(`Previewing pattern: ${pattern.name}`);
    }

    showParsedComparison() {
      if (!this.currentEditPattern) return;

      const pattern = this.currentEditPattern.pattern;
      const patternName = pattern.name;

      // Find the original ASM lines for this pattern
      const originalLines = this.soundSystem.originalAsmLines || [];
      const patternStart = originalLines.findIndex(line => line.trim() === `${patternName}:`);

      if (patternStart === -1) {
        alert(`Could not find pattern "${patternName}" in original ASM`);
        return;
      }

      // Extract original pattern lines
      const originalPatternLines = [];
      for (let i = patternStart + 1; i < originalLines.length; i++) {
        const line = originalLines[i].trim();
        if (!line || line.startsWith(';')) continue; // Skip empty lines and comments
        if (line.endsWith(':')) break; // Stop at next label
        if (line.startsWith('db ')) {
          originalPatternLines.push(line);
        }
      }

      // Parse the original db statements to get the actual bytes
      const originalBytes = [];
      originalPatternLines.forEach(line => {
        const dbMatch = line.match(/^db\s+(.+)$/);
        if (dbMatch) {
          try {
            const values = ASM.parseBytes(dbMatch[1]);
            originalBytes.push(...values);
          } catch (e) {
            console.warn('Could not parse db line:', line, e);
          }
        }
      });

      // Show the comparison
      document.getElementById('parsedComparison').style.display = 'block';

      // Original ASM text
      document.getElementById('originalAsmText').value =
        `${patternName}:\n` + originalPatternLines.join('\n');

      // Parsed data as hex
      const parsedHex = pattern.data.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ');
      document.getElementById('parsedDataText').value =
        `Parsed as ${pattern.data.length} bytes:\n${parsedHex}`;

      // Analysis
      const analysisEl = document.getElementById('analysisResults');
      let analysis = '';

      if (originalBytes.length !== pattern.data.length) {
        analysis += `⚠️ LENGTH MISMATCH: Original has ${originalBytes.length} bytes, parsed has ${pattern.data.length} bytes\n\n`;
      } else {
        analysis += `✅ LENGTH MATCH: Both have ${pattern.data.length} bytes\n\n`;
      }

      // Compare byte by byte
      const maxLen = Math.max(originalBytes.length, pattern.data.length);
      let differences = 0;

      for (let i = 0; i < maxLen; i++) {
        const orig = originalBytes[i];
        const parsed = pattern.data[i];

        if (orig !== parsed) {
          differences++;
          analysis += `❌ Byte ${i}: Original=0x${(orig || 0).toString(16).padStart(2, '0')}, Parsed=0x${(parsed || 0).toString(16).padStart(2, '0')}\n`;
        }
      }

      if (differences === 0) {
        analysis += `✅ PERFECT MATCH: All bytes identical!\n`;
      } else {
        analysis += `\n⚠️ Found ${differences} differences out of ${maxLen} bytes`;
      }

      analysisEl.innerHTML = `<pre>${analysis}</pre>`;
    }

    showStepComparison() {
      if (this.selectedStep === null || !this.currentSequence) return;

      const step = this.currentSequence.steps[this.selectedStep];
      if (!step) return;

      console.log('=== COMPLETE STEP ANALYSIS ===');
      console.log(`Step ${this.selectedStep + 1}:`, step);

      const originalLines = this.soundSystem.originalAsmLines || [];
      let analysisText = `COMPLETE STEP ANALYSIS - Step ${this.selectedStep + 1}\n`;
      const frameRate = this.getCurrentFrameRate();
      analysisText += `Duration: ${step.duration} frames @ ${frameRate}Hz (${(step.duration/frameRate*1000).toFixed(1)}ms)\n\n`;

      // Analyze each channel
      Object.entries(step.channels).forEach(([channel, patternIndex]) => {
        const pattern = this.soundSystem.soundTable.getPattern(patternIndex);
        if (!pattern) {
          analysisText += `❌ Channel ${channel}: Pattern index ${patternIndex} NOT FOUND\n\n`;
          return;
        }

        analysisText += `📡 CHANNEL ${channel} (${['Noise', 'Tone1', 'Tone2', 'Tone3'][channel]}):\n`;
        analysisText += `   Pattern: ${pattern.name} (Index ${patternIndex})\n`;
        analysisText += `   Parsed: ${pattern.data.length} bytes\n`;

        // Find original pattern in ASM
        const patternStart = originalLines.findIndex(line => line.trim() === `${pattern.name}:`);
        if (patternStart === -1) {
          analysisText += `   ❌ Original pattern not found in ASM\n\n`;
          return;
        }

        // Extract original bytes
        const originalBytes = [];
        for (let i = patternStart + 1; i < originalLines.length; i++) {
          const line = originalLines[i].trim();
          if (!line || line.startsWith(';')) continue;
          if (line.endsWith(':')) break;
          if (line.startsWith('db ')) {
            const dbMatch = line.match(/^db\s+(.+)$/);
            if (dbMatch) {
              try {
                const values = ASM.parseBytes(dbMatch[1]);
                originalBytes.push(...values);
              } catch (e) {
                console.warn('Parse error:', line, e);
              }
            }
          }
        }

        analysisText += `   Original: ${originalBytes.length} bytes\n`;

        if (originalBytes.length !== pattern.data.length) {
          analysisText += `   ⚠️ LENGTH MISMATCH!\n`;
        } else {
          analysisText += `   ✅ Length matches\n`;
        }

        // Check for differences
        let differences = 0;
        const maxLen = Math.max(originalBytes.length, pattern.data.length);
        for (let i = 0; i < maxLen; i++) {
          if (originalBytes[i] !== pattern.data[i]) differences++;
        }

        if (differences === 0) {
          analysisText += `   ✅ Perfect byte match\n`;
        } else {
          analysisText += `   ❌ ${differences} byte differences\n`;
        }

        analysisText += `\n`;
      });

      // Show in comparison area
      document.getElementById('parsedComparison').style.display = 'block';
      document.getElementById('originalAsmText').value = 'COMPLETE STEP ANALYSIS';
      document.getElementById('parsedDataText').value = 'See analysis results below';
      document.getElementById('analysisResults').innerHTML = `<pre>${analysisText}</pre>`;

    }

    deleteSequence() {
      if (!this.currentSequence) return;

      if (confirm(`Delete sequence "${this.currentSequence.name}"?`)) {
        this.soundSystem.sequencer.sequences.delete(this.currentSequence.name);
        this.currentSequence = null;
        this.refreshSequenceList();
        this.refreshTimeline();
      }
    }

    // Enhanced Pattern Editor Methods
    switchEditorTab(tab) {
      // Update tab buttons
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
      document.getElementById(`${tab}EditorTab`).classList.add('active');

      // Show/hide editor views
      document.querySelectorAll('.pattern-editor-view').forEach(view => view.style.display = 'none');
      document.getElementById(`${tab}Editor`).style.display = 'block';

      // Load content based on tab
      if (this.currentEditPattern) {
        switch(tab) {
          case 'hex':
            this.loadHexEditor();
            break;
          case 'asm':
            this.loadAsmEditor();
            break;
          case 'analysis':
            this.loadPatternAnalysis();
            break;
        }
      }
    }

    loadHexEditor() {
      const pattern = this.currentEditPattern.pattern;
      const content = document.getElementById('hexEditorContent');

      let html = '';
      pattern.data.forEach((byte, index) => {
        const interpretation = this.interpretByte(byte, index, pattern.data);
        html += `
          <div class="hex-editor-row editable" data-index="${index}">
            <span class="byte-index">${index.toString().padStart(3, '0')}</span>
            <span class="byte-hex">0x${byte.toString(16).padStart(2, '0').toUpperCase()}</span>
            <span class="byte-dec">${byte}</span>
            <span class="byte-interpretation ${interpretation.type}">${interpretation.desc}</span>
          </div>
        `;
      });

      content.innerHTML = html;
    }

    interpretByte(byte, index, data) {
      // ColecoVision sound engine command interpretation
      if (byte === 0x18 || byte === 0x58 || byte === 0x98 || byte === 0xd8) {
        return { type: 'command', desc: `🔄 Loop/Repeat (${byte === 0x18 ? 'standard' : byte === 0x58 ? 'variant1' : byte === 0x98 ? 'variant2' : 'variant3'})` };
      }

      if (byte === 0x10 || byte === 0x50 || byte === 0x90 || byte === 0xd0) {
        return { type: 'command', desc: '🛑 End/Stop' };
      }

      if ((byte & 0x20) === 0x20) {
        const restLength = byte & 0x1f;
        return { type: 'command', desc: `⏸️ Rest ${restLength === 0 ? 256 : restLength} frames` };
      }

      const channel = (byte >>> 6) & 3;
      const code = byte & 0x3f;

      if (code <= 3) {
        const noteTypes = ['Simple Note', 'Freq Swept', 'Vol Swept', 'Freq+Vol Swept'];
        return { type: 'data', desc: `🎵 Ch${channel}: ${noteTypes[code]}` };
      }

      if (byte === 0x00 && index < data.length - 1) {
        const next = data[index + 1];
        if (next === 0x00) {
          return { type: 'data', desc: '🔇 Silence marker' };
        }
      }

      if (byte >= 0x80 && byte <= 0xff) {
        return { type: 'frequency', desc: `🎼 Frequency byte (${byte})` };
      }

      return { type: 'data', desc: `📊 Data byte` };
    }

    loadAsmEditor() {
      const pattern = this.currentEditPattern.pattern;
      const textarea = document.getElementById('patternAsmText');

      // Generate ASM representation
      let asm = `${pattern.name}:\n`;

      // Group bytes into db statements (typically 4-6 bytes per line)
      const bytesPerLine = 5;
      for (let i = 0; i < pattern.data.length; i += bytesPerLine) {
        const chunk = pattern.data.slice(i, i + bytesPerLine);
        const hexValues = chunk.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(',');
        asm += `\tdb  ${hexValues}\n`;
      }

      textarea.value = asm;
    }

    loadPatternAnalysis() {
      const pattern = this.currentEditPattern.pattern;
      const container = document.getElementById('patternAnalysis');

      if (pattern.format === 'tiny') {
        container.textContent = 'Tiny Sound pattern – BIOS routine playback (read-only).';
        return;
      }

      let analysis = `Pattern: ${pattern.name}\n`;
      analysis += `Size: ${pattern.data.length} bytes\n`;
      analysis += `Channel: ${this.currentEditPattern.channel}\n\n`;

      // Analyze pattern structure
      let commands = 0;
      let notes = 0;
      let rests = 0;
      let hasLoop = false;

      pattern.data.forEach((byte, index) => {
        if (byte === 0x18 || byte === 0x58 || byte === 0x98 || byte === 0xd8) {
          hasLoop = true;
          commands++;
        } else if ((byte & 0x20) === 0x20) {
          rests++;
        } else if ((byte & 0x3f) <= 3) {
          notes++;
        }
      });

      analysis += `Structure Analysis:\n`;
      analysis += `- Notes: ${notes}\n`;
      analysis += `- Rests: ${rests}\n`;
      analysis += `- Commands: ${commands}\n`;
      analysis += `- Has Loop: ${hasLoop ? 'Yes' : 'No'}\n\n`;

      analysis += `Pattern Type: ${this.classifyPattern(pattern.data)}\n`;

      container.textContent = analysis;
    }

    classifyPattern(data) {
      if (data.some(b => b === 0x02)) return 'Noise Pattern (likely percussion)';
      if (data.some(b => (b & 0x3f) === 1 || (b & 0x3f) === 3)) return 'Frequency Swept Pattern';
      if (data.some(b => (b & 0x3f) === 2 || (b & 0x3f) === 3)) return 'Volume Swept Pattern';
      if (data.some(b => (b & 0x20) === 0x20)) return 'Rhythm Pattern (with rests)';
      return 'Tone Pattern';
    }
  }

  // Priority System Visualization
  class PriorityUI {
    constructor(container, soundSystem) {
      this.container = container;
      this.soundSystem = soundSystem;
      this.init();
    }

    init() {
      this.container.innerHTML = `
        <div class="priority-panel">
          <div class="panel-header">
            <h3>RAM Layout & Priority System</h3>
            <div class="actions">
              <button id="clearMusic">Clear Music</button>
              <button id="clearSFX">Clear SFX</button>
              <button id="clearAll">Clear All</button>
            </div>
          </div>

          <div class="ram-layout" id="ramLayout"></div>

          <div class="priority-info">
            <h4>Priority Rules</h4>
            <ul>
              <li>Sound effects (SFX) always override music on any channel</li>
              <li>Music channels: Ch0 (Noise), Ch3 (Tone3), Ch2 (Tone2), Ch1 (Tone1)</li>
              <li>SFX slots can be assigned to any channel with high priority</li>
              <li>RAM base address: $${SoundSystem.RAM_BASE.toString(16).toUpperCase()}</li>
            </ul>
          </div>
        </div>
      `;

      this.bindEvents();
      this.refresh();
    }

    bindEvents() {
      document.getElementById('clearMusic').onclick = () => {
        this.soundSystem.priorityManager.clear('music');
        this.refresh();
      };

      document.getElementById('clearSFX').onclick = () => {
        this.soundSystem.priorityManager.clear('sfx');
        this.refresh();
      };

      document.getElementById('clearAll').onclick = () => {
        this.soundSystem.priorityManager.clear('both');
        this.refresh();
      };
    }

    refresh() {
      const layout = this.soundSystem.priorityManager.getLayout();
      const container = document.getElementById('ramLayout');

      container.innerHTML = '';

      layout.forEach(slot => {
        const div = document.createElement('div');
        div.className = `ram-slot ${slot.type} ${slot.priority}`;

        const pattern = slot.active ? this.soundSystem.soundTable.getPattern(slot.active) : null;

        div.innerHTML = `
          <div class="slot-header">
            <span class="channel">${slot.type === 'music' ? 'Ch' + slot.channel : slot.channel}</span>
            <span class="address">$${slot.address.toString(16).toUpperCase()}</span>
            <span class="priority">${slot.priority}</span>
          </div>
          <div class="slot-content">
            ${pattern ? `
              <div class="pattern-name">${pattern.name}</div>
              <div class="pattern-size">${pattern.data.length} bytes</div>
            ` : '<div class="empty">Empty</div>'}
          </div>
        `;

        // Allow dropping patterns
        div.ondrop = (e) => this.handlePatternDrop(e, slot);
        div.ondragover = (e) => e.preventDefault();

        container.appendChild(div);
      });
    }

    handlePatternDrop(e, slot) {
      e.preventDefault();
      const data = JSON.parse(e.dataTransfer.getData('application/x-cv-pattern'));

      if (slot.type === 'music') {
        this.soundSystem.priorityManager.setActive(slot.channel, data.index, 'music');
      } else {
        this.soundSystem.priorityManager.setActive(slot.channel, data.index, 'sfx');
      }

      this.refresh();
    }
  }

  // Export UI
  class ExportUI {
    constructor(container, soundSystem) {
      this.container = container;
      this.soundSystem = soundSystem;
      this.init();
    }

    init() {
      this.container.innerHTML = `
        <div class="export-panel">
          <div class="panel-header">
            <h3>Export Project</h3>
          </div>

          <div class="export-options">
            <label><input type="checkbox" id="exportSoundTable" checked> Sound Table (_snd_table)</label>
            <label><input type="checkbox" id="exportPatterns" checked> Pattern Data</label>
            <label><input type="checkbox" id="exportSequences" checked> Music Sequences</label>
            <label><input type="checkbox" id="exportComments" checked> Include Comments</label>
          </div>

          <div class="export-actions">
            <button id="generateASM">Generate ASM</button>
            <button id="downloadASM">Download File</button>
            <button id="copyToClipboard">Copy to Clipboard</button>
          </div>

          <textarea id="exportOutput" readonly placeholder="Generated code will appear here..."></textarea>
        </div>
      `;

      this.bindEvents();
    }

    bindEvents() {
      document.getElementById('generateASM').onclick = () => this.generateASM();
      document.getElementById('downloadASM').onclick = () => this.downloadASM();
      document.getElementById('copyToClipboard').onclick = () => this.copyToClipboard();
    }

    generateASM() {
      let output = this.soundSystem.exportProject();
      document.getElementById('exportOutput').value = output;
    }

    downloadASM() {
      const content = document.getElementById('exportOutput').value;
      if (!content) {
        alert('Generate ASM first');
        return;
      }

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cv_sound_data.asm';
      a.click();
      URL.revokeObjectURL(url);
    }

    copyToClipboard() {
      const output = document.getElementById('exportOutput');
      output.select();
      document.execCommand('copy');
      alert('Copied to clipboard');
    }
  }

  return {
    SequencePlayer,
    SoundTableUI,
    SequencerUI,
    PriorityUI,
    ExportUI
  };
})();