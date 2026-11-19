import fs from 'node:fs';
import path from 'node:path';

const htmlPath = 'C:/Users/Kaito/.gemini/antigravity/scratch/valorant-shop-viewer/public/index.html';
let content = fs.readFileSync(htmlPath, 'utf8');

console.log('Original sample:');
console.log(content.slice(0, 500));

// Check if double UTF-8 encoded
try {
  const recovered = Buffer.from(content, 'binary').toString('utf8');
  if (recovered.includes('cửa hàng') || recovered.includes('BẢNG ĐIỀU KHIỂN') || recovered.includes('TÀI KHOẢN')) {
    console.log('Successfully recovered via binary -> utf8!');
    fs.writeFileSync(htmlPath, recovered, 'utf8');
  } else {
    // Try windows-1252 to utf8
    console.log('Testing manual replacement or charset fix');
  }
} catch(e) {
  console.error(e);
}
