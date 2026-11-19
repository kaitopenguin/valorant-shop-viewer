import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// In-memory cache for Valorant game assets
const cache = {
  skins: null,
  skinLevelsMap: new Map(), // levelUuid -> { skin, level }
  contentTiers: new Map(),  // tierUuid -> tierData
  bundles: new Map(),       // bundleUuid -> bundleData
  clientVersion: 'release-13.10-shipping-18-5893614',
  lastFetched: 0,
  sharedShops: new Map(),   // shareId -> shopSnapshot
};

// Content Tier standard prices fallback
const TIER_PRICES = {
  '0e38b886-40e7-4946-8e41-194311d74996': 875,  // Select
  '12683d76-48d7-4583-ac74-be2803dbe81e': 1275, // Deluxe
  '0cebb8be-46d7-4b0e-bab4-428837223576': 1775, // Premium
  'e046854e-406c-437b-acac-452a90424268': 2175, // Exclusive
  '411e4a55-4e59-421e-ad30-001a83419b30': 2475, // Ultra
};

// Fetch and cache Valorant static assets
async function loadValorantAssets() {
  try {
    console.log('[Valorant Cache] Fetching game version & assets from valorant-api.com...');

    // 1. Version
    try {
      const vRes = await fetch('https://valorant-api.com/v1/version');
      const vData = await vRes.json();
      if (vData.data?.riotClientVersion) {
        cache.clientVersion = vData.data.riotClientVersion;
      }
    } catch (e) {
      console.warn('[Valorant Cache] Could not fetch latest version, using fallback:', cache.clientVersion);
    }

    // 2. Content Tiers
    try {
      const tRes = await fetch('https://valorant-api.com/v1/contenttiers');
      const tData = await tRes.json();
      if (tData.data) {
        for (const tier of tData.data) {
          cache.contentTiers.set(tier.uuid, {
            uuid: tier.uuid,
            displayName: tier.displayName,
            devName: tier.devName,
            highlightColor: tier.highlightColor || 'ffffff',
            displayIcon: tier.displayIcon,
          });
        }
      }
    } catch (e) {
      console.warn('[Valorant Cache] Error loading content tiers:', e.message);
    }

    // 3. Bundles
    try {
      const bRes = await fetch('https://valorant-api.com/v1/bundles');
      const bData = await bRes.json();
      if (bData.data) {
        for (const bundle of bData.data) {
          cache.bundles.set(bundle.uuid, bundle);
        }
      }
    } catch (e) {
      console.warn('[Valorant Cache] Error loading bundles:', e.message);
    }

    // 4. Weapons & Skins
    const sRes = await fetch('https://valorant-api.com/v1/weapons/skins');
    const sData = await sRes.json();
    if (sData.data) {
      cache.skins = sData.data;
      cache.skinLevelsMap.clear();

      for (const skin of sData.data) {
        const tier = cache.contentTiers.get(skin.contentTierUuid) || null;
        const basePrice = tier ? (TIER_PRICES[tier.uuid] || 1775) : 1775;

        const skinSummary = {
          uuid: skin.uuid,
          displayName: skin.displayName,
          displayIcon: skin.displayIcon || skin.levels?.[0]?.displayIcon,
          contentTier: tier,
          themeUuid: skin.themeUuid,
          chromas: skin.chromas || [],
          levels: skin.levels || [],
          basePrice: basePrice,
        };

        // Map every level UUID to this skin
        if (skin.levels) {
          for (const lvl of skin.levels) {
            cache.skinLevelsMap.set(lvl.uuid.toLowerCase(), {
              skin: skinSummary,
              level: lvl,
            });
          }
        }
        // Also map skin UUID
        cache.skinLevelsMap.set(skin.uuid.toLowerCase(), {
          skin: skinSummary,
          level: skin.levels?.[0] || null,
        });
      }
      cache.lastFetched = Date.now();
      console.log(`[Valorant Cache] Successfully indexed ${cache.skins.length} skins and ${cache.skinLevelsMap.size} levels.`);
    }
  } catch (err) {
    console.error('[Valorant Cache] Failed to load assets:', err);
  }
}

// Initial assets load
loadValorantAssets();
// Refresh assets every 12 hours
setInterval(loadValorantAssets, 12 * 60 * 60 * 1000);

// Helper for sending JSON
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Riot-Entitlements-JWT, X-Riot-Region',
  });
  res.end(JSON.stringify(data));
}

