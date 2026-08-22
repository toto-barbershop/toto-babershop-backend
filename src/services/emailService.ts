import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';
import { prisma } from '../config/db.js';

interface ContactInfo {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  hours: string;
  website: string;
}

/**
 * Lấy thông tin liên hệ động trực tiếp từ bảng Settings của Admin trong database
 */
const getDynamicContactInfo = async (): Promise<ContactInfo> => {
  try {
    const settings = await prisma.setting.findMany();
    const settingsMap = settings.reduce((acc: any, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});

    const businessName = settingsMap.business?.name || 'ToTo Barbershop';
    const address = settingsMap.contact?.address || '123 Nguyễn Trãi, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh';
    const phone = settingsMap.contact?.phone || '090 987 6543';
    const email = settingsMap.contact?.email || 'totobaberadmin@gmail.com';
    const hours = settingsMap.contact?.hours || '08:30 - 20:30 (Tất cả các ngày trong tuần)';
    const website = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'https://totobarbershop.vn';

    return {
      businessName,
      address,
      phone,
      email,
      hours,
      website,
    };
  } catch (error) {
    return {
      businessName: 'ToTo Barbershop',
      address: '123 Nguyễn Trãi, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh',
      phone: '090 987 6543',
      email: 'totobaberadmin@gmail.com',
      hours: '08:30 - 20:30 (Tất cả các ngày trong tuần)',
      website: 'https://totobarbershop.vn',
    };
  }
};

const getTransporter = () => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
};

const getFromAddress = () => {
  const name = process.env.SMTP_FROM_NAME || 'ToTo Barbershop';
  const email = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'no-reply@totobarbershop.vn';
  return `"${name}" <${email}>`;
};

// Cấu hình địa chỉ gửi / nhận để tối ưu độ tin cậy SPF/DKIM của Gmail
const NO_REPLY_ADDRESS = `"${process.env.SMTP_FROM_NAME || 'ToTo Barbershop'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'totobaberadmin@gmail.com'}>`;


const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

/**
 * Footer chuẩn chứa đầy đủ thông tin liên hệ động từ Cài đặt Admin và cảnh báo No-Reply
 */
const getBrandFooterHtml = (info: ContactInfo, showNoReplyNotice: boolean = true) => `
  ${showNoReplyNotice ? `
    <div style="margin: 24px 28px 0 28px; padding: 12px 16px; background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; font-size: 12px; color: #991b1b; text-align: center; line-height: 1.5;">
      🚫 <strong>LƯU Ý:</strong> Đây là email tự động gửi từ hệ thống. Quý khách vui lòng <strong>không trả lời (reply)</strong> trực tiếp email này. Nếu cần hỗ trợ, xin vui lòng liên hệ hotline hoặc thông tin bên dưới.
    </div>
  ` : ''}

  <div style="background: #101715; color: #9ca3af; padding: 32px 28px; margin-top: 28px; border-top: 2px solid #287565; text-align: center;">
    <h3 style="color: #ffffff; margin: 0 0 4px 0; font-size: 18px; text-transform: uppercase; letter-spacing: 2px; font-weight: 800;">${info.businessName}</h3>
    <p style="color: #287565; margin: 0 0 20px 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Gentlemen's Grooming &amp; Culture</p>
    
    <div style="font-size: 13px; line-height: 1.8; color: #e5e7eb; max-width: 480px; margin: 0 auto; text-align: left; background: #18221f; padding: 18px 22px; border-radius: 12px; border: 1px solid #23332e;">
      <p style="margin: 0 0 8px 0; display: flex; align-items: flex-start;">
        <span style="color: #34d399; margin-right: 8px; font-weight: bold;">📍</span>
        <span><strong>Địa chỉ:</strong> ${info.address}</span>
      </p>
      <p style="margin: 0 0 8px 0; display: flex; align-items: center;">
        <span style="color: #34d399; margin-right: 8px; font-weight: bold;">📞</span>
        <span><strong>Hotline / Zalo:</strong> <a href="tel:${info.phone.replace(/[^0-9+]/g, '')}" style="color: #34d399; text-decoration: none; font-weight: bold;">${info.phone}</a></span>
      </p>
      <p style="margin: 0 0 8px 0; display: flex; align-items: center;">
        <span style="color: #34d399; margin-right: 8px; font-weight: bold;">🌐</span>
        <span><strong>Website:</strong> <a href="${info.website}" style="color: #34d399; text-decoration: none;">${info.website}</a></span>
      </p>
      <p style="margin: 0; display: flex; align-items: center;">
        <span style="color: #34d399; margin-right: 8px; font-weight: bold;">⏰</span>
        <span><strong>Giờ mở cửa:</strong> ${info.hours}</span>
      </p>
    </div>

    <p style="color: #6b7280; font-size: 11px; margin: 20px 0 0 0; line-height: 1.5;">
      © ${new Date().getFullYear()} ${info.businessName}. Tất cả quyền được bảo lưu.
    </p>
  </div>
`;

