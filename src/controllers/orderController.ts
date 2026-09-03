import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import { Prisma } from '@prisma/client';
import { createRequire } from 'module';
import redis from '../config/redis.js';
import bcrypt from 'bcrypt';
import { isValidEmail, isValidPhone } from '../utils/validation.js';
import { sendOrderEmails, sendOrderCancelledEmail } from '../services/emailService.js';
import { logger } from '../utils/logger.js';
import { pushToUser } from '../services/sseManager.js';

// @payos/node export dạng { PayOS, PayOSError, ... } — không phải default export
const require = createRequire(import.meta.url);
const { PayOS } = require('@payos/node');

// Tự động serialize BigInt thành String cho JSON.stringify
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// Khởi tạo payOS client
const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID!,
  apiKey: process.env.PAYOS_API_KEY!,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY!
});

// Sinh mã đơn hàng quy chuẩn: TTB-YYMMDD-XXXX (VD: TTB-260818-8A3F)
const generateOrderCode = (): string => {
  const now = new Date();
  const datePart = now.getFullYear().toString().slice(-2)
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0');
  const randPart = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `TTB-${datePart}-${randPart}`;
};

// Helper xác định client URL chính xác (hỗ trợ cả localhost dev và domain production)
const getClientBaseUrl = (req: Request): string => {
  const origin = req.headers.origin;
  const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(u => u.trim());
  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }
  if (req.headers.referer) {
    try {
      const refOrigin = new URL(req.headers.referer).origin;
      if (allowedOrigins.includes(refOrigin)) return refOrigin;
    } catch {}
  }
  return process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'https://www.totobarbershop.vn';
};

// Helper chuẩn hóa danh sách sản phẩm hiển thị trong email (Lấy đúng tên sản phẩm & phân loại)
export const formatOrderItemsForEmail = (orderItems: any[]) => {
  return (orderItems || []).map((i: any) => {
    const productName = i.product?.name || i.product?.title || i.title || i.name || 'Sản phẩm';
    const variantParts = [i.variant?.size, i.variant?.color, i.variant?.name].filter(Boolean);
    const variantInfo = variantParts.length > 0 ? ` (${variantParts.join(' - ')})` : (i.variantName ? ` (${i.variantName})` : '');
    return {
      title: `${productName}${variantInfo}`,
      quantity: i.quantity,
      price: i.price,
    };
  });
};


