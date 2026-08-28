export const isValidEmail = (email: string): boolean => {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

export const isValidPhone = (phone: string): boolean => {
  if (!phone) return false;
  return /^(0[3|5|7|8|9])+([0-9]{8})$/.test(phone.trim());
};

// Danh sách các tên miền hay bị gõ nhầm chính tả
const TYPO_DOMAINS = new Set<string>([
  'gmai.com',
  'gamil.com',
  'gmial.com',
  'gmail.con',
  'gmaill.com',
  'gmal.com',
  'gmaik.com',
  'gemail.com',
  'yahooo.com',
  'yaho.com',
  'hotmial.com',
  'hotmaill.com',
  'outlok.com',
  'outloock.com',
  'iclod.com',
  'icloud.con',
]);

// Danh sách các tên miền email rác / dùng 1 lần phổ biến
const DISPOSABLE_DOMAINS = new Set<string>([
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getairmail.com',
  'dispostable.com',
  'fakeinbox.com',
]);

/**
 * Kiểm tra địa chỉ email có an toàn và đạt tiêu chuẩn gửi mail không (Chống Bounce & Khóa Gmail)
 */
export const isSafeDeliverableEmail = (
  email: string
): { safe: boolean; reason?: string } => {
  if (!email || typeof email !== 'string') {
    return { safe: false, reason: 'Email rỗng hoặc không đúng định dạng chuỗi' };
  }

  const cleanEmail = email.trim().toLowerCase();

  // 1. Kiểm tra cấu trúc cơ bản
  if (!isValidEmail(cleanEmail)) {
    return { safe: false, reason: 'Cấu trúc email không hợp lệ (thiếu @ hoặc domain)' };
  }

  const parts = cleanEmail.split('@');
  if (parts.length !== 2) {
    return { safe: false, reason: 'Email chứa nhiều ký tự @' };
  }

  const username = parts[0];
  const domain = parts[1];

  if (!username || !domain) {
    return { safe: false, reason: 'Email thiếu tên người dùng hoặc tên miền' };
  }

  // 2. Chặn các tên miền gõ sai chính tả phổ biến
  if (TYPO_DOMAINS.has(domain)) {
    return { safe: false, reason: `Tên miền '${domain}' nghi ngờ gõ sai chính tả` };
  }

  // 3. Chặn các tên miền email tạm thời / email rác
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { safe: false, reason: `Tên miền '${domain}' thuộc danh sách email rác/tạm thời` };
  }

  // 4. Kiểm tra riêng cho Gmail (quy chuẩn của Google)
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    // Không được chứa dấu chấm liên tiếp ".."
    if (username.includes('..')) {
      return { safe: false, reason: 'Gmail không cho phép hai dấu chấm liền nhau' };
    }
    // Độ dài username Gmail từ 6 đến 30 ký tự (không tính dấu chấm)
    const normalizedUser = username.replace(/\./g, '');
    if (normalizedUser.length < 6 || normalizedUser.length > 30) {
      return {
        safe: false,
        reason: `Tên tài khoản Gmail phải từ 6 đến 30 ký tự (hiện tại: ${normalizedUser.length} ký tự)`,
      };
    }
    // Chỉ được chứa ký tự chữ cái tiếng Anh, số, dấu chấm
    if (!/^[a-z0-9.]+$/.test(username)) {
      return { safe: false, reason: 'Gmail chỉ cho phép chữ cái tiếng Anh, số và dấu chấm' };
    }
  }

  return { safe: true };
};
