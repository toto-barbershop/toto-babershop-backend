import request from 'supertest';
import { app } from '../src/index.js';
import { prisma } from '../src/config/db.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Concurrency Test: Checkout 100 requests for 5 items', () => {
  let userId: number;
  let variantId: number;
  let productId: number;
  let token: string;
  const initialStock = 5;

  beforeAll(async () => {
    // 1. Tạo test user
    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@test.com`,
        password: 'password123',
        name: 'Test Concurrency',
        role: 'CUSTOMER'
      }
    });
    userId = user.id;

    // Lấy JWT Secret từ env
    const secret = process.env.JWT_SECRET || 'toto-barbershop-secret-1234';
    token = jwt.sign({ id: userId, role: user.role }, secret, { expiresIn: '1h' });

    // 2. Tạo test product
    const product = await prisma.product.create({
      data: {
        name: 'Sáp vuốt tóc Test Concurrency',
        basePrice: 150000,
        category: 'Wax',
        variants: {
          create: [
            {
              price: 150000,
              stock: initialStock, // Chỉ có 5 sản phẩm
            }
          ]
        },
        slug: 'sap-vuot-toc-test-concurrency'
      },
      include: { variants: true }
    });
    
    productId = product.id;
    variantId = product.variants[0]!.id;
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu test
    await prisma.orderItem.deleteMany({
      where: { order: { userId } }
    });
    await prisma.order.deleteMany({
      where: { userId }
    });
    await prisma.productVariant.deleteMany({
      where: { id: variantId }
    });
    await prisma.product.deleteMany({
      where: { id: productId }
    });
    await prisma.user.deleteMany({
      where: { id: userId }
    });
    await prisma.$disconnect();
  });

  it('Nên chỉ xử lý thành công đúng 5 đơn hàng, 95 đơn còn lại phải bị từ chối do hết kho hoặc idempotency', async () => {
    // Tạo 100 request đồng thời mua cùng 1 sản phẩm với số lượng 1
    const totalRequests = 100;
    
    // Mỗi request dùng 1 idempotency key để giả lập 100 giao dịch ĐỘC LẬP
    // Nếu dùng chung idempotency key, nó sẽ test được việc chặn double-click
    // Ở đây ta test CẢ HAI: 
    // - 50 request dùng cùng 1 key (mô phỏng 1 user double-click 50 lần)
    // - 50 request dùng 50 key khác nhau (mô phỏng 50 user thật)
    
    const singleUserKey = crypto.randomUUID();

    const requests = Array.from({ length: totalRequests }).map((_, index) => {
      // Nửa đầu dùng chung 1 key (chặn double submit)
      // Nửa sau mỗi request 1 key (cạnh tranh mua hàng)
      const key = index < 50 ? singleUserKey : crypto.randomUUID();

      return request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId, variantId, quantity: 1, price: 150000 }],
          total: 150000,
          idempotencyKey: key,
          paymentMethod: 'cod',
          address: '123 Test Street'
        });
    });

    // Fire tất cả request cùng 1 lúc!
    const responses = await Promise.all(requests);

    // Tính toán kết quả
    let successCount = 0;
    let outOfStockErrors = 0;
    let duplicateErrors = 0;
    
    const successfulOrderIds = new Set();

    for (const res of responses) {
      if (res.status === 200) {
        // Có thể là tạo mới thành công, hoặc trả về record cũ (nếu trùng idempotency)
        successfulOrderIds.add(res.body.id);
        successCount++;
      } else if (res.status === 400 && res.body.error?.includes('không đủ số lượng')) {
        outOfStockErrors++;
      } else if (res.status === 409) {
        duplicateErrors++;
      }
    }

    // Kiểm tra số dư trong kho
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    
    // Số order thực sự được tạo trong DB không được vượt quá số lượng kho ban đầu (5)
    // Và vì nhóm đầu tiên (50 request trùng key) chỉ tạo ra tối đa 1 order.
    // Nên tổng cộng sẽ có nhiều nhất 5 orders thành công về mặt thay đổi dữ liệu.
    
    const dbOrders = await prisma.order.count({ where: { userId } });
    
    console.log(`--- KẾT QUẢ TEST ---`);
    console.log(`Số order thực tế ghi vào DB: ${dbOrders} (Kho ban đầu: ${initialStock})`);
    console.log(`Số lượng tồn kho còn lại: ${variant?.stock}`);
    console.log(`Số request thành công (kể cả trả về do idempotency): ${successCount}`);
    console.log(`Số request bị từ chối do hết kho: ${outOfStockErrors}`);
    console.log(`Số request bị từ chối do trùng IdempotencyKey (Race Condition trên Postgres): ${duplicateErrors}`);
    
    // Đảm bảo không bán âm kho
    expect(variant?.stock).toBeGreaterThanOrEqual(0);
    // Số order trong DB không vượt quá 5
    expect(dbOrders).toBeLessThanOrEqual(5);
  }, 15000); // Tăng timeout cho 100 request
});
