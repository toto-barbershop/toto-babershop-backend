import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const products = [
  {
    slug: 'toto-strong-hold-pomade',
    title: 'Strong Hold Pomade',
    category: 'grooming',
    collection: 'pomade',
    excerpt: 'Pomade gốc nước, giữ nếp mạnh, bóng vừa.',
    description:
      'Strong Hold Pomade là pomade gốc nước đặc trưng của Toto, cho độ giữ nếp cao suốt cả ngày mà vẫn dễ gội sạch. Mùi hương nam tính, khô nhẹ, phù hợp cho các kiểu classic, pompadour và slick back.',
    images: [`${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/grooming-pomade.png`, `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/grooming-clay.png`],
    basePrice: 220000,
    featured: true,
    status: 'active',
    tags: ['giữ nếp mạnh', 'gốc nước', 'best seller'],
    rating: 4.8,
    reviewCount: 126,
    createdAt: new Date('2024-11-02T00:00:00.000Z'),
    variants: [
      { name: '80g', options: { size: '80g' }, price: 220000, stock: 42, sku: 'POM-80' },
      { name: '120g', options: { size: '120g' }, price: 290000, compareAtPrice: 320000, stock: 18, sku: 'POM-120' },
    ],
    seoTitle: 'Strong Hold Pomade | Toto', 
    seoDescription: 'Pomade giữ nếp mạnh gốc nước.'
  },
  {
    slug: 'matte-styling-clay',
    title: 'Matte Styling Clay',
    category: 'grooming',
    collection: 'clay',
    excerpt: 'Sáp tạo kiểu lì, độ phồng tự nhiên.',
    description:
      'Matte Styling Clay mang lại kết cấu lì hoàn toàn, tăng độ phồng và định hình mạnh cho tóc ngắn và trung bình. Lý tưởng cho crop, textured quiff và các kiểu tự nhiên.',
    images: [`${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/grooming-clay.png`, `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/grooming-pomade.png`],
    basePrice: 240000,
    featured: true,
    status: 'active',
    tags: ['matte', 'độ phồng'],
    rating: 4.7,
    reviewCount: 89,
    createdAt: new Date('2024-12-10T00:00:00.000Z'),
    variants: [
      { name: '100g', options: { size: '100g' }, price: 240000, stock: 30, sku: 'CLAY-100' },
    ],
  },
  {
    slug: 'nourishing-beard-oil',
    title: 'Nourishing Beard Oil',
    category: 'grooming',
    collection: 'beard',
    excerpt: 'Dưỡng râu mềm mượt, giảm ngứa.',
    description:
      'Dầu dưỡng râu chiết xuất jojoba và argan giúp làm mềm, giảm ngứa và kích thích râu phát triển khỏe mạnh. Thẩm thấu nhanh, không nhờn rít.',
    images: [`${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/grooming-beard-oil.png`],
    basePrice: 180000,
    compareAtPrice: 210000,
    featured: false,
    status: 'active',
    tags: ['beard', 'dưỡng'],
    rating: 4.6,
    reviewCount: 54,
    createdAt: new Date('2025-01-05T00:00:00.000Z'),
    variants: [
      { name: '30ml', options: { size: '30ml' }, price: 180000, compareAtPrice: 210000, stock: 25, sku: 'BRD-30' },
      { name: '50ml', options: { size: '50ml' }, price: 250000, stock: 0, sku: 'BRD-50' },
    ],
  },
  {
    slug: 'daily-clean-shampoo',
    title: 'Daily Clean Shampoo',
    category: 'grooming',
    collection: 'wash',
    excerpt: 'Dầu gội hằng ngày, sạch sâu, dịu nhẹ.',
    description:
      'Dầu gội làm sạch sâu bụi bẩn và dầu thừa mà không làm khô da đầu. Công thức dịu nhẹ dùng được hằng ngày, hương bạc hà mát lạnh.',
    images: [`${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/grooming-shampoo.png`],
    basePrice: 160000,
    featured: false,
    status: 'active',
    tags: ['gội', 'daily'],
    rating: 4.5,
    reviewCount: 38,
    createdAt: new Date('2025-01-20T00:00:00.000Z'),
    variants: [
      { name: '250ml', options: { size: '250ml' }, price: 160000, stock: 60, sku: 'SHP-250' },
    ],
  },
  {
    slug: 'barber-comb-brush-set',
    title: 'Comb & Brush Set',
    category: 'grooming',
    collection: 'tools',
    excerpt: 'Bộ lược và bàn chải tạo kiểu chuyên nghiệp.',
    description:
      'Bộ combo lược carbon chống tĩnh điện và bàn chải lông tự nhiên, giúp tạo kiểu và làm mượt tóc như tại tiệm.',
    images: [`${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/grooming-comb.png`],
    basePrice: 150000,
    featured: false,
    status: 'active',
    tags: ['tools', 'combo'],
    rating: 4.9,
    reviewCount: 71,
    createdAt: new Date('2024-10-15T00:00:00.000Z'),
    variants: [
      { name: 'Bộ tiêu chuẩn', options: { type: 'standard' }, price: 150000, stock: 40, sku: 'CMB-STD' },
    ],
  },
  {
    slug: 'complete-grooming-kit',
    title: 'Complete Grooming Kit',
    category: 'grooming',
    collection: 'kit',
    excerpt: 'Bộ quà chăm sóc trọn gói cho quý ông.',
    description:
      'Bộ quà tặng gồm pomade, dầu dưỡng râu và lược, đóng hộp sang trọng — món quà hoàn hảo cho phái mạnh.',
    images: [`${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/grooming-kit.png`],
    basePrice: 520000,
    compareAtPrice: 620000,
    featured: true,
    status: 'active',
    tags: ['gift', 'combo', 'sale'],
    rating: 4.9,
    reviewCount: 44,
    createdAt: new Date('2025-02-01T00:00:00.000Z'),
    variants: [
      { name: 'Gift Box', options: { type: 'box' }, price: 520000, compareAtPrice: 620000, stock: 12, sku: 'KIT-BOX' },
    ],
  },
  {
    slug: 'toto-heavyweight-tee',
    title: 'Heavyweight Logo Tee',
    category: 'merchandise',
    collection: 'tee',
    excerpt: 'Áo thun cotton dày, form regular, logo ngực.',
    description:
      'Áo thun cotton 250gsm dày dặn, form regular streetwear, in logo Toto tối giản ở ngực. Bền màu, thoáng mát, mặc quanh năm.',
    images: [`${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/merch-tee.png`],
    basePrice: 320000,
    featured: true,
    status: 'active',
    tags: ['tee', 'cotton', 'unisex'],
    rating: 4.7,
    reviewCount: 98,
    createdAt: new Date('2024-12-01T00:00:00.000Z'),
    variants: [
      { name: 'Đen / S', options: { color: 'Đen', size: 'S' }, price: 320000, stock: 20, sku: 'TEE-BK-S' },
      { name: 'Đen / M', options: { color: 'Đen', size: 'M' }, price: 320000, stock: 35, sku: 'TEE-BK-M' },
      { name: 'Đen / L', options: { color: 'Đen', size: 'L' }, price: 320000, stock: 28, sku: 'TEE-BK-L' },
      { name: 'Rêu / M', options: { color: 'Xanh rêu', size: 'M' }, price: 340000, stock: 0, sku: 'TEE-GR-M' },
    ],
  },
  {
    slug: 'corduroy-logo-cap',
    title: 'Corduroy Logo Cap',
    category: 'merchandise',
    collection: 'cap',
    excerpt: 'Nón nhung tăm màu rêu, logo thêu.',
    description:
      'Nón lưỡi trai chất liệu nhung tăm màu xanh rêu đặc trưng, logo thêu nổi, khoá điều chỉnh kim loại. Phụ kiện hoàn thiện set đồ.',
    images: [`${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/merch-cap.png`],
    basePrice: 250000,
    featured: true,
    status: 'active',
    tags: ['cap', 'accessory'],
    rating: 4.8,
    reviewCount: 63,
    createdAt: new Date('2025-01-12T00:00:00.000Z'),
    variants: [
      { name: 'Xanh rêu', options: { color: 'Xanh rêu' }, price: 250000, stock: 33, sku: 'CAP-GR' },
      { name: 'Đen', options: { color: 'Đen' }, price: 250000, stock: 21, sku: 'CAP-BK' },
    ],
  },
  {
    slug: 'essential-hoodie',
    title: 'Essential Hoodie',
    category: 'merchandise',
    collection: 'hoodie',
    excerpt: 'Hoodie nỉ dày, in lưng tối giản.',
    description:
      'Hoodie nỉ bông 380gsm giữ ấm tốt, form oversized nhẹ, in lưng tối giản. Item chủ lực cho mùa lạnh.',
    images: [`${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/merch-hoodie.png`],
    basePrice: 590000,
    featured: false,
    status: 'active',
    tags: ['hoodie', 'winter'],
    rating: 4.9,
    reviewCount: 41,
    createdAt: new Date('2025-02-10T00:00:00.000Z'),
    variants: [
      { name: 'Đen / M', options: { color: 'Đen', size: 'M' }, price: 590000, stock: 14, sku: 'HOD-M' },
      { name: 'Đen / L', options: { color: 'Đen', size: 'L' }, price: 590000, stock: 9, sku: 'HOD-L' },
      { name: 'Đen / XL', options: { color: 'Đen', size: 'XL' }, price: 590000, stock: 6, sku: 'HOD-XL' },
    ],
  },
  {
    slug: 'canvas-tote-bag',
    title: 'Canvas Tote Bag',
    category: 'merchandise',
    collection: 'bag',
    excerpt: 'Túi canvas in lụa logo, bền chắc.',
    description:
      'Túi tote vải canvas dày, in lụa logo màu rêu, quai chắc chắn — đựng đồ mỗi ngày hoặc làm phụ kiện phối đồ.',
    images: [`${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/merch-tote.png`],
    basePrice: 180000,
    featured: false,
    status: 'active',
    tags: ['bag', 'canvas'],
    rating: 4.6,
    reviewCount: 29,
    createdAt: new Date('2025-01-25T00:00:00.000Z'),
    variants: [
      { name: 'Kem', options: { color: 'Kem' }, price: 180000, stock: 50, sku: 'TOT-NT' },
    ],
  },
  {
    slug: 'chore-work-jacket',
    title: 'Chore Work Jacket',
    category: 'merchandise',
    collection: 'jacket',
    excerpt: 'Áo khoác chore coat vải bố màu rêu.',
    description:
      'Chore jacket vải bố cotton màu xanh rêu, nhiều túi hộp tiện dụng, form vừa vặn, phối được nhiều phong cách.',
    images: [`${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/merch-jacket.png`],
    basePrice: 780000,
    featured: true,
    status: 'active',
    tags: ['jacket', 'workwear', 'limited'],
    rating: 5,
    reviewCount: 17,
    createdAt: new Date('2025-02-18T00:00:00.000Z'),
    variants: [
      { name: 'Rêu / M', options: { color: 'Xanh rêu', size: 'M' }, price: 780000, stock: 7, sku: 'JKT-M' },
      { name: 'Rêu / L', options: { color: 'Xanh rêu', size: 'L' }, price: 780000, stock: 4, sku: 'JKT-L' },
    ],
  },
  {
    slug: 'ribbed-crew-socks',
    title: 'Ribbed Crew Socks',
    category: 'merchandise',
    collection: 'socks',
    excerpt: 'Tất cổ trung dệt logo, cotton co giãn.',
    description:
      'Tất cổ trung chất cotton co giãn, gân dệt và logo nhỏ ở cổ. Bán theo set 2 đôi đen và rêu.',
    images: [`${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/merch-socks.png`],
    basePrice: 90000,
    featured: false,
    status: 'active',
    tags: ['socks', 'set'],
    rating: 4.4,
    reviewCount: 22,
    createdAt: new Date('2025-01-30T00:00:00.000Z'),
    variants: [
      { name: 'Set 2 đôi', options: { pack: '2 đôi' }, price: 90000, stock: 80, sku: 'SCK-2' },
    ],
  },
];

