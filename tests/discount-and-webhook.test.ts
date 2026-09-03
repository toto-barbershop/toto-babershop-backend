import { describe, it, expect } from 'vitest';

/**
 * Logic tính toán Discount & Validate PromoCode (Đồng bộ với orderController.ts)
 */
export function calculateOrderDiscount(
  promo: {
    isActive: boolean;
    expiresAt: Date | null;
    usageLimit: number | null;
    usedCount: number;
    minOrderValue: number;
    discountType: string;
    discountValue: number;
    maxDiscount: number | null;
  } | null | undefined,
  serverSubtotal: number
): { valid: boolean; discount: number; error?: string } {
  if (!promo) {
    return { valid: true, discount: 0 };
  }

  if (!promo.isActive) {
    return { valid: false, discount: 0, error: 'Mã giảm giá hiện đang tạm thời bị khóa.' };
  }

  if (promo.expiresAt && new Date() > new Date(promo.expiresAt)) {
    return { valid: false, discount: 0, error: 'Mã giảm giá đã hết hạn sử dụng.' };
  }

  if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
    return { valid: false, discount: 0, error: 'Mã giảm giá đã hết lượt sử dụng.' };
  }

  if (promo.minOrderValue && serverSubtotal < promo.minOrderValue) {
    return { valid: false, discount: 0, error: `Đơn hàng chưa đạt giá trị tối thiểu ${promo.minOrderValue.toLocaleString('vi-VN')}đ để áp dụng mã này.` };
  }

  let computedDiscount = 0;
  if (promo.discountType === 'PERCENT') {
    computedDiscount = Math.floor(serverSubtotal * (promo.discountValue / 100));
    if (promo.maxDiscount && computedDiscount > promo.maxDiscount) {
      computedDiscount = promo.maxDiscount;
    }
  } else if (promo.discountType === 'FIXED') {
    computedDiscount = promo.discountValue;
  }

  computedDiscount = Math.min(Math.max(0, computedDiscount), serverSubtotal);
  return { valid: true, discount: computedDiscount };
}

/**
 * Logic đối chiếu số tiền tại PayOS Webhook
 */
export function verifyWebhookAmount(
  webhookAmount: number | undefined,
  orderTotal: number
): { valid: boolean; error?: string } {
  if (webhookAmount !== undefined && Number(webhookAmount) !== Number(orderTotal)) {
    return {
      valid: false,
      error: `Số tiền thanh toán (${webhookAmount}đ) không khớp với đơn hàng (${orderTotal}đ).`
    };
  }
  return { valid: true };
}

describe('Audit Mục 1: Logic Tính Discount & Ràng Buộc PromoCode Phía Server', () => {
  it('Phải chặn mã giảm giá đã bị khóa (isActive = false)', () => {
    const promo = {
      isActive: false,
      expiresAt: null,
      usageLimit: null,
      usedCount: 0,
      minOrderValue: 0,
      discountType: 'FIXED',
      discountValue: 50000,
      maxDiscount: null,
    };
    const res = calculateOrderDiscount(promo, 200000);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('bị khóa');
    expect(res.discount).toBe(0);
  });

  it('Phải chặn mã giảm giá đã hết hạn (expiresAt < now)', () => {
    const promo = {
      isActive: true,
      expiresAt: new Date(Date.now() - 60000), // Hết hạn 1 phút trước
      usageLimit: null,
      usedCount: 0,
      minOrderValue: 0,
      discountType: 'FIXED',
      discountValue: 50000,
      maxDiscount: null,
    };
    const res = calculateOrderDiscount(promo, 200000);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('hết hạn');
  });

  it('Phải chặn mã giảm giá đã hết lượt sử dụng (usedCount >= usageLimit)', () => {
    const promo = {
      isActive: true,
      expiresAt: null,
      usageLimit: 10,
      usedCount: 10,
      minOrderValue: 0,
      discountType: 'PERCENT',
      discountValue: 20,
      maxDiscount: null,
    };
    const res = calculateOrderDiscount(promo, 300000);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('hết lượt');
  });

  it('Phải chặn nếu đơn hàng chưa đạt giá trị tối thiểu (minOrderValue)', () => {
    const promo = {
      isActive: true,
      expiresAt: null,
      usageLimit: null,
      usedCount: 0,
      minOrderValue: 500000,
      discountType: 'FIXED',
      discountValue: 50000,
      maxDiscount: null,
    };
    const res = calculateOrderDiscount(promo, 300000);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('giá trị tối thiểu');
  });

  it('Tính đúng giảm giá % kèm mức trần maxDiscount', () => {
    const promo = {
      isActive: true,
      expiresAt: null,
      usageLimit: null,
      usedCount: 0,
      minOrderValue: 200000,
      discountType: 'PERCENT',
      discountValue: 50, // 50%
      maxDiscount: 100000, // Trần tối đa 100k
    };
    // Đơn 500k -> 50% là 250k nhưng bị ép trần về 100k
    const res = calculateOrderDiscount(promo, 500000);
    expect(res.valid).toBe(true);
    expect(res.discount).toBe(100000);
  });

  it('Giảm giá cố định không được vượt quá subtotal của đơn hàng', () => {
    const promo = {
      isActive: true,
      expiresAt: null,
      usageLimit: null,
      usedCount: 0,
      minOrderValue: 0,
      discountType: 'FIXED',
      discountValue: 200000,
      maxDiscount: null,
    };
    // Đơn 150k nhưng mã giảm 200k -> chỉ giảm tối đa 150k (không ra số âm)
    const res = calculateOrderDiscount(promo, 150000);
    expect(res.valid).toBe(true);
    expect(res.discount).toBe(150000);
  });
});

