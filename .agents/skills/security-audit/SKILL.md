---
name: security-audit
description: Sử dụng skill này khi cần kiểm tra bảo mật (security audit) cho backend Node.js (Express.js / TypeScript) + PostgreSQL Prisma của dự án TOTO Barbershop. Bao gồm kiểm tra OWASP Top 10, SQL Injection, IDOR, Race condition, PayOS Webhook signature, JWT session revocation, Rate limiting và Secrets leakage.
---

# Security Audit Checklist — TOTO Barbershop Backend

Khi thực hiện audit, kiểm tra TỪNG mục sau và báo cáo rõ: **ĐẠT / KHÔNG ĐẠT / CẦN XEM LẠI**, kèm đường dẫn file và số dòng code cụ thể.

## 1. SQL Injection & Input Validation
- [ ] Mọi query database sử dụng Prisma ORM parameterized an toàn, KHÔNG có raw SQL nối chuỗi (`$queryRawUnsafe`).
- [ ] Mọi input từ client (body, query, params) được kiểm tra định dạng và độ dài bằng regex / validator trước khi xử lý.
- [ ] Không có endpoint nào tin tưởng trực tiếp dữ liệu từ client mà không validate.

## 2. Authentication & JWT Security
- [ ] `JWT_SECRET` được lấy từ biến môi trường, có kiểm tra `throw Error` nếu thiếu, không hardcode.
- [ ] Mật khẩu được mã hóa an toàn bằng `bcrypt.hash(password, 10)`, không bao giờ lưu plain text.
- [ ] Có cơ chế thu hồi (revoke) toàn bộ session cũ khi đổi/đặt lại mật khẩu bằng `redis.incr('tokenVersion:' + userId)`.
- [ ] Token xác thực có hạn sử dụng hợp lý (24h cho access token, 15 phút cho OTP token).

## 3. Authorization & Chống IDOR (Insecure Direct Object Reference)
- [ ] Endpoint xem/sửa thông tin cá nhân và đơn hàng: Khách hàng chỉ xem được đúng đơn hàng của mình (`userId === req.user.id`).
- [ ] Endpoint Admin (`/api/stats`, CRUD sản phẩm, cấu hình): Có middleware `authMiddleware` + kiểm tra `req.user.role === 'ADMIN'`.
- [ ] API trả về thông tin người dùng / khách hàng tuyệt đối không để lộ `password` (hash).

## 4. Race Condition & PayOS Webhook Integrity
- [ ] Giao dịch trừ kho sản phẩm và cập nhật đơn hàng sử dụng `prisma.$transaction` để đảm bảo tính nguyên tử (Atomicity).
- [ ] Idempotency key hoạt động đúng, ngăn chặn gửi trùng request đặt hàng (Double Spend).
- [ ] Webhook PayOS bắt buộc xác thực chữ ký số HMAC-SHA256 (`payos.verifyPaymentWebhookData(webhookData)`) trước khi xử lý đơn.
- [ ] Webhook PayOS xử lý idempotent — nhận trùng webhook nhiều lần không làm sai lệch trạng thái đơn hàng.

## 5. Rate Limiting & DoS Protection
- [ ] Endpoint nhạy cảm (Checkout, Forgot Password OTP, Login) có rate limit chặt chẽ.
- [ ] Global rate limiter được cấu hình chống spam DDoS (1.000 req/15 phút cho CGNAT VN).
- [ ] Express có `app.set('trust proxy', 1)` để nhận diện đúng IP thật từ Caddy reverse proxy.
- [ ] Cơ chế bypass cho load test sử dụng `LOAD_TEST_SECRET` bí mật, tuyệt đối không bypass bằng User-Agent.

## 6. Secrets & Quản Lý Cấu Hình
- [ ] Không có API key, database password, SMTP credentials nào hardcode trong mã nguồn.
- [ ] File `.env` nằm trong `.gitignore` và không bị commit vào Git repository.
- [ ] Các thông tin nhạy cảm được quản lý qua GitHub Secrets khi chạy CI/CD.

## 7. CORS & Security HTTP Headers
- [ ] CORS chỉ cho phép các domain frontend hợp lệ (`totobarbershop.vn`, localhost), không mở `*` ở môi trường production.
- [ ] Sử dụng `helmet()` để thiết lập các HTTP Security Headers tiêu chuẩn (X-Content-Type-Options, X-Frame-Options, HSTS).

## 8. File Upload Security
- [ ] Giới hạn dung lượng file upload (tối đa 5MB) và chỉ cho phép định dạng ảnh hợp lệ (`image/jpeg`, `image/png`, `image/webp`).
- [ ] Không cho phép upload các file thực thi nguy hiểm (`.exe`, `.sh`, `.php`, `.js`, `.html`).
