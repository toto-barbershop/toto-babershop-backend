-- Repair schema drift safely when the original Lookbook ordering migration was
-- recorded or skipped before the physical column existed on the serving database.
ALTER TABLE "Lookbook" ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0;