// Helper for parsing JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        req.socket.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// Official Riot OAuth URL generator
const RIOT_CLIENT_ID = 'play-valorant-web-prod';
const RIOT_REDIRECT_URI = 'https://playvalorant.com/opt_in';
const RIOT_AUTH_URL = `https://auth.riotgames.com/authorize?redirect_uri=${encodeURIComponent(RIOT_REDIRECT_URI)}&client_id=${RIOT_CLIENT_ID}&response_type=token%20id_token&scope=account%20openid&nonce=1`;

// Tier List Database synthesized from Reddit (r/Valorant) & Pro Player Tier Lists
const TIER_LIST_DATA = {
  'kuronami': { tier: 'S+', verdict: 'ĐÁNG TIỀN NHẤT (GOD TIER)', score: '9.9/10', summary: 'Âm thanh giòn tan, finisher bão mưa bẻ thời tiết đẹp nhất lịch sử Valorant, cảm giác sấy đạn nước cực êm.' },
  'reaver': { tier: 'S+', verdict: 'ĐÁNG TIỀN NHẤT (GOD TIER)', score: '9.8/10', summary: 'Huyền thoại bất tử của Valorant. Tiếng chuông nhà thờ đanh thép, cảm giác headshot đầm tay bậc nhất.' },
  'prime': { tier: 'S+', verdict: 'ĐÁNG TIỀN NHẤT (GOD TIER)', score: '9.8/10', summary: 'Aimbot ngầm được Pro players tin dùng. Tiếng đạn laser êm như bơ, reload hộp năng lượng công nghệ cao.' },
  'ion': { tier: 'S+', verdict: 'ĐÁNG TIỀN NHẤT (GOD TIER)', score: '9.7/10', summary: 'Thiết kế tối giản tương lai của Apple x Sci-Fi. Âm thanh năng lượng laser sạch sẽ, tap headshot cực sướng.' },
  'prelude to chaos': { tier: 'S+', verdict: 'ĐÁNG TIỀN NHẤT (GOD TIER)', score: '9.7/10', summary: 'Heavy metal rock uy lực xé gió. Khẩu súng có âm thanh bắn mạnh mẽ và finisher triệu hồi vực thẳm đỉnh chóp.' },
  'araxys': { tier: 'S+', verdict: 'ĐÁNG TIỀN NHẤT (GOD TIER)', score: '9.6/10', summary: 'Vảy rồng công nghệ ngoài hành tinh đóng mở khi bắn và nạp đạn, âm thanh sci-fi vũ trụ đanh gọn.' },
  'mystbloom': { tier: 'S+', verdict: 'ĐÁNG TIỀN NHẤT (GOD TIER)', score: '9.6/10', summary: 'Finisher nở rộ vườn hoa anh đào tuyệt mỹ, âm thanh thanh thoát tao nhã, inspect múa hoa kỳ công.' },
  'oni': { tier: 'S', verdict: 'RẤT ĐÁNG MUA (TOP TIER)', score: '9.5/10', summary: 'Mặt nạ quỷ Nhật Bản, âm thanh nhát chém linh hồn sắc lẹm, bắn tap cực kỳ ổn định.' },
  'singularity': { tier: 'S', verdict: 'RẤT ĐÁNG MUA (TOP TIER)', score: '9.4/10', summary: 'Vật chất tối vũ trụ, reload phân rã không gian và finisher hố đen nuốt chửng.' },
  'chronovoid': { tier: 'S', verdict: 'RẤT ĐÁNG MUA (TOP TIER)', score: '9.3/10', summary: 'Quả cầu thời gian xoay chuyển ma thuật, âm thanh gõ pha lê tinh tế và finisher khóa thời gian.' },
  'sovereign': { tier: 'S', verdict: 'RẤT ĐÁNG MUA (TOP TIER)', score: '9.3/10', summary: 'Ánh sáng thánh quân vương, tiếng chuông ngân vang thanh khiết, một trong những skin Ghost/Sword đẹp nhất.' },
  'gaia': { tier: 'S', verdict: 'RẤT ĐÁNG MUA (TOP TIER)', score: '9.2/10', summary: 'Cây cổ thụ thần thoại mọc lên ở finisher, âm thanh gõ đá tinh xảo tựa ngọc bích.' },
  'magepunk': { tier: 'S', verdict: 'RẤT ĐÁNG MUA (TOP TIER)', score: '9.1/10', summary: 'Tia sét hồ quang điện giật tê tái, phong cách Steampunk đồng thau và bóng đèn chân không.' },
  'glitchpop': { tier: 'S', verdict: 'RẤT ĐÁNG MUA (TOP TIER)', score: '9.0/10', summary: 'Cyberpunk neon sặc sỡ, âm thanh điện tử vui nhộn và sticker hoạt hình hologram.' },
  'xenohunter': { tier: 'A', verdict: 'ĐÁNG MUA NẾU THÍCH STYLE', score: '8.8/10', summary: 'Radar quét nhịp tim quân đội, dao bấm mở nhanh nhất game được pro players cực kỳ ưa chuộng.' },
  'neptune': { tier: 'A', verdict: 'ĐÁNG MUA NẾU THÍCH STYLE', score: '8.7/10', summary: 'Khẩu súng bể cá Blub Blub sủi bọt nước giải trí nhất game, bắn cực kỳ êm và xả stress.' },
  'recon': { tier: 'A', verdict: 'ĐÁNG MUA NẾU THÍCH STYLE', score: '8.6/10', summary: 'Quân sự thực tế ngẫu nhiên phụ kiện, múa dao bướm Balisong siêu mượt.' },
  'sentinels of light': { tier: 'A', verdict: 'ĐÁNG MUA NẾU THÍCH STYLE', score: '8.5/10', summary: 'Đá cổ ngữ Ánh Sáng Tối Cao của LMHT, âm thanh nổ sấm vang dội.' },
  'protocol': { tier: 'A', verdict: 'ĐÁNG MUA NẾU THÍCH STYLE', score: '8.5/10', summary: 'Vũ khí AI trí tuệ nhân tạo có giọng nói riêng theo tình huống (hạ gục, clutch, inspect).' },
  'origin': { tier: 'B', verdict: 'CÂN NHẮC KỸ TRƯỚC KHI MUA', score: '7.5/10', summary: 'Inspect vòng xoay ma thuật vô tận cực ngầu nhưng âm thanh bắn hơi to dễ gây mất tập trung.' },
  'rgx': { tier: 'B', verdict: 'CÂN NHẮC KỸ TRƯỚC KHI MUA', score: '7.8/10', summary: 'Đèn LED RGB đổi màu và kill tracker hiện đại, tuy nhiên tiếng đạn hơi chát khi sấy dài.' },
  'elderflame': { tier: 'B', verdict: 'CÂN NHẮC KỸ TRƯỚC KHI MUA', score: '7.2/10', summary: 'Con rồng sống động 100% nhưng thân súng quá to che khuất tầm nhìn khi đấu súng căng thẳng.' },
};

