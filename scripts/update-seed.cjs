const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

if (!R2_PUBLIC_URL) {
  console.error("No R2_PUBLIC_URL found in .env");
  process.exit(1);
}

const seedFile = path.resolve(process.cwd(), 'prisma/seed.ts');
let content = fs.readFileSync(seedFile, 'utf8');

// Replace all '/images/...' with `${R2_PUBLIC_URL}/...'
// We need to match '/images/(some_file.png)' and replace with R2_PUBLIC_URL + '/some_file.png'
const regex = /'\/images\/([^']+)'/g;
content = content.replace(regex, `\`\${process.env.R2_PUBLIC_URL || '${R2_PUBLIC_URL}'}/$1\``);

// Also replace double quotes if any: "/images/xxx.png"
const regex2 = /"\/images\/([^"]+)"/g;
content = content.replace(regex2, `\`\${process.env.R2_PUBLIC_URL || '${R2_PUBLIC_URL}'}/$1\``);

fs.writeFileSync(seedFile, content);

console.log("✅ Cập nhật seed.ts thành công!");