/**
 * 1. Gửi Email Mã OTP Đặt lại mật khẩu (Có No-Reply & Thông tin shop động)
 */
export const sendPasswordResetEmail = async (toEmail: string, otpCode: string) => {
  const transporter = getTransporter();

  if (!transporter) {
    logger.warn('Chưa cấu hình SMTP_USER / SMTP_PASS trong file .env. Gửi email giả lập.');
    console.log('\n======================================================');
    console.log('⚠️ [DEV MODE] EMAIL ĐẶT LẠI MẬT KHẨU TOTO BARBERSHOP ⚠️');
    console.log('Gửi tới:', toEmail);
    console.log('MÃ OTP CỦA BẠN LÀ:', otpCode);
    console.log('======================================================\n');
    return { success: true, simulated: true };
  }

  const contactInfo = await getDynamicContactInfo();
  const subject = `🔐 Mã xác nhận đặt lại mật khẩu - ${contactInfo.businessName}`;
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
      <div style="background: #101715; padding: 28px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; font-weight: 800;">${contactInfo.businessName}</h1>
        <p style="color: #287565; margin: 6px 0 0 0; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; font-weight: 600;">Gentlemen's Grooming &amp; Culture</p>
      </div>

      <div style="padding: 32px 28px 12px 28px;">
        <h2 style="color: #101715; margin: 0 0 16px 0; font-size: 20px; font-weight: 700;">Yêu cầu đặt lại mật khẩu</h2>
        <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
          Xin chào quý khách,<br>
          Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản liên kết với địa chỉ email này.
        </p>

        <div style="background: #f8faf9; border: 2px dashed #287565; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
          <p style="color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0; font-weight: 600;">Mã xác nhận (OTP 6 số)</p>
          <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #101715; font-family: monospace;">${otpCode}</div>
          <p style="color: #9ca3af; font-size: 12px; margin: 8px 0 0 0;">Mã có hiệu lực trong vòng <strong>15 phút</strong></p>
        </div>

        <p style="color: #ef4444; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0;">
          ⚠️ <strong>Lưu ý bảo mật:</strong> Tuyệt đối không chia sẻ mã này cho bất kỳ ai, kể cả nhân viên của ${contactInfo.businessName}.
        </p>
        <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin: 0;">
          Nếu quý khách không thực hiện yêu cầu này, xin vui lòng bỏ qua email.
        </p>
      </div>

      ${getBrandFooterHtml(contactInfo, true)}
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: getFromAddress(),
      replyTo: NO_REPLY_ADDRESS,
      to: toEmail,
      subject,
      html: htmlContent,
    });
    logger.info(`Đã gửi email OTP đặt lại mật khẩu tới: ${toEmail}`, { messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    logger.error(`Lỗi khi gửi email OTP tới ${toEmail}:`, error);
    throw new Error('Không thể gửi email xác thực. Vui lòng kiểm tra lại cấu hình SMTP của shop.');
  }
};

