// asmCodec.js — OS7 sound tables <-> Z80 ASM .db (multi-table, comments, mapping)
const ASM = (() => {
  const CLOCK_NTSC = 3579545.0, CLOCK_PAL = 3546893.0;
  const tname = t => ['Simple', 'FreqSweep', 'VolSweep', 'Vol+FreqSweep'][t & 3];
  const rateName = nf => ({ 0: 'N/512', 1: 'N/1024', 2: 'N/2048', 3: 'Tone3 clock' })[nf & 3];
  const toSigned = b => (b & 0x80) ? (b - 256) : b;
  const hex = arr => arr.map(x => '0x' + (x & 0xFF).toString(16).padStart(2, '0')).join(', ');
  const fmt = x => (x == null || !isFinite(x)) ? '?' : x.toFixed(1);
  const clk = sys => sys === 'PAL' ? CLOCK_PAL : CLOCK_NTSC;
  const hzFromPeriod = (p, sys = 'NTSC') => p ? clk(sys) / (32 * p) : null;

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function noteName(hz) {
    if (!hz || !isFinite(hz) || hz <= 0) return '—';
    const a4 = 440;
    const n = Math.round(12 * Math.log2(hz / a4));
    const name = NOTE_NAMES[(n + 9 + 1200) % 12];
    const oct = 4 + Math.floor((n + 9) / 12);
    return `${name}${oct}`;
  }

  // ========================================
  // ENHANCED EXPRESSION PARSER
  // ========================================

  function parseNumber(token) {
    if (!token) return null;
    let t = token.trim();
    if (!t) return null;

    // Strip # prefix if present (immediate addressing mode indicator)
    if (t.startsWith('#')) {
      t = t.slice(1);
    }

    // Hex formats
    if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
    if (/^\$[0-9a-f]+$/i.test(t)) return parseInt(t.slice(1), 16);
    if (/^[0-9a-f]+h$/i.test(t)) return parseInt(t.slice(0, -1), 16);

    // Binary formats
    if (/^0b[01]+$/i.test(t)) return parseInt(t.slice(2), 2);
    if (/^%[01]+$/i.test(t)) return parseInt(t.slice(1), 2);

    // Decimal
    if (/^\d+$/i.test(t)) return parseInt(t, 10);

    return null;
  }

  function evaluateExpression(expr) {
    if (!expr) return null;
    const trimmed = expr.trim();
    if (!trimmed) return null;

    // Simple number - no expression
    const simpleNum = parseNumber(trimmed);
    if (simpleNum !== null) return simpleNum;

    // Enhanced expression parser with full operator support
    try {
      return evaluateExpressionRecursive(trimmed);
    } catch (e) {
      console.warn('Expression evaluation error:', expr, e.message);
      return null;
    }
  }

  function evaluateExpressionRecursive(expr) {
    expr = expr.trim();

    // Handle parentheses first
    while (expr.includes('(')) {
      const match = expr.match(/\(([^()]+)\)/);
      if (!match) throw new Error('Mismatched parentheses');
      const innerResult = evaluateExpressionRecursive(match[1]);
      if (innerResult === null) throw new Error('Invalid expression in parentheses');
      expr = expr.replace(match[0], innerResult.toString());
    }

    // Handle unary minus (negative numbers)
    if (expr.startsWith('-')) {
      const rest = evaluateExpressionRecursive(expr.slice(1));
      if (rest === null) return null;
      return -rest;
    }

    // Handle unary bitwise NOT (~)
    if (expr.startsWith('~')) {
      const rest = evaluateExpressionRecursive(expr.slice(1));
      if (rest === null) return null;
      return ~rest;
    }

    // Try to parse as simple number
    const num = parseNumber(expr);
    if (num !== null) return num;

    // Operator precedence (lowest to highest):
    // 1. Bitwise OR (|)
    // 2. Bitwise XOR (^)
    // 3. Bitwise AND (&)
    // 4. Shift operators (<<, >>)
    // 5. Addition/Subtraction (+, -)
    // 6. Multiplication/Division/Modulo (*, /, %)

    // Process bitwise OR
    const orParts = splitByOperator(expr, '|');
    if (orParts.length > 1) {
      return orParts.reduce((acc, part) => {
        const val = evaluateExpressionRecursive(part);
        if (val === null) throw new Error('Invalid operand');
        return acc | val;
      });
    }

    // Process bitwise XOR
    const xorParts = splitByOperator(expr, '^');
    if (xorParts.length > 1) {
      return xorParts.reduce((acc, part) => {
        const val = evaluateExpressionRecursive(part);
        if (val === null) throw new Error('Invalid operand');
        return acc ^ val;
      });
    }

    // Process bitwise AND
    const andParts = splitByOperator(expr, '&');
    if (andParts.length > 1) {
      return andParts.reduce((acc, part) => {
        const val = evaluateExpressionRecursive(part);
        if (val === null) throw new Error('Invalid operand');
        return acc & val;
      });
    }

    // Process shift operators (<<, >>)
    let shiftMatch = expr.match(/^(.+?)(<<|>>)(.+)$/);
    if (shiftMatch) {
      const left = evaluateExpressionRecursive(shiftMatch[1]);
      const right = evaluateExpressionRecursive(shiftMatch[3]);
      if (left === null || right === null) throw new Error('Invalid operand');
      return shiftMatch[2] === '<<' ? (left << right) : (left >> right);
    }

    // Process addition/subtraction (left to right)
    const addSubParts = splitByOperatorLeftToRight(expr, ['+', '-']);
    if (addSubParts.length > 1) {
      let result = evaluateExpressionRecursive(addSubParts[0].value);
      if (result === null) throw new Error('Invalid operand');

      for (let i = 1; i < addSubParts.length; i++) {
        const val = evaluateExpressionRecursive(addSubParts[i].value);
        if (val === null) throw new Error('Invalid operand');

        if (addSubParts[i].operator === '+') {
          result += val;
        } else if (addSubParts[i].operator === '-') {
          result -= val;
        }
      }
      return result;
    }

    // Process multiplication/division/modulo (left to right)
    const mulDivParts = splitByOperatorLeftToRight(expr, ['*', '/', '%']);
    if (mulDivParts.length > 1) {
      let result = evaluateExpressionRecursive(mulDivParts[0].value);
      if (result === null) throw new Error('Invalid operand');

      for (let i = 1; i < mulDivParts.length; i++) {
        const val = evaluateExpressionRecursive(mulDivParts[i].value);
        if (val === null) throw new Error('Invalid operand');

        if (mulDivParts[i].operator === '*') {
          result *= val;
        } else if (mulDivParts[i].operator === '/') {
          if (val === 0) throw new Error('Division by zero');
          result = Math.floor(result / val);
        } else if (mulDivParts[i].operator === '%') {
          if (val === 0) throw new Error('Modulo by zero');
          result %= val;
        }
      }
      return result;
    }

    // No operators found, invalid expression
    return null;
  }

  // Split expression by operator (for operators with equal precedence)
  function splitByOperator(expr, operator) {
    const parts = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < expr.length; i++) {
      const char = expr[i];

      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (depth === 0 && char === operator) {
        if (current.trim()) parts.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    if (current.trim()) parts.push(current.trim());
    return parts.length > 1 ? parts : [expr];
  }

  // Split expression by multiple operators (left to right, for operators with equal precedence)
  function splitByOperatorLeftToRight(expr, operators) {
    const parts = [];
    let current = '';
    let depth = 0;
    let pendingOperator = null;

    for (let i = 0; i < expr.length; i++) {
      const char = expr[i];

      if (char === '(') {
        depth++;
        current += char;
      } else if (char === ')') {
        depth--;
        current += char;
      } else if (depth === 0 && operators.includes(char)) {
        if (current.trim()) {
          parts.push({ value: current.trim(), operator: pendingOperator });
          pendingOperator = char;
        }
        current = '';
        continue;
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      parts.push({ value: current.trim(), operator: pendingOperator });
    }

    return parts.length > 1 ? parts : [{ value: expr, operator: null }];
  }

  function dumpOne(data, { system = 'NTSC', comments = true, lfsr = 15, _ctx = null } = {}, label = 'Table0') {
    let i = 0, n = data.length, out = [label.replace(/\s+/g, '_') + ':'];
    const chname = { 1: 'Tone1', 2: 'Tone2', 3: 'Tone3' };
    const ctx = _ctx || { tone3Period: null, noiseUsesTone3Clock: false };
    const db = (line, c) => out.push('    .db ' + line + (comments && c ? ' ; ' + c : ''));
    
    while (i < n) {
      const b0 = data[i++] & 255, ch = (b0 >>> 6) & 3, code = b0 & 63;
      if ((code & 32) === 32) { const L = (code & 31) || 256; db(hex([b0]), `REST len=${L}`); continue; }
      if (code === 0x10) { db(hex([b0]), 'END'); break; }
      if (code === 0x18) { db(hex([b0]), 'REPEAT'); break; }
      
      const type = code & 3, raw = [b0];
      
      if (ch === 0) { // noise
        if (type === 0 && i < n) raw.push(data[i++] & 255);
        if (i >= n) break;
        const b2 = data[i++] & 255; raw.push(b2);
        const atten = (b2 >> 4) & 15, ncode = b2 & 7;
        
        if ((ncode & 3) === 3) {
            ctx.noiseUsesTone3Clock = true;
        } else {
            ctx.noiseUsesTone3Clock = false;
        }

        if (i >= n) break;
        let L = data[i++] & 255; raw.push(L); L = L || 256;
        let cmt;
        if ((ncode & 3) === 3) {
          const p3 = ctx.tone3Period;
          if (p3) {
            const ft = hzFromPeriod(p3, system);
            const fn = ft ? ft / lfsr : null;
            const noiseNote = noteName(fn);
            const tone3Note = noteName(ft);
            cmt = `Noise, ${tname(type)}, ${(ncode & 4) ? 'white' : 'periodic'}, rate=Tone3, `
              + `noise≈ ${noiseNote} (~${fmt(fn)}Hz /${lfsr}); `
              + `Tone3: ${tone3Note} (~${fmt(ft)}Hz, period=${p3}), `
              + `atten=${atten}, len=${L}`;
          } else {
            cmt = `Noise, ${tname(type)}, ${(ncode & 4) ? 'white' : 'periodic'}, rate=Tone3 (period unknown), atten=${atten}, len=${L}`;
          }
        } else {
          cmt = `Noise, ${tname(type)}, ${(ncode & 4) ? 'white' : 'periodic'}, rate=${rateName(ncode)}, atten=${atten}, len=${L}`;
        }
        if (type === 1 || type === 3) {
          const nib = data[i++] & 255; raw.push(nib);
          const step = toSigned(data[i++] & 255); raw.push(step & 255);
          cmt += `, Δperiod=${step} per ${((nib >> 4) & 15) || 16} (first ${(nib & 15) || 16})`;
        }
        if (type === 2 || type === 3) {
          const va = data[i++] & 255; raw.push(va);
          const vb = data[i++] & 255; raw.push(vb);
          cmt += `, Δatten=${(va >> 4) & 15} ×${(va & 15) || 16} per ${(vb >> 4) & 15 || 16} (first ${vb & 15 || 16})`;
        }
        db(hex(raw), cmt);
      } else { // tone
        if (i + 1 >= n) break;
        const low = data[i++] & 255; raw.push(low);
        const mix = data[i++] & 255; raw.push(mix);
        const period = ((mix & 3) << 8) | low, atten = (mix >> 4) & 15;
        if (ch === 3) ctx.tone3Period = period;
        
        let L = data[i++] & 255; raw.push(L); L = L || 256;
        let cmt;

        if (ch === 3 && atten === 15 && ctx.noiseUsesTone3Clock) {
            const noiseHz = hzFromPeriod(period, system) / lfsr;
            cmt = `${chname[ch]}, Simple, MUTED (for Noise), Noise f≈${fmt(noiseHz)}Hz (p=${period}), len=${L}`;
        } else {
            cmt = `${chname[ch] || ('Ch' + ch)}, ${tname(type)}, f≈${fmt(hzFromPeriod(period, system))}Hz (p=${period}), atten=${atten}, len=${L}`;
        }

        if (type === 1 || type === 3) {
          const nib = data[i++] & 255; raw.push(nib);
          const step = toSigned(data[i++] & 255); raw.push(step & 255);
          cmt += `, Δperiod=${step} per ${((nib >> 4) & 15) || 16} (first ${(nib & 15) || 16})`;
        }
        if (type === 2 || type === 3) {
          const va = data[i++] & 255; raw.push(va);
          const vb = data[i++] & 255; raw.push(vb);
          cmt += `, Δatten=${(va >> 4) & 15} ×${(va & 15) || 16} per ${(vb >> 4) & 15 || 16} (first ${vb & 15 || 16})`;
        }
        db(hex(raw), cmt);
      }
    }
    return out.join('\n') + '\n';
  }

  function dumpMulti(tables, { system = 'NTSC', comments = true, lfsr = 15 } = {}) {
    const parts = [], ctx = { tone3Period: null, noiseUsesTone3Clock: false };
    for (let t = 0; t < tables.length; t++) {
      parts.push(dumpOne(tables[t] || [], { system, comments, lfsr, _ctx: ctx }, 'Table' + t));
      if (t < tables.length - 1) parts.push('');
    }
    return parts.join('\n');
  }

  function assembleMultiWithMap(asmText){
    const text = (asmText || "");
    const tables = [], map = [];
    let cur = [], curMap = [], curIdx = -1;

    function pushTable(){
      if (curIdx < 0) return;
      tables.push(cur); map.push(curMap);
      cur = []; curMap = [];
    }

    // Expression parser functions are now defined at module level

    function readByte(tok){
      const result = evaluateExpression(tok);
      if (result === null) return null;

      // Enhanced validation with helpful feedback
      if (!isFinite(result)) {
        console.warn(`Expression "${tok}" resulted in non-finite value`);
        return null;
      }

      if (result < 0) {
        console.warn(`Expression "${tok}" = ${result} (negative values not valid for byte)`);
        return null;
      }

      if (result > 255) {
        console.warn(`Expression "${tok}" = ${result} (exceeds byte range, will be masked to ${result & 0xFF})`);
        return result & 0xFF; // Allow with warning, mask to byte
      }

      return result;
    }

    const noComments = text.replace(/;.*$/gm, "");
    const normalized = noComments.replace(/(^|[^A-Za-z0-9_.])(\.?\s*db)\b/gi, (m, pre, db) => {
      return (pre || "") + "\n" + db;
    });

    const lines = normalized.split(/\r?\n/);

    for (let ln = 0, off = 0; ln < lines.length; ln++){
      const line = lines[ln];
      const s = off; const e = s + line.length; off = e + 1;

      const label = line.match(/^\s*([A-Za-z_]\w*)\s*:\s*$/);
      if (label){
        pushTable();
        curIdx++;
        continue;
      }

      const m = line.match(/^\s*\.?\s*db\b(.*)$/i);
      if (!m) continue;

      const seg = (m[1] || "").trim();
      if (!seg) continue;

      if (curIdx < 0) curIdx = 0;

      const toks = seg.split(/[, \t]+/).filter(Boolean);
      for (const tok of toks){
        const v = readByte(tok);
        if (v == null || isNaN(v)){
          // Provide helpful error message
          let errorMsg = `invalid byte "${tok}"`;

          // Try to identify the error type
          if (tok.includes('/') && tok.split('/').some(x => x.trim() === '0')) {
            errorMsg += ' (division by zero)';
          } else if (tok.match(/[+\-*\/%&|^<>~]/)) {
            errorMsg += ' (expression error - check syntax and operator precedence)';
          } else if (tok.includes('(') || tok.includes(')')) {
            errorMsg += ' (parentheses mismatch or invalid expression)';
          } else if (!tok.match(/^[0-9a-fx$%]+$/i)) {
            errorMsg += ' (contains invalid characters for number/expression)';
          } else {
            errorMsg += ' (not a valid number format)';
          }

          return { error: errorMsg, line: ln + 1, tables: [], map: [] };
        }
        cur.push(v & 0xFF);
        curMap.push({ lineStart: s, lineEnd: e });
      }
    }

    pushTable();
    return { tables, map };
  }

  function assemble(asmText) { const r = assembleMultiWithMap(asmText); return r.error ? { error: r.error, line: r.line, bytes: [] } : { bytes: (r.tables[0] || []) }; }
  function assembleMulti(asmText) { const r = assembleMultiWithMap(asmText); return r.error ? { error: r.error, line: r.line, tables: [] } : { tables: r.tables }; }
  function parseBytes(txt) {
    if (!txt) return [];

    // Remove comments first - everything after ';' is a comment
    const commentIndex = txt.indexOf(';');
    if (commentIndex !== -1) {
      txt = txt.slice(0, commentIndex);
    }

    const out = [];
    const tokens = txt.split(/[\s,]+/).filter(Boolean);
    for (const tok of tokens) {
      const t = tok.trim();

      // Use the enhanced expression evaluator for all tokens
      const v = evaluateExpression(t);

      if (v != null && !isNaN(v) && isFinite(v)) {
        out.push(v & 0xFF);
      }
    }
    return out;
  }

  return { dump: dumpOne, dumpMulti, assemble, assembleMulti, assembleMultiWithMap, parseBytes, hzFromPeriod };
})();