export const createOrder = async (req: Request, res: Response) => {
  try {
    let userId = (req as any).user?.id;
    const { items, total, discount, promoCode, idempotencyKey, paymentMethod, address, note, customer, email } = req.body;

    if (!items || items.length === 0) return res.status(400).json({ error: 'Giỏ hàng trống' });
    if (!idempotencyKey) return res.status(400).json({ error: 'Thiếu idempotencyKey' });

    // Validate quantity từng item (phải là số nguyên dương)
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({ error: `Số lượng sản phẩm không hợp lệ (phải >= 1). Variant ID: ${item.variantId}` });
      }
    }

    // Validate total không âm
    if (Number(total) < 0) {
      return res.status(400).json({ error: 'Tổng tiền đơn hàng không hợp lệ' });
    }

    // Handle Guest Checkout
    if (!userId) {
      const guestEmail = customer?.email || email;
      const guestName = customer?.name || 'Khách vãng lai';
      const guestPhone = customer?.phone || '';
      
      if (!guestEmail) {
        return res.status(400).json({ error: 'Thiếu email để đặt hàng' });
      }
      if (!isValidEmail(guestEmail)) {
        return res.status(400).json({ error: 'Email không hợp lệ' });
      }
      if (guestPhone && !isValidPhone(guestPhone)) {
        return res.status(400).json({ error: 'Số điện thoại không hợp lệ' });
      }

      const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
      const guestUser = await prisma.user.upsert({
        where: { email: guestEmail },
        update: {
          ...(guestName !== 'Khách vãng lai' ? { name: guestName } : {}),
          ...(guestPhone ? { phone: guestPhone } : {}),
        },
        create: {
          email: guestEmail,
          name: guestName,
          phone: guestPhone,
          password: randomPassword,
          role: 'GUEST'
        }
      });
      userId = guestUser.id;
    } else if (customer && customer.phone) {
      if (!isValidPhone(customer.phone)) {
        return res.status(400).json({ error: 'Số điện thoại không hợp lệ' });
      }
      // Cập nhật SĐT và tên cho user đã đăng nhập nếu họ điền form
      await prisma.user.update({
        where: { id: userId },
        data: {
          phone: customer.phone,
          ...(customer.name && { name: customer.name })
        }
      });
    }

    // Phòng chống rủi ro bom hàng cho đơn COD: Blacklist & Giới hạn đơn chờ
    const rawPhone = customer?.phone || (req as any).user?.phone || '';
    const targetPhone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
    const isCod = !paymentMethod || paymentMethod.toLowerCase() === 'cod';

    if (isCod && targetPhone) {
      // 1. Kiểm tra Blacklist số điện thoại
      const isBlocked = await prisma.blockedPhone.findUnique({
        where: { phone: targetPhone }
      });
      if (isBlocked) {
        logger.warn(`COD blocked phone attempt: ${targetPhone}`, { reqId: req.id });
        return res.status(403).json({
          error: 'Số điện thoại này tạm thời không được hỗ trợ phương thức COD do lịch sử giao hàng. Vui lòng chọn thanh toán qua PayOS hoặc liên hệ hotline để được hỗ trợ.',
          code: 'PHONE_BLOCKED_COD'
        });
      }

      // 2. Kiểm tra giới hạn số lượng đơn COD đang chờ xử lý (tối đa 3 đơn)
      const pendingCodCount = await prisma.order.count({
        where: {
          paymentMethod: { in: ['cod', 'COD'] },
          status: 'PENDING',
          OR: [
            { customerPhone: targetPhone },
            ...(userId ? [{ userId: Number(userId) }] : [])
          ]
        }
      });
      if (pendingCodCount >= 3) {
        logger.warn(`COD pending limit reached for phone: ${targetPhone} (${pendingCodCount} orders)`, { reqId: req.id });
        return res.status(429).json({
          error: `Số điện thoại này hiện đang có ${pendingCodCount} đơn hàng COD chưa hoàn tất. Vui lòng chờ nhận hoặc hoàn tất đơn cũ trước khi đặt thêm đơn mới.`,
          code: 'MAX_PENDING_COD_REACHED'
        });
      }
    }

    // Kiểm tra Idempotency Key bằng Redis (chặn double-submit tức thì)
    const redisIdempotencyKey = `idempotency:${idempotencyKey}`;
    const isFirstProcessing = await redis.set(redisIdempotencyKey, 'PROCESSING', 'NX', 'EX', 86400); // Lưu 24h
    if (!isFirstProcessing) {
      logger.warn(`Idempotency conflict detected (double-submit / concurrent request caught)`, {
        reqId: req.id,
        idempotencyKey,
      });
      // Đã có request đang xử lý hoặc đã hoàn thành, trả về lỗi chung chung hoặc tìm order cũ
      const existingOrder = await prisma.order.findUnique({ where: { idempotencyKey } });
      if (existingOrder) return res.json(existingOrder);
      // Thay vì quăng lỗi làm frontend crash, trả về 202 Accepted để frontend tự xử lý redirect nhẹ nhàng
      return res.status(202).json({ success: true, message: 'Đơn hàng đang được xử lý', idempotencyKey });
    }

    logger.race(`Acquired Idempotency lock successfully`, { reqId: req.id, idempotencyKey });

    // Transaction với row lock (for update)
    const order = await prisma.$transaction(async (tx) => {
      // Giải quyết N+1 Query: Gom toàn bộ variant IDs lại, sort để tránh Deadlock và dùng 1 câu query để Lock row
      const variantIds = items.map((i: any) => Number(i.variantId)).sort();
      logger.race(`Locking variant rows (FOR UPDATE)...`, { reqId: req.id, variantIds });
      
      const variantRows = await tx.$queryRaw<any[]>`
        SELECT id, stock, price FROM "ProductVariant"
        WHERE id IN (${Prisma.join(variantIds)})
        FOR UPDATE
      `;

      const stockMap = new Map(variantRows.map((v) => [v.id, v.stock]));
      // Lấy giá từ DB để chống price manipulation từ client
      const priceMap = new Map(variantRows.map((v) => [v.id, Number(v.price)]));
      logger.race(`Row locks acquired for variants`, {
        reqId: req.id,
        currentStocks: Array.from(stockMap.entries()),
      });

      for (const item of items) {
        const variantId = Number(item.variantId);
        const currentStock = stockMap.get(variantId);

        if (currentStock === undefined) {
          throw new Error(`Sản phẩm (Variant ID: ${item.variantId}) không tồn tại.`);
        }

        if (currentStock < item.quantity) {
          logger.warn(`Stock insufficient under lock: Variant #${variantId} has ${currentStock}, requested ${item.quantity}`, { reqId: req.id });
          throw new Error(`Sản phẩm không đủ số lượng trong kho.`);
        }

        await tx.productVariant.update({
          where: { id: variantId },
          data: { stock: currentStock - item.quantity }
        });

        logger.race(`Stock decremented for Variant #${variantId}: ${currentStock} -> ${currentStock - item.quantity}`, { reqId: req.id });
      }

      // Xử lý mã giảm giá nếu có
      if (promoCode) {
        logger.race(`Locking PromoCode row (FOR UPDATE): ${promoCode}`, { reqId: req.id });
        const promoRows = await tx.$queryRaw<any[]>`
          SELECT * FROM "PromoCode"
          WHERE code = ${promoCode}
          FOR UPDATE
        `;
        if (promoRows && promoRows.length > 0) {
          const p = promoRows[0];
          if (p.isActive && (p.usageLimit === null || p.usedCount < p.usageLimit)) {
            await tx.promoCode.update({
              where: { code: promoCode },
              data: { usedCount: p.usedCount + 1 }
            });
            logger.race(`PromoCode #${promoCode} consumed: ${p.usedCount} -> ${p.usedCount + 1} (Limit: ${p.usageLimit ?? '∞'})`, { reqId: req.id });
          } else {
            logger.warn(`PromoCode #${promoCode} exhausted or inactive under lock`, { reqId: req.id, usedCount: p.usedCount, usageLimit: p.usageLimit });
            throw new Error('Mã giảm giá không hợp lệ hoặc đã hết lượt dùng.');
          }
        }
      }

      // Lưu địa chỉ mặc định cho user (nếu có địa chỉ đầy đủ)
      if (userId && address && typeof address === 'object' && address.province) {
        const userAddresses = await tx.address.findMany({ where: { userId } });
        const existingDefault = userAddresses.find(a => a.isDefault) || userAddresses[0];
        
        if (existingDefault) {
          await tx.address.update({
            where: { id: existingDefault.id },
            data: {
              province: address.province,
              district: address.district,
              ward: address.ward,
              street: address.street,
              isDefault: true
            }
          });
        } else {
          await tx.address.create({
            data: {
              userId,
              province: address.province,
              district: address.district,
              ward: address.ward,
              street: address.street,
              isDefault: true
            }
          });
        }
      }

      // Tạo đơn hàng kèm snapshot thông tin nhận hàng
      const fullAddress = address
        ? `${address.street ?? ''}, ${address.ward ?? ''}, ${address.district ?? ''}, ${address.province ?? ''}`
            .replace(/(, )+/g, ', ').replace(/^, |, $/g, '')
        : null;

      // Tính tổng tiền từ giá DB (chống client price manipulation)
      const serverSubtotal = items.reduce((sum: number, i: any) => {
        const dbPrice = priceMap.get(Number(i.variantId));
        const safePrice = dbPrice !== undefined ? dbPrice : Number(i.price);
        return sum + safePrice * Number(i.quantity);
      }, 0);
      // Phí vận chuyển: COD = 30.000đ, PayOS = miễn phí (đồng bộ với FE)
      const SHIPPING_FEE = (paymentMethod === 'cod' || paymentMethod === 'COD') ? 30000 : 0;
      const safeDiscount = Math.min(Math.max(0, Number(discount) || 0), serverSubtotal);
      const serverTotal = Math.max(0, serverSubtotal + SHIPPING_FEE - safeDiscount);

      const newOrder = await tx.order.create({
        data: {
          orderCode: generateOrderCode(),
          userId: Number(userId),
          total: serverTotal,
          discount: safeDiscount,
          promoCode: promoCode ?? null,
          idempotencyKey: idempotencyKey ?? null,
          paymentMethod: paymentMethod || 'COD',
          paymentStatus: (paymentMethod && paymentMethod.toLowerCase() === 'payos') ? 'UNPAID' : 'COD_UNPAID',
          customerName: customer?.name ?? null,
          customerPhone: customer?.phone ?? null,
          customerEmail: customer?.email ?? email ?? null,
          shippingAddress: fullAddress,
          note: note ?? null,
          items: {
            create: items.map((i: any) => {
              const dbPrice = priceMap.get(Number(i.variantId));
              // Sử dụng giá từ DB (chống price manipulation). Fallback sang client price nếu DB không có (không nên xảy ra)
              const safePrice = dbPrice !== undefined ? dbPrice : Number(i.price);
              return {
                productId: i.productId,
                variantId: i.variantId,
                quantity: i.quantity,
                price: safePrice
              };
            })
          }
        },
        include: { items: true }
      });

      return newOrder;
    });

    // Xóa cache sản phẩm để đồng bộ số lượng tồn kho (stock) ngay lập tức
    await redis.del('cache:products').catch(() => {});

    // Lấy email của user đã đăng nhập làm fallback nếu customerEmail bị null
    let resolvedEmail = order.customerEmail || email;
    if (!resolvedEmail && userId) {
      const userRecord = await prisma.user.findUnique({ where: { id: Number(userId) }, select: { email: true } });
      resolvedEmail = userRecord?.email ?? null;
    }

    // Chỉ gửi email tiếp nhận đơn ngay lúc tạo nếu chọn phương thức COD (Thanh toán khi nhận hàng)
    // Đối với PayOS / Chuyển khoản: Chỉ gửi email khi Webhook xác nhận thanh toán thành công
    if (resolvedEmail && paymentMethod === 'cod') {
      const fullOrderForEmail = await prisma.order.findUnique({
        where: { id: order.id },
        include: { items: { include: { product: true, variant: true } } }
      });
      const emailItems = formatOrderItemsForEmail(fullOrderForEmail?.items || items);
      sendOrderEmails(
        order.id, total, resolvedEmail,
        order.orderCode ?? undefined,
        order.customerName ?? undefined,
        order.shippingAddress ?? undefined,
        emailItems,
        { 
          paymentMethod: 'cod', 
          paymentStatus: 'COD_UNPAID', 
          orderStatus: 'PENDING',
          customerPhone: order.customerPhone || customer?.phone || undefined
        }
      ).catch(err => logger.error("Async COD Order Email Error:", err));
    }

    // Nếu chọn thanh toán qua payOS → tạo link QR
    if (paymentMethod === 'payos') {
      try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        // payOS yêu cầu orderCode là số nguyên dương (dùng timestamp để đảm bảo unique)
        const payosOrderCode = Number(Date.now().toString().slice(-8));
        
        const baseUrl = getClientBaseUrl(req);
        const paymentData = await payos.paymentRequests.create({
          orderCode: payosOrderCode,
          amount: total,
          description: `TOTO DH${order.id}`,
          cancelUrl: `${baseUrl}/order/${order.orderCode}/cancelled`,
          returnUrl: `${baseUrl}/order/${order.orderCode}/success`,
          buyerName: user?.name || order.customerName || 'Khách hàng',
          buyerEmail: user?.email || order.customerEmail || undefined,
          buyerPhone: user?.phone || order.customerPhone || undefined,
          expiredAt: Math.floor(Date.now() / 1000) + 15 * 60,
        });

        // Lưu orderCode vào DB để webhook sau nhận dạng được
        await prisma.order.update({
          where: { id: order.id },
          data: { payosOrderCode: BigInt(payosOrderCode) }
        });

        return res.json({
          ...order,
          payosOrderCode,
          checkoutUrl: paymentData.checkoutUrl,
          qrCode: paymentData.qrCode,
        });
      } catch (payosErr: any) {
        console.error('payOS error:', payosErr);
        // Nếu tạo link thất bại vẫn trả về đơn hàng, không để mất
        return res.json({ ...order, payosError: 'Không thể tạo link thanh toán. Vui lòng thanh toán COD.' });
      }
    }

    return res.status(201).json(order);
  } catch (error: any) {
    // Nếu lỗi tạo đơn hàng, xóa cache redis để cho phép thử lại
    if (req.body.idempotencyKey) {
      await redis.del(`idempotency:${req.body.idempotencyKey}`);
    }
    logger.error('Create order transaction error', error, { reqId: req.id, errorCode: error.code });
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Đơn hàng đã được tạo trước đó.', reqId: req.id });
    }
    if (error.code === 'P2034') {
      return res.status(409).json({ error: 'Xung đột giao dịch đồng thời (Transaction conflict), vui lòng thử lại.', reqId: req.id });
    }
    res.status(400).json({ error: error.message || 'Lỗi tạo đơn hàng', reqId: req.id });
  }
};

