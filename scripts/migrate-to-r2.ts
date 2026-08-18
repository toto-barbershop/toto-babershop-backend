import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const IMAGES_DIR = path.resolve(process.cwd(), '../toto-barbershop-v0/public/images');

async function uploadFile(filePath: string, fileName: string) {
  const fileContent = fs.readFileSync(filePath);
  const ext = path.extname(fileName).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.png') contentType = 'image/png';
  else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.svg') contentType = 'image/svg+xml';
  else if (ext === '.mp4') contentType = 'video/mp4';
  
  // We'll upload with the same filename to the root of the bucket
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
    Body: fileContent,
    ContentType: contentType,
  });

  try {
    await s3.send(command);
    console.log(`✅ Uploaded ${fileName}`);
    return `${R2_PUBLIC_URL}/${fileName}`;
  } catch (error) {
    console.error(`❌ Failed to upload ${fileName}`, error);
    throw error;
  }
}

async function run() {
  console.log('Bắt đầu upload toàn bộ ảnh trong public/images lên R2...');
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`Không tìm thấy thư mục ảnh tại: ${IMAGES_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(IMAGES_DIR);
  let successCount = 0;

  for (const file of files) {
    const filePath = path.join(IMAGES_DIR, file);
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      await uploadFile(filePath, file);
      successCount++;
    }
  }

  console.log(`\n🎉 Đã upload thành công ${successCount} ảnh lên R2!`);
}

run().catch(console.error);
