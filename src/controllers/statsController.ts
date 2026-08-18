import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import ExcelJS from 'exceljs';

const ORDER_STATUS_MAP: Record<string, string> = {
  PENDING: 'Chờ xử lý',
  PROCESSING: 'Đang xử lý',
  SHIPPED: 'Đang giao',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã huỷ',
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  cod: 'Thanh toán khi nhận (COD)',
  payos: 'Chuyển khoản / PayOS',
};

export const getStats = async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany();
    const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
    const newOrders = orders.length;
    
    const users = await prisma.user.findMany({ where: { role: 'CUSTOMER' } });
    const newCustomers = users.length;

    res.json({
      revenue: totalRevenue,
      orders: newOrders,
      customers: newCustomers
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};

export const exportOrders = async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        items: { include: { variant: { include: { product: true } } } }
      }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Báo cáo Đơn hàng');

    // Khởi tạo cột
    worksheet.columns = [
      { header: 'Mã Đơn',         key: 'orderCode',   width: 20 },
      { header: 'Khách hàng',     key: 'customer',    width: 25 },
      { header: 'Số Điện Thoại',  key: 'phone',       width: 15 },
      { header: 'Email',          key: 'email',       width: 28 },
      { header: 'Địa chỉ giao',   key: 'address',     width: 40 },
      { header: 'Ghi chú',        key: 'note',        width: 25 },
      { header: 'Trạng thái',     key: 'status',      width: 15 },
      { header: 'Phương thức TT', key: 'payment',     width: 22 },
      { header: 'Ngày đặt',       key: 'date',        width: 18 },
      { header: 'Tổng tiền',      key: 'total',       width: 15 },
    ];

    // Format Header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD71920' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.height = 24;

    // Format Cột Tổng tiền (Tiền tệ VNĐ)
    worksheet.getColumn('total').numFmt = '#,##0" ₫"';

    // Thêm dữ liệu — ưu tiên snapshot trên order, fallback về User profile
    orders.forEach((order) => {
      const row = worksheet.addRow({
        orderCode:  order.orderCode,
        customer:   order.customerName   || order.user?.name  || 'Khách vãng lai',
        phone:      order.customerPhone  || order.user?.phone || 'N/A',
        email:      order.customerEmail  || order.user?.email || 'N/A',
        address:    order.shippingAddress || 'Chưa cập nhật',
        note:       order.note           || '',
        status:     ORDER_STATUS_MAP[order.status] || order.status,
        payment:    PAYMENT_METHOD_MAP[order.paymentMethod.toLowerCase()] || order.paymentMethod,
        date:       order.createdAt.toLocaleDateString('vi-VN'),
        total:      order.total,
      });

      // Căn giữa các ô trạng thái và phương thức
      row.getCell('status').alignment  = { horizontal: 'center' };
      row.getCell('payment').alignment = { horizontal: 'center' };
      row.getCell('date').alignment    = { horizontal: 'center' };
      row.getCell('total').alignment   = { horizontal: 'right' };
    });

    // Thêm border cho tất cả ô dữ liệu
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top:    { style: 'thin', color: { argb: 'FFD0D0D0' } },
          left:   { style: 'thin', color: { argb: 'FFD0D0D0' } },
          bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          right:  { style: 'thin', color: { argb: 'FFD0D0D0' } },
        };
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=bao-cao-don-hang.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Lỗi khi xuất Excel:', error);
    res.status(500).json({ error: 'Không thể xuất báo cáo' });
  }
};