// Webhook từ payOS — xử lý khi khách thanh toán thành công
export const payosWebhook = async (req: Request, res: Response) => {
  try {
    // Verify chữ ký của payOS để đảm bảo request hợp lệ
    let webhookData: any;
    try {
      webhookData = payos.webhooks.verify(req.body);
    } catch (signatureErr) {
      console.error('payOS webhook signature invalid:', signatureErr);
      return res.status(400).send('Invalid signature');
    }

    const { orderCode, code } = webhookData;

    // code "00" = thành công
    if (code !== '00') {
      return res.status(200).json({ message: 'Ignored non-success event' });
    }

    // Tìm order theo payosOrderCode
    const order = await prisma.order.findFirst({
      where: { payosOrderCode: BigInt(orderCode) },
      include: { items: { include: { product: true, variant: true } }, user: true }
    });

    if (!order) {
      console.error('payOS webhook: order not found for orderCode', orderCode);
      return res.status(200).json({ message: 'Order not found, ignored' });
    }

    // Idempotent: nếu đã thanh toán rồi thì bỏ qua
    if (order.paymentStatus === 'PAID') {
      return res.status(200).json({ message: 'Already processed' });
    }

    await prisma.$transaction(async (tx) => {
      // Double-check với row lock
      const orderRows = await tx.$queryRaw<any[]>`
        SELECT "paymentStatus" FROM "Order"
        WHERE id = ${Number(order.id)}
        FOR UPDATE
      `;
      if (orderRows[0]?.paymentStatus === 'PAID') return;

      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PAID',
          status: 'PROCESSING',
          transactionId: String(orderCode),
        }
      });
    });

    console.log(`✅ payOS webhook: Order #${order.id} đã thanh toán thành công`);

    // Ghi audit log lịch sử đơn hàng
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        oldStatus: order.status.toUpperCase(),
        newStatus: 'PROCESSING',
        changedBy: 'payos-webhook',
        note: `Khách hàng thanh toán thành công ${order.total}đ qua PayOS (Mã GD: ${orderCode})`,
      }
    }).catch(err => console.error('Lỗi ghi audit log PayOS webhook:', err));

    // Gửi email xác nhận thanh toán thành công cho khách hàng
    const customerEmail = order.customerEmail || order.user?.email;
    const customerName = order.customerName || order.user?.name || undefined;
    const mappedItems = formatOrderItemsForEmail(order.items);

    if (customerEmail) {
      sendOrderEmails(
        order.id,
        order.total,
        customerEmail,
        order.orderCode || undefined,
        customerName,
        order.shippingAddress || undefined,
        mappedItems,
        {
          paymentMethod: 'payos',
          paymentStatus: 'PAID',
          transactionId: String(orderCode),
          orderStatus: 'PROCESSING',
          customerPhone: order.customerPhone || order.user?.phone || undefined
        }
      ).catch(err => logger.error("Async PayOS Success Email Error:", err));
    }

    // Push SSE realtime update đến client của khách hàng
    if (order.userId) {
      pushToUser(order.userId, 'order_updated', {
        id: order.id,
        orderCode: order.orderCode,
        status: 'processing',
        paymentStatus: 'paid',
        updatedAt: new Date(),
      });
    }

    res.status(200).json({ message: 'OK' });
  } catch (error) {
    console.error('payOS webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Giữ lại webhook cũ (legacy) nếu dùng bên thứ ba
export const paymentWebhook = async (req: Request, res: Response) => {
  try {
    const { orderId, transactionId, status } = req.body;

    if (status !== 'SUCCESS') {
      return res.status(200).send('OK');
    }

    const order = await prisma.order.findUnique({
      where: { id: Number(orderId) },
      include: { items: { include: { product: true, variant: true } }, user: true }
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });

    await prisma.$transaction(async (tx) => {
      const orderRows = await tx.$queryRaw<any[]>`
        SELECT "paymentStatus" FROM "Order"
        WHERE id = ${Number(orderId)}
        FOR UPDATE
      `;
      if (!orderRows || orderRows.length === 0) throw new Error('Order not found');
      if (orderRows[0].paymentStatus === 'PAID') return;

      await tx.order.update({
        where: { id: Number(orderId) },
        data: { paymentStatus: 'PAID', status: 'PROCESSING', transactionId }
      });
    });

    // Gửi email xác nhận thanh toán thành công
    const customerEmail = order.customerEmail || order.user?.email;
    const customerName = order.customerName || order.user?.name || undefined;
    const mappedItems = formatOrderItemsForEmail(order.items);

    if (customerEmail) {
      sendOrderEmails(
        order.id,
        order.total,
        customerEmail,
        order.orderCode || undefined,
        customerName,
        order.shippingAddress || undefined,
        mappedItems,
        {
          paymentMethod: order.paymentMethod,
          paymentStatus: 'PAID',
          transactionId: String(transactionId),
          orderStatus: 'PROCESSING',
          customerPhone: order.customerPhone || order.user?.phone || undefined
        }
      ).catch(err => logger.error("Async Payment Webhook Success Email Error:", err));
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Payment webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
};

export const getOrders = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Nếu chưa đăng nhập hoặc không có token -> trả về mảng rỗng (chặn data exposure)
    if (!user) {
      return res.json({
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 }
      });
    }

    const {
      page,
      pageSize,
      search,
      status,
      paymentStatus,
      paymentMethod,
      startDate,
      endDate,
      all
    } = req.query;

    const isAll = all === 'true' || all === '1';
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const take = isAll ? undefined : Math.min(100, Math.max(1, parseInt(pageSize as string) || 20));
    const skip = isAll ? undefined : (pageNum - 1) * (take || 20);

    let whereCondition: any = {};
    if (user?.role !== 'ADMIN') {
      whereCondition = {
        OR: [
          { userId: Number(user.id) },
          { customerEmail: user.email }
        ]
      };
    }

    // 1. Lọc từ khóa tìm kiếm: Mã đơn, tên khách, số điện thoại
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      const searchOR: any[] = [
        { orderCode: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { customerPhone: { contains: q } },
      ];
      const numId = parseInt(q.replace(/\D/g, ''));
      if (!isNaN(numId) && String(numId) === q.replace(/\D/g, '')) {
        searchOR.push({ id: numId });
      }
      whereCondition.AND = whereCondition.AND || [];
      whereCondition.AND.push({ OR: searchOR });
    }

    // 2. Lọc trạng thái đơn hàng (status)
    if (status && typeof status === 'string' && status.toUpperCase() !== 'ALL') {
      whereCondition.status = status.toUpperCase();
    }

    // 3. Lọc trạng thái thanh toán (paymentStatus)
    if (paymentStatus && typeof paymentStatus === 'string' && paymentStatus.toUpperCase() !== 'ALL') {
      whereCondition.paymentStatus = paymentStatus.toUpperCase();
    }

    // 4. Lọc phương thức thanh toán (paymentMethod)
    if (paymentMethod && typeof paymentMethod === 'string' && paymentMethod.toUpperCase() !== 'ALL') {
      whereCondition.paymentMethod = { equals: paymentMethod.toLowerCase(), mode: 'insensitive' };
    }

    // 5. Lọc khoảng ngày (startDate, endDate)
    if (startDate || endDate) {
      whereCondition.createdAt = whereCondition.createdAt || {};
      if (startDate && typeof startDate === 'string') {
        whereCondition.createdAt.gte = new Date(startDate);
      }
      if (endDate && typeof endDate === 'string') {
        const endD = new Date(endDate);
        if (!endDate.includes('T')) {
          endD.setHours(23, 59, 59, 999);
        }
        whereCondition.createdAt.lte = endD;
      }
    }

    const findArgs: any = {
      where: whereCondition,
      include: {
        user: {
          include: { addresses: true }
        },
        items: {
          include: {
            product: true,
            variant: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    };

    if (take !== undefined && skip !== undefined) {
      findArgs.take = take;
      findArgs.skip = skip;
    }

    const [orders, totalCount] = await Promise.all([
      prisma.order.findMany(findArgs),
      prisma.order.count({ where: whereCondition })
    ]);

    // Map order fields for frontend store
    const mappedOrders = orders.map((o: any) => ({
      id: o.id,
      code: `TOTO-${1000 + o.id}`,
      orderCode: o.orderCode || `TOTO-DH${o.id.toString().padStart(4, '0')}`,
      customer: {
        id: o.userId,
        name: o.customerName || o.user?.name || "Khách vãng lai",
        email: o.customerEmail || o.user?.email || "",
        phone: o.customerPhone || o.user?.phone || "",
        address: o.shippingAddress || (o.user?.addresses && o.user.addresses.length > 0 
          ? `${o.user.addresses[0].street}, ${o.user.addresses[0].ward}, ${o.user.addresses[0].district}, ${o.user.addresses[0].province}`
          : "Khách chưa lưu địa chỉ"),
        note: o.note || ""
      },
      items: o.items.map((i: any) => ({
        id: i.id,
        productId: i.productId,
        variantId: i.variantId,
        product: i.product ? { ...i.product, title: i.product.name } : null,
        variant: i.variant || null,
        title: i.product?.name || "Sản phẩm",
        variantName: i.variant?.name || "Mặc định",
        image: (i.product?.images && i.product.images.length > 0) ? i.product.images[0] : "",
        quantity: i.quantity,
        price: i.price
      })),
      subtotal: o.total - o.discount,
      shippingFee: 0,
      discount: o.discount,
      total: o.total,
      couponCode: o.promoCode,
      status: o.status.toLowerCase(),
      paymentStatus: o.paymentStatus.toLowerCase(),
      paymentMethod: o.paymentMethod.toLowerCase(),
      cancelReason: o.cancelReason,
      cancelledBy: o.cancelledBy,
      deliveryAttempts: o.deliveryAttempts || 0,
      createdAt: o.createdAt.toISOString()
    }));

    const activePageSize = take || totalCount || 20;
    res.json({
      data: mappedOrders,
      pagination: {
        page: pageNum,
        pageSize: activePageSize,
        total: totalCount,
        totalPages: Math.ceil(totalCount / activePageSize) || 1,
      }
    });
  } catch (error) {
    console.error('get orders error:', error);
    res.status(500).json({ error: 'Lỗi lấy danh sách đơn hàng' });
  }
};

export const getOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const order = await prisma.order.findUnique({
      where: { id: Number(id) },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        updatedAt: true
      }
    });
    
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    res.json({
      id: order.id,
      status: order.status.toLowerCase(),
      paymentStatus: order.paymentStatus.toLowerCase(),
      updatedAt: order.updatedAt
    });
  } catch (error) {
    console.error('Get order status error:', error);
    res.status(500).json({ error: 'Lỗi lấy trạng thái đơn hàng' });
  }
};

export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PROCESSING', 'SHIPPED', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'COMPLETED', 'CANCELLED'],
  SHIPPED: ['COMPLETED', 'CANCELLED', 'DELIVERY_FAILED'],
  DELIVERY_FAILED: ['SHIPPED', 'CANCELLED'], // Có thể giao lại (SHIPPED) hoặc hủy đơn (CANCELLED)
  COMPLETED: [], // Trạng thái cuối, không thể thay đổi
  CANCELLED: [], // Trạng thái cuối, không thể thay đổi
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, cancelReason } = req.body;
    
    const existingOrder = await prisma.order.findUnique({
      where: { id: Number(id) },
      include: { items: { include: { product: true, variant: true } }, user: true }
    });

    if (!existingOrder) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    const currentStatus = (existingOrder.status || 'PENDING').toUpperCase();

    // 1. Kiểm tra State Machine nếu có yêu cầu đổi status
    if (status) {
      const targetStatus = status.toUpperCase();

      if (targetStatus !== currentStatus) {
        // Kiểm tra xem đơn hàng đã ở trạng thái kết thúc (Terminal) chưa
        if (currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED') {
          const statusText = currentStatus === 'COMPLETED' ? 'Hoàn thành' : 'Đã hủy';
          return res.status(422).json({
            error: `Đơn hàng đã ở trạng thái "${statusText}" (kết thúc), không thể thay đổi trạng thái nữa.`
          });
        }

        const validNext = VALID_STATUS_TRANSITIONS[currentStatus] || [];
        if (!validNext.includes(targetStatus)) {
          return res.status(422).json({
            error: `Không thể chuyển trạng thái từ "${currentStatus}" sang "${targetStatus}". Các trạng thái hợp lệ tiếp theo: ${validNext.join(', ') || 'Không có'}.`
          });
        }
      }
    }

    // 2. Nếu chuyển sang trạng thái CANCELLED và đơn trước đó chưa hủy, hoàn lại kho
    if (status && status.toUpperCase() === 'CANCELLED' && currentStatus !== 'CANCELLED') {
      await prisma.$transaction(async (tx) => {
        for (const item of existingOrder.items) {
          if (item.variantId) {
            const variantRows = await tx.$queryRaw<any[]>`
              SELECT stock FROM "ProductVariant"
              WHERE id = ${item.variantId}
              FOR UPDATE
            `;
            if (variantRows && variantRows.length > 0) {
              await tx.productVariant.update({
                where: { id: item.variantId },
                data: { stock: variantRows[0].stock + item.quantity }
              });
            }
          }
        }
      });
      await redis.del('cache:products').catch(() => {});
    }

    const order = await (prisma.order as any).update({
      where: { id: Number(id) },
      data: {
        ...(status && { status: status.toUpperCase() }),
        ...(paymentStatus && { paymentStatus: paymentStatus.toUpperCase() }),
        ...(status && status.toUpperCase() === 'CANCELLED' && {
          cancelReason: cancelReason || 'Admin hủy đơn',
          cancelledBy: 'admin',
        }),
        ...(status && status.toUpperCase() === 'DELIVERY_FAILED' && {
          deliveryAttempts: { increment: 1 }
        })
      }
    });

    // Nếu đơn hàng bị đánh dấu DELIVERY_FAILED, kiểm tra số đơn thất bại của SĐT
    if (status && status.toUpperCase() === 'DELIVERY_FAILED' && existingOrder.customerPhone) {
      const failedCount = await prisma.order.count({
        where: {
          customerPhone: existingOrder.customerPhone,
          status: 'DELIVERY_FAILED'
        }
      });
      if (failedCount >= 2) {
        await prisma.blockedPhone.upsert({
          where: { phone: existingOrder.customerPhone },
          update: {
            reason: 'Giao hàng thất bại nhiều lần — SĐT hoặc địa chỉ có thể không chính xác (Tự động chặn COD)'
          },
          create: {
            phone: existingOrder.customerPhone,
            reason: 'Giao hàng thất bại nhiều lần — SĐT hoặc địa chỉ có thể không chính xác (Tự động chặn COD)',
            createdBy: 'system-delivery-failed'
          }
        });
        logger.warn(`SĐT ${existingOrder.customerPhone} đã bị tự động thêm vào Blacklist do có ${failedCount} đơn giao hàng thất bại.`);
      }
    }

    // 3. Ghi Audit Log vào OrderStatusHistory
    const changedBy = (req as any).user?.email || (req as any).user?.name || 'admin';
    if (status && status.toUpperCase() !== currentStatus) {
      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          oldStatus: currentStatus,
          newStatus: status.toUpperCase(),
          changedBy: String(changedBy),
          note: cancelReason || (status.toUpperCase() === 'CANCELLED' ? 'Admin hủy đơn' : `Chuyển trạng thái sang ${status.toUpperCase()}`),
        }
      }).catch(err => console.error('Lỗi ghi audit log order status:', err));
    }

    // Nếu đơn hàng bị hủy, gửi email thông báo cho khách hàng
    if (status && status.toUpperCase() === 'CANCELLED' && currentStatus !== 'CANCELLED') {
      const customerEmail = existingOrder.customerEmail || existingOrder.user?.email;
      const customerName = existingOrder.customerName || existingOrder.user?.name || undefined;
      const mappedItems = formatOrderItemsForEmail(existingOrder.items);

      if (customerEmail) {
        sendOrderCancelledEmail(
          order.id,
          order.total,
          customerEmail,
          order.orderCode || undefined,
          customerName,
          cancelReason || 'Đơn hàng đã được Quản trị viên hủy theo yêu cầu hoặc do sự cố phát sinh.',
          mappedItems
        ).catch(err => console.error("Lỗi gửi email hủy đơn từ Admin:", err));
      }
    }

    // Push SSE realtime update đến client của khách hàng sở hữu đơn hàng này
    if (order.userId) {
      pushToUser(order.userId, 'order_updated', {
        id: order.id,
        orderCode: order.orderCode,
        status: order.status.toLowerCase(),
        paymentStatus: order.paymentStatus.toLowerCase(),
        updatedAt: order.updatedAt,
      });
    }

    res.json({
      ...order,
      payosOrderCode: order.payosOrderCode ? order.payosOrderCode.toString() : null,
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Lỗi cập nhật đơn hàng' });
  }
};