async function main() {
  console.log('🌱 Seeding categories...');
  const categories = [
    { slug: 'grooming', name: 'Grooming', parent: 'grooming', description: 'Sản phẩm chăm sóc tóc và râu.', productCount: 6 },
    { slug: 'merchandise', name: 'Toto Merchandise', parent: 'merchandise', description: 'Đồ streetwear & phụ kiện thương hiệu.', productCount: 6 },
    { slug: 'pomade', name: 'Pomade & Sáp', parent: 'grooming', description: 'Sản phẩm tạo kiểu.', productCount: 2 },
    { slug: 'beard', name: 'Chăm sóc râu', parent: 'grooming', description: 'Dầu & dưỡng râu.', productCount: 1 },
    { slug: 'apparel', name: 'Apparel', parent: 'merchandise', description: 'Áo & khoác.', productCount: 3 },
    { slug: 'accessory', name: 'Phụ kiện', parent: 'merchandise', description: 'Nón, túi, tất.', productCount: 3 },
  ];

  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: c,
      create: c,
    });
    console.log(`  ✅ Category: ${c.name}`);
  }

  console.log('\n🌱 Seeding services...');
  const services = [
    { slug: 'classic-haircut', name: 'Classic Haircut', category: 'Cắt tóc', price: 150000, duration: 45, description: 'Cắt tóc cổ điển theo khuôn mặt, gội và tạo kiểu hoàn thiện.', process: ['Tư vấn kiểu tóc', 'Cắt & tỉa', 'Gội massage', 'Tạo kiểu'], image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/barber-1.png`, featured: true, order: 1, status: 'active' },
    { slug: 'skin-fade', name: 'Skin Fade', category: 'Cắt tóc', price: 200000, duration: 60, description: 'Fade da đầu chuẩn từng lớp, đường nét sắc sảo, hiện đại.', process: ['Tư vấn độ fade', 'Tông đơ tạo lớp', 'Line-up', 'Tạo kiểu'], image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/lookbook-3.png`, featured: true, order: 2, status: 'active' },
    { slug: 'beard-shaping', name: 'Beard Shaping & Hot Towel', category: 'Cạo râu', price: 120000, duration: 30, description: 'Tạo dáng râu, cạo dao cạo truyền thống kèm khăn nóng thư giãn.', process: ['Khăn nóng', 'Tạo dáng râu', 'Cạo dao', 'Dưỡng da'], image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/lookbook-5.png`, featured: true, order: 3, status: 'active' },
    { slug: 'the-full-service', name: 'The Full Service', category: 'Combo', price: 300000, duration: 90, description: 'Combo trọn gói: cắt tóc, fade, cạo râu và tạo kiểu cao cấp.', process: ['Tư vấn tổng thể', 'Cắt & fade', 'Cạo râu hot towel', 'Gội & tạo kiểu'], image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/hero.png`, featured: true, order: 4, status: 'active' },
    { slug: 'kids-cut', name: 'Kids Cut', category: 'Cắt tóc', price: 100000, duration: 30, description: 'Cắt tóc cho bé nhẹ nhàng, thân thiện, tạo kiểu dễ thương.', process: ['Trò chuyện với bé', 'Cắt & tỉa', 'Tạo kiểu'], image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/barber-2.png`, featured: false, order: 5, status: 'active' },
    { slug: 'hair-color', name: 'Hair Color', category: 'Nhuộm', price: 450000, duration: 120, description: 'Nhuộm màu thời trang hoặc phủ bạc, chăm sóc màu bền đẹp.', process: ['Tư vấn màu', 'Tẩy/nhuộm', 'Dưỡng màu', 'Tạo kiểu'], image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/lookbook-4.png`, featured: false, order: 6, status: 'active' },
  ];

  for (const s of services) {
    await prisma.service.upsert({
      where: { slug: s.slug },
      update: s,
      create: s,
    });
    console.log(`  ✅ Service: ${s.name}`);
  }

  console.log('\n🌱 Seeding products...');
  
  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.title,
        excerpt: p.excerpt,
        description: p.description,
        images: p.images,
        category: p.category,
        collection: p.collection,
        basePrice: p.basePrice,
        compareAtPrice: p.compareAtPrice || null,
        featured: p.featured,
        status: p.status,
        tags: p.tags,
        rating: p.rating,
        reviewCount: p.reviewCount,
        seoTitle: p.seoTitle || null,
        seoDescription: p.seoDescription || null,
      },
      create: {
        slug: p.slug,
        name: p.title,
        excerpt: p.excerpt,
        description: p.description,
        images: p.images,
        category: p.category,
        collection: p.collection,
        basePrice: p.basePrice,
        compareAtPrice: p.compareAtPrice || null,
        featured: p.featured,
        status: p.status,
        tags: p.tags,
        rating: p.rating,
        reviewCount: p.reviewCount,
        seoTitle: p.seoTitle || null,
        seoDescription: p.seoDescription || null,
        createdAt: p.createdAt,
      },
    });

    for (const v of p.variants as any[]) {
      await prisma.productVariant.upsert({
        where: { sku: v.sku },
        update: { 
          stock: v.stock,
          price: v.price,
          compareAtPrice: v.compareAtPrice || null,
          name: v.name,
          options: v.options,
        },
        create: {
          productId: product.id,
          name: v.name,
          options: v.options,
          price: v.price,
          compareAtPrice: v.compareAtPrice || null,
          stock: v.stock,
          sku: v.sku,
        },
      });
    }
    
    console.log(`  ✅ ${p.title} (${p.variants.length} variants)`);
  }

  console.log('\n🌱 Seeding users...');
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@toto.com';
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || '123456';
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  
  const users = [
    {
      email: adminEmail,
      password: passwordHash,
      name: 'Toto Admin',
      phone: '0981378179',
      role: 'ADMIN',
    },
    {
      email: 'customer@toto.com',
      password: await bcrypt.hash('123456', 10),
      name: 'Nguyen Van Khach',
      phone: '0909876543',
      role: 'CUSTOMER',
    }
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
    console.log(`  ✅ User: ${u.email}`);
  }

  console.log('\n🌱 Seeding promo codes...');
  const promoCodes = [
    {
      code: 'WELCOME10',
      discountType: 'PERCENT',
      discountValue: 10,
      minOrderValue: 200000,
      maxDiscount: 50000,
      usageLimit: 100,
      isActive: true,
      expiresAt: null,
    },
    {
      code: 'TOTO50K',
      discountType: 'FIXED',
      discountValue: 50000,
      minOrderValue: 300000,
      maxDiscount: null,
      usageLimit: 50,
      isActive: true,
      expiresAt: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000), // Expires in 7 days
    },
    {
      code: 'SUMMER20',
      discountType: 'PERCENT',
      discountValue: 20,
      minOrderValue: 500000,
      maxDiscount: 100000,
      usageLimit: 200,
      isActive: true,
      expiresAt: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000), // Expires in 30 days
    },
    {
      code: 'FREESHIP15K',
      discountType: 'FIXED',
      discountValue: 15000,
      minOrderValue: 150000,
      maxDiscount: null,
      usageLimit: null,
      isActive: true,
      expiresAt: null,
    },
    {
      code: 'VIP100K',
      discountType: 'FIXED',
      discountValue: 100000,
      minOrderValue: 1000000,
      maxDiscount: null,
      usageLimit: 10,
      isActive: true,
      expiresAt: new Date(new Date().getTime() - 24 * 60 * 60 * 1000), // Expired 1 day ago (for testing)
    }
  ];

  for (const pc of promoCodes) {
    await prisma.promoCode.upsert({
      where: { code: pc.code },
      update: pc,
      create: pc,
    });
    console.log(`  ✅ Promo: ${pc.code}`);
  }

  console.log('\n🌱 Seeding courses...');
  const courses = [
    {
      id: 't-foundation',
      slug: 'barber-foundation',
      title: 'Barber Foundation',
      excerpt: 'Khóa nền tảng cho người mới bắt đầu',
      description: 'Từ cách cầm tông đơ đến hoàn thiện một kiểu cắt cơ bản.',
      duration: '8 tuần',
      price: 12000000,
      image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/training.png`,
      status: 'active',
    },
    {
      id: 't-pro',
      slug: 'advanced-fade-styling',
      title: 'Advanced Fade & Styling',
      excerpt: 'Khóa nâng cao cho barber đã có nghề',
      description: 'Tập trung vào fade phức tạp, freestyle và xây dựng phong cách cá nhân.',
      duration: '6 tuần',
      price: 18000000,
      image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/lookbook-3.png`,
      status: 'active',
    }
  ];
  for (const c of courses) {
    await prisma.course.upsert({ where: { slug: c.slug }, update: c, create: c });
  }



  console.log('🌱 Seeding stories...');
  const stories = [
    {
      id: 'st-origin',
      slug: 'the-origin',
      title: 'The Origin',
      subtitle: 'Từ ghế cắt đến tủ đồ',
      manifesto: 'Toto Merchandise sinh ra từ văn hóa barber — nơi mỗi đường kéo, mỗi lần fade đều là một tuyên ngôn phong cách.',
      heroImage: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/merch-story-hero.jpg`,
      blocks: [
        { id: "b1", type: "quote", body: "Không chỉ là thợ cắt tóc, chúng tôi còn là những người kể chuyện qua từng sản phẩm." },
        { id: "b2", type: "image", image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/merch-story-hero.jpg` }
      ],
      gallery: [],
      status: 'published',
    },
    {
      id: 'st-workwear',
      slug: 'workwear-chapter',
      title: 'Workwear Chapter',
      subtitle: 'Bền bỉ như người thợ',
      manifesto: 'Lấy cảm hứng từ trang phục lao động, chương Workwear tôn vinh sự bền bỉ, thực dụng và vẻ đẹp mộc mạc của người thợ lành nghề.',
      heroImage: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/merch-jacket.png`,
      blocks: [
        { id: "b3", type: "quote", body: "Bền bỉ, thực dụng, và mộc mạc." },
        { id: "b4", type: "image", image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/merch-jacket-detail.png` }
      ],
      gallery: [],
      status: 'published',
    }
  ];
  for (const s of stories) {
    await prisma.story.upsert({ where: { slug: s.slug }, update: s, create: s });
  }

  console.log('🌱 Seeding lookbooks...');
  const lookbooks = [
    { id: 'lb-1', image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/lookbook-1.png`, title: 'Pompadour cổ điển', category: 'Classic', tags: ['Classic'] },
    { id: 'lb-2', image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/lookbook-2.png`, title: 'Textured crop & beard', category: 'Modern', tags: ['Modern'] },
    { id: 'lb-3', image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/lookbook-3.png`, title: 'Skin fade sắc nét', category: 'Fade', tags: ['Fade'] },
    { id: 'lb-4', image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/lookbook-4.png`, title: 'Side part thanh lịch', category: 'Classic', tags: ['Classic'] },
    { id: 'lb-shop-1', image: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/ourshop-1.jpg`, title: 'Shop Interior 1', category: 'Shop', tags: ['Shop'] },
  ];
  for (const lb of lookbooks) {
    await prisma.lookbook.upsert({ where: { id: lb.id }, update: lb, create: lb });
  }

  console.log('🌱 Seeding media...');
  const media = [
    { id: "med_01", url: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/hero.png`, filename: "hero.png", type: "image", size: 1200000 },
    { id: "med_02", url: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/interior.png`, filename: "interior.png", type: "image", size: 980000 },
    { id: "med_03", url: `${process.env.R2_PUBLIC_URL || 'https://pub-6729e43af67d4a3f94fe9289bd80ea69.r2.dev'}/barber-1.png`, filename: "barber-1.png", type: "image", size: 760000 },
  ];
  for (const m of media) {
    await prisma.media.upsert({ where: { id: m.id }, update: m, create: m });
  }

  console.log('🌱 Seeding FAQs...');
  const faqs = [
    // Shop FAQs
    { question: 'Thời gian giao hàng là bao lâu?', answer: 'Thông thường nội thành TPHCM 1-2 ngày, ngoại thành 3-5 ngày.', category: 'shop', order: 1 },
    { question: 'Có được kiểm tra hàng trước khi nhận không?', answer: 'Có, bạn được quyền kiểm tra hàng trước khi thanh toán.', category: 'shop', order: 2 },
    { question: 'Tôi có thể đổi trả sản phẩm không?', answer: 'Shop hỗ trợ đổi trả trong vòng 3 ngày đối với các sản phẩm chưa qua sử dụng và còn nguyên tem mác.', category: 'shop', order: 3 },
    
    // Service FAQs
    { question: 'Có cần đặt lịch trước khi cắt không?', answer: 'Nên đặt lịch trước để tránh phải đợi lâu, đặc biệt là vào dịp cuối tuần hoặc lễ Tết.', category: 'service', order: 1 },
    { question: 'Giá cắt tóc đã bao gồm gội đầu chưa?', answer: 'Đã bao gồm. Dịch vụ cắt tóc của Toto luôn đi kèm combo gội, massage đầu và tạo kiểu bằng sáp/pomade chuyên dụng.', category: 'service', order: 2 },
    { question: 'Nếu tôi đến muộn hơn giờ đã hẹn thì sao?', answer: 'Nếu bạn đến trễ quá 15 phút, chúng tôi xin phép được hủy lịch hoặc sắp xếp bạn vào khung giờ trống tiếp theo để không ảnh hưởng đến khách hàng sau.', category: 'service', order: 3 },
    { question: 'Shop có nhận cắt tóc cho trẻ em không?', answer: 'Có, chúng tôi có phục vụ cắt tóc cho các bé trai từ 3 tuổi trở lên. Tuy nhiên bé cần có sự đồng hành của phụ huynh để đảm bảo an toàn.', category: 'service', order: 4 },
  ];
  await prisma.faq.deleteMany({});
  for (const f of faqs) {
    await prisma.faq.create({ data: f });
  }

  console.log('🌱 Seeding Settings...');
  const settingsData = {
    business: { name: 'TOTO BARBERSHOP' },
    contact: { email: 'hello@totobarbershop.com', phone: '0901234567', address: '123 Đường ABC, Quận 1, TPHCM' },
    socials: { facebook: 'https://facebook.com/totobarbershop', instagram: 'https://instagram.com/totobarbershop', tiktok: 'https://tiktok.com/@totobarbershop' }
  };
  for (const [key, value] of Object.entries(settingsData)) {
    await prisma.setting.upsert({ where: { key }, update: { value: value as any }, create: { key, value: value as any } });
  }

  console.log('\n🎉 Seed hoàn tất!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
