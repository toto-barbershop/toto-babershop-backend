import { describe, it, expect } from 'vitest';
import { validatePaymentTransition } from '../src/controllers/orderController.js';

describe('Audit Cụm 2: Ràng Buộc Hoàn Tiền (REFUNDED) Khi Hủy Đơn PAID & COD_COLLECTED', () => {
  const originStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERY_FAILED'];

  describe('Quy tắc toàn cục: Chặn 100% việc hủy đơn đã thu tiền (PAID hoặc COD_COLLECTED) nếu không có REFUNDED', () => {
    originStatuses.forEach((origin) => {
      it(`[Từ ${origin}] CẤM chuyển sang CANCELLED nếu đơn là PAID mà paymentStatus giữ nguyên PAID`, () => {
        const res = validatePaymentTransition('CANCELLED', 'PAID', 'PAID', 'PAYOS');
        expect(res.isValid).toBe(false);
        expect(res.error).toContain('Đã hoàn tiền');
      });

      it(`[Từ ${origin}] CẤM chuyển sang CANCELLED nếu đơn là COD_COLLECTED mà paymentStatus giữ nguyên COD_COLLECTED`, () => {
        const res = validatePaymentTransition('CANCELLED', 'COD_COLLECTED', 'COD_COLLECTED', 'COD');
        expect(res.isValid).toBe(false);
        expect(res.error).toContain('Đã hoàn tiền');
      });

      it(`[Từ ${origin}] CẤM chuyển sang CANCELLED nếu đơn là PAID/COD_COLLECTED mà cố tình revert về UNPAID/COD_UNPAID`, () => {
        const res1 = validatePaymentTransition('CANCELLED', 'PAID', 'UNPAID', 'PAYOS');
        expect(res1.isValid).toBe(false);

        const res2 = validatePaymentTransition('CANCELLED', 'COD_COLLECTED', 'COD_UNPAID', 'COD');
        expect(res2.isValid).toBe(false);
      });
    });
  });

  describe('Quy tắc toàn cục: CHO PHÉP hủy đơn đã thu tiền khi và chỉ khi paymentStatus chuyển sang REFUNDED', () => {
    it('Cho phép CANCELLED khi chuyển từ PAID sang REFUNDED (PayOS)', () => {
      const res = validatePaymentTransition('CANCELLED', 'PAID', 'REFUNDED', 'PAYOS');
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('Cho phép CANCELLED khi chuyển từ COD_COLLECTED sang REFUNDED (COD)', () => {
      const res = validatePaymentTransition('CANCELLED', 'COD_COLLECTED', 'REFUNDED', 'COD');
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });
  });

  describe('Đơn hàng chưa từng phát sinh thanh toán (UNPAID hoặc COD_UNPAID)', () => {
    it('Cho phép hủy đơn chưa thanh toán mà giữ nguyên UNPAID hoặc COD_UNPAID', () => {
      const resPayos = validatePaymentTransition('CANCELLED', 'UNPAID', 'UNPAID', 'PAYOS');
      expect(resPayos.isValid).toBe(true);

      const resCod = validatePaymentTransition('CANCELLED', 'COD_UNPAID', 'COD_UNPAID', 'COD');
      expect(resCod.isValid).toBe(true);
    });

    it('CẤM gán REFUNDED cho đơn CANCELLED nếu chưa từng thu tiền (UNPAID/COD_UNPAID)', () => {
      const resPayos = validatePaymentTransition('CANCELLED', 'UNPAID', 'REFUNDED', 'PAYOS');
      expect(resPayos.isValid).toBe(false);
      expect(resPayos.error).toContain('chưa từng phát sinh thanh toán');

      const resCod = validatePaymentTransition('CANCELLED', 'COD_UNPAID', 'REFUNDED', 'COD');
      expect(resCod.isValid).toBe(false);
      expect(resCod.error).toContain('chưa từng phát sinh thanh toán');
    });
  });
});