export const getOrderHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: Number(id) },
      orderBy: { changedAt: 'desc' }
    });
    res.json(history);
  } catch (error) {
    console.error('Get order history error:', error);
    res.status(500).json({ error: 'Lỗi lấy lịch sử trạng thái đơn hàng' });
  }
};

export const cancelOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const order = await prisma.order.findUnique({
      where: { id: Number(id) },
      include: { items: { include: { product: true, variant: true } }, user: true }
    });

    if (!order) return res.status(404).json({ error: 'Đơn hàng không tồn tại' });
    if (order.userId !== userId) return res.status(403).json({ error: 'Bạn không có quyền hủy đơn hàng này.' });
    if (order.status === 'CANCELLED') return res.status(400).json({ error: 'Đơn hàng này đã được hủy trước đó rồi.' });
    if (order.status !== 'PENDING') return res.status(400).json({ error: `Không thể hủy do đơn hàng đang ở trạng thái "${order.status}".` });
    if (order.paymentStatus === 'PAID') return res.status(400).json({ error: 'Đơn hàng đã thanh toán thành công. Vui lòng liên hệ CSKH để được hỗ trợ hoàn tiền.' });

    // Trả lại kho
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (item.variantId) {
          const variantRows = await tx.$queryRaw<any[]>`
            SELECT stock FROM "ProductVariant"
            WHERE id = ${item.variantId}
            FOR UPDATE
          `;
          if (variantRows && variantRows.length > 0) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: variantRows[0].stock + item.quantity }
            });
          }
        }
      }
      
      await tx.order.update({
        where: { id: Number(id) },
        data: { status: 'CANCELLED' }
      });
    });

    await redis.del('cache:products').catch(() => {});

    // Gửi email thông báo hủy đơn hàng tới khách hàng
    const customerEmail = order.customerEmail || order.user?.email;
    const customerName = order.customerName || order.user?.name || undefined;
    const mappedItems = formatOrderItemsForEmail(order.items);

    if (customerEmail) {
      sendOrderCancelledEmail(
        order.id,
        order.total,
        customerEmail,
        order.orderCode || undefined,
        customerName,
        req.body?.reason || 'Quý khách đã thực hiện hủy đơn hàng trực tuyến trên hệ thống.',
        mappedItems
      ).catch(err => console.error("Lỗi gửi email hủy đơn hàng:", err));
    }

    // Ghi audit log lịch sử đơn hàng
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        oldStatus: order.status.toUpperCase(),
        newStatus: 'CANCELLED',
        changedBy: customerEmail || `User#${userId}`,
        note: req.body?.reason || 'Khách hàng tự hủy đơn hàng trực tuyến',
      }
    }).catch(err => console.error('Lỗi ghi audit log cancelOrder:', err));

    res.json({ message: 'Đã hủy đơn hàng thành công' });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Lỗi hủy đơn hàng' });
  }
};

