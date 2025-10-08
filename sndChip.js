/**
 * @file SoundChip class
 * @copyright Amy Bienvenu 2010
 * @author Amy Bienvenu <amy.bienvenu@outlook.com>
 * @version 0.1
 * @summary Sound chip emulation for the ColecoVision BIOS OS7.
 */

const ATTENUATION_MAX = 15;
const CYCLESINTIME = 3579545.0 / 16.0;
var generaltime; //:Number
var interruption; //:Number
var interruption_counter; //:Number
var flipflop = []; //new Array(4);
var resulting_flipflop = []; //new Array(4);
var counter = []; //new Array(4);
var period = []; //new Array(4);
var attenuation = []; //new Array(4);
var noise_freq3; //:Boolean;
var noise_white; //:Boolean;
var noise_oldcode; //:int;
var ShiftRegister; //:int;
const ShiftReg_PRESET = 0x4000; //:int = ;
var Engine; //:SoundEngine;   
const AMPLIFICATION = [
   0.25,
   0.1985820586810703755164795707091,
   0.15773933612004831235859003415559,
   0.12529680840681807125038854672124,
   0.099526792638374312692563076271938,
   0.079056941504209483299972338610818,
   0.062797160787739502777125801694983,
   0.049881557874221990033811384918488,
   0.039622329811527837130052534334788,
   0.031473135294854180260598852659895,
   0.025,
   0.01985820586810703755164795707091,
   0.015773933612004831235859003415559,
   0.012529680840681807125038854672124,
   0.0099526792638374312692563076271938,
   0.0,
];
const NOISEFREQS = [32, 64, 128, 0];
class SoundChip{
  mute=[false,false,false,false];
  mixerGain=[1,1,1,1];
  lastOut=[0,0,0,0];
  setChannelMute(ch,m){this.mute[ch|0]=!!m;}
  setChannelGain(ch,g){this.mixerGain[ch|0]=Math.max(0,Math.min(2,+g));}

   constructor(myEngine, freq = 59.94) {
      Engine = myEngine;
      this.setBIOS(Engine);
      // Set INTERRUPTION FRENQUENCY (normally either PAL or NTSC)
      this.setSpeedHz(freq);
      interruption_counter = 0.0;
      this.reset_channels();
   }
   setBIOS(new_engine) {
      if (new_engine != null) {
         Engine = new_engine;
         Engine.setSoundChip(this);
      }
   }   
   setSpeedHz(hz) {
      interruption = 1.0/hz;
   }
   reset_channels() {
      // reset channels vars
      for (let i=0;i<4;i++) {
         attenuation[i] = ATTENUATION_MAX;
         counter[i] = 0; // 0.0;
         flipflop[i] = -1.0;
         resulting_flipflop[i] = 0;
         period[i] = 0; //0.0;
      }
      ShiftRegister = ShiftReg_PRESET;
      noise_freq3 = false;
      noise_white = true;
      noise_oldcode = -1;      
      generaltime = 0.0;
   }      
   tone(channel,new_period, new_attenuation) {
      attenuation[channel] = new_attenuation & 15;
      period[channel] = new_period & 0x3ff;
      if (attenuation[channel] == ATTENUATION_MAX) {
         counter[channel] = 0; // 0.0;
      }
   }
   noise_coleco(code, new_attenuation) {
      this.noise_attenuation(new_attenuation);
      if (code != noise_oldcode) {
         noise_oldcode = code;
         this.noise_code(code);
      }
   }
   noise_attenuation(new_attenuation) {
      attenuation[0] = new_attenuation & 15;
      if (attenuation[0] == ATTENUATION_MAX) {
         counter[0] = 0; // 0.0;
      }
   }   
   noise_code(code) {
      noise_oldcode = code;
      ShiftRegister = ShiftReg_PRESET;
      noise_white = ((code & 4) == 4);
      code &= 3;
      noise_freq3 = (code == 3);
      this.noise_period_update();
      counter[0] = 0; // 0.0;
   }

   noise_period_update() {
      if (noise_freq3) {
         period[0] = period[3] * 2;
      } else {
         period[0] = NOISEFREQS[noise_oldcode&3];
      }			
   }   
   /*
      * tonefreq (Hz) = 3579545 / (32*reg)
      */
   update(time) {
      
      interruption_counter += time;
      if (interruption_counter >= interruption) {
         interruption_counter = interruption_counter - interruption;				
         if (Engine != null) Engine.update_sound();
      }
      
      var nbcycles = Math.floor(CYCLESINTIME * (generaltime + time)) - Math.floor(CYCLESINTIME * generaltime);
      generaltime += time;
      
      this.noise_period_update();
      
      for (var i = 4; i >=0 ; i--)	{
         if (attenuation[i] < ATTENUATION_MAX) {
            
               resulting_flipflop[i] = flipflop[i];
               counter[i] += nbcycles;
               
               if (counter[i] >= period[i] && period[i] >= nbcycles ) {
                  counter[i] %= period[i];
                  counter[i] %= nbcycles;
                  if (i != 0 || (i == 0 && (ShiftRegister & 1) != ((ShiftRegister & 2) >> 1))) {
                     resulting_flipflop[i] = flipflop[i] * (1.0 - 2.0 * counter[i] / nbcycles);
                  }
                  if (i == 0) {							
                     flipflop[0] = ((ShiftRegister & 1) == 1)? -1.0 : 1.0;
                     var feedback;
                     if (noise_white) {
                        feedback = (ShiftRegister ^ ( ShiftRegister >>> 1)) & 1;
                     } else {
                        feedback = ShiftRegister & 1;
                     }
                     ShiftRegister = (ShiftRegister >>> 1) | (feedback << 14);							
                  } else {
                     flipflop[i] = -flipflop[i];
                  }
                  
               }
               
         } else {
            counter[i] = 0; // 0.0;
            flipflop[i] = -1.0;
         }
      }			
   }

   output() {
      var out = 0.0;
      for (var i = 0; i < 4; i++) {
         const __contrib = resulting_flipflop[i] * AMPLIFICATION[attenuation[i]];
      const __mixed = (this.mute[i]?0:__contrib * this.mixerGain[i]);
      this.lastOut[i] = __mixed;
      out += __mixed;
      }
      return out;
   }      
}

let sndChip = new SoundChip(null);
