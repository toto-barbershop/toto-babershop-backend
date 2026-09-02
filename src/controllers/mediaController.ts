import type { Request, Response } from 'express';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '../config/db.js';
import redis from '../config/redis.js';

const useR2 = Boolean(
  process.env.R2_ACCOUNT_ID && 
  process.env.R2_ACCESS_KEY_ID && 
  process.env.R2_SECRET_ACCESS_KEY && 
  process.env.R2_BUCKET_NAME
);

const s3 = useR2 ? new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
}) : null;

export const getMedias = async (req: Request, res: Response) => {
  try {
    const cached = await redis.get('cache:medias');
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // 1. Lấy dữ liệu từ Database
    const dbMedias = await prisma.media.findMany({ orderBy: { createdAt: 'desc' } });
    const mediaMap = new Map<string, any>();

    dbMedias.forEach(m => {
      if (m.url) {
        mediaMap.set(m.url, {
          id: m.id,
          url: m.url,
          name: m.filename || m.url.split('/').pop()?.split('?')[0] || "Tệp Media",
          filename: m.filename,
          size: m.size ? `${(m.size / (1024 * 1024)).toFixed(2)} MB` : "—",
          type: m.type || (m.url.match(/\.(mp4|webm|mov|ogg|m4v)$/i) ? "video" : "image"),
          createdAt: m.createdAt,
          source: "Thư viện Media",
          isDatabase: true
        });
      }
    });

    // 2. Lấy danh sách toàn bộ tệp (Ảnh & Video MP4) trực tiếp từ Cloudflare R2
    if (useR2 && s3 && process.env.R2_PUBLIC_URL && process.env.R2_BUCKET_NAME) {
      try {
        const r2Data = await s3.send(new ListObjectsV2Command({
          Bucket: process.env.R2_BUCKET_NAME,
        }));

        (r2Data.Contents || []).forEach(item => {
          if (!item.Key || item.Key.startsWith('db-backup/')) return;

          const fileUrl = `${process.env.R2_PUBLIC_URL}/${item.Key}`;
          const isVideo = item.Key.match(/\.(mp4|webm|mov|ogg|m4v)$/i) !== null;
          const sizeStr = item.Size 
            ? (item.Size > 1024 * 1024 ? `${(item.Size / (1024 * 1024)).toFixed(2)} MB` : `${(item.Size / 1024).toFixed(1)} KB`)
            : "—";

          if (!mediaMap.has(fileUrl)) {
            mediaMap.set(fileUrl, {
              id: `r2-${item.Key}`,
              url: fileUrl,
              name: item.Key.replace(/[-_]/g, ' '),
              filename: item.Key,
              size: sizeStr,
              type: isVideo ? "video" : "image",
              createdAt: item.LastModified ? item.LastModified.toISOString() : new Date().toISOString(),
              source: "Cloudflare R2",
              isR2: true
            });
          }
        });
      } catch (r2Err) {
        console.error("⚠️ Lỗi đọc danh sách tệp từ Cloudflare R2:", r2Err);
      }
    }

    const result = Array.from(mediaMap.values()).sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    // Cache kết quả 120s
    await redis.set('cache:medias', JSON.stringify(result), 'EX', 120);
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching media:", error);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

export const getMedia = async (req: Request, res: Response) => {
  try {
    const data = await prisma.media.findUnique({ where: { id: String(req.params.id) } });
    if (!data) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi server' });
  }
};

export const createMedia = async (req: Request, res: Response) => {
  try {
    const data = await prisma.media.create({ data: req.body });
    await redis.del('cache:medias');
    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi thêm mới' });
  }
};

export const updateMedia = async (req: Request, res: Response) => {
  try {
    const data = await prisma.media.update({ where: { id: String(req.params.id) }, data: req.body });
    await redis.del('cache:medias');
    res.json(data);
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi cập nhật' });
  }
};

export const deleteMedia = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Nếu tệp thuộc Cloudflare R2
    if (String(id).startsWith('r2-') && useR2 && s3 && process.env.R2_BUCKET_NAME) {
      const key = String(id).replace('r2-', '');
      try {
        await s3.send(new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
        }));
      } catch (err) {
        console.error("Lỗi xóa tệp từ R2:", err);
      }
    }

    // Xóa từ Database nếu tồn tại
    try {
      await prisma.media.delete({ where: { id: String(id) } });
    } catch {}

    await redis.del('cache:medias');
    res.json({ message: 'Xóa thành công' });
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi xóa' });
  }
};