export const retryPayment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    const order = await prisma.order.findUnique({
      where: { id: Number(id) },
      include: { items: { include: { product: true } }, user: true }
    });

    if (!order) {
      return res.status(404).json({ error: 'Đơn hàng không tồn tại' });
    }

    if (userId && order.userId && order.userId !== userId && (req as any).user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Bạn không có quyền thanh toán đơn hàng này' });
    }

    if (order.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Đơn hàng đã bị hủy, không thể thanh toán lại. Vui lòng đặt đơn hàng mới.' });
    }

    if (order.status !== 'PENDING') {
      return res.status(400).json({ error: `Đơn hàng đang ở trạng thái "${order.status}", không thể thanh toán lại.` });
    }

    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'Đơn hàng này đã được thanh toán thành công trước đó rồi.' });
    }

    // Kiểm tra thời hạn 15 phút
    const isExpired = (Date.now() - new Date(order.createdAt).getTime()) > 15 * 60 * 1000;
    if (isExpired) {
      return res.status(400).json({ error: 'Đơn hàng đã hết hạn thanh toán (quá 15 phút). Vui lòng đặt đơn hàng mới.' });
    }

    // Tạo link thanh toán PayOS mới
    const payosOrderCode = Number(Date.now().toString().slice(-8));
    const baseUrl = getClientBaseUrl(req);
    const paymentData = await payos.paymentRequests.create({
      orderCode: payosOrderCode,
      amount: order.total,
      description: `TOTO DH${order.id}`,
      cancelUrl: `${baseUrl}/order/${order.orderCode}/cancelled`,
      returnUrl: `${baseUrl}/order/${order.orderCode}/success`,
      buyerName: order.customerName || order.user?.name || 'Khách hàng',
      buyerEmail: order.customerEmail || order.user?.email,
      buyerPhone: order.customerPhone || order.user?.phone || undefined,
      expiredAt: Math.floor(Date.now() / 1000) + 15 * 60,
    });

    // Cập nhật lại payosOrderCode mới
    await prisma.order.update({
      where: { id: order.id },
      data: {
        payosOrderCode: BigInt(payosOrderCode),
        paymentMethod: 'payos',
      }
    });

    return res.json({
      orderId: order.id,
      orderCode: order.orderCode,
      payosOrderCode,
      checkoutUrl: paymentData.checkoutUrl,
      qrCode: paymentData.qrCode,
    });
  } catch (error: any) {
    logger.error('Retry payment error:', error);
    res.status(500).json({ error: error.message || 'Lỗi tạo lại link thanh toán PayOS' });
  }
};