function getSkinTierInfo(displayName) {
  if (!displayName) return { tier: 'C', verdict: 'BÌNH THƯỜNG', score: '6.0/10', summary: 'Skin cơ bản không có nhiều hiệu ứng hoạt ảnh nổi bật.' };
  const lower = displayName.toLowerCase();
  for (const [key, val] of Object.entries(TIER_LIST_DATA)) {
    if (lower.includes(key)) return val;
  }
  // Check if standard select/deluxe skin with no VFX
  return { tier: 'D', verdict: 'LÃNG PHÍ VP (NÊN TRÁNH)', score: '4.0/10', summary: 'Skin đổi màu đơn thuần, không có hiệu ứng bắn, âm thanh hay kết liễu. Tiết kiệm VP cho các skin cao cấp hơn!' };
}
function getDemoShop() {
  const sampleSkinNames = ['Kuronami Vandal', 'Reaver Operator', 'Prime//2.0 Phantom', 'Ion Sheriff'];
  const dailyOffers = [];

  for (const name of sampleSkinNames) {
    const found = cache.skins?.find(s => s.displayName.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(s.displayName.toLowerCase()));
    if (found) {
      const tier = cache.contentTiers.get(found.contentTierUuid) || {
        displayName: 'Exclusive',
        highlightColor: 'e09c3d',
      };
      // Pick best video: level 4 finisher, or level 3 vfx, or chroma video
      const bestVideo = found.levels?.slice().reverse().find(l => l.streamedVideo)?.streamedVideo ||
        found.chromas?.find(c => c.streamedVideo)?.streamedVideo || null;

      dailyOffers.push({
        uuid: found.uuid,
        displayName: found.displayName,
        displayIcon: found.displayIcon || found.levels?.[0]?.displayIcon,
        price: TIER_PRICES[found.contentTierUuid] || 2175,
        contentTier: tier,
        chromas: found.chromas || [],
        levels: found.levels || [],
        video: bestVideo,
        tierInfo: getSkinTierInfo(found.displayName),
      });
    }
  }

  // Calculate remaining seconds until 00:00 UTC (Shop reset time)
  const now = new Date();
  const reset = new Date();
  reset.setUTCHours(24, 0, 0, 0);
  const remainingSeconds = Math.max(0, Math.floor((reset.getTime() - now.getTime()) / 1000));

  return {
    isDemo: true,
    user: {
      gameName: 'RadiantAgent',
      tagLine: 'VN1',
      region: 'ap',
      puuid: 'demo-puuid-12345',
    },
    wallet: {
      vp: 4250,
      rp: 180,
      kc: 8500,
    },
    shop: {
      remainingSeconds,
      offers: dailyOffers,
    },
    nightMarket: {
      active: true,
      remainingSeconds: 86400 * 5,
      offers: [
        {
          displayName: 'Prime Vandal',
          displayIcon: 'https://media.valorant-api.com/weaponskins/9c82e13d-4736-0d37-8ff0-f08386925fa2/displayicon.png',
          originalPrice: 1775,
          discountPercent: 42,
          discountedPrice: 1029,
          contentTier: { displayName: 'Premium Edition', highlightColor: 'd1548d' },
        },
        {
          displayName: 'Magepunk Ghost',
          displayIcon: 'https://media.valorant-api.com/weaponskins/225c50ef-4ab4-7744-8d40-f483cbb16db2/displayicon.png',
          originalPrice: 1775,
          discountPercent: 35,
          discountedPrice: 1153,
          contentTier: { displayName: 'Premium Edition', highlightColor: 'd1548d' },
        },
        {
          displayName: 'Recon Spectre',
          displayIcon: 'https://media.valorant-api.com/weaponskins/92666710-449e-ec47-0e9b-439ff0185994/displayicon.png',
          originalPrice: 1775,
          discountPercent: 30,
          discountedPrice: 1242,
          contentTier: { displayName: 'Premium Edition', highlightColor: 'd1548d' },
        },
        {
          displayName: 'Sovereign Marshal',
          displayIcon: 'https://media.valorant-api.com/weaponskins/bb6e1a90-410a-39fb-0bf5-eb99e31d42a9/displayicon.png',
          originalPrice: 1775,
          discountPercent: 48,
          discountedPrice: 923,
          contentTier: { displayName: 'Premium Edition', highlightColor: 'd1548d' },
        },
        {
          displayName: 'Infantry Guardian',
          displayIcon: 'https://media.valorant-api.com/weaponskins/b00d8804-44b4-d757-0ad0-4284d7a885eb/displayicon.png',
          originalPrice: 875,
          discountPercent: 50,
          discountedPrice: 437,
          contentTier: { displayName: 'Select Edition', highlightColor: '5a9fe2' },
        },
        {
          displayName: 'Xenohunter Knife',
          displayIcon: 'https://media.valorant-api.com/weaponskins/88e8f8dc-4e58-6938-166e-2195df4a6224/displayicon.png',
          originalPrice: 3550,
          discountPercent: 25,
          discountedPrice: 2662,
          contentTier: { displayName: 'Premium Edition', highlightColor: 'd1548d' },
        },
      ],
    },
    featuredBundle: {
      name: 'Singularity 2.0',
      remainingSeconds: 86400 * 3,
      price: 6700,
      banner: 'https://media.valorant-api.com/bundles/165cf459-4d69-3259-22a8-0f9c2d1b7a2c/displayicon.png',
    },
  };
}

