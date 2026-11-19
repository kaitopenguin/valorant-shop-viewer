# VALORANT STORE PROTOCOL 2.0 // MULTI-USER & DISCORD BOT 🛒🔥
> **Ứng dụng kiểm tra cửa hàng Valorant cho bạn & nhóm bạn — Tích hợp Bot Discord & Webhook — Đăng nhập Riot chính quy an toàn 100% — Giao diện & Font chữ chuẩn VALORANT In-Game.**

---

## 🌟 Điểm Mới Trong Phiên Bản 2.0

1. **Cho Mọi Người Cùng Dùng & Tích Hợp Discord:**
   - **Gửi Thẻ Shop Lên Discord:** Kết nối Discord Webhook chỉ trong 1 phút để tự động phát thẻ cửa hàng 4 skin HD vào kênh chat chung của Server bạn bè.
   - **Bot Discord Độc Lập (`bot.js`):** Hỗ trợ các lệnh `!shop`, `!nm`, `!wallet`, `!login` cho mọi thành viên trong server.
   - **Trình Chuyển Đổi Đa Tài Khoản (Multi-Account Switcher):** Lưu trữ nhiều tài khoản Riot (Acc chính, Acc smurf, Acc bạn bè) và chuyển đổi mượt mà với 1 click ngay trên thanh điều hướng.
   - **Nút "📸 Chia Sẻ" Đa Năng:** Tải về ảnh thẻ Shop 16:9 chất lượng cao (PNG) hoặc sao chép định dạng văn bản Discord để gửi nhanh vào nhóm chat Zalo/Messenger/Discord.

2. **Giao Diện Chuẩn VALORANT In-Game & Font Chữ Đẳng Cấp:**
   - **Bộ Font Game:** Nạp font **Bebas Neue** (chuẩn font *Tungsten* tiêu đề của Valorant), **Rajdhani** (*DIN Next LT Pro*) và **Share Tech Mono** (digital clock).
   - **Chi Tiết Tactical:** Vát góc công nghệ cao (`clip-path`), dấu chữ thập hồng tâm `+`, vạch cảnh báo phân đoạn `[ 01 // CỬA HÀNG ]`.
   - **Hiệu Ứng Âm Thanh In-Game (Web Audio SFX):** Âm thanh click công nghệ cao, âm thanh quét khi lật thẻ Chợ Đêm, âm thanh báo động Wishlist (có nút bật/tắt `🔊 SFX: ON/OFF`).

3. **Bảo Mật Chính Quy Tuyệt Đối:**
   - Đăng nhập trực tiếp qua cổng chính thức `auth.riotgames.com` của Riot Games (hỗ trợ mã OTP 2FA).
   - Không lưu trữ mật khẩu trên bất kỳ máy chủ bên thứ ba nào.

---

## 🚀 Khởi Chạy Ứng Dụng

Ứng dụng không cần cài đặt thêm thư viện ngoài (Zero dependencies).

```bash
node server.js
```
*(Hoặc dùng `agy-node server.js`)*

Truy cập: **[http://localhost:3000](http://localhost:3000)**

---

## 🤖 Hướng Dẫn Dùng Chung Trong Server Discord

### Cách 1: Sử dụng Discord Webhook (Đơn giản nhất - Khuyên dùng)
1. Trong Server Discord của bạn, vào **Cài đặt Kênh** &rarr; **Tích hợp** &rarr; **Tạo Webhook mới** &rarr; Copy URL.
2. Trên Web App, bấm nút **"🤖 Discord Bot"**, dán Webhook URL vào và bấm **"Gửi Lên Server Discord Ngay"**.
3. Cả Server sẽ nhận được thẻ Embed cực đẹp có đủ 4 skin hôm nay, giá VP và số dư ví!

### Cách 2: Khởi chạy Bot Discord với `bot.js`
1. Điền `DISCORD_BOT_TOKEN` vào file `.env` hoặc truyền biến môi trường.
2. Chạy:
   ```bash
   node bot.js
   ```
3. Mọi người trong Server có thể gõ `!shop`, `!nm`, `!wallet`.

---

## 📱 Cài Đặt PWA Vào Điện Thoại

- **iPhone (Safari):** Bấm nút **Chia sẻ** &rarr; chọn **"Thêm vào Màn hình chính"**.
- **Android (Chrome):** Bấm **3 dấu chấm** &rarr; chọn **"Cài đặt ứng dụng"**.
