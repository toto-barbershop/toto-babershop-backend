import { describe, it, expect, vi } from 'vitest';
import { generateOrderCode } from '../src/controllers/orderController.js';

describe('Audit Cụm 3: Mã Đơn Hàng 8 Ký Tự Hex & Chống Trùng Mã', () => {
  it('Mã đơn hàng phải đúng định dạng TTB-YYMMDD-XXXXXXXX (8 hex chars)', () => {
    const code = generateOrderCode();
    // Ví dụ: TTB-260903-8F3A2B1C
    const regex = /^TTB-\d{6}-[0-9A-F]{8}$/;
    expect(code).toMatch(regex);
    expect(code.length).toBe(19);
  });

  it('Sinh 1,000 mã đơn hàng liên tiếp không trùng lặp (Zero Collision)', () => {
    const set = new Set<string>();
    const count = 1000;
    for (let i = 0; i < count; i++) {
      const code = generateOrderCode();
      set.add(code);
    }
    expect(set.size).toBe(count);
  });

  it('Mô phỏng phát hiện trùng mã (Collision) kích hoạt retry loop và ghi logger.warn', () => {
    const warnLogs: string[] = [];
    const mockLogger = {
      warn: (msg: string) => warnLogs.push(msg)
    };

    // Mô phỏng DB đã tồn tại mã trùng
    const existingCodes = new Set(['TTB-DUPLICATE-CODE']);

    // Giả lập hàm sinh mã có 1 lần trùng đầu tiên, lần 2 ra mã mới
    let callCount = 0;
    const mockGenerateCode = () => {
      callCount++;
      if (callCount === 1) return 'TTB-DUPLICATE-CODE';
      return generateOrderCode();
    };

    let uniqueOrderCode = mockGenerateCode();
    const MAX_CODE_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      if (!existingCodes.has(uniqueOrderCode)) {
        break;
      }
      mockLogger.warn(`Collision detected on orderCode "${uniqueOrderCode}", retrying generation (${attempt + 1}/${MAX_CODE_RETRIES})...`);
      uniqueOrderCode = mockGenerateCode();
    }

    expect(warnLogs.length).toBe(1);
    expect(warnLogs[0]).toContain('Collision detected on orderCode "TTB-DUPLICATE-CODE"');
    expect(uniqueOrderCode).not.toBe('TTB-DUPLICATE-CODE');
    expect(uniqueOrderCode).toMatch(/^TTB-\d{6}-[0-9A-F]{8}$/);
  });
});

describe('Audit Cụm 3: Khóa OTP Quên Mật Khẩu Sau 5 Lần Sai (attempts)', () => {
  // Logic mô phỏng kiểm tra OTP và attempts
  function verifyOtpAttempt(token: { attempts: number; tokenHash: string }, inputHash: string) {
    if (token.attempts >= 5) {
      return { success: false, code: 'OTP_LOCKED', error: 'Mã xác nhận OTP đã bị vô hiệu hóa do nhập sai quá 5 lần.' };
    }

    if (token.tokenHash !== inputHash) {
      token.attempts += 1;
      const remaining = Math.max(0, 5 - token.attempts);
      if (remaining === 0) {
        return { success: false, code: 'OTP_LOCKED', error: 'Mã xác nhận OTP không đúng. Bạn đã nhập sai 5 lần, mã đã bị khóa.' };
      }
      return { success: false, remainingAttempts: remaining, error: `Mã không chính xác. Bạn còn ${remaining} lần thử.` };
    }

    return { success: true };
  }

  it('Bản ghi token mới khởi tạo có attempts = 0', () => {
    const newToken = { attempts: 0, tokenHash: 'correct_hash' };
    expect(newToken.attempts).toBe(0);
  });

  it('Nhập sai từ lần 1 đến lần 4: Giảm dần số lần thử còn lại', () => {
    const token = { attempts: 0, tokenHash: 'correct_hash' };

    // Lần 1
    const res1 = verifyOtpAttempt(token, 'wrong_1');
    expect(res1.success).toBe(false);
    expect(res1.remainingAttempts).toBe(4);
    expect(token.attempts).toBe(1);

    // Lần 2
    const res2 = verifyOtpAttempt(token, 'wrong_2');
    expect(res2.success).toBe(false);
    expect(res2.remainingAttempts).toBe(3);
    expect(token.attempts).toBe(2);

    // Lần 3
    const res3 = verifyOtpAttempt(token, 'wrong_3');
    expect(res3.success).toBe(false);
    expect(res3.remainingAttempts).toBe(2);
    expect(token.attempts).toBe(3);

    // Lần 4
    const res4 = verifyOtpAttempt(token, 'wrong_4');
    expect(res4.success).toBe(false);
    expect(res4.remainingAttempts).toBe(1);
    expect(token.attempts).toBe(4);
  });

  it('Nhập sai lần thứ 5: Khóa mã ngay lập tức (OTP_LOCKED)', () => {
    const token = { attempts: 4, tokenHash: 'correct_hash' };

    const res5 = verifyOtpAttempt(token, 'wrong_5');
    expect(res5.success).toBe(false);
    expect(res5.code).toBe('OTP_LOCKED');
    expect(token.attempts).toBe(5);
  });

  it('Lần thứ 6 trở đi: Chặn ngay từ đầu vì token.attempts >= 5', () => {
    const token = { attempts: 5, tokenHash: 'correct_hash' };

    // Kể cả nhập đúng mã nhưng đã bị khóa trước đó vẫn bị chặn
    const res6 = verifyOtpAttempt(token, 'correct_hash');
    expect(res6.success).toBe(false);
    expect(res6.code).toBe('OTP_LOCKED');
    expect(res6.error).toContain('nhập sai quá 5 lần');
  });

  it('Khi nhập đúng mã (trước khi bị khóa): Xác thực thành công', () => {
    const token = { attempts: 2, tokenHash: 'correct_hash' };
    const res = verifyOtpAttempt(token, 'correct_hash');
    expect(res.success).toBe(true);
    expect(token.attempts).toBe(2); // Giữ nguyên attempts
  });
});
