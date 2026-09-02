import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function run() {
  try {
    const data = await s3.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME }));
    console.log("✅ Kết nối R2 thành công! Tổng số items:", data.Contents?.length);
    data.Contents?.forEach(c => console.log(`- ${c.Key} (${c.Size} bytes)`));
  } catch (err) {
    console.error("❌ Kết nối thất bại:", err);
  }
}

run();
