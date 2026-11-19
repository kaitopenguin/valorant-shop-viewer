// ==========================================================================
// VALORANT SHOP DISCORD BOT - FULL SLASH COMMANDS & PREFIX SUPPORT
// ==========================================================================

import https from 'node:https';

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID; // Optional: for instant guild command testing
const API_URL = process.env.SHOP_API_URL || 'http://localhost:3000';

console.log('=======================================================');
console.log('  VALORANT SHOP DISCORD BOT PROTOCOL                   ');
console.log('=======================================================');

if (!BOT_TOKEN) {
  console.log('ℹ️  Chưa có DISCORD_BOT_TOKEN trong biến môi trường.');
  console.log('   Để khởi chạy Bot:');
  console.log('   1. Tạo ứng dụng trên https://discord.com/developers/applications');
  console.log('   2. Lấy Bot Token và Client ID');
  console.log('   3. Điền vào file .env hoặc chạy với biến môi trường');
}

// Discord REST API helper
function discordApi(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : null;
    const req = https.request(`https://discord.com/api/v10${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordBot (ValorantShopBot, 2.0)',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    req.on('error', reject);
    if (dataString) req.write(dataString);
    req.end();
  });
}

// List of official Slash Commands
export const SLASH_COMMANDS = [
  {
    name: 'shop',
    description: '🛒 Xem cửa hàng vũ khí Valorant hôm nay (kèm ảnh HD & giá VP)',
    options: [
      {
        name: 'user',
        description: 'Tên người chơi cần xem (nếu đã liên kết)',
        type: 3, // STRING
        required: false,
      }
    ]
  },
  {
    name: 'nightmarket',
    description: '🌙 Xem Chợ Đêm (Night Market) với ưu đãi giảm giá độc quyền',
  },
  {
    name: 'wallet',
    description: '💰 Kiểm tra số dư ví Valorant (VP, Radianite, Kingdom Credits)',
  },
  {
    name: 'login',
    description: '🔑 Nhận liên kết đăng nhập Riot chính quy an toàn 100% (gửi riêng tư)',
  },
  {
    name: 'wishlist',
    description: '⭐ Thêm skin vào danh sách theo dõi để bot tự tag bạn khi có trong shop',
    options: [
      {
        name: 'skin',
        description: 'Tên skin vũ khí (vd: Kuronami Vandal, Reaver, Prime...)',
        type: 3,
        required: true,
      }
    ]
  },
  {
    name: 'tierlist',
    description: '🏆 Tra cứu đánh giá Reddit & Pro player xem skin có đáng mua hay không',
    options: [
      {
        name: 'skin',
        description: 'Tên skin vũ khí (vd: Kuronami, Reaver, Prime, Ion, Origin...)',
        type: 3,
        required: true,
      }
    ]
  },
  {
    name: 'ping',
    description: '⚡ Kiểm tra độ trễ và trạng thái máy chủ Bot',
  }
];

// Register Slash Commands to Discord API
export async function registerSlashCommands() {
  if (!BOT_TOKEN || !CLIENT_ID) {
    console.log('⚠️ Cần có BOT_TOKEN và CLIENT_ID để đăng ký Slash Commands.');
    return;
  }

  try {
    console.log('Đang đăng ký Slash Commands lên Discord...');
    const endpoint = GUILD_ID 
      ? `/applications/${CLIENT_ID}/guilds/${GUILD_ID}/commands`
      : `/applications/${CLIENT_ID}/commands`;

    const res = await discordApi(endpoint, 'PUT', SLASH_COMMANDS);
    console.log('✅ Đã đăng ký thành công các lệnh Slash Commands:', res.map ? res.map(c => '/' + c.name).join(', ') : 'OK');
  } catch (err) {
    console.error('❌ Lỗi khi đăng ký Slash Commands:', err);
  }
}

// Helper: Format Rich Valorant Embed
export function buildShopEmbed(shopData, user, wallet) {
  const offers = shopData?.offers || [];
  return {
    title: `🛒 CỬA HÀNG VALORANT HÔM NAY // ${user?.gameName || 'AGENT'}#${user?.tagLine || 'VAL'}`,
    description: `💰 **Số Dư Ví:** \`${(wallet?.vp || 0).toLocaleString()} VP\` | \`${(wallet?.rp || 0).toLocaleString()} RP\` | \`${(wallet?.kc || 0).toLocaleString()} KC\`\n⏰ **Làm mới lại vào:** \`07:00 sáng mai\``,
    color: 0xff4655, // Radiant Red
    fields: offers.map((offer, idx) => {
      const tierBadge = offer.tierInfo ? `\n⭐ **Đánh giá: [Tier ${offer.tierInfo.tier}]** - ${offer.tierInfo.verdict}` : '';
      let videoLinks = offer.video ? `\n🎬 [Xem Video Finisher & Hiệu Ứng](${offer.video})` : '';
      const chromasWithVideo = offer.chromas?.filter(c => c.streamedVideo) || [];
      if (chromasWithVideo.length > 0) {
        const cLinks = chromasWithVideo.slice(0, 3).map((c, i) => `[Variant ${i + 1}](${c.streamedVideo})`).join(' • ');
        videoLinks += `\n🎨 Video Biến Thể: ${cLinks}`;
      }

      return {
        name: `[#${idx + 1}] ${offer.displayName}`,
        value: `💎 **${(offer.price || 1775).toLocaleString()} VP** | *${offer.contentTier?.displayName || 'Vũ khí'}*${tierBadge}${videoLinks}`,
        inline: false,
      };
    }),
    thumbnail: {
      url: offers[0]?.displayIcon || 'https://media.valorant-api.com/weaponskins/d8d5d7a1-4d81-8560-54bc-0692ab40f69b/displayicon.png',
    },
    footer: {
      text: 'Valorant Shop Bot 2.0 • Tự động gửi mỗi ngày lúc 07:00 sáng',
      icon_url: 'https://media.valorant-api.com/contenttiers/0cebb8be-46d7-4b0e-bab4-428837223576/displayicon.png',
    },
    timestamp: new Date().toISOString(),
  };
}

if (process.argv.includes('--register')) {
  registerSlashCommands();
}
