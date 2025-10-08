// notes.js — insert OS7 patterns into the editor
const NOTES = (() => {
  const KEYS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  let lastPreviewedBytes = null;
  let previewSpeaker = null;

  function getHz(note, octave) {
      const idx = KEYS.indexOf(note); if (idx < 0) return 0;
      const A4=440, semis = (octave-4)*12 + (idx-9);
      return A4 * Math.pow(2, semis/12);
  }

  function getPeriod(hz, system) {
      if (hz === 0) return 0x1000;
      const clk = (system==='PAL') ? 3546893.0 : 3579545.0;
      return Math.max(1, Math.round(clk/(32*hz)));
  }

  function periodFor(note, octave, system) {
      const hz = getHz(note, octave);
      return getPeriod(hz, system);
  }

  function periodForNoise(targetNote, targetOctave, system) {
      const lfsr = parseInt(document.querySelector('input[name="lfsr"]:checked').value, 10) || 15;
      const targetHz = getHz(targetNote, targetOctave);
      const tone3Hz = targetHz * lfsr;
      return getPeriod(tone3Hz, system);
  }

  function isNotePlayable(note, octave) {
      const period = periodFor(note, octave, window.currentSystem || 'NTSC');
      return period <= 0x3FF;
  }

  function getFadeParams(noteLen) {
      const num_steps = 15;
      let step_len = Math.floor(noteLen / num_steps);
      if (step_len === 0) step_len = 1;
      let first_step_len = noteLen - (step_len * (num_steps - 1));

      if (step_len > 16 || first_step_len > 16) {
        step_len = Math.min(16, Math.max(1, step_len));
        first_step_len = Math.min(16, Math.max(1, first_step_len));
      }

      const encoded_step_len = step_len === 16 ? 0 : step_len;
      const encoded_first_step_len = first_step_len === 16 ? 0 : first_step_len;

      const b1 = (1 << 4) | num_steps;
      const b2 = (encoded_step_len << 4) | encoded_first_step_len;
      return [b1, b2];
  }

  function tSimple(ch, note, oct, len){
    const N = periodFor(note, oct, window.currentSystem||'NTSC');
    const lo=N&0xFF, hi=((N>>8)&3), att=0x0;
    return { tables: [ [ (ch<<6) | 0x00, lo, (att<<4)|hi, len ] ] };
  }
  function tFade(ch, note, oct, len){
    const N = periodFor(note, oct, window.currentSystem||'NTSC');
    const lo=N&0xFF, hi=((N>>8)&3), att=0x0;
    const fadeParams = getFadeParams(len);
    return { tables: [ [ (ch<<6) | 0x02, lo, (att<<4)|hi, len, ...fadeParams ] ] };
  }
  function tVib(ch, note, oct, len){
      const vibratoDepth = 4;
      const sweepDuration = 6;

      const periodCorrect = periodFor(note, oct, window.currentSystem || 'NTSC');

      if (periodCorrect + vibratoDepth > 0x3FF) {
          return tSimple(ch, note, oct, len || 24);
      }

      const periodStartLow = periodCorrect + vibratoDepth;
      const periodEndHigh = Math.max(1, periodCorrect - vibratoDepth);

      const periodStepUp = -4;
      const periodStepDown = 4;

      const makeSweepNote = (startPeriod, step, duration) => {
          const lo = startPeriod & 0xFF;
          const hi = (startPeriod >> 8) & 3;
          const att = 0x0;
          const sweepParams = [ 0x11, step & 0xFF ];
          return [ (ch << 6) | 0x01, lo, (att << 4) | hi, duration, ...sweepParams ];
      };

      const noteSequence = [
          ...makeSweepNote(periodStartLow, periodStepUp, sweepDuration),
          ...makeSweepNote(periodEndHigh, periodStepDown, sweepDuration),
          0x18 // Repeat
      ];

      return { tables: [ noteSequence ] };
  }
  function simpleBass(note, oct, len){
      const chN = 0, chT3 = 3;
      const N3 = periodForNoise(note, oct, window.currentSystem||'NTSC');
      if (N3 > 0x3FF) return null;

      const lo = N3 & 0xFF, hi = (N3 >> 8) & 3;

      const tone3Table = [ (chT3 << 6) | 0x00, lo, (0xF << 4) | hi, len ];
      const noiseTable = [ (chN << 6) | 0x00, 0x00, (0x0 << 4) | 0x03, len ];

      return { tables:[ tone3Table, noiseTable ] };
  }
  function fadeBass(note, oct, len){
      const chN = 0, chT3 = 3;
      const N3 = periodForNoise(note, oct, window.currentSystem||'NTSC');
      if (N3 > 0x3FF) return null;

      const lo = N3 & 0xFF, hi = (N3 >> 8) & 3;
      const fadeParams = getFadeParams(len);

      const tone3Table = [ (chT3 << 6) | 0x00, lo, (0xF << 4) | hi, len ];
      const noiseTable = [ (chN << 6) | 0x02, 0x03, (0x0 << 4), len, ...fadeParams ];

      return { tables:[ tone3Table, noiseTable ] };
  }

  function toDb(arr){ return arr.map(b=>'0x'+b.toString(16).padStart(2,'0')).join(', '); }

  function preview(tables) {
    if (previewSpeaker) {
      try { previewSpeaker.stop(); } catch(e) {}
      previewSpeaker = null;
    }
    const previewEngine = new SoundEngine();
    const previewChip = new SoundChip(previewEngine, (window.currentSystem === 'PAL') ? 50.0 : 59.94);
    previewEngine.setSoundChip(previewChip);

    const originalTables = window.sndtable;
    const originalNbrTables = window.nbrtables;

    window.sndtable = tables;
    window.nbrtables = tables.length;
    previewEngine.play();
    previewSpeaker = new Speaker(previewChip);
    previewSpeaker.play();

    setTimeout(() => {
      if (previewSpeaker) {
        try { previewSpeaker.stop(); } catch(e) {}
        previewSpeaker = null;
      }
      window.sndtable = originalTables;
      window.nbrtables = originalNbrTables;
    }, 800);
  }

  function insertIntoTable(text, tableLabel, newDbLine) {
      const tableRegex = new RegExp(`(^|
)(${tableLabel}\s*\n)`, 'i');
      const match = text.match(tableRegex);

      if (match) {
          const insertionPoint = match.index + match[0].length;
          return text.slice(0, insertionPoint) + newDbLine + '\n' + text.slice(insertionPoint);
      }
      else {
          return text + (text.trim() ? '\n\n' : '') + tableLabel + '\n' + newDbLine + '\n';
      }
  }

  function insert() {
    if (!lastPreviewedBytes || !lastPreviewedBytes.tables) return;

    const ta = document.getElementById('asm');
    const targetTableIndex = parseInt(document.getElementById('noteTargetTable').value, 10);
    let text = ta.value;

    for (let i = 0; i < lastPreviewedBytes.tables.length; i++) {
        const tableBytes = lastPreviewedBytes.tables[i];
        if (!tableBytes || tableBytes.length === 0) continue;
        const currentTableIndex = targetTableIndex + i;
        const targetLabel = `Table${currentTableIndex}:`;
        const newDbLine = `    .db ${toDb(tableBytes)}`;
        text = insertIntoTable(text, targetLabel, newDbLine);
    }

    ta.value = text;
    ta.focus();
    lastPreviewedBytes = null;
    document.getElementById('addNoteBtn').disabled = true;
  }

  function mount(el){
    el.innerHTML = `
      <div class="notes-controls">
        <span>Channel:</span>
        <label><input type="radio" name="noteChannel" value="1"> T1</label>
        <label><input type="radio" name="noteChannel" value="2" checked> T2</label>
        <label><input type="radio" name="noteChannel" value="3"> T3</label>
        <span style="margin-left: 20px;">Target Table:</span>
        <select id="noteTargetTable">
          <option value="0">Table0</option>
          <option value="1">Table1</option>
          <option value="2">Table2</option>
          <option value="3">Table3</option>
          <option value="4">Table4</option>
        </select>
        <div class="duration-control">
          <span>Length (Whole Note):</span>
          <input type="number" id="wholeNoteLen" value="64" style="width: 40px;">
          <button class="duration-btn" data-divisor="1">W</button>
          <button class="duration-btn" data-divisor="2">H</button>
          <button class="duration-btn selected" data-divisor="4">Q</button>
          <button class="duration-btn" data-divisor="8">E</button>
          <button class="duration-btn" data-divisor="16">S</button>
        </div>
        <button id="addNoteBtn" disabled>Add to Editor</button>
      </div>
      <div class="tabs">
        <button data-tab="tone" class="on">Simple Tone</button>
        <button data-tab="fade">Tone Fade</button>
        <button data-tab="vib">Tone Vibrato</button>
        <button data-tab="simple-bass">Simple Bass</button>
        <button data-tab="fade-bass">Fade Bass</button>
      </div>
      <div class="grid"></div>`;

    const grid = el.querySelector('.grid');
    const addBtn = document.getElementById('addNoteBtn');
    addBtn.onclick = insert;

    function getSelectedLength() {
        const wholeNoteLen = parseInt(document.getElementById('wholeNoteLen').value, 10);
        const selectedDur = document.querySelector('.duration-btn.selected');
        const divisor = selectedDur ? parseInt(selectedDur.dataset.divisor, 10) : 4;
        return Math.round(wholeNoteLen / divisor);
    }

    function draw(tab='tone'){
      grid.innerHTML='';
      const isTone = tab === 'tone' || tab === 'fade' || tab === 'vib';
      const isBass = tab === 'simple-bass' || tab === 'fade-bass';

      el.querySelector('.notes-controls span').hidden = isBass;
      el.querySelectorAll('.notes-controls label').forEach(l => l.hidden = isBass);

      if (isTone) {
          for (let oct=2; oct<=6; oct++){
            KEYS.forEach(k=>{
              if (!isNotePlayable(k, oct)) return;
              const btn = document.createElement('button');
              btn.textContent = k+' '+oct;
              btn.onclick = ()=>{
                const ch = parseInt(document.querySelector('input[name="noteChannel"]:checked').value, 10);
                const len = getSelectedLength();
                let noteData;
                if (tab==='tone') noteData=tSimple(ch,k,oct,len);
                if (tab==='fade') noteData=tFade(ch,k,oct,len);
                if (tab==='vib')  noteData=tVib(ch,k,oct,len);
                lastPreviewedBytes = noteData;
                preview(noteData.tables);
                addBtn.disabled = false;
              };
              grid.appendChild(btn);
            });
          }
      } else if (isBass) {
          for (let oct = 1; oct <= 3; oct++) {
              KEYS.forEach(k => {
                  const requiredPeriod = periodForNoise(k, oct, window.currentSystem|| 'NTSC');
                  if (requiredPeriod > 0x3FF) return;

                  const btn = document.createElement('button');
                  btn.textContent = k + ' ' + oct;
                  btn.onclick = () => {
                      const len = getSelectedLength();
                      let bassData;
                      if (tab === 'simple-bass') {
                          bassData = simpleBass(k, oct, len);
                      } else { // fade-bass
                          bassData = fadeBass(k, oct, len);
                      }
                      if (bassData) {
                        lastPreviewedBytes = bassData;
                        preview(bassData.tables);
                        addBtn.disabled = false;
                      } else {
                        alert(`The note ${k}${oct} is too high to be generated as a bass note.`);
                      }
                  };
                  grid.appendChild(btn);
              });
          }
      }
    }

    el.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
      el.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      draw(b.dataset.tab);
    });

    el.querySelectorAll('.duration-btn').forEach(b => {
        b.onclick = () => {
            el.querySelectorAll('.duration-btn').forEach(x => x.classList.remove('selected'));
            b.classList.add('selected');
        }
    });

    draw('tone');
  }
  return { mount };
})();