// ============================================================
// Tra cứu đơn hàng công khai an toàn bằng mã đơn (orderCode / payosOrderCode)
// ============================================================
export const getOrderByCode = async (req: Request, res: Response) => {
  try {
    const code = String(req.params.orderCode || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'Mã đơn hàng không hợp lệ' });
    }

    const isNumeric = /^\d+$/.test(code);
    const order: any = await prisma.order.findFirst({
      where: isNumeric
        ? { OR: [{ orderCode: code }, { payosOrderCode: BigInt(code) }] }
        : { orderCode: code },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, images: true, basePrice: true } },
            variant: { select: { id: true, name: true, price: true } },
          }
        },
        user: { select: { id: true, name: true, email: true } }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    }

    const isExpired = order.status === 'PENDING' && (Date.now() - new Date(order.createdAt).getTime()) > 15 * 60 * 1000;
    const expiresAt = new Date(new Date(order.createdAt).getTime() + 15 * 60 * 1000).toISOString();

    // Giữ sự riêng tư: Che bớt họ tên nếu gọi từ route công khai
    const rawName = order.customerName || order.user?.name || 'Khách hàng';
    const maskedName = rawName.length > 2 ? `${rawName.charAt(0)}***` : rawName;

    return res.json({
      id: order.id,
      orderCode: order.orderCode,
      payosOrderCode: order.payosOrderCode ? order.payosOrderCode.toString() : null,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      total: order.total,
      discount: order.discount,
      shippingFee: (order.paymentMethod === 'cod' || order.paymentMethod === 'COD') ? 30000 : 0,
      createdAt: order.createdAt,
      isExpired,
      expiresAt,
      customerName: maskedName,
      items: (order.items || []).map((item: any) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        title: item.product?.name || 'Sản phẩm',
        variantName: item.variant?.name || '',
        image: item.product?.images?.[0] || null
      }))
    });
  } catch (error: any) {
    logger.error('Get order by code error:', error);
    res.status(500).json({ error: 'Lỗi tra cứu đơn hàng' });
  }
};

