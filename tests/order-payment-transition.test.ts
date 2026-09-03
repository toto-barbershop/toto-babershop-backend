import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/index.js';
import { prisma } from '../src/config/db.js';
import { validatePaymentTransition } from '../src/controllers/orderController.js';

describe('Payment Status State Machine & Audit Log Tests (Hướng A)', () => {
  let adminToken: string;
  let customerToken: string;
  let adminUserId: number;
  let customerUserId: number;
  let testProductId: number;
  let testVariantId: number;

  beforeAll(async () => {
    // 1. Tạo test Admin user
    const adminUser = await prisma.user.create({
      data: {
        email: `admin-test-${Date.now()}@test.com`,
        password: 'password123',
        name: 'Admin Test',
        role: 'ADMIN'
      }
    });
    adminUserId = adminUser.id;

    // 2. Tạo test Customer user
    const customerUser = await prisma.user.create({
      data: {
        email: `customer-test-${Date.now()}@test.com`,
        password: 'password123',
        name: 'Customer Test',
        role: 'CUSTOMER'
      }
    });
    customerUserId = customerUser.id;

    const secret = process.env.JWT_SECRET || 'testsecret';
    adminToken = jwt.sign({ id: adminUserId, email: adminUser.email, role: 'ADMIN', tokenVersion: 1 }, secret, { expiresIn: '1h' });
    customerToken = jwt.sign({ id: customerUserId, email: customerUser.email, role: 'CUSTOMER', tokenVersion: 1 }, secret, { expiresIn: '1h' });

    // 3. Tạo test Product & Variant
    const product = await prisma.product.create({
      data: {
        name: `Test Transition Product ${Date.now()}`,
        slug: `test-transition-product-${Date.now()}`,
        basePrice: 200000,
        category: 'Wax',
        variants: {
          create: [{
            price: 200000,
            stock: 20,
            sku: `TRANS-${Date.now()}`,
          }]
        }
      },
      include: { variants: true }
    });
    testProductId = product.id;
    testVariantId = product.variants[0]!.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.orderStatusHistory.deleteMany({
      where: { order: { userId: customerUserId } }
    });
    await prisma.orderItem.deleteMany({
      where: { order: { userId: customerUserId } }
    });
    await prisma.order.deleteMany({
      where: { userId: customerUserId }
    });
    await prisma.productVariant.deleteMany({
      where: { productId: testProductId }
    });
    await prisma.product.deleteMany({
      where: { id: testProductId }
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminUserId, customerUserId] } }
    });
    await prisma.$disconnect();
  });

  // ============================================================
  // Test 1: Unit Test cho hàm validatePaymentTransition
  // ============================================================
  describe('Unit Test: validatePaymentTransition matrix', () => {
    it('cho phép giữ nguyên paymentStatus (current === target)', () => {
      const res = validatePaymentTransition('CANCELLED', 'COD_UNPAID', 'COD_UNPAID', 'COD');
      expect(res.isValid).toBe(true);
    });

    it('khóa 100% khi đơn CANCELLED mà current là COD_UNPAID (kể cả sang REFUNDED)', () => {
      const res1 = validatePaymentTransition('CANCELLED', 'COD_UNPAID', 'REFUNDED', 'COD');
      expect(res1.isValid).toBe(false);

      const res2 = validatePaymentTransition('CANCELLED', 'COD_UNPAID', 'COD_COLLECTED', 'COD');
      expect(res2.isValid).toBe(false);
    });

    it('cho phép CANCELLED chuyển sang REFUNDED nếu trước đó là PAID', () => {
      const res = validatePaymentTransition('CANCELLED', 'PAID', 'REFUNDED', 'PAYOS');
      expect(res.isValid).toBe(true);
    });

    it('cấm COMPLETED chuyển ngược về UNPAID hoặc COD_UNPAID', () => {
      const res1 = validatePaymentTransition('COMPLETED', 'PAID', 'UNPAID', 'PAYOS');
      expect(res1.isValid).toBe(false);

      const res2 = validatePaymentTransition('COMPLETED', 'COD_COLLECTED', 'COD_UNPAID', 'COD');
      expect(res2.isValid).toBe(false);
    });

    it('cho phép COMPLETED đơn COD_UNPAID chuyển sang COD_COLLECTED', () => {
      const res = validatePaymentTransition('COMPLETED', 'COD_UNPAID', 'COD_COLLECTED', 'COD');
      expect(res.isValid).toBe(true);
    });

    it('cấm đơn PENDING/PROCESSING COD chuyển sang COD_COLLECTED khi chưa giao', () => {
      const res = validatePaymentTransition('PROCESSING', 'COD_UNPAID', 'COD_COLLECTED', 'COD');
      expect(res.isValid).toBe(false);
    });

    it('quy tắc toàn cục A: cấm REFUNDED mọi trạng thái nếu chưa từng thu tiền (UNPAID hoặc COD_UNPAID)', () => {
      expect(validatePaymentTransition('SHIPPED', 'COD_UNPAID', 'REFUNDED', 'COD').isValid).toBe(false);
      expect(validatePaymentTransition('PROCESSING', 'UNPAID', 'REFUNDED', 'PAYOS').isValid).toBe(false);
      expect(validatePaymentTransition('PENDING', 'COD_UNPAID', 'REFUNDED', 'COD').isValid).toBe(false);
      expect(validatePaymentTransition('DELIVERY_FAILED', 'COD_UNPAID', 'REFUNDED', 'COD').isValid).toBe(false);
    });

    it('quy tắc toàn cục B: cấm revert PAID/COD_COLLECTED về UNPAID/COD_UNPAID ở mọi trạng thái', () => {
      expect(validatePaymentTransition('SHIPPED', 'COD_COLLECTED', 'COD_UNPAID', 'COD').isValid).toBe(false);
      expect(validatePaymentTransition('PROCESSING', 'PAID', 'UNPAID', 'PAYOS').isValid).toBe(false);
      expect(validatePaymentTransition('DELIVERY_FAILED', 'PAID', 'UNPAID', 'PAYOS').isValid).toBe(false);
    });

    it('quy tắc toàn cục C: cấm sửa bất kỳ trạng thái nào nếu đã REFUNDED', () => {
      expect(validatePaymentTransition('CANCELLED', 'REFUNDED', 'PAID', 'PAYOS').isValid).toBe(false);
      expect(validatePaymentTransition('COMPLETED', 'REFUNDED', 'COD_COLLECTED', 'COD').isValid).toBe(false);
    });
  });

  // ============================================================
  // Test 2: Yêu cầu của User:
  // Gửi đồng thời { status: 'CANCELLED', paymentStatus: 'REFUNDED' }
  // vào đơn đang PROCESSING + COD_UNPAID -> kỳ vọng 422
  // ============================================================
  it('Yêu cầu 3: Gửi đồng thời status CANCELLED và paymentStatus REFUNDED vào đơn PROCESSING + COD_UNPAID -> kỳ vọng 422', async () => {
    // Tạo đơn PROCESSING + COD_UNPAID
    const order = await prisma.order.create({
      data: {
        userId: customerUserId,
        orderCode: `TEST-CANCEL-REFUND-${Date.now()}`,
        status: 'PROCESSING',
        paymentStatus: 'COD_UNPAID',
        paymentMethod: 'COD',
        total: 200000,
        items: {
          create: [{
            productId: testProductId,
            variantId: testVariantId,
            quantity: 1,
            price: 200000
          }]
        }
      }
    });

    const res = await request(app)
      .put(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'CANCELLED',
        paymentStatus: 'REFUNDED',
        cancelReason: 'Test cancel and refund'
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('chưa từng phát sinh thanh toán');
  });

  // ============================================================
  // Test 3: Test hồi quy:
  // Gửi { status: 'PROCESSING' } (không kèm paymentStatus)
  // vào đơn PENDING -> kỳ vọng 200 thành công bình thường
  // ============================================================
  it('Yêu cầu 4 (Hồi quy): Gửi status PROCESSING (không kèm paymentStatus) vào đơn PENDING -> kỳ vọng 200 thành công', async () => {
    const order = await prisma.order.create({
      data: {
        userId: customerUserId,
        orderCode: `TEST-REGRESS-PENDING-${Date.now()}`,
        status: 'PENDING',
        paymentStatus: 'COD_UNPAID',
        paymentMethod: 'COD',
        total: 200000,
        items: {
          create: [{
            productId: testProductId,
            variantId: testVariantId,
            quantity: 1,
            price: 200000
          }]
        }
      }
    });

    const res = await request(app)
      .put(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'PROCESSING'
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PROCESSING');
    expect(res.body.paymentStatus).toBe('COD_UNPAID');
  });

  // ============================================================
  // Test 4: Gửi paymentStatus COD_COLLECTED vào đơn đã CANCELLED + COD_UNPAID
  // (chỉ gửi paymentStatus, không kèm status) -> kỳ vọng 422
  // ============================================================
  it('Chặn 422 khi chỉ gửi paymentStatus COD_COLLECTED vào đơn đã CANCELLED + COD_UNPAID', async () => {
    const order = await prisma.order.create({
      data: {
        userId: customerUserId,
        orderCode: `TEST-CANCELLED-COD-${Date.now()}`,
        status: 'CANCELLED',
        paymentStatus: 'COD_UNPAID',
        paymentMethod: 'COD',
        total: 200000,
        items: {
          create: [{
            productId: testProductId,
            variantId: testVariantId,
            quantity: 1,
            price: 200000
          }]
        }
      }
    });

    const res = await request(app)
      .put(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paymentStatus: 'COD_COLLECTED'
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('Hủy');
  });

  // ============================================================
  // Test 5: Cho phép REFUNDED cho đơn CANCELLED + PAID (Online)
  // và kiểm tra Audit Log được ghi nhận vào OrderStatusHistory
  // ============================================================
  it('Cho phép REFUNDED cho đơn CANCELLED + PAID và tự động ghi Audit Log', async () => {
    const order = await prisma.order.create({
      data: {
        userId: customerUserId,
        orderCode: `TEST-CANCELLED-PAID-${Date.now()}`,
        status: 'CANCELLED',
        paymentStatus: 'PAID',
        paymentMethod: 'PAYOS',
        total: 200000,
        items: {
          create: [{
            productId: testProductId,
            variantId: testVariantId,
            quantity: 1,
            price: 200000
          }]
        }
      }
    });

    const res = await request(app)
      .put(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paymentStatus: 'REFUNDED'
      });

    expect(res.status).toBe(200);
    expect(res.body.paymentStatus).toBe('REFUNDED');

    // Kiểm tra OrderStatusHistory
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id }
    });
    expect(history.length).toBeGreaterThan(0);
    const lastLog = history[history.length - 1];
    expect(lastLog!.note).toContain('PAID ➔ REFUNDED');
  });

  // ============================================================
  // Test 6: Cấm COMPLETED + PAID chuyển ngược về UNPAID -> kỳ vọng 422
  // ============================================================
  it('Chặn 422 khi chuyển COMPLETED + PAID ngược về UNPAID', async () => {
    const order = await prisma.order.create({
      data: {
        userId: customerUserId,
        orderCode: `TEST-COMPLETED-UNPAID-${Date.now()}`,
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        paymentMethod: 'PAYOS',
        total: 200000,
        items: {
          create: [{
            productId: testProductId,
            variantId: testVariantId,
            quantity: 1,
            price: 200000
          }]
        }
      }
    });

    const res = await request(app)
      .put(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paymentStatus: 'UNPAID'
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('chưa thanh toán');
  });

  // ============================================================
  // Test 7: Quy tắc toàn cục - Chặn 422 khi đơn đang SHIPPED + COD_COLLECTED
  // cố tình revert về COD_UNPAID (không chỉ áp dụng cho COMPLETED)
  // ============================================================
  it('Quy tắc toàn cục: Chặn 422 khi đơn SHIPPED + COD_COLLECTED cố tình revert về COD_UNPAID', async () => {
    const order = await prisma.order.create({
      data: {
        userId: customerUserId,
        orderCode: `TEST-SHIPPED-REVERT-${Date.now()}`,
        status: 'SHIPPED',
        paymentStatus: 'COD_COLLECTED',
        paymentMethod: 'COD',
        total: 200000,
        items: {
          create: [{
            productId: testProductId,
            variantId: testVariantId,
            quantity: 1,
            price: 200000
          }]
        }
      }
    });

    const res = await request(app)
      .put(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paymentStatus: 'COD_UNPAID'
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('chưa thanh toán');
  });

  // ============================================================
  // Test 8: Quy tắc toàn cục - Chặn 422 khi đơn đang PROCESSING + COD_UNPAID
  // cố tình đổi sang REFUNDED (không chỉ áp dụng cho CANCELLED)
  // ============================================================
  it('Quy tắc toàn cục: Chặn 422 khi đơn PROCESSING + COD_UNPAID cố tình đổi sang REFUNDED', async () => {
    const order = await prisma.order.create({
      data: {
        userId: customerUserId,
        orderCode: `TEST-PROCESSING-REFUND-${Date.now()}`,
        status: 'PROCESSING',
        paymentStatus: 'COD_UNPAID',
        paymentMethod: 'COD',
        total: 200000,
        items: {
          create: [{
            productId: testProductId,
            variantId: testVariantId,
            quantity: 1,
            price: 200000
          }]
        }
      }
    });

    const res = await request(app)
      .put(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paymentStatus: 'REFUNDED'
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('chưa từng phát sinh thanh toán');
  });
});
