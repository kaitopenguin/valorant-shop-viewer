// ==========================================================================
// INSTANT PUBLIC ONLINE TUNNEL FOR VALORANT SHOP VIEWER
// Allows friends anywhere in the world to open your shop without hosting
// ==========================================================================

import { spawn } from 'node:child_process';

console.log('=======================================================');
console.log('  VALORANT SHOP VIEWER - INSTANT ONLINE TUNNEL        ');
console.log('  Đang tạo đường link công khai trực tuyến miễn phí... ');
console.log('=======================================================');

// Using localhost.run SSH tunnel (free, zero install, pure SSH)
const ssh = spawn('ssh', [
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ServerAliveInterval=60',
  '-R', '80:localhost:3000',
  'nokey@localhost.run'
]);

ssh.stdout.on('data', (data) => {
  const text = data.toString();
  console.log(text);
  const match = text.match(/https:\/\/[a-zA-Z0-9.-]+\.lhr\.life/);
  if (match) {
    console.log('\n=======================================================');
    console.log('🎉 LINK ONLINE CÔNG KHAI ĐÃ SẴN SÀNG:');
    console.log(`👉 ${match[0]}`);
    console.log('Mọi người trên thế giới đều có thể mở link này trên điện thoại!');
    console.log('=======================================================\n');
  }
});

ssh.stderr.on('data', (data) => {
  // SSH diagnostic info
  const text = data.toString();
  if (text.includes('authenticated') || text.includes('tunnel')) {
    console.log(text);
  }
});

ssh.on('close', (code) => {
  console.log(`Đã đóng kết nối tunnel (code ${code})`);
});
