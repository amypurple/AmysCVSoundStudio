// Globals provided by original project
engine = new SoundEngine();
window.engine = engine; // Make sure engine is accessible
soundchip = new SoundChip(engine, 59.94); // default NTSC
let speakers = null;
let currentSystem = 'NTSC';
let currentLFSR = 15;      // NEW: 15 (TI/Coleco) or 16 (Sega VDP)
function setStatus(msg) { const el = document.getElementById('status'); if (el) el.textContent = msg || ''; }

// Song selection: call engine.demo(i) to populate tables, but do not play
window.onSongLoaded = function (choice) {
  const tables = [];
  for (let t = 0; t < nbrtables; t++) tables.push([...(sndtable[t] || [])]);
  document.getElementById('asm').value = ASM.dumpMulti(
    tables,
    { system: currentSystem, comments: document.getElementById('inlineComments').checked, lfsr: currentLFSR }
  );
  const byteLines = tables.map((tab, idx) => 'T' + idx + ': ' + tab.map(b => b.toString(16).padStart(2, '0')).join(' '));
  document.getElementById('bytes').value = byteLines.join('\n');
  setStatus('Loaded: ' + (MUSIC[choice] || ('Song ' + choice)) + ' — ready to edit');
};

function initUI() {
  // Populate music menu directly from MUSIC array
  const musicDemoList = document.getElementById('musicDemoList');

  if (!window.MUSIC) {
    console.error('MUSIC array not found!');
    musicDemoList.innerHTML = '<div style="color: #ff6666; padding: 8px;">Error: Music data not loaded</div>';
    return;
  }

  window.MUSIC.forEach((musicName, index) => {
    const musicItem = document.createElement('div');
    musicItem.className = 'music-item';
    musicItem.textContent = musicName;
    musicItem.onclick = async () => {
      try {
        // Stop any current playback first
        if (window.soundUI?.sequencer?.stopAll) {
          window.soundUI.sequencer.stopAll();
        }

        // Check if engine exists
        if (!window.engine) {
          console.error('Engine not found!');
          return;
        }

        engine.demo(index); // populate sndtable[]

        // Call onSongLoaded to update ASM editor and bytes display
        if (window.onSongLoaded) {
          window.onSongLoaded(index);
        }

        // Update current track display
        if (window.updateCurrentTrack) {
          window.updateCurrentTrack(musicName);
        }

        // Start timer for playback
        if (window.startMiniTimer) {
          window.startMiniTimer();
        }

        // Remove playing class from all music items
        document.querySelectorAll('.music-item').forEach(item => item.classList.remove('playing'));
        musicItem.classList.add('playing');

        // Automatically play the loaded track
        await playCurrentTrack();
      } catch (error) {
        console.error('Error in music click handler:', error);
      }
    };
    musicDemoList.appendChild(musicItem);
  });

  // Initialize menu system
  initMenuSystem();

  // Initialize theme toggle
  initThemeToggle();

  // Initialize floating player
  initFloatingPlayer();

  // Transport (main controls)
  document.getElementById('playBtn').onclick = playFromEditor;
  document.getElementById('stopBtn').onclick = () => {
    // Stop all audio including sequences
    if (window.soundUI?.sequencer?.stopAll) {
      window.soundUI.sequencer.stopAll();
    }
    if (window.stopMiniTimer) window.stopMiniTimer();
    setStatus('Stopped');
  };
  document.getElementById('muteBtn').onclick = (e) => {
    if (!speakers || !speakers.gain) return;
    const g = speakers.gain.gain, now = speakers.audioContext.currentTime;
    const icon = e.currentTarget.querySelector('span');
    if (g.value > 0) { 
      g.setTargetAtTime(0.0, now, 0.02); 
      e.currentTarget.classList.add('muted');
      icon.textContent = 'volume_off';
    } else { 
      g.setTargetAtTime(0.5, now, 0.02); 
      e.currentTarget.classList.remove('muted'); 
      icon.textContent = 'volume_up';
    }
  };

  // Compact transport controls (for minimized state)
  document.getElementById('miniPlayBtn').onclick = playFromEditor;
  document.getElementById('miniStopBtn').onclick = () => {
    // Stop all audio including sequences
    if (window.soundUI?.sequencer?.stopAll) {
      window.soundUI.sequencer.stopAll();
    }
    if (window.stopMiniTimer) window.stopMiniTimer();
    setStatus('Stopped');
  };
  document.getElementById('miniMuteBtn').onclick = (e) => {
    if (!speakers || !speakers.gain) return;
    const g = speakers.gain.gain, now = speakers.audioContext.currentTime;
    const icon = e.currentTarget.querySelector('span');
    const mainMuteBtn = document.getElementById('muteBtn');
    const mainIcon = mainMuteBtn.querySelector('span');

    if (g.value > 0) {
      g.setTargetAtTime(0.0, now, 0.02);
      e.currentTarget.classList.add('muted');
      mainMuteBtn.classList.add('muted');
      icon.textContent = 'volume_off';
      mainIcon.textContent = 'volume_off';
    } else {
      g.setTargetAtTime(0.5, now, 0.02);
      e.currentTarget.classList.remove('muted');
      mainMuteBtn.classList.remove('muted');
      icon.textContent = 'volume_up';
      mainIcon.textContent = 'volume_up';
    }
  };

  // NTSC/PAL
  document.querySelectorAll('input[name=tv]').forEach(r => {
    r.onchange = () => {
      if (!r.checked) return;
      currentSystem = r.value;
      const hz = (currentSystem === 'PAL') ? 50.0 : 59.94;
      soundchip = new SoundChip(engine, hz);
      if (speakers && typeof speakers.stop === 'function') { try { speakers.stop(); } catch (_) { } }
      speakers = null;
      setStatus('System set to ' + currentSystem);
      // refresh ASM comments
      const asm = document.getElementById('asm').value;
      const res = ASM.assembleMulti(asm);
      if (res.tables && res.tables.length)
        document.getElementById('asm').value = ASM.dumpMulti(
          res.tables, { system: currentSystem, comments: document.getElementById('inlineComments').checked, lfsr: currentLFSR }
        );
    };
  });

  // NEW: LFSR (periodic noise divisor) 15 vs 16
  document.querySelectorAll('input[name=lfsr]').forEach(r => {
    r.onchange = () => {
      if (!r.checked) return;
      currentLFSR = parseInt(r.value, 10) || 15;
      setStatus('Noise periodic LFSR set to ' + currentLFSR + ' (' + (currentLFSR === 15 ? 'TI/Coleco' : 'Sega VDP') + ')');
      const asm = document.getElementById('asm').value;
      const res = ASM.assembleMulti(asm);
      if (res.tables && res.tables.length) {
        document.getElementById('asm').value = ASM.dumpMulti(
          res.tables, { system: currentSystem, comments: document.getElementById('inlineComments').checked, lfsr: currentLFSR }
        );
      }
    };
  });

  // Enhanced ASM processing with auto-import
  document.getElementById('asmToBytes').onclick = () => {
    const asmText = document.getElementById('asm').value;

    // Check if this contains sequence data (music sequences or sound tables)
    const hasSequenceData = asmText.includes('_music') ||
                           asmText.includes('_commando') ||
                           asmText.includes('_snd_table') ||
                           asmText.includes('_sound_table') ||
                           asmText.includes('music_ch') ||
                           (asmText.includes('dw ') && asmText.includes('db '));

    if (hasSequenceData) {
      // Import the complete file into the sound system
      try {
        cvSoundSystem.importAsmFile(asmText);
        soundUI.soundTable.refresh();
        soundUI.sequencer.refreshChannelSelects();
        soundUI.sequencer.refreshSequenceList();

        // Add sequences to song selection
        try {
          if (window.addSequencesToSongList) {
            window.addSequencesToSongList();
          }
        } catch (songListError) {
          console.error('Error adding to song list:', songListError);
        }

        // Auto-open sequencer view and select first sequence
        if (window.hideAllPanes) {
          window.hideAllPanes();
          document.getElementById('sequencerPane').hidden = false;
          window.updateMenuActiveStates('toggleSequencer');
        } else {
          console.error('hideAllPanes function not found');
        }

        // Auto-select first sequence if available (with proper timing)
        const waitForSequencesAndPlay = () => {
          const availableSequences = cvSoundSystem.sequencer.getAllSequences();
          if (availableSequences && availableSequences.length > 0) {
            const firstSequence = availableSequences[0];

            if (soundUI?.sequencer?.loadSequence && soundUI?.sequencer?.playSequence) {
              // Load the sequence
              soundUI.sequencer.loadSequence(firstSequence.name);

              // Wait longer for UI to fully update and sequence to be ready
              setTimeout(() => {
                // Double-check that the sequence is actually loaded and ready
                if (soundUI.sequencer.currentSequence && soundUI.sequencer.currentSequence.name === firstSequence.name) {
                  soundUI.sequencer.playSequence();
                  setStatus(`Imported complete sound data! Auto-playing sequence: ${firstSequence.name}`);
                } else {
                  setTimeout(() => {
                    if (soundUI.sequencer.currentSequence) {
                      soundUI.sequencer.playSequence();
                      setStatus(`Imported complete sound data! Auto-playing sequence: ${firstSequence.name}`);
                    } else {
                      console.error('Sequence still not ready after delay');
                      setStatus(`Imported complete sound data! Sequence loaded: ${firstSequence.name}`);
                    }
                  }, 300);
                }
              }, 500);
            } else {
              console.error('sequencer.loadSequence or playSequence not found');
              setStatus('Imported complete sound data with patterns and sequences!');
            }
          } else {
            // Try again after a short delay if sequences aren't ready
            setTimeout(waitForSequencesAndPlay, 200);
          }
        };

        // Start the sequence waiting process
        waitForSequencesAndPlay();
        return;
      } catch (error) {
        setStatus('Import error: ' + error.message);
      }
    }

    // Regular assembly for single patterns
    const res = ASM.assembleMulti(asmText);
    if (res.error) { setStatus('ASM error on line ' + res.line + ': ' + res.error); return; }
    const byteLines = res.tables.map((tab, idx) => 'T' + idx + ': ' + tab.map(b => b.toString(16).padStart(2, '0')).join(' '));
    document.getElementById('bytes').value = byteLines.join('\n');
    setStatus('Assembled ' + res.tables.map(t => t.length).join('+') + ' bytes across ' + res.tables.length + ' table(s)');
  };
  document.getElementById('bytesToAsm').onclick = () => {
    if (nbrtables && nbrtables > 0) {
      const tabs = []; for (let t = 0; t < nbrtables; t++) tabs.push([...(sndtable[t] || [])]);
      document.getElementById('asm').value = ASM.dumpMulti(tabs, { system: currentSystem, comments: document.getElementById('inlineComments').checked, lfsr: currentLFSR });
      setStatus('Disassembled engine state: ' + tabs.map(t => t.length).join('+'));
      return;
    }
    const single = ASM.parseBytes(document.getElementById('bytes').value);
    document.getElementById('asm').value = ASM.dumpMulti([single], { system: currentSystem, comments: document.getElementById('inlineComments').checked, lfsr: currentLFSR });
    setStatus('Disassembled ' + single.length + ' bytes into one table');
  };

  // Notes Sheet
  NOTES.mount(document.getElementById('notesPane'));

  // Mixer wiring (HEX/NOTE + VU) and pane toggles
  initMixerAndVU();
}

