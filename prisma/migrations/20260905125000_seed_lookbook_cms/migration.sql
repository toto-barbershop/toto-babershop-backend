-- Make display order explicit so the public grid stays stable after admins add new items.
ALTER TABLE "Lookbook" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

UPDATE "Lookbook"
SET "order" = CASE "id"
  WHEN 'lb-1' THEN 1
  WHEN 'lb-2' THEN 2
  WHEN 'lb-3' THEN 3
  WHEN 'lb-4' THEN 4
  WHEN 'lb-shop-1' THEN 17
  ELSE "order"
END
WHERE "order" = 0
  AND "id" IN ('lb-1', 'lb-2', 'lb-3', 'lb-4', 'lb-shop-1');

-- Import the former frontend fixtures once. Existing admin-managed records are never overwritten.
INSERT INTO "Lookbook" ("id", "image", "title", "category", "tags", "order", "createdAt", "updatedAt") VALUES
  ('lb-1', '/images/lookbook-1.png', 'Pompadour Cổ Điển', 'Classic', ARRAY['Classic']::TEXT[], 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-2', '/images/lookbook-2.png', 'Textured Crop & Beard', 'Modern', ARRAY['Modern']::TEXT[], 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-3', '/images/lookbook-3.png', 'Skin Fade Sắc Nét', 'Fade', ARRAY['Fade']::TEXT[], 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-4', '/images/lookbook-4.png', 'Side Part Thanh Lịch', 'Classic', ARRAY['Classic']::TEXT[], 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-5', '/images/lookbook-5.png', 'Hot Towel Shave', 'Grooming', ARRAY['Grooming']::TEXT[], 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-6', '/images/lookbook-6.png', 'Buzz Cut & Line-Up', 'Modern', ARRAY['Modern']::TEXT[], 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-7', '/images/lookbook-7.png', 'Quiff & Beard Combo', 'Modern', ARRAY['Modern']::TEXT[], 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-8', '/images/lookbook-8.png', 'Disconnected Undercut', 'Modern', ARRAY['Modern']::TEXT[], 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-9', '/images/lookbook-9.png', 'Taper Fade Tự Nhiên', 'Fade', ARRAY['Fade']::TEXT[], 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-10', '/images/lookbook-10.png', 'Mullet Phá Cách', 'Creative', ARRAY['Creative']::TEXT[], 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-11', '/images/lookbook-11.png', 'Textured Layer Rủ', 'Layer', ARRAY['Layer']::TEXT[], 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-12', '/images/service-cut.jpg', 'Modern Slick Back', 'Classic', ARRAY['Classic']::TEXT[], 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-13', '/images/service-cut-1.jpg', 'Low Fade & Short Crop', 'Fade', ARRAY['Fade']::TEXT[], 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-14', '/images/barber-1.png', 'Ivy League Gọn Gàng', 'Classic', ARRAY['Classic']::TEXT[], 14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-15', '/images/barber-2.png', 'Two Block Hiện Đại', 'Modern', ARRAY['Modern']::TEXT[], 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-16', '/images/barber-3.png', 'French Crop Tự Nhiên', 'Modern', ARRAY['Modern']::TEXT[], 16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-shop-1', '/images/ourshop-1.jpg', 'ToTo Workspace', 'Shop', ARRAY['Shop']::TEXT[], 17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-shop-2', '/images/ourshop-2.jpg', 'Góc Ghế Cắt Cổ Điển', 'Shop', ARRAY['Shop']::TEXT[], 18, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-shop-3', '/images/ourshop-3.jpg', 'Quầy Dụng Cụ Barber', 'Shop', ARRAY['Shop']::TEXT[], 19, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-shop-4', '/images/ourshop-4.jpg', 'Ánh Sáng & Không Gian', 'Shop', ARRAY['Shop']::TEXT[], 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-shop-5', '/images/ourshop-5.jpg', 'Góc Nghỉ Khách Hàng', 'Shop', ARRAY['Shop']::TEXT[], 21, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-shop-6', '/images/ourshop-6.jpg', 'Không Khí ToTo', 'Shop', ARRAY['Shop']::TEXT[], 22, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-shop-7', '/images/ourshop-7.jpg', 'Bộ Sưu Tập Sản Phẩm', 'Shop', ARRAY['Shop']::TEXT[], 23, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lb-shop-8', '/images/ourshop-8.jpg', 'Chi Tiết Chỉn Chu', 'Shop', ARRAY['Shop']::TEXT[], 24, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
