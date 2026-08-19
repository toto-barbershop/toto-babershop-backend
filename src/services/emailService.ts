import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const sendPasswordResetEmail = async (toEmail: string, otpCode: string) => {
  const subject = 'Mã xác nhận đặt lại mật khẩu - TOTO Barbershop';
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">TOTO Barbershop</h2>
      <p>Xin chào,</p>
      <p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản tại TOTO Barbershop.</p>
      <p>Mã xác nhận (OTP) của bạn là:</p>
      <h1 style="background: #f4f4f4; padding: 10px 20px; letter-spacing: 5px; text-align: center; color: #000; border-radius: 4px;">${otpCode}</h1>
      <p style="color: #666; font-size: 14px;">Mã này sẽ hết hạn sau 15 phút. Tuyệt đối không chia sẻ mã này cho bất kỳ ai.</p>
      <p>Nếu bạn không yêu cầu đặt lại mật khẩu, xin vui lòng bỏ qua email này.</p>
      <p>Trân trọng,<br>Đội ngũ TOTO Barbershop</p>
    </div>
  `;

  if (!resend) {
    console.log('\n======================================================');
    console.log('⚠️ CẢNH BÁO: CHƯA CẤU HÌNH RESEND_API_KEY TRONG .ENV ⚠️');
    console.log('Gửi email giả lập tới:', toEmail);
    console.log('MÃ OTP CỦA BẠN LÀ:', otpCode);
    console.log('======================================================\n');
    return { success: true, simulated: true };
  }

  try {
    const data = await resend.emails.send({
      from: 'TOTO Barbershop <onboarding@resend.dev>', // Dùng email dev để test
      to: toEmail,
      subject,
      html: htmlContent,
    });

    return { success: true, data };
  } catch (error: any) {
    if (error?.error?.name === 'validation_error' && error?.error?.message?.includes('own email address')) {
      console.warn(`\n[Resend Test Mode] Bỏ qua gửi OTP đến ${toEmail} do Resend chưa xác thực domain.`);
      console.log(`[DEV MODE] MÃ OTP CỦA BẠN LÀ: ${otpCode}\n`);
      return { success: true, simulated: true };
    }
    console.error('Error sending email:', error);
    throw new Error('Không thể gửi email. Vui lòng thử lại sau.');
  }
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

export const sendOrderEmails = async (
  orderId: number,
  total: number,
  customerEmail: string,
  orderCode?: string,
  customerName?: string,
  shippingAddress?: string,
) => {
  const displayCode = orderCode || `#${orderId}`;
  const displayName = customerName || 'Quý khách';
  const displayAddress = shippingAddress || 'Chưa cập nhật';

  if (!resend) {
    console.log(`[SIMULATED EMAIL] New order ${displayCode} created. Emails sent to Admin and ${customerEmail}.`);
    return;
  }
  
  try {
    // 1. Email cho Khách hàng
    const customerHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
        <div style="background: #d71920; padding: 20px 24px;">
          <h2 style="color: #fff; margin: 0;">TOTO Barbershop</h2>
        </div>
        <div style="padding: 24px;">
          <p>Xin chào <strong>${displayName}</strong>,</p>
          <p>Cảm ơn bạn đã đặt hàng tại TOTO Barbershop! Đơn hàng của bạn đã được ghi nhận thành công.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="background: #f9f9f9;">
              <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Mã đơn hàng</td>
              <td style="padding: 10px; border: 1px solid #eee; color: #d71920; font-weight: bold;">${displayCode}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Tổng giá trị</td>
              <td style="padding: 10px; border: 1px solid #eee;">${formatCurrency(total)}</td>
            </tr>
            <tr style="background: #f9f9f9;">
              <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Địa chỉ giao hàng</td>
              <td style="padding: 10px; border: 1px solid #eee;">${displayAddress}</td>
            </tr>
          </table>
          <p>Chúng tôi sẽ liên hệ với bạn trong thời gian sớm nhất để xác nhận đơn hàng.</p>
          <p>Trân trọng,<br><strong>Đội ngũ TOTO Barbershop</strong></p>
        </div>
      </div>
    `;

    // 2. Email cho Admin
    const adminHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
        <div style="background: #d71920; padding: 20px 24px;">
          <h2 style="color: #fff; margin: 0;">[ĐƠN HÀNG MỚI] ${displayCode}</h2>
        </div>
        <div style="padding: 24px;">
          <p>Hệ thống vừa ghi nhận một đơn hàng mới.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="background: #f9f9f9;">
              <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Mã đơn</td>
              <td style="padding: 10px; border: 1px solid #eee; color: #d71920; font-weight: bold;">${displayCode}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Khách hàng</td>
              <td style="padding: 10px; border: 1px solid #eee;">${displayName}</td>
            </tr>
            <tr style="background: #f9f9f9;">
              <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Email</td>
              <td style="padding: 10px; border: 1px solid #eee;">${customerEmail}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Địa chỉ giao</td>
              <td style="padding: 10px; border: 1px solid #eee;">${displayAddress}</td>
            </tr>
            <tr style="background: #f9f9f9;">
              <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Tổng tiền</td>
              <td style="padding: 10px; border: 1px solid #eee;"><strong>${formatCurrency(total)}</strong></td>
            </tr>
          </table>
          <p>Vui lòng đăng nhập vào trang quản trị để xem chi tiết và xử lý đơn hàng.</p>
        </div>
      </div>
    `;

    const safeSend = async (payload: any) => {
      try {
        await resend.emails.send(payload);
      } catch (err: any) {
        if (err?.error?.name === 'validation_error' && err?.error?.message?.includes('own email address')) {
          console.warn(`[Resend Test Mode] Bỏ qua gửi email đến ${payload.to} do chưa xác thực domain.`);
        } else {
          console.error(`[Resend] Error sending email to ${payload.to}:`, err);
        }
      }
    };

    await Promise.all([
      safeSend({
        from: 'TOTO Barbershop <onboarding@resend.dev>',
        to: customerEmail,
        subject: `Xác nhận đơn hàng ${displayCode} - TOTO Barbershop`,
        html: customerHtml,
      }),
      safeSend({
        from: 'TOTO Barbershop <onboarding@resend.dev>',
        to: process.env.ADMIN_EMAIL || 'admin@totobarbershop.com',
        subject: `[ĐƠN HÀNG MỚI] ${displayCode} - ${displayName}`,
        html: adminHtml,
      })
    ]);
  } catch (error) {
    console.error('Error in sendOrderEmails workflow:', error);
  }
};
