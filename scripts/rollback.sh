#!/usr/bin/env bash
# ==============================================================================
# Script Rollback Tự Động Toàn Diện - ToTo Barbershop (Đơn giản hóa)
# ==============================================================================

set -e

APP_DIR="${APP_DIR:-$HOME/app}"
cd "$APP_DIR"

PRE_DEPLOY_DIR="$HOME/backups/pre-deploy"
EMERGENCY_DIR="$HOME/backups/emergency"
POINTER_FILE="$PRE_DEPLOY_DIR/LATEST_BACKUP_PATH.txt"
COMMIT_FILE="$PRE_DEPLOY_DIR/LAST_GOOD_COMMIT.txt"

echo "========================================================"
echo " 🚨 BẮT ĐẦU QUY TRÌNH ROLLBACK TỰ ĐỘNG"
echo "========================================================"

# 1. Tạo bản backup khẩn cấp (Emergency Backup) ngay lập tức trước khi đụng vào DB
mkdir -p "$EMERGENCY_DIR"
EMERGENCY_FILE="$EMERGENCY_DIR/emergency_backup_$(date +%Y%m%d_%H%M%S).sql"
echo "--> [1/5] Tạo backup khẩn cấp trước khi khôi phục: $EMERGENCY_FILE"
docker compose exec -T db pg_dump -U postgres totodb > "$EMERGENCY_FILE" || true
chmod 600 "$EMERGENCY_FILE" 2>/dev/null || true

# 2. Dừng container backend đang chạy
echo "--> [2/5] Dừng container backend..."
docker compose stop backend || true

# 3. Restore database từ file backup pre-deploy
if [ ! -f "$POINTER_FILE" ]; then
  echo "::error::ROLLBACK THẤT BẠI: Không tìm thấy file lưu đường dẫn backup ($POINTER_FILE)!"
  exit 1
fi
BACKUP_FILE=$(cat "$POINTER_FILE")

if [ ! -f "$BACKUP_FILE" ]; then
  echo "::error::ROLLBACK THẤT BẠI: File backup không tồn tại tại đường dẫn: $BACKUP_FILE!"
  exit 1
fi

echo "--> [3/5] Khôi phục database từ: $BACKUP_FILE"
docker compose exec -T db psql -U postgres -d totodb -c "
  DROP SCHEMA public CASCADE;
  CREATE SCHEMA public;
  GRANT ALL ON SCHEMA public TO postgres;
  GRANT ALL ON SCHEMA public TO public;
"
docker compose exec -T db psql -U postgres -d totodb < "$BACKUP_FILE"

# 4. Đọc commit từ LAST_GOOD_COMMIT.txt và reset git về đúng commit đó
if [ ! -f "$COMMIT_FILE" ]; then
  echo "::error::ROLLBACK THẤT BẠI: Không tìm thấy file lưu commit ổn định ($COMMIT_FILE)!"
  exit 1
fi
LAST_GOOD_COMMIT=$(cat "$COMMIT_FILE")

echo "--> [4/5] Rollback mã nguồn về commit ổn định: $LAST_GOOD_COMMIT"
git reset --hard "$LAST_GOOD_COMMIT"

# 5. Build lại và khởi động lại container backend với code đã rollback
echo "--> [5/5] Khởi động lại backend với phiên bản ổn định..."
docker compose up -d --build backend

# 6. Đợi 5 giây và gọi lại health check 1 lần để xác nhận rollback thành công
echo "--> Đợi 5 giây để kiểm tra lại trạng thái server sau rollback..."
sleep 5

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/health || echo "000")

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "========================================================"
  echo "✅ ROLLBACK THÀNH CÔNG — server đã hoạt động trở lại bình thường với commit cũ."
  echo " - Database đã khôi phục từ: $BACKUP_FILE"
  echo " - Mã nguồn đang chạy: $(git rev-parse --short HEAD)"
  echo "========================================================"
else
  echo "========================================================"
  echo "🔥 ROLLBACK THẤT BẠI — server VẪN LỖI sau khi rollback (HTTP code: $HTTP_CODE)!"
  echo "🔥 CẦN SSH VÀO VPS KIỂM TRA THỦ CÔNG NGAY LẬP TỨC."
  echo "🔥 CẦN SSH VÀO VPS KIỂM TRA THỦ CÔNG NGAY LẬP TỨC."
  echo "🔥 CẦN SSH VÀO VPS KIỂM TRA THỦ CÔNG NGAY LẬP TỨC."
  echo "========================================================"
  exit 1
fi