// Request handler
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Riot-Entitlements-JWT, X-Riot-Region',
    });
    return res.end();
  }

  // --- API Endpoints ---

  // Healthcheck
  if (pathname === '/api/health') {
    return sendJSON(res, 200, {
      status: 'ok',
      version: '2.0.0',
      clientVersion: cache.clientVersion,
      skinsCount: cache.skins ? cache.skins.length : 0,
      timestamp: new Date().toISOString(),
    });
  }

  // Get Riot Official Login URL
  if (pathname === '/api/riot/login-url') {
    return sendJSON(res, 200, {
      success: true,
      authUrl: RIOT_AUTH_URL,
      instructions: [
        '1. Nhấp vào đường dẫn đăng nhập Riot chính quy bên dưới.',
        '2. Đăng nhập an toàn trực tiếp trên máy chủ Riot Games (auth.riotgames.com).',
        '3. Sau khi đăng nhập, Riot sẽ chuyển hướng bạn về trang playvalorant.com/opt_in#access_token=...',
        '4. Copy toàn bộ URL trên thanh địa chỉ và dán vào ô bên dưới để xem cửa hàng!',
      ],
    });
  }

  // Demo Shop endpoint
  if (pathname === '/api/demo-shop') {
    return sendJSON(res, 200, getDemoShop());
  }

  // Tier List endpoint (Community & Reddit consensus)
  if (pathname === '/api/tierlist') {
    return sendJSON(res, 200, {
      success: true,
      tiers: TIER_LIST_DATA,
    });
  }

  // Share Shop: Save a snapshot for friends to view
  if (pathname === '/api/share/save' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const shareId = (body.user?.gameName || 'shop') + '-' + Math.random().toString(36).substring(2, 8);
      cache.sharedShops.set(shareId, {
        ...body,
        savedAt: Date.now(),
      });
      return sendJSON(res, 200, {
        success: true,
        shareId,
        shareUrl: `/share.html?id=${shareId}`,
      });
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: e.message });
    }
  }

  // Share Shop: Get snapshot
  if (pathname.startsWith('/api/share/get/')) {
    const id = pathname.replace('/api/share/get/', '');
    const data = cache.sharedShops.get(id);
    if (!data) {
      return sendJSON(res, 404, { success: false, error: 'Không tìm thấy cửa hàng được chia sẻ hoặc đã hết hạn.' });
    }
    return sendJSON(res, 200, { success: true, data });
  }

  // Exchange Access Token for Entitlements & User Info
  if (pathname === '/api/riot/token' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      let accessToken = body.accessToken || '';
      const fullUrl = body.url || '';

      // Extract access_token from URL if provided
      if (fullUrl) {
        const match = fullUrl.match(/access_token=([^&]+)/);
        if (match) accessToken = match[1];
      }

      if (!accessToken) {
        return sendJSON(res, 400, {
          success: false,
          error: 'Thiếu Access Token hoặc URL hợp lệ.',
        });
      }

      // 1. Fetch Entitlements Token
      const entRes = await fetch('https://entitlements.auth.riotgames.com/api/token/v1', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!entRes.ok) {
        const errText = await entRes.text();
        return sendJSON(res, entRes.status, {
          success: false,
          error: 'Token Riot không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
          details: errText,
        });
      }

      const entData = await entRes.json();
      const entitlementsToken = entData.entitlements_token;

      // 2. Fetch User Info (PUUID & Riot ID)
      const userRes = await fetch('https://auth.riotgames.com/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      let userInfo = { puuid: '', gameName: 'Agent', tagLine: 'VAL' };
      if (userRes.ok) {
        const uData = await userRes.json();
        userInfo.puuid = uData.sub || '';
        if (uData.acct) {
          userInfo.gameName = uData.acct.game_name || userInfo.gameName;
          userInfo.tagLine = uData.acct.tag_line || userInfo.tagLine;
        }
      }

      return sendJSON(res, 200, {
        success: true,
        accessToken,
        entitlementsToken,
        user: userInfo,
      });
    } catch (err) {
      console.error('Error handling token exchange:', err);
      return sendJSON(res, 500, {
        success: false,
        error: 'Lỗi máy chủ khi xử lý xác thực Riot: ' + err.message,
      });
    }
  }

  // Direct Login (Username & Password + 2FA support)
  if (pathname === '/api/riot/direct-login' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { username, password, otpCode } = body;

      const userAgent = 'RiotClient/93.0.1.2272.3923 rso-auth (Windows; 10;;Enterprise;64bit)';

      // 1. Initialize auth cookies
      const initRes = await fetch('https://auth.riotgames.com/api/v1/authorization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
        },
        body: JSON.stringify({
          client_id: RIOT_CLIENT_ID,
          nonce: '1',
          redirect_uri: RIOT_REDIRECT_URI,
          response_type: 'token id_token',
          scope: 'account openid',
        }),
      });

      const setCookieHeaders = initRes.headers.getSetCookie ? initRes.headers.getSetCookie() : [initRes.headers.get('set-cookie')].filter(Boolean);
      const cookies = setCookieHeaders.map(c => c.split(';')[0]).join('; ');

      // 2. Submit credentials or OTP
      let authPayload;
      if (otpCode) {
        authPayload = {
          type: 'multifactor',
          code: otpCode.trim(),
          rememberDevice: true,
        };
      } else {
        authPayload = {
          type: 'auth',
          username,
          password,
          remember: true,
        };
      }

      const authRes = await fetch('https://auth.riotgames.com/api/v1/authorization', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
          Cookie: cookies,
        },
        body: JSON.stringify(authPayload),
      });

      const authData = await authRes.json();

      // Check if 2FA is required
      if (authData.type === 'multifactor') {
        return sendJSON(res, 200, {
          success: true,
          require2FA: true,
          email: authData.multifactor?.email || 'email bảo mật của bạn',
          message: 'Vui lòng nhập mã xác thực 2FA gửi về email của bạn.',
        });
      }

      // Check error
      if (authData.error) {
        return sendJSON(res, 400, {
          success: false,
          error: authData.error === 'auth_failure' ? 'Tài khoản hoặc mật khẩu Riot không chính xác.' : authData.error,
        });
      }

      // Check if redirected with tokens
      const redirectUri = authData.response?.parameters?.uri;
      if (redirectUri) {
        const tokenMatch = redirectUri.match(/access_token=([^&]+)/);
        const accessToken = tokenMatch ? tokenMatch[1] : null;

        if (accessToken) {
          const entRes = await fetch('https://entitlements.auth.riotgames.com/api/token/v1', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
          });
          const entData = await entRes.json();

          const userRes = await fetch('https://auth.riotgames.com/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const uData = await userRes.json();

          return sendJSON(res, 200, {
            success: true,
            accessToken,
            entitlementsToken: entData.entitlements_token,
            user: {
              puuid: uData.sub,
              gameName: uData.acct?.game_name || 'Agent',
              tagLine: uData.acct?.tag_line || 'VAL',
            },
          });
        }
      }

      return sendJSON(res, 400, {
        success: false,
        error: 'Không thể trích xuất token Riot từ phiên đăng nhập.',
        raw: authData,
      });
    } catch (e) {
      console.error('Direct login error:', e);
      return sendJSON(res, 500, {
        success: false,
        error: 'Lỗi đăng nhập: ' + e.message,
      });
    }
  }

  // Get User Storefront (Daily Skins, Bundles, Night Market)
  if (pathname === '/api/shop') {
    try {
      const accessToken = req.headers['authorization']?.replace('Bearer ', '');
      const entitlementsToken = req.headers['x-riot-entitlements-jwt'];
      const region = req.headers['x-riot-region'] || 'ap';
      const puuid = parsedUrl.searchParams.get('puuid');

      if (!accessToken || !entitlementsToken || !puuid) {
        return sendJSON(res, 400, {
          success: false,
          error: 'Thiếu thông tin xác thực (Authorization, Entitlements JWT, hoặc PUUID).',
        });
      }

      const clientPlatform = 'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9';

      // 1. Fetch Storefront
      const storeUrl = `https://pd.${region}.a.pvp.net/store/v2/storefront/${puuid}`;
      const storeRes = await fetch(storeUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Riot-Entitlements-JWT': entitlementsToken,
          'X-Riot-ClientVersion': cache.clientVersion,
          'X-Riot-ClientPlatform': clientPlatform,
        },
      });

      if (!storeRes.ok) {
        const errText = await storeRes.text();
        return sendJSON(res, storeRes.status, {
          success: false,
          error: 'Không thể tải cửa hàng từ Riot PVP server. Phiên đăng nhập có thể đã hết hạn.',
          details: errText,
        });
      }

      const storeData = await storeRes.json();

      // 2. Fetch Wallet (Balances)
      let wallet = { vp: 0, rp: 0, kc: 0 };
      try {
        const walletRes = await fetch(`https://pd.${region}.a.pvp.net/store/v1/wallet/${puuid}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Riot-Entitlements-JWT': entitlementsToken,
            'X-Riot-ClientVersion': cache.clientVersion,
            'X-Riot-ClientPlatform': clientPlatform,
          },
        });
        if (walletRes.ok) {
          const walletData = await walletRes.json();
          wallet.vp = walletData.Balances?.['85ad13f7-3d1b-5128-9eb8-14cd290b591a'] || 0;
          wallet.rp = walletData.Balances?.['e59aa87c-4cbf-517a-5983-6e81511be9b7'] || 0;
          wallet.kc = walletData.Balances?.['d9d58f5a-47f6-4ced-9c23-25752c26454e'] || 0;
        }
      } catch (we) {
        console.warn('Could not fetch wallet:', we.message);
      }

      // 3. Resolve Daily 4 Skin Offers
      const rawOffers = storeData.SkinsPanelLayout?.SingleItemOffers || [];
      const remainingSeconds = storeData.SkinsPanelLayout?.SingleItemOffersRemainingDurationInSeconds || 0;

      const dailyOffers = rawOffers.map(uuid => {
        const itemInfo = cache.skinLevelsMap.get(uuid.toLowerCase());
        if (itemInfo) {
          const bestVideo = itemInfo.skin.levels?.slice().reverse().find(l => l.streamedVideo)?.streamedVideo ||
            itemInfo.skin.chromas?.find(c => c.streamedVideo)?.streamedVideo || null;

          return {
            uuid: itemInfo.skin.uuid,
            levelUuid: itemInfo.level?.uuid || uuid,
            displayName: itemInfo.skin.displayName,
            displayIcon: itemInfo.skin.displayIcon || itemInfo.level?.displayIcon,
            price: itemInfo.skin.basePrice,
            contentTier: itemInfo.skin.contentTier,
            chromas: itemInfo.skin.chromas,
            levels: itemInfo.skin.levels,
            video: bestVideo,
            tierInfo: getSkinTierInfo(itemInfo.skin.displayName),
          };
        }
        return {
          uuid: uuid,
          displayName: 'Vũ khí Valorant',
          displayIcon: '',
          price: 1775,
          contentTier: null,
          video: null,
          tierInfo: { tier: 'C', verdict: 'BÌNH THƯỜNG', score: '6.0/10', summary: 'Skin cơ bản' },
        };
      });

      // 4. Resolve Night Market (BonusStore)
      let nightMarket = null;
      if (storeData.BonusStore?.BonusStoreOffers) {
        const nmOffers = storeData.BonusStore.BonusStoreOffers.map(offer => {
          const rewardUuid = offer.Offer?.Rewards?.[0]?.ItemID || '';
          const itemInfo = cache.skinLevelsMap.get(rewardUuid.toLowerCase());
          const costMap = offer.Offer?.Cost || {};
          const originalPrice = Object.values(costMap)[0] || (itemInfo?.skin?.basePrice || 1775);
          const discountCostMap = offer.DiscountCosts || {};
          const discountedPrice = Object.values(discountCostMap)[0] || originalPrice;

          return {
            uuid: itemInfo?.skin.uuid || rewardUuid,
            displayName: itemInfo?.skin.displayName || 'Vũ khí Chợ Đêm',
            displayIcon: itemInfo?.skin.displayIcon || itemInfo?.level?.displayIcon || '',
            originalPrice,
            discountPercent: offer.DiscountPercent || 0,
            discountedPrice,
            contentTier: itemInfo?.skin.contentTier || null,
          };
        });

        nightMarket = {
          active: true,
          remainingSeconds: storeData.BonusStore.BonusStoreRemainingDurationInSeconds || 0,
          offers: nmOffers,
        };
      }

      // 5. Resolve Featured Bundle
      let featuredBundle = null;
      const rawBundle = storeData.FeaturedBundle?.Bundle;
      if (rawBundle) {
        const bundleInfo = cache.bundles.get(rawBundle.DataAssetID);
        featuredBundle = {
          id: rawBundle.ID,
          name: bundleInfo?.displayName || 'Gói Nổi Bật',
          banner: bundleInfo?.displayIcon || bundleInfo?.displayIcon2 || '',
          price: rawBundle.TotalBaseCost ? Object.values(rawBundle.TotalBaseCost)[0] : 0,
          remainingSeconds: rawBundle.DurationRemainingInSeconds || 0,
        };
      }

      return sendJSON(res, 200, {
        success: true,
        wallet,
        shop: {
          remainingSeconds,
          offers: dailyOffers,
        },
        nightMarket,
        featuredBundle,
      });
    } catch (err) {
      console.error('Error fetching shop:', err);
      return sendJSON(res, 500, {
        success: false,
        error: 'Lỗi tải cửa hàng: ' + err.message,
      });
    }
  }

  // Search skins (for Wishlist search)
  if (pathname === '/api/skins/search') {
    const q = (parsedUrl.searchParams.get('q') || '').toLowerCase().trim();
    if (!cache.skins) {
      return sendJSON(res, 200, { skins: [] });
    }

    const results = cache.skins
      .filter(s => {
        if (!s.displayName) return false;
        if (s.displayName.toLowerCase().includes('standard')) return false;
        if (s.displayName.toLowerCase().includes('random')) return false;
        return q ? s.displayName.toLowerCase().includes(q) : true;
      })
      .slice(0, 30)
      .map(s => {
        const tier = cache.contentTiers.get(s.contentTierUuid) || null;
        return {
          uuid: s.uuid,
          displayName: s.displayName,
          displayIcon: s.displayIcon || s.levels?.[0]?.displayIcon,
          contentTier: tier,
          price: tier ? (TIER_PRICES[tier.uuid] || 1775) : 1775,
        };
      });

    return sendJSON(res, 200, { skins: results });
  }

  // Send Telegram Notification
  if (pathname === '/api/notify/telegram' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { botToken, chatId, message, photoUrl } = body;

      if (!botToken || !chatId) {
        return sendJSON(res, 400, {
          success: false,
          error: 'Vui lòng cung cấp botToken và chatId của Telegram.',
        });
      }

      let teleRes;
      if (photoUrl) {
        teleRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: photoUrl,
            caption: message,
            parse_mode: 'HTML',
          }),
        });
      } else {
        teleRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
          }),
        });
      }

      const teleData = await teleRes.json();
      if (!teleData.ok) {
        return sendJSON(res, 400, {
          success: false,
          error: 'Telegram API trả về lỗi: ' + (teleData.description || 'Không xác định'),
        });
      }

      return sendJSON(res, 200, { success: true, message: 'Đã gửi thông báo Telegram thành công!' });
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: 'Lỗi gửi Telegram: ' + e.message });
    }
  }

  // Send Discord Rich Embed Notification (Single or Multi-Account)
  if (pathname === '/api/notify/discord' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { webhookUrl, embeds, content, shop, user, wallet } = body;

      if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
        return sendJSON(res, 400, {
          success: false,
          error: 'URL Discord Webhook không hợp lệ.',
        });
      }

      // If raw shop data was provided, format a rich Valorant embed
      let finalEmbeds = embeds;
      if (!finalEmbeds && shop?.offers) {
        finalEmbeds = [
          {
            title: `🛒 CỬA HÀNG VALORANT HÔM NAY // ${user?.gameName || 'AGENT'}#${user?.tagLine || 'VAL'}`,
            description: `**Số Dư:** \`${(wallet?.vp || 0).toLocaleString()} VP\` | \`${(wallet?.rp || 0).toLocaleString()} RP\` | \`${(wallet?.kc || 0).toLocaleString()} KC\``,
            color: 0xff4655, // Valorant Red
            fields: shop.offers.map((offer, idx) => {
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
              url: shop.offers[0]?.displayIcon || 'https://media.valorant-api.com/weaponskins/d8d5d7a1-4d81-8560-54bc-0692ab40f69b/displayicon.png',
            },
            footer: {
              text: 'Valorant Shop Viewer • Tự động gửi mỗi ngày lúc 07:00 sáng',
              icon_url: 'https://media.valorant-api.com/contenttiers/0cebb8be-46d7-4b0e-bab4-428837223576/displayicon.png',
            },
            timestamp: new Date().toISOString(),
          },
        ];
      }

      const discRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'Valorant Shop Protocol',
          avatar_url: 'https://media.valorant-api.com/weaponskins/d8d5d7a1-4d81-8560-54bc-0692ab40f69b/displayicon.png',
          content: content || '🔥 **Cập nhật cửa hàng Valorant hôm nay cho Server!**',
          embeds: finalEmbeds || [],
        }),
      });

      if (!discRes.ok) {
        const text = await discRes.text();
        return sendJSON(res, discRes.status, {
          success: false,
          error: 'Discord Webhook trả về lỗi: ' + text,
        });
      }

      return sendJSON(res, 200, { success: true, message: 'Đã gửi thông báo Discord thành công!' });
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: 'Lỗi gửi Discord: ' + e.message });
    }
  }

  // --- Static Files Serving ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.webm': 'video/webm',
  };

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const indexFile = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexFile, (err2, content) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        }
      });
      return;
    }

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  VALORANT SHOP VIEWER - MULTI-USER & DISCORD READY    `);
  console.log(`  Local URL:   http://localhost:${PORT}                `);
  console.log(`  Public Dir:  ${PUBLIC_DIR}                           `);
  console.log(`  Version:     2.0.0 (Tactical Audio & Multi-Account)  `);
  console.log(`=======================================================`);
});
