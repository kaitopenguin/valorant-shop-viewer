// ==========================================================================
// VALORANT SHOP VIEWER - MAIN APPLICATION v2.1
// TACTICAL DRAWER, DISCORD BOT CENTER & COMMAND SIMULATOR
// ==========================================================================

const App = {
  state: {
    user: null,
    wallet: { vp: 0, rp: 0, kc: 0 },
    shop: null,
    nightMarket: null,
    featuredBundle: null,
    region: 'ap',
    isDemo: false,
    wishlist: [],
    timerInterval: null,
    inspectSkin: null,
    sfxEnabled: true,
  },

  // Audio Synthesizer (Zero-Latency Web Audio Tactical SFX)
  audioCtx: null,

  initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    } catch (e) {
      console.warn('Web Audio not supported');
    }
  },

  playSFX(type) {
    if (!this.state.sfxEnabled) return;
    if (!this.audioCtx) this.initAudio();
    if (!this.audioCtx) return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    if (type === 'click') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'hover') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.02);
    } else if (type === 'flip') {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        gain.gain.setValueAtTime(0.12, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.4);
      });
    } else if (type === 'alert') {
      [880, 1174.66, 1760].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.08, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.3);
      });
    }
  },

  // Initialize App
  async init() {
    this.loadWishlist();
    this.setupEventListeners();
    this.checkUrlForRedirectTokens();

    const savedSfx = localStorage.getItem('valoshop_sfx');
    if (savedSfx !== null) {
      this.state.sfxEnabled = savedSfx === 'true';
    }
    this.updateSfxUI();

    const loginLink = document.getElementById('riotOfficialLoginBtn');
    if (loginLink) loginLink.href = RiotAuth.getOfficialLoginUrl();

    const bookmarkletLink = document.getElementById('bookmarkletLink');
    if (bookmarkletLink) bookmarkletLink.href = RiotAuth.getBookmarkletCode();

    const saved = RiotAuth.getSession();
    if (saved && saved.accessToken) {
      this.state.user = saved.user;
      this.state.region = saved.region || 'ap';
      const rSelect = document.getElementById('drawerRegionSelect');
      if (rSelect) rSelect.value = this.state.region;
      this.updateUserUI();
      await this.fetchShop();
    } else {
      this.startDemoMode();
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW reg error:', err));
    }
  },

  updateSfxUI() {
    const icon = document.getElementById('drawerSoundIcon');
    const text = document.getElementById('drawerSoundText');
    if (icon && text) {
      icon.textContent = this.state.sfxEnabled ? '🔊' : '🔇';
      text.textContent = this.state.sfxEnabled ? 'Âm Thanh Hiệu Ứng: BẬT' : 'Âm Thanh Hiệu Ứng: TẮT';
    }
  },

  async checkUrlForRedirectTokens() {
    const params = new URLSearchParams(window.location.search);
    const tokenRedirect = params.get('token_redirect');
    if (tokenRedirect) {
      try {
        const tokens = RiotAuth.extractTokens(tokenRedirect);
        if (tokens) {
          this.showToast('Đang xác thực tài khoản Riot...', 'info');
          const res = await RiotAuth.submitTokens(tokens, this.state.region);
          this.state.user = res.user;
          this.state.isDemo = false;
          this.updateUserUI();
          await this.fetchShop();
          this.showToast(`Chào mừng ${res.user.gameName}#${res.user.tagLine}!`, 'success');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {
        this.showToast('Lỗi xác thực: ' + e.message, 'error');
      }
    }
  },

  loadWishlist() {
    try {
      const data = localStorage.getItem('valoshop_wishlist');
      this.state.wishlist = data ? JSON.parse(data) : ['Kuronami Vandal', 'Reaver Vandal', 'Prime Vandal'];
      this.updateWishlistCount();
    } catch (e) {
      this.state.wishlist = [];
    }
  },

  saveWishlist() {
    try {
      localStorage.setItem('valoshop_wishlist', JSON.stringify(this.state.wishlist));
      this.updateWishlistCount();
    } catch (e) {
      console.error('Failed to save wishlist:', e);
    }
  },

  isWishlisted(name) {
    if (!name) return false;
    return this.state.wishlist.some(w => w.toLowerCase() === name.toLowerCase());
  },

  toggleWishlist(name) {
    if (this.isWishlisted(name)) {
      this.state.wishlist = this.state.wishlist.filter(w => w.toLowerCase() !== name.toLowerCase());
      this.showToast(`Đã xoá "${name}" khỏi Wishlist.`);
    } else {
      this.state.wishlist.push(name);
      this.playSFX('alert');
      this.showToast(`⭐ Đã thêm "${name}" vào Wishlist!`, 'gold');
    }
    this.saveWishlist();
    this.renderShop();
    this.renderWishlistModal();
  },

  updateWishlistCount() {
    const badge = document.getElementById('wishlistCountBadge');
    if (badge) badge.textContent = this.state.wishlist.length;
  },

  updateUserUI() {
    const userNameEl = document.getElementById('navUserName');
    const userAvatarEl = document.getElementById('navUserAvatar');
    const vpVal = document.getElementById('walletVP');
    const rpVal = document.getElementById('walletRP');
    const kcVal = document.getElementById('walletKC');

    if (this.state.user) {
      userNameEl.textContent = `${this.state.user.gameName}#${this.state.user.tagLine}`;
      userAvatarEl.textContent = (this.state.user.gameName || 'A')[0].toUpperCase();
    } else {
      userNameEl.textContent = 'Chưa đăng nhập';
      userAvatarEl.textContent = '?';
    }

    vpVal.textContent = (this.state.wallet.vp || 0).toLocaleString();
    rpVal.textContent = (this.state.wallet.rp || 0).toLocaleString();
    kcVal.textContent = (this.state.wallet.kc || 0).toLocaleString();

    this.renderAccountDropdown();
  },

  renderAccountDropdown() {
    const container = document.getElementById('accountDropdownMenu');
    if (!container) return;

    const accounts = RiotAuth.getAccounts();
    const current = RiotAuth.getSession();

    container.innerHTML = `
      <div style="padding: 10px 14px; font-family: var(--font-display); font-size: 13px; color: var(--text-secondary); border-bottom: 1px solid rgba(255,255,255,0.06); letter-spacing: 1px;">
        DANH SÁCH TÀI KHOẢN (${accounts.length})
      </div>
    `;

    if (accounts.length === 0) {
      container.innerHTML += `
        <div style="padding: 12px 14px; font-size: 12px; color: var(--text-muted);">
          Chưa lưu tài khoản nào. Hãy đăng nhập tài khoản Riot của bạn!
        </div>
      `;
    } else {
      accounts.forEach(acc => {
        const isCurrent = current?.user?.puuid === acc.user?.puuid;
        const item = document.createElement('div');
        item.className = `account-dropdown-item ${isCurrent ? 'current' : ''}`;
        item.innerHTML = `
          <div>
            <div style="font-weight: 700;">${acc.user.gameName}#${acc.user.tagLine}</div>
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Khu vực: ${acc.region || 'ap'}</div>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            ${isCurrent ? '<span style="color: var(--valo-cyan); font-size: 11px; font-weight: 800;">ĐANG DÙNG</span>' : '<button class="btn btn-secondary" style="padding: 2px 8px; font-size: 10px;">Chọn</button>'}
            <button class="account-delete-btn" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 2px 4px;" title="Xoá">✕</button>
          </div>
        `;

        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('account-delete-btn')) {
            e.stopPropagation();
            RiotAuth.removeAccount(acc.user.puuid);
            this.showToast(`Đã xoá tài khoản ${acc.user.gameName}`);
            this.updateUserUI();
            return;
          }
          if (!isCurrent) {
            RiotAuth.switchAccount(acc.user.puuid);
            this.state.user = acc.user;
            this.state.region = acc.region || 'ap';
            this.updateUserUI();
            this.fetchShop();
            container.classList.remove('active');
            this.showToast(`Đã chuyển sang tài khoản: ${acc.user.gameName}#${acc.user.tagLine}`, 'success');
          }
        });

        container.appendChild(item);
      });
    }

    const addBtn = document.createElement('div');
    addBtn.style.cssText = 'padding: 10px 14px; background: rgba(255, 70, 85, 0.1); color: var(--valo-red); font-weight: 700; font-size: 12px; cursor: pointer; text-align: center; border-top: 1px solid rgba(255,255,255,0.06); text-transform: uppercase;';
    addBtn.innerHTML = '+ Thêm Tài Khoản Riot Mới';
    addBtn.addEventListener('click', () => {
      container.classList.remove('active');
      this.openModal('loginModal');
    });
    container.appendChild(addBtn);
  },

  async startDemoMode() {
    this.playSFX('click');
    this.state.isDemo = true;
    try {
      const res = await fetch('/api/demo-shop');
      const data = await res.json();
      this.state.user = data.user;
      this.state.wallet = data.wallet;
      this.state.shop = data.shop;
      this.state.nightMarket = data.nightMarket;
      this.state.featuredBundle = data.featuredBundle;

      this.updateUserUI();
      this.renderShop();
      this.renderNightMarket();
      this.renderBundle();
      this.startCountdown(data.shop.remainingSeconds);
      this.showToast('Đang ở chế độ xem thử (Demo Shop). Đăng nhập Riot để xem cửa hàng thật của bạn!', 'info');
    } catch (e) {
      console.error('Demo shop error:', e);
    }
  },

  async fetchShop() {
    const session = RiotAuth.getSession();
    if (!session || !session.accessToken) {
      this.openModal('loginModal');
      return;
    }

    this.showToast('Đang tải dữ liệu cửa hàng Valorant...', 'info');

    try {
      const res = await fetch(`/api/shop?puuid=${session.user.puuid}`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Riot-Entitlements-JWT': session.entitlementsToken,
          'X-Riot-Region': this.state.region,
        },
      });

      if (!res.ok) {
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          this.showToast('Phiên đăng nhập Riot đã hết hạn. Vui lòng đăng nhập lại.', 'error');
          RiotAuth.clearSession();
          this.openModal('loginModal');
          return;
        }
        throw new Error('Lỗi khi tải cửa hàng (' + res.status + ')');
      }

      const data = await res.json();
      this.state.isDemo = false;
      this.state.wallet = data.wallet || { vp: 0, rp: 0, kc: 0 };
      this.state.shop = data.shop;
      this.state.nightMarket = data.nightMarket;
      this.state.featuredBundle = data.featuredBundle;

      this.updateUserUI();
      this.renderShop();
      this.renderNightMarket();
      this.renderBundle();
      this.startCountdown(data.shop.remainingSeconds);

      this.checkWishlistMatches();
      this.showToast('Cửa hàng hôm nay đã sẵn sàng!', 'success');
    } catch (err) {
      console.error(err);
      this.showToast(err.message, 'error');
    }
  },

  checkWishlistMatches() {
    if (!this.state.shop?.offers) return;
    const matches = this.state.shop.offers.filter(o => this.isWishlisted(o.displayName));
    if (matches.length > 0) {
      const names = matches.map(m => m.displayName).join(', ');
      this.playSFX('alert');
      this.showToast(`🔥 CHÚC MỪNG! Skin trong Wishlist của bạn đã xuất hiện trong shop: ${names}!`, 'gold');
    }
  },

  renderShop() {
    const grid = document.getElementById('dailyShopGrid');
    if (!grid || !this.state.shop?.offers) return;

    grid.innerHTML = '';

    this.state.shop.offers.forEach(offer => {
      const isWish = this.isWishlisted(offer.displayName);
      const tierColor = offer.contentTier?.highlightColor ? `#${offer.contentTier.highlightColor}` : '#ff4655';
      const tierName = offer.contentTier?.displayName || 'Vũ khí';

      // Community tier badge
      const ci = offer.tierInfo;
      const ciColors = { 'S+': '#ffd700', 'S': '#c0c0c0', 'A': '#00bcd4', 'B': '#7986cb', 'D': '#607d8b' };
      const ciTierBadgeHtml = ci ? `
        <div style="position:absolute;bottom:0;left:0;right:0;background:${ciColors[ci.tier] || '#607d8b'}22;
          border-top:2px solid ${ciColors[ci.tier] || '#607d8b'};padding:4px 8px;
          display:flex;align-items:center;justify-content:space-between;">
          <span style="font-family:var(--font-display);font-size:11px;font-weight:800;
            color:${ciColors[ci.tier] || '#607d8b'};letter-spacing:1px;">TIER ${ci.tier}</span>
          <span style="font-size:10px;color:var(--text-secondary);">${ci.verdict || ''}</span>
        </div>` : '';

      const hasVideo = offer.levels?.some(l => l.streamedVideo);

      const card = document.createElement('div');
      card.className = `skin-card ${isWish ? 'wishlist-match' : ''}`;
      card.style.setProperty('--card-tier-color', tierColor);
      card.style.setProperty('--card-tier-glow', `${tierColor}44`);

      card.innerHTML = `
        ${isWish ? '<div class="wishlist-ribbon">⭐ WISHLIST</div>' : ''}
        <div class="card-top">
          <div class="tier-badge">
            <span class="tier-dot"></span>
            <span>${tierName}</span>
          </div>
          <button class="wishlist-toggle-btn ${isWish ? 'active' : ''}" title="${isWish ? 'Xoá khỏi Wishlist' : 'Thêm vào Wishlist'}" data-name="${offer.displayName}">
            ${isWish ? '★' : '☆'}
          </button>
        </div>

        <div class="weapon-preview" style="position:relative;">
          <img class="weapon-img" src="${offer.displayIcon || '/assets/icon.svg'}" alt="${offer.displayName}" loading="lazy" />
          ${hasVideo ? '<div style="position:absolute;top:6px;left:6px;background:rgba(0,0,0,0.7);border:1px solid var(--valo-cyan);padding:2px 6px;font-size:9px;color:var(--valo-cyan);font-weight:800;letter-spacing:1px;">▶ VIDEO</div>' : ''}
        </div>

        <div class="card-bottom" style="position:relative;">
          ${ciTierBadgeHtml}
          <div class="skin-name" style="margin-bottom:${ci ? '28px' : '0'}">${offer.displayName}</div>
          <div class="skin-pricing">
            <div class="price-pill">
              <img src="/assets/vp.svg" class="currency-icon" alt="VP">
              <span>${(offer.price || 1775).toLocaleString()}</span>
            </div>
            <div class="inspect-text">
              Chi tiết ↗
            </div>
          </div>
        </div>
      `;

      card.addEventListener('mouseenter', () => this.playSFX('hover'));
      card.addEventListener('click', (e) => {
        if (e.target.closest('.wishlist-toggle-btn')) {
          this.toggleWishlist(offer.displayName);
          return;
        }
        this.openInspectModal(offer);
      });

      grid.appendChild(card);
    });
  },

  renderNightMarket() {
    const section = document.getElementById('nightMarketSection');
    const grid = document.getElementById('nightMarketGrid');
    if (!section || !grid) return;

    if (!this.state.nightMarket || !this.state.nightMarket.active) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    grid.innerHTML = '';

    this.state.nightMarket.offers.forEach((offer, idx) => {
      const card = document.createElement('div');
      card.className = 'nm-flip-card';
      const tierColor = offer.contentTier?.highlightColor ? `#${offer.contentTier.highlightColor}` : '#c084fc';

      card.innerHTML = `
        <div class="nm-flip-inner">
          <div class="nm-card-front">
            <div class="nm-mystery-icon">✦</div>
            <div class="nm-mystery-text">LẬT THẺ #${idx + 1}</div>
          </div>
          <div class="nm-card-back" style="border-top: 3px solid ${tierColor}">
            <span class="nm-discount-tag">-${offer.discountPercent}%</span>
            <div class="weapon-preview" style="height: 110px; margin: 4px 0;">
              <img class="weapon-img" src="${offer.displayIcon || '/assets/icon.svg'}" alt="${offer.displayName}" />
            </div>
            <div>
              <div class="skin-name" style="font-size: 14px; min-height: 38px;">${offer.displayName}</div>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 6px;">
                <span class="nm-price-strike">${offer.originalPrice.toLocaleString()} VP</span>
                <span class="nm-price-discounted">
                  <img src="/assets/vp.svg" class="currency-icon" alt="VP">
                  ${offer.discountedPrice.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.playSFX('flip');
        card.classList.toggle('flipped');
      });

      grid.appendChild(card);
    });
  },

  renderBundle() {
    const section = document.getElementById('bundleSection');
    if (!section) return;

    if (!this.state.featuredBundle || !this.state.featuredBundle.name) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    const bundleBanner = document.getElementById('bundleBanner');
    const bundleName = document.getElementById('bundleName');
    const bundlePrice = document.getElementById('bundlePrice');

    if (bundleName) bundleName.textContent = this.state.featuredBundle.name;
    if (bundlePrice) bundlePrice.textContent = (this.state.featuredBundle.price || 0).toLocaleString();
    if (bundleBanner && this.state.featuredBundle.banner) {
      bundleBanner.src = this.state.featuredBundle.banner;
    }
  },

  openInspectModal(skin) {
    this.playSFX('click');
    this.state.inspectSkin = skin;
    const modal = document.getElementById('inspectModal');
    const vidEl = document.getElementById('inspectWeaponVideo');
    const imgEl = document.getElementById('inspectWeaponImg');
    const titleEl = document.getElementById('inspectWeaponTitle');
    const tierEl = document.getElementById('inspectWeaponTier');
    const priceEl = document.getElementById('inspectWeaponPrice');
    const chromasContainer = document.getElementById('inspectChromasContainer');
    const levelsContainer = document.getElementById('inspectLevelsContainer');
    const wishlistBtn = document.getElementById('inspectWishlistBtn');
    const videoStatus = document.getElementById('videoPlayingStatus');

    if (!modal) return;

    titleEl.textContent = skin.displayName;
    imgEl.src = skin.displayIcon || '/assets/icon.svg';
    priceEl.textContent = (skin.price || 1775).toLocaleString() + ' VP';

    const tierName = skin.contentTier?.displayName || 'Vũ khí';
    const tierColor = skin.contentTier?.highlightColor ? `#${skin.contentTier.highlightColor}` : '#ff4655';
    tierEl.textContent = tierName;
    tierEl.style.color = tierColor;

    // --- Helper: switch video src ---
    const setVideo = (url, label) => {
      if (!vidEl) return;
      if (url) {
        vidEl.src = url;
        vidEl.style.display = 'block';
        imgEl.style.display = 'none';
        vidEl.play().catch(() => {});
        if (videoStatus) videoStatus.textContent = `▶ ${label}`;
      } else {
        vidEl.style.display = 'none';
        imgEl.style.display = 'block';
        if (videoStatus) videoStatus.textContent = '🖼️ Không có video — xem ảnh 3D render';
      }
    };

    // --- Populate Tier Info Box ---
    const tierInfo = skin.tierInfo;
    const tierBadge = document.getElementById('inspectTierRatingBadge');
    const tierVerdict = document.getElementById('inspectTierVerdict');
    const tierScore = document.getElementById('inspectTierScore');
    const tierSummary = document.getElementById('inspectTierSummary');
    const tierBox = document.getElementById('inspectTierBox');

    if (tierInfo && tierBadge && tierVerdict) {
      tierBadge.textContent = `TIER ${tierInfo.tier}`;
      tierBadge.style.background = {
        'S+': '#ffd700', 'S': '#c0c0c0', 'A': '#00bcd4', 'B': '#7986cb', 'D': '#607d8b'
      }[tierInfo.tier] || '#607d8b';
      tierBadge.style.color = (tierInfo.tier === 'S+' || tierInfo.tier === 'S') ? '#0f1923' : '#fff';
      tierVerdict.textContent = tierInfo.verdict || '';
      if (tierScore) tierScore.textContent = tierInfo.score ? `${tierInfo.score}/10` : '';
      if (tierSummary) tierSummary.textContent = tierInfo.summary || 'Chưa có đánh giá chi tiết.';
      if (tierBox) tierBox.style.display = 'block';
    } else {
      if (tierBox) tierBox.style.display = 'none';
    }

    // --- Chromas with video switching ---
    chromasContainer.innerHTML = '';
    if (skin.chromas && skin.chromas.length > 1) {
      skin.chromas.forEach((chroma, i) => {
        const swatch = document.createElement('div');
        swatch.className = `chroma-swatch ${i === 0 ? 'active' : ''}`;
        swatch.title = chroma.displayName;
        const swatchSrc = chroma.swatch || chroma.displayIcon || skin.displayIcon || '';
        swatch.innerHTML = `<img src="${swatchSrc}" alt="${chroma.displayName}" />`;

        swatch.addEventListener('click', () => {
          this.playSFX('hover');
          document.querySelectorAll('.chroma-swatch').forEach(s => s.classList.remove('active'));
          swatch.classList.add('active');
          const renderSrc = chroma.fullRender || chroma.displayIcon || skin.displayIcon;
          if (imgEl) imgEl.src = renderSrc;
          const chromaVideoUrl = chroma.streamedVideo || null;
          setVideo(chromaVideoUrl, `Biến thể: ${chroma.displayName}`);
        });

        chromasContainer.appendChild(swatch);
      });
    } else {
      chromasContainer.innerHTML = '<span style="font-size: 13px; color: var(--text-muted);">Mặc định (Không có biến thể phụ)</span>';
    }

    // --- Levels as clickable video-switching buttons ---
    levelsContainer.innerHTML = '';
    const levelLabels = ['', 'Tiêu Chuẩn', 'VFX / Âm Thanh', 'Hiệu Ứng Nạp Đạn', '🔥 Finisher'];
    if (skin.levels && skin.levels.length > 0) {
      skin.levels.forEach((lvl, idx) => {
        const btn = document.createElement('button');
        const rawLabel = lvl.levelItem ? lvl.levelItem.replace('EEquippableSkinLevelItem::', '') : (levelLabels[idx + 1] || 'Tiêu Chuẩn');
        btn.className = `btn btn-secondary`;
        btn.style.cssText = 'padding: 6px 14px; font-size: 12px; text-align: left; border-radius: 0;';
        btn.innerHTML = `<span style="color:var(--valo-cyan);font-weight:800;">Cấp ${idx + 1}</span> — ${rawLabel}${lvl.streamedVideo ? ' <span style="color:#4ade80;font-size:10px;">▶ VIDEO</span>' : ''}`;

        btn.addEventListener('click', () => {
          this.playSFX('hover');
          levelsContainer.querySelectorAll('button').forEach(b => b.style.borderColor = '');
          btn.style.borderColor = 'var(--valo-cyan)';
          setVideo(lvl.streamedVideo || null, `Cấp ${idx + 1} — ${rawLabel}`);
        });

        levelsContainer.appendChild(btn);
      });

      // Auto-play highest available level video
      const bestLevel = [...skin.levels].reverse().find(l => l.streamedVideo);
      if (bestLevel) {
        const lvlIdx = skin.levels.indexOf(bestLevel);
        const rawLabel = bestLevel.levelItem ? bestLevel.levelItem.replace('EEquippableSkinLevelItem::', '') : (levelLabels[lvlIdx + 1] || 'Cấp cao nhất');
        setVideo(bestLevel.streamedVideo, `Cấp ${lvlIdx + 1} — ${rawLabel}`);
      } else {
        // No video at any level — show image
        if (vidEl) vidEl.style.display = 'none';
        if (imgEl) imgEl.style.display = 'block';
        if (videoStatus) videoStatus.textContent = '🖼️ Skin này chưa có video Riot CDN';
      }
    }

    const isWish = this.isWishlisted(skin.displayName);
    wishlistBtn.textContent = isWish ? '★ Đang trong Wishlist (Xoá)' : '☆ Thêm vào Wishlist';
    wishlistBtn.onclick = () => {
      this.toggleWishlist(skin.displayName);
      const updatedWish = this.isWishlisted(skin.displayName);
      wishlistBtn.textContent = updatedWish ? '★ Đang trong Wishlist (Xoá)' : '☆ Thêm vào Wishlist';
    };

    this.openModal('inspectModal');
  },

  async openTierListModal() {
    this.openModal('tierListModal');
    const content = document.getElementById('tierListContent');
    if (!content) return;

    content.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted);">
      <div style="font-size:28px;margin-bottom:10px;">⏳</div>Đang tải dữ liệu tier list...</div>`;

    try {
      const res = await fetch('/api/tierlist');
      const data = await res.json();

      // Server returns flat object { skinKey: { tier, verdict, score, summary } }
      // Group into { 'S+': [...], 'S': [...], 'A': [...], 'B': [...], 'D': [...] }
      const grouped = { 'S+': [], 'S': [], 'A': [], 'B': [], 'D': [] };
      for (const [key, val] of Object.entries(data.tiers || {})) {
        const t = val.tier;
        if (!grouped[t]) grouped[t] = [];
        grouped[t].push({
          name: key.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
          ...val,
          score: parseFloat((val.score || '0').replace('/10', '')),
        });
      }

      this._tierListData = grouped;
      this._renderTierListContent('');
    } catch (e) {
      content.innerHTML = `<div style="color:var(--valo-red);padding:20px;">Lỗi tải tier list: ${e.message}</div>`;
    }

    // Wire search
    const searchInput = document.getElementById('tierListSearchInput');
    if (searchInput) {
      searchInput.oninput = (e) => this._renderTierListContent(e.target.value.trim().toLowerCase());
    }
  },

  _renderTierListContent(query) {
    const content = document.getElementById('tierListContent');
    if (!content || !this._tierListData) return;

    const tierColors = { 'S+': '#ffd700', 'S': '#c0c0c0', 'A': '#00bcd4', 'B': '#7986cb', 'D': '#607d8b' };
    const tierLabels = { 'S+': 'ĐÁNG TIỀN NHẤT', 'S': 'RẤT ĐÁNG MUA', 'A': 'ĐÁNG MUA', 'B': 'TRUNG BÌNH', 'D': 'NÊN BỎ QUA' };

    content.innerHTML = '';
    let totalShown = 0;

    ['S+', 'S', 'A', 'B', 'D'].forEach(tier => {
      const skins = (this._tierListData[tier] || []).filter(s =>
        !query || s.name.toLowerCase().includes(query)
      );
      if (skins.length === 0) return;
      totalShown += skins.length;

      const group = document.createElement('div');
      group.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="background:${tierColors[tier]};color:${['S+','S'].includes(tier)?'#0f1923':'#fff'};
            font-family:var(--font-display);font-size:15px;font-weight:900;padding:3px 12px;
            letter-spacing:2px;">TIER ${tier}</span>
          <span style="color:${tierColors[tier]};font-size:12px;font-weight:700;letter-spacing:1px;">${tierLabels[tier]}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${skins.map(s => `
            <div style="display:flex;align-items:flex-start;justify-content:space-between;
              padding:10px 12px;background:rgba(255,255,255,0.03);
              border:1px solid rgba(255,255,255,0.06);border-left:3px solid ${tierColors[tier]};">
              <div>
                <div style="font-weight:700;font-size:13px;text-transform:uppercase;">${s.name}</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:3px;line-height:1.5;">${s.summary}</div>
                ${s.proPlayers ? `<div style="font-size:10px;color:var(--valo-cyan);margin-top:4px;">👑 ${s.proPlayers}</div>` : ''}
              </div>
              <div style="text-align:right;flex-shrink:0;margin-left:12px;">
                <div style="font-family:var(--font-mono);color:${tierColors[tier]};font-size:16px;font-weight:900;">${typeof s.score === 'number' ? s.score.toFixed(1) : s.score}/10</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Reddit</div>
              </div>
            </div>`).join('')}
        </div>
      `;
      content.appendChild(group);
    });

    if (totalShown === 0) {
      content.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:20px;">
        Không tìm thấy skin nào khớp với "${query}"</div>`;
    }
  },

  startCountdown(seconds) {
    if (this.state.timerInterval) clearInterval(this.state.timerInterval);

    let remaining = Math.max(0, parseInt(seconds, 10) || 0);

    const updateDisplay = () => {
      if (remaining <= 0) {
        document.getElementById('storeCountdown').textContent = '00:00:00';
        clearInterval(this.state.timerInterval);
        this.showToast('Cửa hàng đã đến giờ làm mới! Đang cập nhật...', 'info');
        setTimeout(() => this.fetchShop(), 3000);
        return;
      }

      const hrs = Math.floor(remaining / 3600);
      const mins = Math.floor((remaining % 3600) / 60);
      const secs = remaining % 60;

      const formatted = [
        hrs.toString().padStart(2, '0'),
        mins.toString().padStart(2, '0'),
        secs.toString().padStart(2, '0'),
      ].join(' : ');

      const el = document.getElementById('storeCountdown');
      if (el) el.textContent = formatted;
      remaining--;
    };

    updateDisplay();
    this.state.timerInterval = setInterval(updateDisplay, 1000);
  },

  async renderWishlistModal() {
    const listContainer = document.getElementById('currentWishlistItems');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    if (this.state.wishlist.length === 0) {
      listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">Chưa có skin nào trong danh sách yêu thích. Hãy tìm kiếm bên dưới để thêm!</div>';
      return;
    }

    this.state.wishlist.forEach(name => {
      const item = document.createElement('div');
      item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--valo-dark); border: 1px solid var(--border-subtle);';
      
      const inStore = this.state.shop?.offers?.some(o => o.displayName.toLowerCase() === name.toLowerCase());

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: var(--valo-gold); font-size: 16px;">★</span>
          <span style="font-weight: 700; text-transform: uppercase;">${name}</span>
          ${inStore ? '<span style="background: var(--valo-cyan); color: #0f1923; font-size: 10px; font-weight: 800; padding: 2px 6px;">TRONG SHOP HÔM NAY!</span>' : ''}
        </div>
        <button class="btn btn-secondary" style="padding: 4px 8px; color: var(--valo-red);" title="Xoá">✕</button>
      `;

      item.querySelector('button').addEventListener('click', () => {
        this.toggleWishlist(name);
      });

      listContainer.appendChild(item);
    });
  },

  openShareModal() {
    this.playSFX('click');
    const modal = document.getElementById('shareModal');
    if (!modal) return;

    const previewBox = document.getElementById('shareDiscordPreview');
    if (previewBox && this.state.shop?.offers) {
      const u = this.state.user || { gameName: 'Agent', tagLine: 'VAL' };
      const w = this.state.wallet || { vp: 0, rp: 0, kc: 0 };
      const lines = [
        `🛒 **CỬA HÀNG VALORANT HÔM NAY // ${u.gameName}#${u.tagLine}**`,
        `💰 **Số Dư:** \`${w.vp.toLocaleString()} VP\` | \`${w.rp.toLocaleString()} RP\` | \`${w.kc.toLocaleString()} KC\``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ...this.state.shop.offers.map((s, i) => `🔹 **[#${i + 1}] ${s.displayName}** — 💎 \`${(s.price || 1775).toLocaleString()} VP\``),
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `⏰ *Làm mới lại vào lúc 07:00 sáng mai!*`,
      ];
      previewBox.value = lines.join('\n');
    }

    this.openModal('shareModal');
  },

  copyDiscordText() {
    const text = document.getElementById('shareDiscordPreview')?.value;
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        this.playSFX('click');
        this.showToast('✓ Đã sao chép nội dung Discord vào bộ nhớ đệm!', 'success');
      });
    }
  },

  async downloadShopImage() {
    this.showToast('Đang tạo ảnh thẻ Valorant Shop...', 'info');
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 675;
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, 1200, 675);
    bgGrad.addColorStop(0, '#0f1923');
    bgGrad.addColorStop(1, '#17212b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1200, 675);

    ctx.strokeStyle = '#ff4655';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(40, 40);
    ctx.lineTo(1160, 40);
    ctx.stroke();

    ctx.fillStyle = '#ece8e1';
    ctx.font = 'bold 36px "Segoe UI", sans-serif';
    ctx.fillText('VALORANT // DAILY STORE PROTOCOL', 40, 90);

    const u = this.state.user || { gameName: 'Agent', tagLine: 'VAL' };
    ctx.fillStyle = '#ff4655';
    ctx.font = '22px "Segoe UI", sans-serif';
    ctx.fillText(`PLAYER: ${u.gameName}#${u.tagLine} | REGION: ${(this.state.region || 'ap').toUpperCase()}`, 40, 125);

    const offers = this.state.shop?.offers || [];
    const cardWidth = 260;
    const cardHeight = 440;
    const startX = 40;
    const startY = 160;
    const gap = 30;

    for (let i = 0; i < Math.min(4, offers.length); i++) {
      const offer = offers[i];
      const x = startX + i * (cardWidth + gap);
      const y = startY;

      ctx.fillStyle = 'rgba(23, 33, 43, 0.9)';
      ctx.fillRect(x, y, cardWidth, cardHeight);

      const tierColor = offer.contentTier?.highlightColor ? `#${offer.contentTier.highlightColor}` : '#ff4655';
      ctx.fillStyle = tierColor;
      ctx.fillRect(x, y, cardWidth, 4);

      ctx.fillStyle = '#9aa4af';
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.fillText(offer.contentTier?.displayName?.toUpperCase() || 'WEAPON', x + 14, y + 26);

      ctx.fillStyle = '#00f5d4';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`${(offer.price || 1775).toLocaleString()} VP`, x + 14, y + cardHeight - 20);

      ctx.fillStyle = '#ece8e1';
      ctx.font = 'bold 16px "Segoe UI", sans-serif';
      ctx.fillText(offer.displayName.substring(0, 22), x + 14, y + cardHeight - 50);

      if (offer.displayIcon) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise((res) => {
            img.onload = res;
            img.onerror = res;
            img.src = offer.displayIcon;
          });
          if (img.width) {
            ctx.drawImage(img, x + 10, y + 100, cardWidth - 20, 130);
          }
        } catch (e) {}
      }
    }

    const link = document.createElement('a');
    link.download = `valorant-shop-${u.gameName}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    this.playSFX('click');
    this.showToast('✓ Đã tải ảnh thẻ shop thành công!', 'success');
  },

  // Discord Command Simulator
  simulateDiscordCommand(cmd) {
    this.playSFX('click');
    const output = document.getElementById('discordSimulatorOutput');
    if (!output) return;

    const u = this.state.user || { gameName: 'RadiantPlayer', tagLine: 'VN1' };
    const w = this.state.wallet || { vp: 4250, rp: 180, kc: 8500 };
    const offers = this.state.shop?.offers || [];

    if (cmd === 'shop') {
      output.value = `[BOT] Discord Response to /shop:\n` +
        `-----------------------------------------\n` +
        `🛒 CỬA HÀNG VALORANT HÔM NAY // ${u.gameName}#${u.tagLine}\n` +
        `💰 Số Dư: ${w.vp.toLocaleString()} VP | ${w.rp.toLocaleString()} RP | ${w.kc.toLocaleString()} KC\n\n` +
        offers.map((s, idx) => `[#${idx + 1}] ${s.displayName} — 💎 ${(s.price || 1775).toLocaleString()} VP (${s.contentTier?.displayName || 'Vũ khí'})`).join('\n') +
        `\n\n⏰ Làm mới lại vào lúc: 07:00 sáng mai!`;
    } else if (cmd === 'login') {
      output.value = `[BOT] Discord Response to /login (Chỉ mình bạn thấy - Ephemeral):\n` +
        `-----------------------------------------\n` +
        `🔑 ĐĂNG NHẬP RIOT GAMES CHÍNH QUY AN TOÀN:\n` +
        `1. Nhấp link: https://auth.riotgames.com/authorize?redirect_uri=...\n` +
        `2. Đăng nhập an toàn trực tiếp trên máy chủ Riot Games.\n` +
        `3. Copy link playvalorant.com/opt_in#access_token=... gửi lại cho Bot.\n` +
        `✅ Mật khẩu của bạn không bị chia sẻ cho bất kỳ ai!`;
    } else if (cmd === 'nm') {
      output.value = `[BOT] Discord Response to /nightmarket:\n` +
        `-----------------------------------------\n` +
        `🌙 CHỢ ĐÊM VALORANT (NIGHT MARKET) // ${u.gameName}#${u.tagLine}\n` +
        `1. Prime Vandal — 1,029 VP (-42%)\n` +
        `2. Magepunk Ghost — 1,153 VP (-35%)\n` +
        `3. Recon Spectre — 1,242 VP (-30%)\n` +
        `4. Sovereign Marshal — 923 VP (-48%)\n` +
        `5. Infantry Guardian — 437 VP (-50%)\n` +
        `6. Xenohunter Knife — 2,662 VP (-25%)`;
    } else if (cmd === 'wallet') {
      output.value = `[BOT] Discord Response to /wallet:\n` +
        `-----------------------------------------\n` +
        `💰 SỐ DƯ TÀI KHOẢN // ${u.gameName}#${u.tagLine}\n` +
        `• Valorant Points (VP): ${w.vp.toLocaleString()} VP\n` +
        `• Radianite Points (RP): ${w.rp.toLocaleString()} RP\n` +
        `• Kingdom Credits (KC): ${w.kc.toLocaleString()} KC`;
    } else if (cmd === 'wishlist') {
      output.value = `[BOT] Discord Response to /wishlist:\n` +
        `-----------------------------------------\n` +
        `⭐ DANH SÁCH THEO DÕI CỦA @${u.gameName}:\n` +
        `• Kuronami Vandal\n` +
        `• Reaver Operator\n` +
        `• Prime//2.0 Phantom\n` +
        `🔔 Bot sẽ tự động @tag bạn trong kênh chat khi một trong các skin trên xuất hiện ở shop!`;
    } else if (cmd === 'ping') {
      output.value = `[BOT] Discord Response to /ping:\n` +
        `-----------------------------------------\n` +
        `🏓 Pong! Độ trễ Discord Gateway: 18ms | Riot PVP API: 42ms | Trạng thái: SẴN SÀNG 24/7!`;
    }
  },

  // Setup UI Event Listeners
  setupEventListeners() {
    // Drawer Open / Close
    const openDrawer = () => {
      this.playSFX('click');
      document.getElementById('tacticalDrawerOverlay')?.classList.add('active');
    };
    const closeDrawer = () => {
      this.playSFX('click');
      document.getElementById('tacticalDrawerOverlay')?.classList.remove('active');
    };

    document.getElementById('menuToggleBtn')?.addEventListener('click', openDrawer);
    document.getElementById('drawerCloseBtn')?.addEventListener('click', closeDrawer);
    document.getElementById('tacticalDrawerOverlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'tacticalDrawerOverlay') closeDrawer();
    });

    // Drawer Menu Items
    document.getElementById('drawerDiscordBtn')?.addEventListener('click', () => {
      closeDrawer();
      this.openModal('discordCenterModal');
    });
    document.getElementById('quickDiscordBtn')?.addEventListener('click', () => {
      this.playSFX('click');
      this.openModal('discordCenterModal');
    });

    document.getElementById('drawerOnlineBtn')?.addEventListener('click', () => {
      closeDrawer();
      this.openModal('onlineWebModal');
    });
    document.getElementById('quickOnlineBtn')?.addEventListener('click', () => {
      this.playSFX('click');
      this.openModal('onlineWebModal');
    });

    document.getElementById('copyPublicDomainBtn')?.addEventListener('click', () => {
      const input = document.getElementById('publicDomainInput');
      if (input) {
        navigator.clipboard.writeText(input.value).then(() => {
          this.playSFX('click');
          this.showToast('✓ Đã sao chép Link Online công khai!', 'success');
        });
      }
    });

    document.getElementById('drawerShareBtn')?.addEventListener('click', () => {
      closeDrawer();
      this.openShareModal();
    });
    document.getElementById('quickShareBtn')?.addEventListener('click', () => {
      this.openShareModal();
    });

    document.getElementById('drawerWishlistBtn')?.addEventListener('click', () => {
      closeDrawer();
      this.renderWishlistModal();
      this.openModal('wishlistModal');
    });
    document.getElementById('quickWishlistBtn')?.addEventListener('click', () => {
      this.playSFX('click');
      this.renderWishlistModal();
      this.openModal('wishlistModal');
    });

    document.getElementById('drawerDemoBtn')?.addEventListener('click', () => {
      closeDrawer();
      this.startDemoMode();
    });

    document.getElementById('drawerSoundBtn')?.addEventListener('click', () => {
      this.state.sfxEnabled = !this.state.sfxEnabled;
      localStorage.setItem('valoshop_sfx', this.state.sfxEnabled);
      this.updateSfxUI();
      if (this.state.sfxEnabled) this.playSFX('click');
      this.showToast(`Âm thanh hiệu ứng: ${this.state.sfxEnabled ? 'BẬT' : 'TẮT'}`);
    });

    document.getElementById('drawerRegionSelect')?.addEventListener('change', (e) => {
      this.state.region = e.target.value;
      this.showToast(`Đã chuyển khu vực máy chủ sang: ${e.target.value.toUpperCase()}`, 'info');
      if (!this.state.isDemo) this.fetchShop();
    });

    // Discord Command Simulator buttons
    document.querySelectorAll('.sim-cmd-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.simulateDiscordCommand(btn.dataset.cmd);
      });
    });

    // Auto update Discord Bot Invite Link
    document.getElementById('discordClientIdInput')?.addEventListener('input', (e) => {
      const clientId = e.target.value.trim();
      const inviteBtn = document.getElementById('discordInviteLinkBtn');
      if (inviteBtn) {
        if (clientId) {
          inviteBtn.href = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=277025777728&scope=bot%20applications.commands`;
        } else {
          inviteBtn.href = '#';
        }
      }
    });

    // Account Switcher Badge Click
    document.getElementById('userBadge')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('accountDropdownMenu');
      if (menu) menu.classList.toggle('active');
    });

    document.addEventListener('click', () => {
      document.getElementById('accountDropdownMenu')?.classList.remove('active');
    });

    // Refresh Button
    document.getElementById('refreshShopBtn')?.addEventListener('click', () => {
      this.playSFX('click');
      if (this.state.isDemo) {
        this.startDemoMode();
      } else {
        this.fetchShop();
      }
    });

    // Copy Discord Text Button
    document.getElementById('copyDiscordBtn')?.addEventListener('click', () => {
      this.copyDiscordText();
    });

    // Download Image Button
    document.getElementById('downloadImageBtn')?.addEventListener('click', () => {
      this.downloadShopImage();
    });

    // Login Button (ALWAYS WORKS & NEVER CUT OFF)
    document.getElementById('loginBtn')?.addEventListener('click', () => {
      this.playSFX('click');
      this.openModal('loginModal');
    });

    // Drawer Login Button (inside left menu)
    document.getElementById('drawerLoginBtn')?.addEventListener('click', () => {
      this.playSFX('click');
      document.getElementById('tacticalDrawerOverlay')?.classList.remove('active');
      this.openModal('loginModal');
    });

    // Drawer Tier List Button
    document.getElementById('drawerTierListBtn')?.addEventListener('click', () => {
      this.playSFX('click');
      document.getElementById('tacticalDrawerOverlay')?.classList.remove('active');
      this.openTierListModal();
    });

    // Inspect Modal — Video / Image toggle
    document.getElementById('inspectViewVideoBtn')?.addEventListener('click', () => {
      const vid = document.getElementById('inspectWeaponVideo');
      const img = document.getElementById('inspectWeaponImg');
      if (vid && img) {
        vid.style.display = vid.src ? 'block' : 'none';
        img.style.display = vid.src ? 'none' : 'block';
        const status = document.getElementById('videoPlayingStatus');
        if (vid.src) {
          vid.play().catch(() => {});
          if (status) status.textContent = '▶ Đang phát video in-game';
        } else {
          if (status) status.textContent = '⚠ Skin này chưa có video';
        }
      }
    });
    document.getElementById('inspectViewImgBtn')?.addEventListener('click', () => {
      const vid = document.getElementById('inspectWeaponVideo');
      const img = document.getElementById('inspectWeaponImg');
      if (vid && img) { vid.style.display = 'none'; img.style.display = 'block'; }
      const status = document.getElementById('videoPlayingStatus');
      if (status) status.textContent = '🖼️ Đang xem ảnh 3D render';
    });

    // Modal Close Buttons
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target === el) {
          this.playSFX('click');
          document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        }
      });
    });

    document.querySelectorAll('.modal-container').forEach(c => {
      c.addEventListener('click', e => e.stopPropagation());
    });

    // Tabs inside Login Modal
    document.querySelectorAll('#loginModal .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.playSFX('click');
        document.querySelectorAll('#loginModal .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.login-tab-content').forEach(c => c.style.display = 'none');
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.target);
        if (target) target.style.display = 'flex';
      });
    });

    // Tabs inside Discord Center Modal
    document.querySelectorAll('#discordCenterModal .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.playSFX('click');
        document.querySelectorAll('#discordCenterModal .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.discord-tab-content').forEach(c => c.style.display = 'none');
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.target);
        if (target) target.style.display = 'flex';
      });
    });

    // Parse Token Button
    document.getElementById('parseTokenBtn')?.addEventListener('click', async () => {
      this.playSFX('click');
      const input = document.getElementById('tokenInput').value.trim();
      const tokens = RiotAuth.extractTokens(input);
      if (!tokens) {
        this.showToast('Không tìm thấy token hợp lệ trong liên kết đã nhập.', 'error');
        return;
      }
      try {
        this.showToast('Đang xác thực với máy chủ Riot...', 'info');
        const res = await RiotAuth.submitTokens(tokens, this.state.region);
        this.state.user = res.user;
        this.state.isDemo = false;
        this.updateUserUI();
        this.closeModals();
        await this.fetchShop();
        this.showToast(`Đăng nhập thành công! Chào ${res.user.gameName}#${res.user.tagLine}`, 'success');
      } catch (e) {
        this.showToast(e.message, 'error');
      }
    });

    // Direct Login Form Submit
    document.getElementById('directLoginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.playSFX('click');
      const u = document.getElementById('directUsername').value.trim();
      const p = document.getElementById('directPassword').value;
      const otp = document.getElementById('directOtp').value.trim();

      if (!u || !p) {
        this.showToast('Vui lòng điền tài khoản và mật khẩu.', 'error');
        return;
      }

      try {
        this.showToast('Đang đăng nhập Riot...', 'info');
        const res = await RiotAuth.directLogin(u, p, this.state.region, otp || null);

        if (res.require2FA) {
          document.getElementById('directOtpGroup').style.display = 'flex';
          this.showToast(res.message, 'info');
          return;
        }

        this.state.user = res.user;
        this.state.isDemo = false;
        this.updateUserUI();
        this.closeModals();
        await this.fetchShop();
        this.showToast(`Đăng nhập thành công: ${res.user.gameName}#${res.user.tagLine}`, 'success');
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    });

    // Wishlist Search Input
    let searchTimeout = null;
    document.getElementById('wishlistSearchInput')?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();
      if (!query) {
        document.getElementById('wishlistSearchResults').innerHTML = '';
        return;
      }
      searchTimeout = setTimeout(() => this.searchSkinsForWishlist(query), 300);
    });

    // Discord Webhook Broadcast Button
    document.getElementById('testDiscordBtn')?.addEventListener('click', async () => {
      const webhookUrl = document.getElementById('discordWebhookUrl').value.trim();
      if (!webhookUrl) {
        this.showToast('Vui lòng nhập URL Discord Webhook.', 'error');
        return;
      }

      localStorage.setItem('valoshop_discord_url', webhookUrl);

      try {
        this.showToast('Đang gửi cửa hàng hôm nay đến Discord...', 'info');
        const res = await fetch('/api/notify/discord', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            webhookUrl,
            shop: this.state.shop,
            user: this.state.user,
            wallet: this.state.wallet,
          }),
        });
        const data = await res.json();
        if (data.success) {
          this.showToast('Đã gửi thông báo Discord thành công!', 'success');
        } else {
          this.showToast(data.error, 'error');
        }
      } catch (err) {
        this.showToast('Lỗi: ' + err.message, 'error');
      }
    });

    const savedDiscord = localStorage.getItem('valoshop_discord_url');
    if (savedDiscord) document.getElementById('discordWebhookUrl').value = savedDiscord;
  },

  async searchSkinsForWishlist(query) {
    const resultsContainer = document.getElementById('wishlistSearchResults');
    if (!resultsContainer) return;

    try {
      const res = await fetch(`/api/skins/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      resultsContainer.innerHTML = '';

      if (!data.skins || data.skins.length === 0) {
        resultsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; padding: 8px;">Không tìm thấy skin nào.</div>';
        return;
      }

      data.skins.forEach(skin => {
        const isWish = this.isWishlisted(skin.displayName);
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.03); margin-bottom: 6px; cursor: pointer; border: 1px solid var(--border-subtle);';

        item.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${skin.displayIcon || '/assets/icon.svg'}" style="width: 48px; height: 24px; object-fit: contain;" />
            <span style="font-size: 14px; font-weight: 700; text-transform: uppercase;">${skin.displayName}</span>
          </div>
          <button class="btn ${isWish ? 'btn-primary' : 'btn-secondary'}" style="padding: 4px 10px; font-size: 11px;">
            ${isWish ? '★ Đã thêm' : '+ Thêm'}
          </button>
        `;

        item.querySelector('button').addEventListener('click', () => {
          this.toggleWishlist(skin.displayName);
          this.searchSkinsForWishlist(query);
        });

        resultsContainer.appendChild(item);
      });
    } catch (e) {
      console.error(e);
    }
  },

  openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
  },

  closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'gold' ? '⭐' : type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