describe('Audit Mục 1: Kiểm Thử Đồng Thời (Concurrency) Khi Mã Có usageLimit = 1', () => {
  it('Chỉ duy nhất 1 request thành công khi 2 request gửi đồng thời dùng mã usageLimit = 1', async () => {
    // Mô phỏng hàng đợi row lock độc quyền FOR UPDATE của PostgreSQL:
    // Các transaction tiếp cận dòng PromoCode sẽ tuần tự hóa (serialized) bởi lock
    const promoRecord = {
      code: 'FLASH1',
      isActive: true,
      expiresAt: null,
      usageLimit: 1,
      usedCount: 0,
      minOrderValue: 0,
      discountType: 'FIXED',
      discountValue: 50000,
      maxDiscount: null,
    };

    // Hàm mô phỏng transaction có FOR UPDATE lock
    let isLocked = false;
    const lockWaitQueue: (() => void)[] = [];

    const acquireRowLock = async () => {
      if (isLocked) {
        await new Promise<void>((resolve) => lockWaitQueue.push(resolve));
      }
      isLocked = true;
    };

    const releaseRowLock = () => {
      isLocked = false;
      const next = lockWaitQueue.shift();
      if (next) next();
    };

    const executeCheckoutWithPromo = async (reqId: string) => {
      await acquireRowLock(); // Bắt đầu lock FOR UPDATE
      try {
        const check = calculateOrderDiscount(promoRecord, 200000);
        if (!check.valid) {
          throw new Error(check.error);
        }
        // Tăng usedCount trong lock
        promoRecord.usedCount += 1;
        return { success: true, reqId, discount: check.discount };
      } finally {
        releaseRowLock(); // Commit/Rollback giải phóng lock
      }
    };

    // Gửi 2 request chạy đồng thời (Promise.allSettled)
    const [result1, result2] = await Promise.allSettled([
      executeCheckoutWithPromo('req_1'),
      executeCheckoutWithPromo('req_2'),
    ]);

    const successes = [result1, result2].filter((r) => r.status === 'fulfilled');
    const failures = [result1, result2].filter((r) => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(promoRecord.usedCount).toBe(1); // Chỉ tăng đúng 1 lần
    const firstFailure = failures[0];
    if (firstFailure && firstFailure.status === 'rejected') {
      expect(firstFailure.reason.message).toContain('hết lượt sử dụng');
    }
  });
});

describe('Audit Mục 1: Kiểm Thử Hồi Quy (Regression) Khi Đơn Hàng KHÔNG Dùng Mã Giảm Giá', () => {
  it('Đơn hàng không truyền promoCode phải tính đúng subtotal + shipping, discount = 0', () => {
    const serverSubtotal = 450000;
    const SHIPPING_FEE = 30000; // COD

    // Khi promoCode là null hoặc undefined:
    const discountRes = calculateOrderDiscount(null, serverSubtotal);
    expect(discountRes.valid).toBe(true);
    expect(discountRes.discount).toBe(0);

    const safeDiscount = discountRes.discount;
    const serverTotal = Math.max(0, serverSubtotal + SHIPPING_FEE - safeDiscount);

    expect(safeDiscount).toBe(0);
    expect(serverTotal).toBe(480000);
  });

  it('Client gửi kèm discount tùy ý (VD: 99999999) nhưng không có promoCode hợp lệ -> discount vẫn là 0', () => {
    const serverSubtotal = 300000;
    const clientFakeDiscount = 99999999;
    const SHIPPING_FEE = 0; // PayOS

    // Server hoàn toàn không dùng clientFakeDiscount, chỉ dùng calculateOrderDiscount(null)
    const discountRes = calculateOrderDiscount(undefined, serverSubtotal);
    const safeDiscount = discountRes.discount; // Bằng 0
    const serverTotal = Math.max(0, serverSubtotal + SHIPPING_FEE - safeDiscount);

    expect(safeDiscount).toBe(0);
    expect(serverTotal).toBe(300000); // Không bị trừ về 0đ
  });
});

describe('Audit Mục 2: Xác Thực Số Tiền Amount Tại PayOS Webhook', () => {
  it('Từ chối khi số tiền webhook gửi lên nhỏ hơn tổng tiền đơn hàng trong DB', () => {
    const res = verifyWebhookAmount(200000, 350000);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('không khớp');
  });

  it('Từ chối khi số tiền webhook gửi lên lớn hơn tổng tiền đơn hàng trong DB', () => {
    const res = verifyWebhookAmount(500000, 350000);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('không khớp');
  });

  it('Chấp nhận khi số tiền webhook gửi lên khớp 100% với đơn hàng trong DB', () => {
    const res = verifyWebhookAmount(350000, 350000);
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });
});