async function playFromEditor() {
  const r = ASM.assembleMultiWithMap(document.getElementById('asm').value);
  if (r.error) { setStatus('ASM error on line ' + r.line + ': ' + r.error); return; }
  window.__asmMap = r.map;
  const tabs = r.tables;
  if (!tabs.length) { setStatus('Nothing to play'); return; }
  engine.reset();
  for (let t = 0; t < tabs.length; t++) sndtable[t] = tabs[t];
  nbrtables = tabs.length;
  engine.play();
  if (!speakers) speakers = new Speaker(soundchip);
  await speakers.play();
  if (window.startMiniTimer) window.startMiniTimer();
  setStatus('Playing ' + tabs.map(t => t.length).join('+') + ' bytes across ' + tabs.length + ' table(s) (' + currentSystem + ')');
}

/**
 * Plays the currently loaded track in the sound engine without re-assembling.
 * This is used for demo songs that are loaded directly into sndtable.
 */
async function playCurrentTrack() {
  if (nbrtables === 0 || !sndtable[0] || sndtable[0].length === 0) {
    setStatus('No track loaded to play');
    return;
  }
  engine.play(); // This resets pointers in the engine
  if (!speakers) speakers = new Speaker(soundchip);
  await speakers.play();
}

// Live tracker + highlighting
(function () {
  const log = document.getElementById('trackerLog');
  const ta = document.getElementById('asm');
  let counter = 0;
  const prev = window.onOS7Event;
  window.onOS7Event = (ev) => {
    if (prev) prev(ev);

    // Handle missing or empty bytes array - skip empty events to avoid spam
    const bytes = ev.bytes || [];
    if (bytes.length === 0) return; // Skip empty events

    const bytesDisplay = bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ');
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div>${(counter++).toString().padStart(4, '0')}</div><div class="t${ev.table}">T${ev.table}</div><div>${bytesDisplay}</div>`;
    log.appendChild(row);

    // Keep only last 120 entries
    while (log.children.length > 120) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
    // Highlighting removed - was causing incorrect selection
  };
})();

// Mixer: per-channel mute + HEX/NOTE + calibrated VU
function initMixerAndVU() {
  // Per-channel state derived from OS-7 events (not altering emulation)
  const st = {
    0: { nf: 0, fb: 0, atten: 0, lastHex: '—', note: '—' }, // noise
    1: { period: 0, atten: 0, lastHex: '—', note: '—' },   // T1
    2: { period: 0, atten: 0, lastHex: '—', note: '—' },   // T2
    3: { period: 0, atten: 0, lastHex: '—', note: '—' },   // T3
  };

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const CLK_NTSC = 3579545.0, CLK_PAL = 3546893.0;
  const chipClock = () => (currentSystem === 'PAL' ? CLK_PAL : CLK_NTSC);

  function hzFromPeriod(p) { return p ? (chipClock() / (32 * p)) : null; }

  function noteName(hz) {
    if (!hz || !isFinite(hz) || hz <= 0) return '—';
    const a4 = 440;
    const n = Math.round(12 * Math.log2(hz / a4));
    const name = NOTE_NAMES[(n + 9 + 1200) % 12]; // +9 to align A as index baseline
    const oct = 4 + Math.floor((n + 9) / 12);
    return `${name}${oct} (~${hz.toFixed(1)}Hz)`;
  }

  // Mount mute buttons and VU meters
  document.querySelectorAll('#mixer .chan').forEach(div => {
    const ch = parseInt(div.dataset.ch, 10);
    const mbtn = div.querySelector('.mute');
    const vu = div.querySelector('.vu');
    const ctx = vu.getContext('2d');

    mbtn.onclick = () => {
      mbtn.classList.toggle('active');
      soundchip.setChannelMute(ch, mbtn.classList.contains('active'));
    };

    // RMS/peak hybrid with auto-calibration
    const s = { rms: 0, peak: 0, calib: 0.2 };
    (function draw() {
      requestAnimationFrame(draw);
      const v = Math.abs(soundchip.lastOut[ch] || 0);
      s.rms = Math.sqrt(s.rms * s.rms * 0.88 + v * v * 0.12);
      s.peak = Math.max(v, s.peak * 0.9);
      const t = Math.max(s.peak, s.rms);
      if (t > s.calib * 0.9) s.calib = t * 1.1; else s.calib = Math.max(0.05, s.calib * 0.9995);
      const level = Math.min(1, (s.rms * 2.0) / (s.calib || 1e-6));
      const h = vu.height - 2, bar = Math.round(h * level);
      ctx.clearRect(0, 0, vu.width, vu.height);
      ctx.fillStyle = '#0c8'; ctx.fillRect(1, vu.height - 1 - bar, vu.width - 2, bar);
      const peak = Math.min(1, (s.peak * 2.0) / (s.calib || 1e-6));
      const py = vu.height - 1 - Math.round(h * peak);
      ctx.fillStyle = '#ff8'; ctx.fillRect(1, Math.max(1, py), vu.width - 2, 1);
      ctx.strokeStyle = '#355'; ctx.strokeRect(0, 0, vu.width, vu.height);
    })();
  });

  // Update the little HEX/NOTE labels
  function refreshUI(ch) {
    const hx = document.getElementById('hex-' + ch);
    const nt = document.getElementById('note-' + ch);
    const s = st[ch];
    if (hx) hx.textContent = s.lastHex || '—';
    if (nt) nt.textContent = s.note || '—';
  }

  // Extend the OS-7 event hook to decode and update our displays
  const prevEv = window.onOS7Event;
  window.onOS7Event = (ev) => {
    if (prevEv) prevEv(ev);

    const bytes = ev.bytes || [];
    const hexLine = bytes.map(b => ('0x' + b.toString(16).padStart(2, '0'))).join(', ');
    const b0 = bytes[0] & 0xFF;
    const ch = (b0 >>> 6) & 3;
    const code = b0 & 0x3F;

    st[ch] && (st[ch].lastHex = hexLine);

    // REST / END / REPEAT: just update hex
    if ((code & 0x20) === 0x20 || code === 0x10 || code === 0x18) {
      refreshUI(ch);
      return;
    }

    const type = code & 3;

    if (ch === 0) {
      // Noise decode
      let i = 1;
      if (type === 0 && bytes.length > i) i++; // simple has a filler
      if (bytes.length <= i) { refreshUI(0); return; }
      const b2 = bytes[i++] & 0xFF;
      const atten = (b2 >> 4) & 0xF;
      const ncode = b2 & 7; // bit2=FB, bits1..0=NF
      const fb = (ncode >> 2) & 1;      // 0=periodic, 1=white
      const nf = ncode & 3;             // 0..3

      st[0].atten = atten; st[0].nf = nf; st[0].fb = fb;

      // If NF=3 (Tone3 clock), estimate Tone3 & noise≈Tone3/LFSR
      let label = `Noise ${fb ? 'white' : 'periodic'} NF=${nf}`;
      if (nf === 3) {
        const p3 = st[3].period || 0;
        if (p3) {
          const f3 = hzFromPeriod(p3);
          const fN = f3 ? f3 / currentLFSR : null;

          // NOTE demandée: la note du BRUIT (≈ fN), puis l’info d’origine (Tone3)
          const noiseNote = noteName(fN);
          const tone3Note = noteName(f3);
          label = `Noise periodic NF=3 → ${noiseNote} (≈ ${fN ? fN.toFixed(1) : '?.?'}Hz, /${currentLFSR}; from T3 ${tone3Note})`;
        } else {
          label += ` | T3: (period?)`;
        }
      }
      st[0].note = label;
      refreshUI(0);

      return;
    }

    // Tone decode (T1..T3)
    if (bytes.length >= 3) {
      const low = bytes[1] & 0xFF;
      const mix = bytes[2] & 0xFF;
      const period = ((mix & 3) << 8) | low;
      const atten = (mix >> 4) & 0xF;
      st[ch].period = period; st[ch].atten = atten;
      const f = hzFromPeriod(period);
      st[ch].note = noteName(f);
      // Also refresh noise line if it’s clocked by Tone3
      if (ch === 3 && st[0].nf === 3) {
        const f3 = hzFromPeriod(period);
        const fN = f3 ? f3 / currentLFSR : null;
        const noiseNote = noteName(fN);
        st[0].note = `Noise periodic NF=3 → ${noiseNote} (≈ ${fN ? fN.toFixed(1) : '?.?'}Hz, /${currentLFSR}; from T3 ${noteName(f3)})`;
        refreshUI(0);
      }
      refreshUI(ch);
    }
  };

  // Pane toggles
  function hideAllPanes() {
    document.getElementById('welcomePane').hidden = true;
    document.getElementById('notesPane').hidden = true;
    document.getElementById('editorPane').hidden = true;
    document.getElementById('soundTablePane').hidden = true;
    document.getElementById('sequencerPane').hidden = true;
    // priorityPane removed in simplified version
    if (document.getElementById('priorityPane')) {
      document.getElementById('priorityPane').hidden = true;
    }
    document.getElementById('exportPane').hidden = true;

    // Remove active class from all toggle buttons
    document.querySelectorAll('[id^="toggle"]').forEach(btn => btn.classList.remove('on'));
  }

  // Old toggle button handlers removed - now using menu system
}

// Initialize advanced UI components
function initAdvancedUI() {
  // Initialize the sound system UI components
  window.soundUI = {
    soundTable: new SoundUI.SoundTableUI(document.getElementById('soundTablePane'), cvSoundSystem),
    sequencer: new SoundUI.SequencerUI(document.getElementById('sequencerPane'), cvSoundSystem),
    // priority: new SoundUI.PriorityUI(document.getElementById('priorityPane'), cvSoundSystem), // Removed in simplified version
    export: new SoundUI.ExportUI(document.getElementById('exportPane'), cvSoundSystem)
  };

  // Try to load the snddata_original.asm file if available
  const originalDataScript = document.querySelector('script[src*="snddata_original"]');
  if (originalDataScript) {
    fetch('snddata_original.asm')
      .then(response => response.text())
      .then(asmData => {
        cvSoundSystem.importAsmFile(asmData);
        soundUI.soundTable.refresh();
        soundUI.sequencer.refreshChannelSelects();
        soundUI.sequencer.refreshSequenceList();

        // Add sequences to song selection
        window.addSequencesToSongList();
        setStatus('Loaded snddata_original.asm with patterns and sequences');
      })
      .catch(err => console.log('snddata_original.asm not found, using demo data'));
  }

  window.addSequencesToSongList = function() {
    const sequences = cvSoundSystem.sequencer.getAllSequences();
    const musicSequenceList = document.getElementById('musicSequenceList');

    sequences.forEach((sequence, index) => {
      const musicItem = document.createElement('div');
      musicItem.className = 'music-item';
      musicItem.textContent = sequence.name;
      musicItem.onclick = () => {
        // Stop any current playback first
        if (window.soundUI?.sequencer?.stopAll) {
          window.soundUI.sequencer.stopAll();
        }

        // Load sequence in sequencer and play
        if (window.soundUI?.sequencer) {
          window.soundUI.sequencer.loadSequence(sequence.name);
          window.soundUI.sequencer.playSequence();

          // Switch to sequencer view using the new menu system
          window.hideAllPanes();
          document.getElementById('sequencerPane').hidden = false;
          window.updateMenuActiveStates('toggleSequencer');
        }

        // Remove playing class from all music items
        document.querySelectorAll('.music-item').forEach(item => item.classList.remove('playing'));
        musicItem.classList.add('playing');
      };
      musicSequenceList.appendChild(musicItem);
    });
  }

  // File input will be created in menu system

  setStatus('Amy\'s CV Sound OS7 Tool Ready - Sound and Music Development Environment');
}

function initFloatingPlayer() {
  const player = document.getElementById('soundPlayer');
  const titlebar = document.querySelector('.player-titlebar');
  const minimizeBtn = document.getElementById('minimizePlayer');
  const toggleBtn = document.getElementById('togglePlayer');
  const currentTrack = document.getElementById('currentTrack');

  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  // Make player draggable
  titlebar.addEventListener('mousedown', (e) => {
    if (e.target.closest('.player-controls')) return; // Don't drag on buttons

    isDragging = true;
    const rect = player.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;

    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
  });

  function handleDrag(e) {
    if (!isDragging) return;

    let x = e.clientX - dragOffset.x;
    let y = e.clientY - dragOffset.y;

    // Snap-to-edge logic
    const snapThreshold = 15; // pixels
    const maxX = window.innerWidth - player.offsetWidth;
    const maxY = window.innerHeight - player.offsetHeight;

    if (Math.abs(x) < snapThreshold) x = 0; // Snap to left
    if (Math.abs(y) < snapThreshold) y = 0; // Snap to top
    if (Math.abs(x - maxX) < snapThreshold) x = maxX; // Snap to right
    if (Math.abs(y - maxY) < snapThreshold) y = maxY; // Snap to bottom

    // Keep player within viewport
    player.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    player.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    player.style.right = 'auto';
  }

  function stopDrag() {
    isDragging = false;
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', stopDrag);
  }

  // Minimize/restore functionality
  minimizeBtn.addEventListener('click', () => {
    player.classList.toggle('minimized');
    const icon = minimizeBtn.querySelector('.material-symbols-outlined');
    icon.textContent = player.classList.contains('minimized') ? 'open_in_full' : 'minimize';
  });
  // Set initial icon state for minimized player
  if (player.classList.contains('minimized')) {
    minimizeBtn.querySelector('.material-symbols-outlined').textContent = 'open_in_full';
  }

  // Toggle player visibility
  toggleBtn.addEventListener('click', () => {
    player.style.display = player.style.display === 'none' ? 'block' : 'none';
  });

  // Update current track display
  window.updateCurrentTrack = function(trackName) {
    currentTrack.textContent = trackName || 'No track loaded';
    // Update minimized track info
    const miniTrackName = document.getElementById('miniTrackName');
    if (miniTrackName) {
      miniTrackName.textContent = trackName || 'No track';
    }
    // Also update the minimized player title
    const playerTitle = document.querySelector('.player-title');
    if (playerTitle) {
      playerTitle.setAttribute('data-track', trackName ? ` - ${trackName}` : '');
    }
  };

  // Simple timer for minimized display
  let playStartTime = 0;
  let isPlaying = false;

  function updateMiniTime() {
    const miniTime = document.getElementById('miniTime');
    if (miniTime && isPlaying) {
      const elapsed = Math.floor((Date.now() - playStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      miniTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  // Update timer every second
  setInterval(updateMiniTime, 1000);

  // Update play state when starting/stopping
  window.startMiniTimer = function() {
    playStartTime = Date.now();
    isPlaying = true;
    updateMiniTime();
  };

  window.stopMiniTimer = function() {
    isPlaying = false;
    const miniTime = document.getElementById('miniTime');
    if (miniTime) {
      miniTime.textContent = '0:00';
    }
  };

  // Add keyboard shortcut to toggle player (Ctrl+P)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'p') {
      e.preventDefault();
      toggleBtn.click();
    }
  });

  // Store player position in localStorage
  function savePlayerPosition() {
    const rect = player.getBoundingClientRect();
    localStorage.setItem('soundPlayerPosition', JSON.stringify({
      x: rect.left,
      y: rect.top
    }));
  }

  // Restore player position
  function restorePlayerPosition() {
    const saved = localStorage.getItem('soundPlayerPosition');
    if (saved) {
      try {
        const pos = JSON.parse(saved);
        player.style.left = pos.x + 'px';
        player.style.top = pos.y + 'px';
        player.style.right = 'auto';
      } catch (e) {
        // Invalid saved position, keep default
      }
    }
  }

  // Save position when dragging stops
  titlebar.addEventListener('mouseup', savePlayerPosition);

  // Restore position on load
  restorePlayerPosition();
}

function initMenuSystem() {
  // File menu functionality
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.asm,.txt';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          if (window.cvSoundSystem && window.soundUI) {
            cvSoundSystem.importAsmFile(event.target.result);
            soundUI.soundTable.refresh();
            soundUI.sequencer.refreshChannelSelects();
          } else {
            // Fallback to basic import
            document.getElementById('asm').value = event.target.result;
          }
          setStatus('Imported: ' + file.name);
        } catch (error) {
          setStatus('Import error: ' + error.message);
        }
      };
      reader.readAsText(file);
    }
  };

  document.getElementById('importFile').addEventListener('click', () => {
    fileInput.click();
  });

  document.getElementById('exportFile').addEventListener('click', () => {
    const asmText = document.getElementById('asm').value;
    const blob = new Blob([asmText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'music.asm';
    a.click();
    URL.revokeObjectURL(url);
  });

  // View menu functionality - directly call the toggle functions
  document.querySelector('[data-toggle="toggleEditor"]').addEventListener('click', () => {
    hideAllPanes();
    document.getElementById('editorPane').hidden = false;
    updateMenuActiveStates('toggleEditor');
  });

  document.querySelector('[data-toggle="toggleNotes"]').addEventListener('click', () => {
    hideAllPanes();
    document.getElementById('notesPane').hidden = false;
    updateMenuActiveStates('toggleNotes');
  });

  document.querySelector('[data-toggle="toggleSoundTable"]').addEventListener('click', () => {
    hideAllPanes();
    document.getElementById('soundTablePane').hidden = false;
    updateMenuActiveStates('toggleSoundTable');
  });

  document.querySelector('[data-toggle="toggleSequencer"]').addEventListener('click', () => {
    hideAllPanes();
    document.getElementById('sequencerPane').hidden = false;
    updateMenuActiveStates('toggleSequencer');
  });

  document.querySelector('[data-toggle="toggleLibrary"]').addEventListener('click', () => {
    hideAllPanes();
    document.getElementById('libraryPane').hidden = false;
    updateMenuActiveStates('toggleLibrary');
  });

  document.querySelector('[data-toggle="toggleSoundPlayer"]').addEventListener('click', () => {
    const player = document.getElementById('soundPlayer');
    player.style.display = player.style.display === 'none' ? 'block' : 'none';
  });

  // Make these functions global for access from other parts
  window.hideAllPanes = function() {
    document.getElementById('welcomePane').hidden = true;
    document.getElementById('notesPane').hidden = true;
    document.getElementById('editorPane').hidden = true;
    document.getElementById('soundTablePane').hidden = true;
    document.getElementById('sequencerPane').hidden = true;
    document.getElementById('exportPane').hidden = true;
    document.getElementById('libraryPane').hidden = true;
  }
  window.updateMenuActiveStates=function(t){document.querySelectorAll("[data-toggle]").forEach(e=>{e.getAttribute("data-toggle")===t?e.classList.add("active"):e.classList.remove("active")})}

  // No initial active menu item, since welcome pane is shown

  // Settings menu - TV system radio buttons
  document.querySelectorAll('input[name="tv"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const hz = e.target.value === 'PAL' ? 50.0 : 59.94;
      soundchip = new SoundChip(engine, hz);
      setStatus(`Switched to ${e.target.value} (${hz}Hz)`);
    });
  });

  // Settings menu - LFSR radio buttons
  document.querySelectorAll('input[name="lfsr"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const lfsr = parseInt(e.target.value);
      soundchip.lfsr_length = lfsr;
      setStatus(`LFSR length set to ${lfsr} bits`);
    });
  });

  // Menu dropdown behavior - close dropdowns when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-item')) {
      document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
      });
    }
  });

  // Prevent dropdown from closing when clicking inside
  document.querySelectorAll('.dropdown').forEach(dropdown => {
    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
}

function initThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  const body = document.body;

  // Function to apply theme
  const applyTheme = (theme) => {
    if (theme === 'dark') {
      body.classList.add('dark-mode');
      toggle.checked = true;
    } else {
      body.classList.remove('dark-mode');
      toggle.checked = false;
    }
  };

  // Event listener for the toggle
  toggle.addEventListener('change', () => {
    const theme = toggle.checked ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
    applyTheme(theme);
  });

  // Apply saved theme on load
  applyTheme(localStorage.getItem('theme'));
}
// Music Library functionality
let musicLibrary = null;

async function loadMusicLibrary() {
  const loadBtn = document.getElementById('loadLibraryBtn');
  const listEl = document.getElementById('musicLibraryList');

  try {
    loadBtn.textContent = 'Loading...';
    loadBtn.disabled = true;
    listEl.innerHTML = '<div style="padding: 8px; color: #888;">Loading music library...</div>';

    musicLibrary = await MusicLibrary.loadLibrary('cvbanks/');

    // Display loaded games
    listEl.innerHTML = '';

    if (musicLibrary.games.length === 0) {
      listEl.innerHTML = '<div style="padding: 8px; color: #888;">No games found</div>';
      return;
    }

    musicLibrary.games.forEach((game, gameIndex) => {
      // Game container
      const gameContainer = document.createElement('div');
      gameContainer.className = 'music-game-container';
      gameContainer.style.marginBottom = '2px';
      gameContainer.style.overflow = 'hidden';

      // Game header (collapsible)
      const gameHeader = document.createElement('div');
      gameHeader.className = 'music-game-header';
      gameHeader.style.cursor = 'pointer';
      gameHeader.style.padding = '10px 12px';
      gameHeader.style.borderBottom = '1px solid #444';
      gameHeader.style.background = 'linear-gradient(to bottom, #3a3a3a, #2d2d2d)';
      gameHeader.style.fontWeight = 'bold';
      gameHeader.style.display = 'flex';
      gameHeader.style.alignItems = 'center';
      gameHeader.style.justifyContent = 'space-between';
      gameHeader.style.transition = 'background 0.2s';

      // Left side: game info
      const headerLeft = document.createElement('div');
      headerLeft.style.display = 'flex';
      headerLeft.style.alignItems = 'center';
      headerLeft.style.gap = '8px';

      const expandIcon = document.createElement('span');
      expandIcon.textContent = '▶';
      expandIcon.style.fontSize = '0.7em';
      expandIcon.style.color = '#888';
      expandIcon.style.transition = 'transform 0.2s';

      const gameTitle = document.createElement('span');
      gameTitle.textContent = game.title;
      gameTitle.style.fontSize = '0.95em';

      headerLeft.appendChild(expandIcon);
      headerLeft.appendChild(gameTitle);

      // Right side: counts
      const headerRight = document.createElement('div');
      headerRight.style.display = 'flex';
      headerRight.style.gap = '12px';
      headerRight.style.fontSize = '0.8em';
      headerRight.style.color = '#999';

      if (game.musicCount > 0) {
        const musicBadge = document.createElement('span');
        musicBadge.style.padding = '2px 8px';
        musicBadge.style.borderRadius = '10px';
        musicBadge.style.backgroundColor = '#4ec9b055';
        musicBadge.style.color = '#4ec9b0';
        musicBadge.textContent = `${game.musicCount} tracks`;
        headerRight.appendChild(musicBadge);
      }

      if (game.sfxCount > 0) {
        const sfxBadge = document.createElement('span');
        sfxBadge.style.padding = '2px 8px';
        sfxBadge.style.borderRadius = '10px';
        sfxBadge.style.backgroundColor = '#ce917855';
        sfxBadge.style.color = '#ce9178';
        sfxBadge.textContent = `${game.sfxCount} SFX`;
        headerRight.appendChild(sfxBadge);
      }

      gameHeader.appendChild(headerLeft);
      gameHeader.appendChild(headerRight);

      // Hover effect
      gameHeader.onmouseenter = () => {
        gameHeader.style.background = 'linear-gradient(to bottom, #454545, #383838)';
      };
      gameHeader.onmouseleave = () => {
        gameHeader.style.background = 'linear-gradient(to bottom, #3a3a3a, #2d2d2d)';
      };

      // Track list container (initially hidden)
      const trackList = document.createElement('div');
      trackList.className = 'music-track-list';
      trackList.style.display = 'none';
      trackList.style.backgroundColor = '#1e1e1e';
      trackList.style.borderBottom = '1px solid #444';
      trackList.style.maxHeight = '0';
      trackList.style.overflow = 'hidden';
      trackList.style.transition = 'max-height 0.3s ease-out';

      const trackListInner = document.createElement('div');
      trackListInner.style.padding = '8px 0';

      // Add music tracks
      if (game.music && game.music.length > 0) {
        const musicSection = document.createElement('div');
        musicSection.style.marginBottom = game.sfxCount > 0 ? '12px' : '0';

        const musicHeader = document.createElement('div');
        musicHeader.style.padding = '6px 16px';
        musicHeader.style.fontSize = '0.8em';
        musicHeader.style.fontWeight = 'bold';
        musicHeader.style.color = '#4ec9b0';
        musicHeader.style.textTransform = 'uppercase';
        musicHeader.style.letterSpacing = '0.5px';
        musicHeader.style.borderBottom = '1px solid #2d2d2d';
        musicHeader.style.marginBottom = '4px';
        musicHeader.innerHTML = '♪ Music Tracks';
        musicSection.appendChild(musicHeader);

        game.music.forEach((track, index) => {
          const trackItem = document.createElement('div');
          trackItem.className = 'music-track-item';
          trackItem.style.cursor = 'pointer';
          trackItem.style.padding = '8px 16px 8px 32px';
          trackItem.style.borderBottom = index < game.music.length - 1 ? '1px solid #252525' : 'none';
          trackItem.style.transition = 'all 0.15s';
          trackItem.style.display = 'flex';
          trackItem.style.justifyContent = 'space-between';
          trackItem.style.alignItems = 'center';

          const trackLeft = document.createElement('div');

          const trackName = document.createElement('div');
          trackName.textContent = track.label;
          trackName.style.fontSize = '0.9em';
          trackName.style.fontWeight = '500';
          trackName.style.marginBottom = '2px';

          const trackInfo = document.createElement('div');
          trackInfo.style.fontSize = '0.75em';
          trackInfo.style.color = '#666';
          const channelText = track.channels > 1 ? `${track.channels}ch` : '1ch';
          const byteCount = track.totalBytes || track.data?.length || 0;
          trackInfo.innerHTML = `<span style="color: #4ec9b0;">@${track.type}</span> • ${byteCount}b • ${channelText}`;

          trackLeft.appendChild(trackName);
          trackLeft.appendChild(trackInfo);

          const playIcon = document.createElement('span');
          playIcon.textContent = '▶';
          playIcon.style.fontSize = '0.8em';
          playIcon.style.color = '#4ec9b0';
          playIcon.style.opacity = '0';
          playIcon.style.transition = 'opacity 0.15s';

          trackItem.appendChild(trackLeft);
          trackItem.appendChild(playIcon);

          trackItem.onclick = async () => {
            await loadTrack(track, game.title);
            // Visual feedback
            trackItem.style.backgroundColor = '#4ec9b022';
            setTimeout(() => {
              trackItem.style.backgroundColor = '';
            }, 200);
          };

          trackItem.onmouseenter = () => {
            trackItem.style.backgroundColor = '#2d2d2d';
            trackItem.style.paddingLeft = '36px';
            playIcon.style.opacity = '1';
          };
          trackItem.onmouseleave = () => {
            trackItem.style.backgroundColor = '';
            trackItem.style.paddingLeft = '32px';
            playIcon.style.opacity = '0';
          };

          musicSection.appendChild(trackItem);
        });

        trackListInner.appendChild(musicSection);
      }

      // Add sound effects (collapsed by default)
      if (game.soundEffects && game.soundEffects.length > 0) {
        const sfxSection = document.createElement('div');

        const sfxHeader = document.createElement('div');
        sfxHeader.style.padding = '6px 16px';
        sfxHeader.style.fontSize = '0.8em';
        sfxHeader.style.fontWeight = 'bold';
        sfxHeader.style.color = '#ce9178';
        sfxHeader.style.textTransform = 'uppercase';
        sfxHeader.style.letterSpacing = '0.5px';
        sfxHeader.style.borderBottom = '1px solid #2d2d2d';
        sfxHeader.style.marginBottom = '4px';
        sfxHeader.style.cursor = 'pointer';
        sfxHeader.style.display = 'flex';
        sfxHeader.style.justifyContent = 'space-between';
        sfxHeader.style.alignItems = 'center';

        const sfxTitle = document.createElement('span');
        sfxTitle.innerHTML = 'Sound Effects';

        const sfxToggle = document.createElement('span');
        sfxToggle.textContent = `${game.sfxCount} items ▼`;
        sfxToggle.style.fontSize = '0.85em';
        sfxToggle.style.color = '#666';

        sfxHeader.appendChild(sfxTitle);
        sfxHeader.appendChild(sfxToggle);

        const sfxList = document.createElement('div');
        sfxList.style.maxHeight = '200px';
        sfxList.style.overflowY = 'auto';
        sfxList.style.display = 'none';

        game.soundEffects.forEach((track, index) => {
          const trackItem = document.createElement('div');
          trackItem.className = 'music-track-item';
          trackItem.style.cursor = 'pointer';
          trackItem.style.padding = '6px 16px 6px 32px';
          trackItem.style.borderBottom = index < game.soundEffects.length - 1 ? '1px solid #252525' : 'none';
          trackItem.style.transition = 'all 0.15s';
          trackItem.style.display = 'flex';
          trackItem.style.justifyContent = 'space-between';
          trackItem.style.alignItems = 'center';
          trackItem.style.fontSize = '0.85em';

          const trackLeft = document.createElement('div');

          const trackName = document.createElement('div');
          trackName.textContent = track.label;
          trackName.style.marginBottom = '2px';

          const trackInfo = document.createElement('div');
          trackInfo.style.fontSize = '0.85em';
          trackInfo.style.color = '#666';
          trackInfo.innerHTML = `<span style="color: #ce9178;">@${track.type}</span> • ${track.data.length}b`;

          trackLeft.appendChild(trackName);
          trackLeft.appendChild(trackInfo);

          const playIcon = document.createElement('span');
          playIcon.textContent = '▶';
          playIcon.style.fontSize = '0.75em';
          playIcon.style.color = '#ce9178';
          playIcon.style.opacity = '0';
          playIcon.style.transition = 'opacity 0.15s';

          trackItem.appendChild(trackLeft);
          trackItem.appendChild(playIcon);

          trackItem.onclick = async () => {
            await loadTrack(track, game.title);
            trackItem.style.backgroundColor = '#ce917822';
            setTimeout(() => {
              trackItem.style.backgroundColor = '';
            }, 200);
          };

          trackItem.onmouseenter = () => {
            trackItem.style.backgroundColor = '#2a2a2a';
            trackItem.style.paddingLeft = '36px';
            playIcon.style.opacity = '1';
          };
          trackItem.onmouseleave = () => {
            trackItem.style.backgroundColor = '';
            trackItem.style.paddingLeft = '32px';
            playIcon.style.opacity = '0';
          };

          sfxList.appendChild(trackItem);
        });

        // Toggle SFX list
        sfxHeader.onclick = () => {
          const isVisible = sfxList.style.display !== 'none';
          sfxList.style.display = isVisible ? 'none' : 'block';
          sfxToggle.textContent = `${game.sfxCount} items ${isVisible ? '▼' : '▲'}`;
        };

        sfxSection.appendChild(sfxHeader);
        sfxSection.appendChild(sfxList);
        trackListInner.appendChild(sfxSection);
      }

      trackList.appendChild(trackListInner);

      gameContainer.appendChild(gameHeader);
      gameContainer.appendChild(trackList);
      listEl.appendChild(gameContainer);

      // Toggle track list on header click
      gameHeader.onclick = () => {
        const isExpanded = trackList.style.display !== 'none';

        if (isExpanded) {
          // Collapse
          trackList.style.maxHeight = '0';
          setTimeout(() => {
            trackList.style.display = 'none';
          }, 300);
          expandIcon.style.transform = 'rotate(0deg)';
        } else {
          // Expand
          trackList.style.display = 'block';
          const height = trackListInner.scrollHeight;
          trackList.style.maxHeight = height + 'px';
          expandIcon.style.transform = 'rotate(90deg)';
        }
      };
    });

    loadBtn.textContent = `${musicLibrary.games.length} Games Loaded`;
    loadBtn.style.backgroundColor = '#4ec9b0';
    setStatus(`Music library loaded: ${musicLibrary.games.length} games, ${musicLibrary.allMusic.length} tracks`);

  } catch (error) {
    console.error('Failed to load library:', error);
    listEl.innerHTML = `<div style="padding: 8px; color: #f48771;">Error: ${error.message}</div>`;
    loadBtn.textContent = 'Retry';
    loadBtn.disabled = false;
  }
}

async function loadTrack(track, gameTitle) {
  // Stop any current playback
  if (window.soundUI?.sequencer?.stopAll) {
    window.soundUI.sequencer.stopAll();
  }

  // Load into engine
  engine.reset();

  // Check if track has multiple channels (stored in channelData array)
  if (track.channelData && track.channelData.length > 0) {
    // Multi-channel music: load each channel as a separate table
    nbrtables = track.channelData.length;
    track.channelData.forEach((channel, i) => {
      sndtable[i] = channel.data;
    });

    // Update ASM view with all channels
    const asmView = ASM.dumpMulti(track.channelData.map(ch => ch.data), {
      system: currentSystem,
      comments: document.getElementById('inlineComments')?.checked ?? true,
      lfsr: currentLFSR
    });

    document.getElementById('asm').value = asmView;

    // Update bytes view
    const bytesView = track.channelData.map((ch, i) =>
      `T${i}: ` + ch.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
    ).join('\n');
    document.getElementById('bytes').value = bytesView;

    setStatus(`Playing: ${gameTitle} - ${track.label} (${track.channels} channels, ${track.totalBytes} bytes, @${track.type})`);
  } else {
    // Single channel (sound effect or old format)
    nbrtables = 1;
    sndtable[0] = track.data;

    // Update ASM view
    const asmView = ASM.dump(track.data, {
      system: currentSystem,
      comments: document.getElementById('inlineComments')?.checked ?? true,
      lfsr: currentLFSR
    }, track.label);

    document.getElementById('asm').value = asmView;

    // Update bytes view
    const bytesView = 'T0: ' + track.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    document.getElementById('bytes').value = bytesView;

    setStatus(`Playing: ${gameTitle} - ${track.label} (${track.data.length} bytes, @${track.type})`);
  }

  // Play
  engine.play();
  if (!speakers) speakers = new Speaker(soundchip);
  await speakers.play();
}

// Full-page Library View
async function loadLibraryFullView() {
  const loadBtn = document.getElementById('loadLibraryBtnMain');
  const contentEl = document.getElementById('libraryContent');
  const gameCountEl = document.getElementById('gameCount');
  const trackCountEl = document.getElementById('trackCount');

  try {
    loadBtn.textContent = 'Loading...';
    loadBtn.disabled = true;

    if (!musicLibrary) {
      musicLibrary = await MusicLibrary.loadLibrary('cvbanks/');
    }

    // Update stats
    gameCountEl.textContent = `${musicLibrary.games.length} games`;
    trackCountEl.textContent = `${musicLibrary.allMusic.length} tracks`;

    renderLibraryGames(musicLibrary.games);

    loadBtn.textContent = 'Library Loaded';
    loadBtn.style.background = '#5dd9c0';

    setStatus(`Music library loaded: ${musicLibrary.games.length} games, ${musicLibrary.allMusic.length} tracks`);
  } catch (error) {
    console.error('Failed to load library:', error);
    contentEl.innerHTML = `<div class="library-placeholder">
      <div class="placeholder-icon">!</div>
      <div class="placeholder-text">Error loading library: ${error.message}</div>
    </div>`;
    loadBtn.textContent = 'Retry';
    loadBtn.disabled = false;
  }
}

function renderLibraryGames(games) {
  const contentEl = document.getElementById('libraryContent');
  contentEl.innerHTML = '';

  games.forEach(game => {
    const card = document.createElement('div');
    card.className = 'game-card';

    // Card Header
    const header = document.createElement('div');
    header.className = 'game-card-header';

    const title = document.createElement('div');
    title.className = 'game-title';
    title.textContent = game.title;

    const badges = document.createElement('div');
    badges.className = 'game-badges';

    if (game.musicCount > 0) {
      const musicBadge = document.createElement('span');
      musicBadge.className = 'game-badge badge-music';
      musicBadge.textContent = `${game.musicCount} tracks`;
      badges.appendChild(musicBadge);
    }

    if (game.sfxCount > 0) {
      const sfxBadge = document.createElement('span');
      sfxBadge.className = 'game-badge badge-sfx';
      sfxBadge.textContent = `${game.sfxCount} SFX`;
      badges.appendChild(sfxBadge);
    }

    header.appendChild(title);
    header.appendChild(badges);

    // Game Info
    const info = document.createElement('div');
    info.className = 'game-info';
    const totalTracks = game.musicCount + game.sfxCount;
    info.textContent = `${totalTracks} total track${totalTracks !== 1 ? 's' : ''}`;

    // Tracks Container
    const tracksContainer = document.createElement('div');
    tracksContainer.className = 'game-tracks';

    // Add music tracks
    if (game.music && game.music.length > 0) {
      const musicSection = document.createElement('div');
      musicSection.className = 'track-section';

      const musicTitle = document.createElement('div');
      musicTitle.className = 'track-section-title music';
      musicTitle.textContent = '♪ Music';
      musicSection.appendChild(musicTitle);

      const musicList = document.createElement('div');
      musicList.className = 'track-list';

      game.music.forEach(track => {
        const trackItem = createTrackElement(track, game.title, false);
        musicList.appendChild(trackItem);
      });

      musicSection.appendChild(musicList);
      tracksContainer.appendChild(musicSection);
    }

    // Add SFX
    if (game.soundEffects && game.soundEffects.length > 0) {
      const sfxSection = document.createElement('div');
      sfxSection.className = 'track-section';

      const sfxTitle = document.createElement('div');
      sfxTitle.className = 'track-section-title sfx';
      sfxTitle.textContent = 'Sound Effects';
      sfxSection.appendChild(sfxTitle);

      const sfxList = document.createElement('div');
      sfxList.className = 'track-list';

      game.soundEffects.forEach(track => {
        const trackItem = createTrackElement(track, game.title, true);
        sfxList.appendChild(trackItem);
      });

      sfxSection.appendChild(sfxList);
      tracksContainer.appendChild(sfxSection);
    }

    // Collapse button
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'game-collapse-btn';
    collapseBtn.textContent = '▲ Hide Tracks';
    collapseBtn.onclick = () => {
      card.classList.remove('expanded');
    };
    tracksContainer.appendChild(collapseBtn);

    // Expand/collapse functionality
    card.onclick = (e) => {
      // Don't toggle if a button inside the card was clicked (like play or collapse)
      if (e.target.closest('button')) return;
      card.classList.toggle('expanded');
    };

    card.appendChild(header);
    card.appendChild(info);
    card.appendChild(tracksContainer);

    contentEl.appendChild(card);
  });
}

function createTrackElement(track, gameTitle, isSFX) {
  const trackItem = document.createElement('div');
  trackItem.className = 'track-item' + (isSFX ? ' sfx' : '');

  const infoLeft = document.createElement('div');
  infoLeft.className = 'track-info-left';

  const trackName = document.createElement('div');
  trackName.className = 'track-name';
  trackName.textContent = track.label;

  const trackDetails = document.createElement('div');
  trackDetails.className = 'track-details';
  const byteCount = track.totalBytes || track.data?.length || 0;
  const channelInfo = track.channels > 1 ? ` • ${track.channels}ch` : '';
  trackDetails.textContent = `@${track.type} • ${byteCount}b${channelInfo}`;

  infoLeft.appendChild(trackName);
  infoLeft.appendChild(trackDetails);

  const playBtn = document.createElement('button');
  playBtn.className = 'track-play-btn';
  playBtn.innerHTML = '▶';
  playBtn.onclick = async (e) => {
    e.stopPropagation();

    // Remove playing class from all tracks
    document.querySelectorAll('.track-item').forEach(t => t.classList.remove('playing'));
    trackItem.classList.add('playing');

    await loadTrack(track, gameTitle);
  };

  trackItem.appendChild(infoLeft);
  trackItem.appendChild(playBtn);

  return trackItem;
}

// Search and filter functionality
function setupLibrarySearch() {
  const searchInput = document.getElementById('librarySearch');
  const filterSelect = document.getElementById('libraryFilter');

  if (searchInput) {
    searchInput.oninput = () => filterLibrary();
  }

  if (filterSelect) {
    filterSelect.onchange = () => filterLibrary();
  }
}

function filterLibrary() {
  if (!musicLibrary) return;

  const searchTerm = document.getElementById('librarySearch').value.toLowerCase();
  const filter = document.getElementById('libraryFilter').value;

  let filtered = musicLibrary.games;

  // Apply search filter
  if (searchTerm) {
    filtered = filtered.filter(game =>
      game.title.toLowerCase().includes(searchTerm)
    );
  }

  // Apply category filter
  if (filter === 'music') {
    filtered = filtered.filter(game => game.musicCount > 0);
  } else if (filter === 'sfx') {
    filtered = filtered.filter(game => game.musicCount === 0 && game.sfxCount > 0);
  }

  renderLibraryGames(filtered);
}

window.addEventListener('DOMContentLoaded', () => {
  initUI();
  initAdvancedUI();

  // Add library button handler
  const loadBtnMain = document.getElementById('loadLibraryBtnMain');
  if (loadBtnMain) {
    loadBtnMain.onclick = loadLibraryFullView;
  }

  // Setup library search
  setupLibrarySearch();
});
