/**
 * @file SoundTables class
 * @copyright Amy Bienvenu 2010
 * @author Amy Bienvenu <amy.bienvenu@outlook.com>
 * @version 0.1
 * @summary Sound tables based on the ColecoVision OS7 BIOS routines.
 */

class SoundTables 
{
   table = [];
   label = [];
   nbrtables = 0;
   
   constructor() {			
      this.table = [[],[],[],[]];
      this.label = ["","","",""];
      this.nbrtables = 0;
   }
   
   fromString(s){
      
      var substrings = s.split("\n").join(String.fromCharCode(13)).split(String.fromCharCode(13));
      
      var i;
      var j;
      
      var flag_comment=false;
      var flag_valuekeyword = false;
      var flag_value = false;
      var aword ="";
      var value;
      
      this.nbrtables = 0;
      
      var car = "";
      
      for (j = 0; j < substrings.length; j++) {
      
         flag_comment = false;
         flag_valuekeyword = false;
         flag_value = false;
         value = -1;
         aword = new String();
         
         for (i = 0; i < substrings[j].length; i++) {
            
            car = substrings[j].charAt(i);
            
            switch (car)
            {
               
               case ".":
                  if (!flag_comment) {
                     if (this.nbrtables != 0) {
                        if (flag_value && value !=-1) this.table[this.nbrtables - 1].push(value);
                        value = -1;
                        flag_value = false;
                        flag_valuekeyword = true;
                     }
                  }
                  break;
               case ",":
                  if (flag_value && value != -1) {
                        this.table[this.nbrtables - 1].push(value);
                        value = 0;
                  }
                  aword = "";
                  break;
                  
               case ";":
                  if (!flag_comment) {
                     
                     if (flag_value && value != -1) {
                        this.table[this.nbrtables - 1].push(value);
                     }
                     value = -1;
                     aword = "";			
                     flag_comment = true;							
                  }
                  break;
                  
               case ":":
                  if (!flag_comment) {
                     this.table[this.nbrtables] = new Array();
                     this.label[this.nbrtables] = aword.replace(" ", "");
                     this.nbrtables++;
                     aword = "";
                     value = -1;
                  }
                  break;
                  
               case "0":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "1":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 1;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "2":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 2;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "3":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 3;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "4":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 4;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "5":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 5;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "6":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 6;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "7":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 7;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "8":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 8;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "9":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 9;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "a":
               case "A":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 10;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "b":
               case "B":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 11;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "c":
               case "C":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 12;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "d":
               case "D":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 13;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "e":
               case "E":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 14;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
               case "f":
               case "F":
                  if (!flag_comment && flag_value && value!=-1) {
                     value = value * 16 + 15;
                     if (value > 255) value = -1;
                  }
                  aword += car;
                  break;
                  
               case " ":
                  if (flag_valuekeyword) {
                     flag_valuekeyword = false;
                     flag_value = true;
                     value = 0;
                  }
                  break;
                  
               default:
                  if (!flag_comment) aword += car;
                  break;
            }
         }
         
         if (!flag_comment && flag_value) {
            if (value!=-1) this.table[this.nbrtables - 1].push(value);
         }
      }
      
   }
   
}
