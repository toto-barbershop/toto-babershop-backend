-- Align the editable service catalogue with the approved Figma services layout.
-- Legacy rows are retained for admin history but hidden from the public page.

ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "durationLabel" TEXT;

INSERT INTO "Service" (
  "slug", "name", "category", "price", "duration", "durationLabel",
  "description", "process", "image", "featured", "order", "status",
  "createdAt", "updatedAt"
)
VALUES
  ('cat-toc-tao-kieu', 'CẮT TÓC & TẠO KIỂU', 'Cắt tóc & tạo kiểu', 150000, 45, '~45 phút', 'Cắt gọt và định hình form tóc chuẩn nam tính.', ARRAY['Tư vấn dáng tóc', 'Xả sạch & Cắt gọt', 'Sấy tạo kiểu & Hướng dẫn vuốt sáp'], '/images/service-cut.jpg', false, 1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cham-soc-tia-rau', 'CHĂM SÓC & TỈA RÂU', 'Chăm sóc & tỉa râu', 120000, 30, '~30 phút', 'Tỉa form râu và cạo sát êm ái cho gương mặt chỉn chu.', ARRAY['Định hình khuôn râu', 'Ủ khăn nóng & Cạo êm ái', 'Thoa dưỡng da mặt'], '/images/service-shave.jpg', false, 2, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('uon-nhuom-tao-form', 'UỐN & NHUỘM TẠO FORM', 'Uốn & nhuộm tạo form', 350000, 90, '~90 - 120 phút', 'Hóa chất tạo nếp và đổi màu bảo vệ chất tóc.', ARRAY['Kiểm tra chất tóc', 'Uốn/Nhuộm tạo phom natural', 'Xả dưỡng & Khóa form'], '/images/combo.jpg', true, 3, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('phuc-hoi-goi-thu-gian', 'PHỤC HỒI & GỘI THƯ GIÃN', 'Phục hồi & gội thư giãn', 180000, 30, '~30 - 45 phút', 'Làm sạch sâu da đầu và giải tỏa căng thẳng.', ARRAY['Tẩy tế bào chết da đầu', 'Gội ấn huyệt cổ-vai-gáy', 'Xả dưỡng & Sấy khô'], '/images/ourshop-2.jpg', true, 4, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "category" = EXCLUDED."category",
  "price" = EXCLUDED."price",
  "duration" = EXCLUDED."duration",
  "durationLabel" = EXCLUDED."durationLabel",
  "description" = EXCLUDED."description",
  "process" = EXCLUDED."process",
  "image" = EXCLUDED."image",
  "featured" = EXCLUDED."featured",
  "order" = EXCLUDED."order",
  "status" = EXCLUDED."status",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Service"
SET "status" = 'hidden', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" IN ('classic-haircut', 'skin-fade', 'beard-shaping', 'the-full-service', 'kids-cut', 'hair-color');
