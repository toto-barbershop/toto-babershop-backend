-- AlterTable
ALTER TABLE "Lookbook" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Lookbook" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "description" TEXT,
    "specialty" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- Seed the existing public team cards so the new CMS can edit them immediately.
INSERT INTO "TeamMember" ("id", "name", "role", "image", "description", "specialty", "status", "order", "createdAt", "updatedAt")
VALUES
  ('team-barber-toto', 'Barber ToTo', 'Head Barber & Founder', '/images/interior.png', 'Tư vấn kĩ lưỡng, cắt tỉ mỉ, form tóc bền đẹp chuẩn form.', 'Classic Pompadour, Skin Fade', 'active', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-barber-huy', 'Barber Huy', 'Senior Barber', '/images/service-shave.jpg', 'Chuyên mảng tẩy tóc, vuốt tạo kiểu khó và form textured cá tính.', 'Textured Crop, Mullet', 'active', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-barber-minh', 'Barber Minh', 'Stylist & Color Specialist', '/images/interior1.png', 'Chuyên uốn nhuộm, vào màu tự nhiên hay contrast, sấy tạo kiểu.', 'Uốn Texture, Nhuộm Khói', 'active', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-barber-tin', 'Barber Tín', 'Grooming & Treatment Specialist', '/images/ourshop-4.jpg', 'Chuyên phục hồi tóc yếu, gội thư giãn và hoàn thiện mẫu tóc.', 'Cạo Khăn Nóng, Phục Hồi', 'active', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
