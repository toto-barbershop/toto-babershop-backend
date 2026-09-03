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
          await (tx.order as any).update({
            where: { id: order.id },
            data: {
              status: 'CANCELLED',
              cancelReason: `Hết hạn thanh toán quá ${TIMEOUT_MINUTES} phút`,
              cancelledBy: 'system_timeout',
              note: order.note ? `${order.note} | [Hệ thống tự động hủy do hết hạn thanh toán 15 phút]` : '[Hệ thống tự động hủy do hết hạn thanh toán 15 phút]',
            },
          });

          // 3. Ghi audit log lịch sử đơn hàng (bọc try-catch để không làm abort transaction nếu bảng gặp sự cố)
          try {
            await tx.orderStatusHistory.create({
              data: {
                orderId: order.id,
                oldStatus: 'PENDING',
                newStatus: 'CANCELLED',
                changedBy: 'system-scheduler',
                note: `Hệ thống tự động hủy do quá hạn thời gian thanh toán (${TIMEOUT_MINUTES} phút)`,
              }
            });
          } catch (auditErr) {
            logger.warn(`[OrderScheduler] Không thể ghi audit log cho đơn #${order.id}`, { err: String(auditErr) });
          }
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
    logger.error('[OrderScheduler] Lỗi quét đơn hàng PayOS hết hạn:', error);
  }
};

const COD_STALE_DAYS = 3;

/**
 * Tự động hủy và hoàn kho cho các đơn COD bị treo ở trạng thái PENDING quá 3 ngày (không được xác nhận)
 */
export const checkAndCancelStaleCodOrders = async () => {
  try {
    const codThreshold = new Date(Date.now() - COD_STALE_DAYS * 24 * 60 * 60 * 1000);

    const staleCodOrders = await prisma.order.findMany({
      where: {
        paymentMethod: { in: ['cod', 'COD'] },
        status: 'PENDING',
        createdAt: { lt: codThreshold },
      },
      include: {
        items: { include: { product: true, variant: true } },
        user: true,
      },
    });

    if (!staleCodOrders || staleCodOrders.length === 0) {
      return;
    }

    logger.info(`[OrderScheduler] Tìm thấy ${staleCodOrders.length} đơn hàng COD chờ xử lý quá ${COD_STALE_DAYS} ngày, đang tiến hành tự động hủy và hoàn kho...`);

    let anyStockRestored = false;

    for (const order of staleCodOrders) {
      try {
        await prisma.$transaction(async (tx) => {
          // 1. Hoàn trả stock kho
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
          await (tx.order as any).update({
            where: { id: order.id },
            data: {
              status: 'CANCELLED',
              cancelReason: `Quá ${COD_STALE_DAYS} ngày chưa được xác nhận`,
              cancelledBy: 'system_timeout',
              note: order.note
                ? `${order.note} | [Hệ thống tự động hủy do quá ${COD_STALE_DAYS} ngày chưa được xác nhận]`
                : `[Hệ thống tự động hủy do quá ${COD_STALE_DAYS} ngày chưa được xác nhận]`,
            },
          });

          // 3. Ghi audit log
          try {
            await tx.orderStatusHistory.create({
              data: {
                orderId: order.id,
                oldStatus: 'PENDING',
                newStatus: 'CANCELLED',
                changedBy: 'system-scheduler',
                note: `Hệ thống tự động hủy đơn COD quá ${COD_STALE_DAYS} ngày chưa được shop xác nhận`,
              },
            });
          } catch (auditErr) {
            logger.warn(`[OrderScheduler] Không thể ghi audit log cho đơn COD #${order.id}`, { err: String(auditErr) });
          }
        });

        logger.info(`[OrderScheduler] Đã tự động hủy đơn COD #${order.orderCode || order.id} do quá ${COD_STALE_DAYS} ngày`);

        // Gửi email hủy đơn
        const customerEmail = order.customerEmail || order.user?.email;
        const customerName = order.customerName || order.user?.name || undefined;
        const mappedItems = order.items.map((i) => {
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
            `Đơn hàng tự động hủy do đã quá ${COD_STALE_DAYS} ngày mà chưa thể liên hệ xác nhận đơn.`,
            mappedItems
          ).catch((err) => logger.error(`[OrderScheduler] Lỗi gửi email hủy đơn COD #${order.id}:`, err));
        }

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
        logger.error(`[OrderScheduler] Lỗi khi hủy đơn COD #${order.id}:`, orderErr);
      }
    }

    if (anyStockRestored) {
      await redis.del('cache:products').catch(() => {});
    }
  } catch (error) {
    logger.error('[OrderScheduler] Lỗi quét đơn hàng COD quá hạn:', error);
  }
};

let schedulerInterval: NodeJS.Timeout | null = null;

export const startOrderScheduler = () => {
  if (schedulerInterval) return;
  logger.info(`🕒 [OrderScheduler] Khởi động tiến trình tự động kiểm tra và hủy đơn quá hạn (PayOS 15 phút, COD ${COD_STALE_DAYS} ngày)...`);

  // Chạy ngay lần đầu sau 10 giây
  setTimeout(() => {
    checkAndCancelExpiredOrders().catch(() => {});
    checkAndCancelStaleCodOrders().catch(() => {});
  }, 10000);

  // Chạy định kỳ mỗi 2 phút
  schedulerInterval = setInterval(() => {
    checkAndCancelExpiredOrders().catch(() => {});
    checkAndCancelStaleCodOrders().catch(() => {});
  }, 2 * 60 * 1000);
};