/**
 * 2. Gửi Email Xác nhận Đơn hàng (Khách hàng + Admin) với thông tin liên hệ động
 */
export const sendOrderEmails = async (
  orderId: number,
  total: number,
  customerEmail: string,
  orderCode?: string,
  customerName?: string,
  shippingAddress?: string,
  items?: Array<{ title?: string; name?: string; quantity: number; price: number }>,
) => {
  const displayCode = orderCode || `TTB-${orderId}`;
  const displayName = customerName || 'Quý khách';
  const displayAddress = shippingAddress || 'Nhận tại cửa hàng / Theo thông tin đơn';
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;

  const transporter = getTransporter();

  if (!transporter) {
    logger.warn('Chưa cấu hình SMTP. Bỏ qua gửi email đơn hàng thực tế (Simulated).');
    console.log(`[SIMULATED ORDER EMAIL] Đơn hàng #${displayCode} - Tổng: ${formatCurrency(total)} - Khách: ${customerEmail}`);
    return;
  }

  const contactInfo = await getDynamicContactInfo();

  // Danh sách sản phẩm dạng bảng HTML
  const itemsHtml = items && items.length > 0
    ? items.map(item => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 14px;">${item.title || item.name || 'Sản phẩm'}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center; font-size: 14px;">x${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-size: 14px; font-weight: 600;">${formatCurrency(item.price * item.quantity)}</td>
        </tr>
      `).join('')
    : '';

  // 1. Email cho Khách hàng (Kèm No-Reply và thông tin liên hệ shop động)
  const customerHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
      <div style="background: #101715; padding: 28px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; font-weight: 800;">${contactInfo.businessName}</h1>
        <p style="color: #287565; margin: 6px 0 0 0; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; font-weight: 600;">Đặt hàng thành công</p>
      </div>

      <div style="padding: 32px 28px 12px 28px;">
        <h2 style="color: #101715; margin: 0 0 12px 0; font-size: 20px; font-weight: 700;">Cảm ơn ${displayName} đã mua sắm!</h2>
        <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
          Đơn hàng của quý khách đã được tiếp nhận thành công. Chúng tôi sẽ nhanh chóng chuẩn bị và liên hệ giao hàng sớm nhất.
        </p>

        <div style="background: #f8faf9; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #e5e7eb;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Mã đơn hàng:</td>
              <td style="padding: 6px 0; font-weight: 700; text-align: right; color: #287565; font-family: monospace; font-size: 16px;">${displayCode}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Người nhận:</td>
              <td style="padding: 6px 0; font-weight: 600; text-align: right; color: #101715; font-size: 14px;">${displayName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Địa chỉ giao:</td>
              <td style="padding: 6px 0; text-align: right; color: #101715; font-size: 14px;">${displayAddress}</td>
            </tr>
          </table>
        </div>

        ${itemsHtml ? `
          <h3 style="color: #101715; font-size: 16px; margin: 0 0 12px 0; font-weight: 700;">Chi tiết sản phẩm</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background: #f3f4f6;">
                <th style="padding: 8px 10px; text-align: left; font-size: 13px; color: #4b5563;">Sản phẩm</th>
                <th style="padding: 8px 10px; text-align: center; font-size: 13px; color: #4b5563;">SL</th>
                <th style="padding: 8px 10px; text-align: right; font-size: 13px; color: #4b5563;">Giá</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        ` : ''}

        <div style="border-top: 2px solid #101715; padding-top: 16px; margin-bottom: 8px;">
          <table style="width: 100%;">
            <tr>
              <td style="font-size: 16px; font-weight: 700; color: #101715;">Tổng thanh toán:</td>
              <td style="font-size: 20px; font-weight: 800; color: #287565; text-align: right;">${formatCurrency(total)}</td>
            </tr>
          </table>
        </div>
      </div>

      ${getBrandFooterHtml(contactInfo, true)}
    </div>
  `;

  // 2. Email cho Admin
  const adminHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden;">
      <div style="background: #287565; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; text-transform: uppercase;">🛒 Đơn Hàng Mới: ${displayCode}</h1>
      </div>

      <div style="padding: 28px;">
        <p style="color: #101715; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">Hệ thống vừa ghi nhận một đơn hàng mới từ website:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 130px;">Mã đơn:</td>
            <td style="padding: 8px 0; font-weight: 700; color: #101715;">${displayCode}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Khách hàng:</td>
            <td style="padding: 8px 0; font-weight: 600; color: #101715;">${displayName} (${customerEmail})</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Địa chỉ giao:</td>
            <td style="padding: 8px 0; color: #101715;">${displayAddress}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Tổng giá trị:</td>
            <td style="padding: 8px 0; font-weight: 800; color: #287565; font-size: 18px;">${formatCurrency(total)}</td>
          </tr>
        </table>

        <p style="color: #6b7280; font-size: 13px; margin: 0;">Vui lòng truy cập bảng điều khiển Admin để xem chi tiết và đóng gói giao hàng.</p>
      </div>
    </div>
  `;

  try {
    const promises: Promise<any>[] = [
      transporter.sendMail({
        from: getFromAddress(),
        replyTo: NO_REPLY_ADDRESS,
        to: customerEmail,
        subject: `🧾 Xác nhận đơn hàng ${displayCode} - ${contactInfo.businessName}`,
        html: customerHtml,
      }),
    ];

    if (adminEmail) {
      promises.push(
        transporter.sendMail({
          from: getFromAddress(),
          to: adminEmail,
          subject: `🛒 [ĐƠN MỚI] ${displayCode} - ${displayName} (${formatCurrency(total)})`,
          html: adminHtml,
        }),
      );
    }

    await Promise.all(promises);
    logger.info(`Đã gửi email xác nhận đơn hàng #${displayCode} tới ${customerEmail} và Admin`);
  } catch (error: any) {
    logger.error(`Lỗi khi gửi email đơn hàng #${displayCode}:`, error);
  }
};

/**
 * 3. Gửi Email Thông báo Tin nhắn Liên hệ / Đăng ký Khóa học tới Admin
 */
export const sendContactNotificationEmail = async (
  name: string,
  email: string,
  phone?: string,
  subject?: string,
  message?: string,
) => {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
  const transporter = getTransporter();

  if (!transporter || !adminEmail) {
    return;
  }

  const emailSubject = subject ? `📩 [LIÊN HỆ MỚI] ${subject} - ${name}` : `📩 [LIÊN HỆ MỚI] Tin nhắn từ ${name}`;
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden;">
      <div style="background: #101715; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800;">📩 Khách Hàng Gửi Lời Nhắn Mới</h1>
      </div>
      <div style="padding: 28px;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 120px;">Họ và tên:</td>
            <td style="padding: 8px 0; font-weight: 600; color: #101715;">${name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Email:</td>
            <td style="padding: 8px 0; color: #101715;">${email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Số điện thoại:</td>
            <td style="padding: 8px 0; color: #101715;">${phone || 'Không cung cấp'}</td>
          </tr>
        </table>
        <div style="background: #f8faf9; border-left: 4px solid #287565; padding: 16px; border-radius: 4px; margin-top: 16px;">
          <p style="margin: 0; color: #101715; font-size: 14px; line-height: 1.6;">${message || 'Không có nội dung'}</p>
        </div>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: getFromAddress(),
      to: adminEmail,
      replyTo: `"${name}" <${email}>`, // Admin có thể bấm reply để trả lời thẳng cho khách này
      subject: emailSubject,
      html: htmlContent,
    });
    logger.info(`Đã gửi email thông báo liên hệ tới Admin (${adminEmail})`);
  } catch (error) {
    logger.error('Lỗi khi gửi email thông báo liên hệ tới Admin:', error);
  }
};
