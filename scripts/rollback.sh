#!/usr/bin/env bash
# ==============================================================================
# Script Rollback Tự Động Toàn Diện - ToTo Barbershop Production
# Sử dụng chung cho mọi sự cố: Health check thất bại hoặc Prisma migrate drift/lỗi
# ==============================================================================

set -e

APP_DIR="${APP_DIR:-$HOME/app}"
cd "$APP_DIR"

POINTER_FILE="$HOME/backups/pre-deploy/LATEST_BACKUP_PATH.txt"

if [ ! -f "$POINTER_FILE" ]; then
  echo "::error::ROLLBACK THẤT BẠI: Không tìm thấy file lưu đường dẫn backup ($POINTER_FILE)!"
  exit 1
fi

BACKUP_FILE=$(cat "$POINTER_FILE")

if [ ! -f "$BACKUP_FILE" ]; then
  echo "::error::ROLLBACK THẤT BẠI: File backup không tồn tại tại đường dẫn: $BACKUP_FILE!"
  exit 1
fi

echo "========================================================"
echo " 🚨 BẮT ĐẦU QUY TRÌNH ROLLBACK TỰ ĐỘNG KHẨN CẤP"
echo " File backup khôi phục: $BACKUP_FILE"
echo " Commit hiện tại đang lỗi: $(git rev-parse --short HEAD)"
echo "========================================================"

# Bước 1: Dừng container backend đang chạy để cắt toàn bộ kết nối lỗi
echo "--> [1/4] Dừng container backend hiện tại..."
docker compose stop backend || true

# Bước 2: Xóa sạch schema public và khôi phục nguyên trạng database từ file backup
echo "--> [2/4] Khôi phục toàn bộ database từ bản backup pre-deploy..."
docker compose exec -T db psql -U postgres -d totodb -c "
  DROP SCHEMA public CASCADE;
  CREATE SCHEMA public;
  GRANT ALL ON SCHEMA public TO postgres;
  GRANT ALL ON SCHEMA public TO public;
"

docker compose exec -T db psql -U postgres -d totodb < "$BACKUP_FILE"
echo "--> Database đã được khôi phục thành công từ $BACKUP_FILE"

# Bước 3: Revert mã nguồn git về commit ổn định trước đó (HEAD~1)
echo "--> [3/4] Revert mã nguồn git về commit trước đó (HEAD~1)..."
git reset --hard HEAD~1

# Bước 4: Build lại image và khởi động lại container backend với mã nguồn cũ
echo "--> [4/4] Khởi động lại backend với phiên bản code cũ ổn định..."
docker compose up -d --build backend

echo "========================================================"
echo " ✅ ROLLBACK TỰ ĐỘNG HOÀN TẤT THÀNH CÔNG"
echo " - Database đã được đưa về trạng thái trước khi deploy."
echo " - Mã nguồn đang chạy: $(git rev-parse --short HEAD)"
echo "========================================================"