// ============================================================
// Tạo lại link thanh toán PayOS bằng orderCode (Hỗ trợ cả Guest)
// ============================================================
export const retryPaymentByCode = async (req: Request, res: Response) => {
  try {
    const code = String(req.params.orderCode || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'Mã đơn hàng không hợp lệ' });
    }

    const isNumeric = /^\d+$/.test(code);
    const order: any = await prisma.order.findFirst({
      where: isNumeric
        ? { OR: [{ orderCode: code }, { payosOrderCode: BigInt(code) }] }
        : { orderCode: code },
      include: { items: true, user: true }
    });

    if (!order) {
      return res.status(404).json({ error: 'Đơn hàng không tồn tại' });
    }

    if (order.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Đơn hàng đã bị hủy, không thể thanh toán lại. Vui lòng đặt đơn hàng mới.' });
    }

    if (order.status !== 'PENDING') {
      return res.status(400).json({ error: `Đơn hàng đang ở trạng thái "${order.status}", không thể thanh toán lại.` });
    }

    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'Đơn hàng này đã được thanh toán thành công trước đó rồi.' });
    }

    // Kiểm tra thời hạn 15 phút
    const isExpired = (Date.now() - new Date(order.createdAt).getTime()) > 15 * 60 * 1000;
    if (isExpired) {
      return res.status(400).json({ error: 'Đơn hàng đã hết hạn thanh toán (quá 15 phút). Vui lòng đặt đơn hàng mới.' });
    }

    // Tạo link thanh toán PayOS mới cho đúng đơn hàng này
    const payosOrderCode = Number(Date.now().toString().slice(-8));
    const baseUrl = getClientBaseUrl(req);
    const paymentData = await payos.paymentRequests.create({
      orderCode: payosOrderCode,
      amount: order.total,
      description: `TOTO DH${order.id}`,
      cancelUrl: `${baseUrl}/order/${order.orderCode}/cancelled`,
      returnUrl: `${baseUrl}/order/${order.orderCode}/success`,
      buyerName: order.customerName || order.user?.name || 'Khách hàng',
      buyerEmail: order.customerEmail || order.user?.email,
      buyerPhone: order.customerPhone || order.user?.phone || undefined,
      expiredAt: Math.floor(Date.now() / 1000) + 15 * 60,
    });

    // Cập nhật lại payosOrderCode trong DB
    await prisma.order.update({
      where: { id: order.id },
      data: {
        payosOrderCode: BigInt(payosOrderCode),
        paymentMethod: 'payos',
      }
    });

    return res.json({
      orderId: order.id,
      orderCode: order.orderCode,
      payosOrderCode,
      checkoutUrl: paymentData.checkoutUrl,
      qrCode: paymentData.qrCode,
    });
  } catch (error: any) {
    logger.error('Retry payment by code error:', error);
    res.status(500).json({ error: error.message || 'Lỗi tạo lại link thanh toán PayOS' });
  }
};

