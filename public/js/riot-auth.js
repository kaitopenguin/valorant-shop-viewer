// ==========================================================================
// RIOT AUTHENTICATION HANDLER (MULTI-ACCOUNT SUPPORT)
// ==========================================================================

const RiotAuth = {
  CLIENT_ID: 'play-valorant-web-prod',
  REDIRECT_URI: 'https://playvalorant.com/opt_in',

  // Official Riot Sign-On URL
  getOfficialLoginUrl() {
    return `https://auth.riotgames.com/authorize?redirect_uri=${encodeURIComponent(
      this.REDIRECT_URI
    )}&client_id=${this.CLIENT_ID}&response_type=token%20id_token&scope=account%20openid&nonce=1`;
  },

  // Extract access_token from a redirect URL, hash, or raw string
  extractTokens(input) {
    if (!input || typeof input !== 'string') return null;
    const clean = input.trim();

    // Match access_token=...
    const accessMatch = clean.match(/access_token=([^&]+)/);
    const idMatch = clean.match(/id_token=([^&]+)/);

    if (accessMatch) {
      return {
        accessToken: accessMatch[1],
        idToken: idMatch ? idMatch[1] : null,
      };
    }

    // If user pasted raw JWT
    if (clean.startsWith('eyJ')) {
      return {
        accessToken: clean,
        idToken: null,
      };
    }

    return null;
  },

  // Save current active session and add to multi-account list
  saveSession(sessionData) {
    try {
      const active = {
        accessToken: sessionData.accessToken,
        entitlementsToken: sessionData.entitlementsToken,
        user: sessionData.user,
        region: sessionData.region || 'ap',
        timestamp: Date.now(),
      };

      localStorage.setItem('valoshop_session', JSON.stringify(active));

      // Also add to multi-account list if valid PUUID
      if (sessionData.user?.puuid) {
        const accounts = this.getAccounts();
        const existingIdx = accounts.findIndex(a => a.user?.puuid === sessionData.user.puuid);
        if (existingIdx >= 0) {
          accounts[existingIdx] = active;
        } else {
          accounts.push(active);
        }
        localStorage.setItem('valoshop_accounts', JSON.stringify(accounts));
      }
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  },

  // Get current active session
  getSession() {
    try {
      const data = localStorage.getItem('valoshop_session');
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  // Get all saved accounts
  getAccounts() {
    try {
      const data = localStorage.getItem('valoshop_accounts');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  // Switch active account
  switchAccount(puuid) {
    const accounts = this.getAccounts();
    const target = accounts.find(a => a.user?.puuid === puuid);
    if (target) {
      localStorage.setItem('valoshop_session', JSON.stringify(target));
      return target;
    }
    return null;
  },

  // Remove an account
  removeAccount(puuid) {
    let accounts = this.getAccounts();
    accounts = accounts.filter(a => a.user?.puuid !== puuid);
    localStorage.setItem('valoshop_accounts', JSON.stringify(accounts));

    const current = this.getSession();
    if (current?.user?.puuid === puuid) {
      if (accounts.length > 0) {
        this.switchAccount(accounts[0].user.puuid);
      } else {
        localStorage.removeItem('valoshop_session');
      }
    }
  },

  // Clear all sessions
  clearSession() {
    localStorage.removeItem('valoshop_session');
  },

  // Check token via backend
  async submitTokens(tokens, region = 'ap') {
    const res = await fetch('/api/riot/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: tokens.accessToken,
        url: tokens.rawUrl,
      }),
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Xác thực Riot thất bại.');
    }

    this.saveSession({
      accessToken: data.accessToken,
      entitlementsToken: data.entitlementsToken,
      user: data.user,
      region,
    });

    return data;
  },

  // Direct login with username & password
  async directLogin(username, password, region = 'ap', otpCode = null) {
    const res = await fetch('/api/riot/direct-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        otpCode,
      }),
    });

    const data = await res.json();
    if (data.require2FA) {
      return { require2FA: true, email: data.email, message: data.message };
    }

    if (!data.success) {
      throw new Error(data.error || 'Đăng nhập không thành công.');
    }

    this.saveSession({
      accessToken: data.accessToken,
      entitlementsToken: data.entitlementsToken,
      user: data.user,
      region,
    });

    return data;
  },

  // Bookmarklet code for 1-click token extraction
  getBookmarkletCode() {
    const appOrigin = window.location.origin;
    return `javascript:(function(){var url=window.location.href;if(url.indexOf('access_token=')!==-1){window.location.href='${appOrigin}/?token_redirect='+encodeURIComponent(url);}else{alert('Vui lòng hoàn tất đăng nhập Riot trước khi nhấp Bookmarklet!');}})();`;
  }
};

window.RiotAuth = RiotAuth;
