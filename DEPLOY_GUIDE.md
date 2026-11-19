# VALORANT Shop Viewer — Hướng Dẫn Deploy 24/7

## 🌐 Kiến Trúc Cloud

```
Render.com (Server Node.js)
    ↑ auto-deploy
GitHub (source code)
    +
UptimeRobot (ping /api/health mỗi 14 phút → Render không ngủ)
```

## ✅ Sau Khi Deploy Xong

| Thành phần | Link |
|---|---|
| App URL | `https://valorant-shop-viewer.onrender.com` |
| GitHub repo | `https://github.com/kaitopenguin/valorant-shop-viewer` |
| UptimeRobot | https://uptimerobot.com |

## 🔄 Auto-Deploy

Mỗi khi code thay đổi trên GitHub → Render tự động build và deploy lại.

## 🏥 Keep-Alive Setup (UptimeRobot - Free)

1. Đăng ký tài khoản miễn phí tại https://uptimerobot.com
2. Thêm monitor mới:
   - Type: **HTTP(s)**
   - URL: `https://valorant-shop-viewer.onrender.com/api/health`
   - Interval: **14 minutes**
3. App sẽ không bao giờ ngủ!
