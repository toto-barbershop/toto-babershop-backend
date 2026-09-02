import { prisma } from '../config/db.js';
import redis from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { sendOrderCancelledEmail } from './emailService.js';
import { pushToUser } from './sseManager.js';

const TIMEOUT_MINUTES = 15;

export const checkAndCancelExpiredOrders = async () => {
  try {
    const expirationThreshold = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000);

    // Tìm các đơn hàng PayOS đang ở trạng thái PENDING quá 15 phút
    const expiredOrders = await prisma.order.findMany({
      where: {
        paymentMethod: { equals: 'payos', mode: 'insensitive' },
        status: 'PENDING',
        paymentStatus: { in: ['PENDING', 'UNPAID'] },
        createdAt: { lt: expirationThreshold },
      },
      include: {
        items: { include: { product: true, variant: true } },
        user: true,
      },
    });

    if (!expiredOrders || expiredOrders.length === 0) {
      return;
    }

    logger.info(`[OrderScheduler] Tìm thấy ${expiredOrders.length} đơn hàng PayOS quá hạn ${TIMEOUT_MINUTES} phút, đang tiến hành tự động hủy và hoàn kho...`);

    let anyStockRestored = false;

    for (const order of expiredOrders) {
      try {
        await prisma.$transaction(async (tx) => {
          // 1. Hoàn trả stock kho hàng
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
                  data: { stock: variantRows[0].stock + item.quantity },
                });
                anyStockRestored = true;
              }
            }
          }

          // 2. Chuyển trạng thái đơn sang CANCELLED
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'CANCELLED',
              note: order.note ? `${order.note} | [Hệ thống tự động hủy do hết hạn thanh toán 15 phút]` : '[Hệ thống tự động hủy do hết hạn thanh toán 15 phút]',
            },
          });

          // 3. Ghi audit log lịch sử đơn hàng
          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              oldStatus: 'PENDING',
              newStatus: 'CANCELLED',
              changedBy: 'system-scheduler',
              note: `Hệ thống tự động hủy do quá hạn thời gian thanh toán (${TIMEOUT_MINUTES} phút)`,
            }
          });
        });

        logger.info(`[OrderScheduler] Đã tự động hủy đơn #${order.orderCode || order.id} do quá hạn thanh toán`);

        // 3. Gửi email thông báo hủy đơn tới khách hàng
        const customerEmail = order.customerEmail || order.user?.email;
        const customerName = order.customerName || order.user?.name || undefined;
        const mappedItems = order.items.map(i => {
          const productName = i.product?.name || 'Sản phẩm';
          const variantParts = [i.variant?.size, i.variant?.color, i.variant?.name].filter(Boolean);
          const variantInfo = variantParts.length > 0 ? ` (${variantParts.join(' - ')})` : '';
          return {
            title: `${productName}${variantInfo}`,
            quantity: i.quantity,
            price: i.price,
          };
        });

        if (customerEmail) {
          sendOrderCancelledEmail(
            order.id,
            order.total,
            customerEmail,
            order.orderCode || undefined,
            customerName,
            `Đơn hàng tự động hủy do đã quá thời gian thanh toán (${TIMEOUT_MINUTES} phút) mà chưa nhận được thanh toán.`,
            mappedItems
          ).catch(err => logger.error(`[OrderScheduler] Lỗi gửi email hủy đơn #${order.id}:`, err));
        }

        // 4. Bắn SSE update đến client
        if (order.userId) {
          pushToUser(order.userId, 'order_updated', {
            id: order.id,
            orderCode: order.orderCode,
            status: 'cancelled',
            paymentStatus: order.paymentStatus.toLowerCase(),
            updatedAt: new Date(),
          });
        }
      } catch (orderErr) {
        logger.error(`[OrderScheduler] Lỗi khi hủy đơn #${order.id}:`, orderErr);
      }
    }

    if (anyStockRestored) {
      await redis.del('cache:products').catch(() => {});
    }
  } catch (error) {
    logger.error('[OrderScheduler] Lỗi quét đơn hàng hết hạn:', error);
  }
};

let schedulerInterval: NodeJS.Timeout | null = null;

export const startOrderScheduler = () => {
  if (schedulerInterval) return;
  logger.info(`🕒 [OrderScheduler] Khởi động tiến trình tự động kiểm tra và hủy đơn quá hạn (${TIMEOUT_MINUTES} phút)...`);
  
  // Chạy ngay lần đầu sau 10 giây
  setTimeout(() => {
    checkAndCancelExpiredOrders().catch(() => {});
  }, 10000);

  // Chạy định kỳ mỗi 2 phút
  schedulerInterval = setInterval(() => {
    checkAndCancelExpiredOrders().catch(() => {});
  }, 2 * 60 * 1000);
};
