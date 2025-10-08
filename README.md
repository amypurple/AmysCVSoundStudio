# Amy's CV Sound Studio

**ColecoVision Music Development Environment**

A web-based development environment for creating authentic ColecoVision music and sound effects with hardware-accurate SN76489 PSG emulation.

## About

**First stable Version: v1.0.0 (October 2025)**

This project is based on:
- [Amy's CV SOUND OS7 DEMO](https://github.com/amypurple/cvsoundjs) - The incredible foundation for this project
- [Amy's Java OS7 Sound Bank](https://www.geocities.ws/newcoleco/soundbank/os7_en.html) - Game music library source

## Core Features

### Sound Engine
- **SN76489 PSG Emulation** - Authentic Texas Instruments sound chip with 3 tone channels + noise
- **Hardware-Accurate Audio** - Real ColecoVision sound with proper timings
- **NTSC/PAL Support** - Toggle between 60Hz and 50Hz frame rates
- **LFSR Configuration** - TI LFSR=15 (ColecoVision) or Sega LFSR=16

### Professional Development Tools
- **ASM Editor** - Import/export complete assembly files with label support
- **Notes Sheet** - Musical notation and reference
- **Sound Library** - Organize and manage reusable sound patterns
- **Music Sequencer** - Create elaborate multi-part compositions
- **Live Mixer** - Real-time VU meters, note detection, and channel visualization

### Music Library
- **46 ColecoVision Games** - Pre-loaded soundtracks from classic titles
- **Instant Playback** - Browse and play music from Donkey Kong, Zaxxon, Boulder Dash, and more
- **Gzip Compression** - Efficient storage (~50KB total library)

## Quick Start

### 1. Serve Locally
The app requires a local web server for file loading:

```bash
# Python
python -m http.server 8000

# Node.js
npx http-server

# PHP
php -S localhost:8000
```

### 2. Open in Browser
Navigate to `http://localhost:8000/`

### 3. Try Demo Songs
Click **Music → Demo Songs** to hear built-in examples like:
- Donkey Kong
- Rocky
- Space Fury
- Burger Time
- Omega Race

### 4. Explore the Game Library
Click **View → Game Library** and load the 46-game ColecoVision soundtrack collection

### 5. Create Your Own Music
Use the **ASM Editor** to paste assembly code or create new patterns from scratch

## Development Workflow

### Pattern Creation
Create sound patterns using the hex editor:
- Byte-by-byte editing with real-time interpretation
- Command analysis (notes, rests, loops, frequency sweeps)
- Channel targeting (Noise, Tone1, Tone2, Tone3)

### Sound Table Management
Organize patterns into indexed libraries:
- Sound table entries starting from index 1
- Memory address mapping for hardware layout
- Drag-drop pattern organization

### Music Sequencing
Compose complete soundtracks:
- Step-by-step timeline with variable durations
- Multi-channel support (1-4 channels per step)
- Loop point configuration

### Export
Generate assembly code for ColecoVision projects:
- Full ASM export with labels and comments
- Arithmetic expression support (`0x2D+0x40`, etc.)
- Multiple number formats (`$`, `0x`, `0b`, `%`, decimal)

## Project Structure

```
AmysCVSoundStudio/
├── index.html              # Main application interface
├── sndChip.js             # SN76489 PSG chip emulation
├── sndEngine.js           # Sound pattern interpreter
├── speaker.js             # Web Audio API integration
├── soundSystem.js         # 3-level architecture manager
├── soundUI.js             # User interface components
├── asmCodec.js            # ASM parser/generator
├── notes.js               # Musical note tables
├── musicLibrary.js        # Game library browser
├── sndTables.js           # Built-in demo songs
├── style.css              # Core styling
├── enhanced_editor_styles.css  # Advanced UI styling
└── cvbanks/               # 46 ColecoVision game soundtracks
```

## Music Data Format

### Pattern Structure
```assembly
music_pattern_A:
    db  0x41,0x23,0x40,0x0c    ; Tone1 note: 440Hz, vol 12, length 12
    db  0x83,0x45,0x50,0x18    ; Freq sweep note
    db  0x18                   ; LOOP to start
```

### Sound Table
```assembly
_snd_table:
    dw  noise_pattern,  0x702b      ; Index 1: Noise
    dw  tone1_pattern,  0x702b+30   ; Index 2: Tone1
    dw  tone2_pattern,  0x702b+20   ; Index 3: Tone2
```

### Music Sequence
```assembly
_music_sequence:
    db  0xc2, 1, 2, 3, 4     ; Duration 768 frames, 4 channels
    db  0xc1, 5, 6, 7, 8     ; Duration 384 frames, 4 channels
    db  0x00, 0x00           ; End sequence
```

## Technical Details

### Sound Commands
- **0x00-0x03** - Note types (Simple, Freq Swept, Vol Swept, Both)
- **0x10, 0x50, 0x90, 0xd0** - END commands
- **0x18, 0x58, 0x98, 0xd8** - LOOP/Repeat commands
- **0x20-0x3F** - Rest commands (duration = value & 0x1F)

### Timing System
- **NTSC**: 60Hz frame rate (16.67ms per frame)
- **PAL**: 50Hz frame rate (20ms per frame)
- **Frame-based durations** - All timing in frames, not milliseconds

### LFSR Configuration
- **TI/Coleco Mode**: 15-bit LFSR for authentic ColecoVision noise
- **Sega Mode**: 16-bit LFSR for Master System compatibility

## Included Game Soundtracks

The Music Library includes music from 46 classic ColecoVision titles:

- Donkey Kong
- Zaxxon
- Omega Race
- Boulder Dash
- Burger Time
- Pepper II
- Rocky
- Space Fury
- Time Pilot
- And 37 more!

## Tips & Tricks

1. **Use the mixer** to visualize what each channel is playing in real-time
2. **Import ASM files** directly - the parser handles labels, expressions, and multiple formats
3. **Browse the game library** for inspiration and to study how classic games used the sound chip
4. **Export your work** frequently to save your compositions
5. **Use sequences** to create complex multi-part music with intro/loop sections

## Credits

**Amy's CV Sound Studio** - Making ColecoVision music creation accessible and fun!

Built with authentic hardware emulation for the SN76489 PSG chip, this studio lets you create professional-quality ColecoVision music right in your browser.

Based on the incredible work from [Amy's CV SOUND OS7 DEMO](https://github.com/amypurple/cvsoundjs) and the extensive game music collection from [Amy's Java OS7 Sound Bank](https://www.geocities.ws/newcoleco/soundbank/os7_en.html).

---

**Created with passion for retro computing and ColecoVision development**