// ============================================================
// Khách tự hủy đơn hàng trực tuyến qua mã orderCode (Hỗ trợ cả Guest)
// ============================================================
export const cancelOrderByCode = async (req: Request, res: Response) => {
  try {
    const code = String(req.params.orderCode || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'Mã đơn hàng không hợp lệ' });
    }

    const isNumeric = /^\d+$/.test(code);
    const order: any = await prisma.order.findFirst({
      where: isNumeric
        ? { OR: [{ orderCode: code }, { payosOrderCode: BigInt(code) }] }
        : { orderCode: code },
      include: { items: { include: { product: true, variant: true } }, user: true }
    });

    if (!order) {
      return res.status(404).json({ error: 'Đơn hàng không tồn tại' });
    }

    if (order.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Đơn hàng này đã được hủy trước đó rồi.' });
    }

    if (order.status !== 'PENDING') {
      return res.status(400).json({ error: `Không thể hủy do đơn hàng đang ở trạng thái "${order.status}".` });
    }

    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'Đơn hàng đã thanh toán thành công. Vui lòng liên hệ CSKH để được hỗ trợ hoàn tiền.' });
    }

    // Trả lại kho dùng concurrency lock FOR UPDATE
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (item.variantId) {
          const variantRows = await tx.$queryRaw<any[]>`
            SELECT stock FROM "ProductVariant"
            WHERE id = ${item.variantId}
            FOR UPDATE
          `;
          if (variantRows && variantRows.length > 0) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: variantRows[0].stock + item.quantity }
            });
          }
        }
      }

      const cancelReason = req.body?.reason ? String(req.body.reason).trim() : null;

      await (tx.order as any).update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelReason,
          cancelledBy: 'customer',
        }
      });
    });

    await redis.del('cache:products').catch(() => {});

    const cancelReason = req.body?.reason ? String(req.body.reason).trim() : null;

    // Gửi email thông báo hủy đơn
    const customerEmail = order.customerEmail || order.user?.email;
    const customerName = order.customerName || order.user?.name || undefined;
    const mappedItems = formatOrderItemsForEmail(order.items);

    if (customerEmail) {
      sendOrderCancelledEmail(
        order.id,
        order.total,
        customerEmail,
        order.orderCode || undefined,
        customerName,
        cancelReason || 'Khách hàng tự hủy đơn hàng trực tuyến trên hệ thống.',
        mappedItems
      ).catch((err: any) => console.error("Lỗi gửi email hủy đơn trực tuyến:", err));
    }

    // Ghi audit log lịch sử đơn hàng
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        oldStatus: order.status,
        newStatus: 'CANCELLED',
        changedBy: customerEmail || 'Khách hàng',
        note: cancelReason ? `Khách hủy đơn: ${cancelReason}` : 'Khách hủy đơn không nêu lý do',
      }
    }).catch((err: any) => console.error('Lỗi ghi audit log cancelOrderByCode:', err));

    return res.json({ message: 'Đã hủy đơn hàng thành công' });
  } catch (error: any) {
    logger.error('Cancel order by code error:', error);
    res.status(500).json({ error: error.message || 'Lỗi hủy đơn hàng' });
  }
};

// ============================================================
// Quản lý Đơn COD: Xác nhận thu tiền mặt
// ============================================================
export const markCodCollected = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const order = await prisma.order.findUnique({
      where: { id: Number(id) }
    });

    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    const isCod = order.paymentMethod.toUpperCase() === 'COD';
    if (!isCod) {
      return res.status(400).json({ error: 'Đơn hàng này không phải phương thức COD' });
    }

    if (order.paymentStatus.toUpperCase() === 'COD_COLLECTED' || order.paymentStatus.toUpperCase() === 'PAID') {
      return res.status(400).json({ error: 'Đơn hàng này đã được xác nhận thu tiền trước đó rồi' });
    }

    const currentStatus = (order.status || 'PENDING').toUpperCase();
    if (currentStatus !== 'SHIPPED' && currentStatus !== 'COMPLETED') {
      return res.status(400).json({
        error: `Chỉ có thể xác nhận thu tiền khi đơn hàng đang giao (SHIPPED) hoặc đã hoàn thành (COMPLETED). Hiện tại đơn đang ở trạng thái "${currentStatus}".`
      });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'COD_COLLECTED'
      }
    });

    const changedBy = (req as any).user?.email || (req as any).user?.name || 'admin';
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        oldStatus: currentStatus,
        newStatus: currentStatus,
        changedBy: String(changedBy),
        note: `Xác nhận đã thu ${order.total.toLocaleString('vi-VN')}đ tiền mặt COD`,
      }
    }).catch(() => {});

    logger.info(`Admin [${changedBy}] xác nhận thu tiền COD đơn #${order.id} (${order.total}đ)`);
    res.json({
      success: true,
      order: {
        ...updated,
        payosOrderCode: updated.payosOrderCode ? updated.payosOrderCode.toString() : null,
      }
    });
  } catch (error) {
    logger.error('markCodCollected error:', error);
    res.status(500).json({ error: 'Lỗi khi xác nhận thu tiền COD' });
  }
};

// ============================================================
// Quản lý Blacklist Số điện thoại chống bom hàng
// ============================================================
export const getBlockedPhones = async (req: Request, res: Response) => {
  try {
    const list = await prisma.blockedPhone.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(list);
  } catch (error) {
    logger.error('getBlockedPhones error:', error);
    res.status(500).json({ error: 'Lỗi lấy danh sách blacklist số điện thoại' });
  }
};

export const addBlockedPhone = async (req: Request, res: Response) => {
  try {
    const { phone, reason } = req.body;
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ error: 'Số điện thoại không hợp lệ' });
    }
    const cleanPhone = phone.trim();
    const createdBy = (req as any).user?.email || (req as any).user?.name || 'admin';

    const blocked = await prisma.blockedPhone.upsert({
      where: { phone: cleanPhone },
      update: {
        reason: reason || 'Chặn COD do bom hàng / không nhận hàng'
      },
      create: {
        phone: cleanPhone,
        reason: reason || 'Chặn COD do bom hàng / không nhận hàng',
        createdBy: String(createdBy)
      }
    });

    logger.info(`Added phone to blacklist: ${cleanPhone} by ${createdBy}`);
    res.json({ success: true, data: blocked });
  } catch (error) {
    logger.error('addBlockedPhone error:', error);
    res.status(500).json({ error: 'Lỗi khi thêm số điện thoại vào blacklist' });
  }
};

export const removeBlockedPhone = async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    if (!phone) return res.status(400).json({ error: 'Thiếu số điện thoại' });

    await prisma.blockedPhone.deleteMany({
      where: { phone: String(phone).trim() }
    });

    logger.info(`Removed phone from blacklist: ${phone}`);
    res.json({ success: true, message: 'Đã xóa số điện thoại khỏi blacklist' });
  } catch (error) {
    logger.error('removeBlockedPhone error:', error);
    res.status(500).json({ error: 'Lỗi khi xóa số điện thoại khỏi blacklist' });
  }
};
