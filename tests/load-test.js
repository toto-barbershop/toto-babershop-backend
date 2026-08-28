import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom Metrics
export const errorRate = new Rate('error_rate');
export const productsLatency = new Trend('products_latency');
export const servicesLatency = new Trend('services_latency');

// Cấu hình kịch bản tải thực tế (Realistic Load Test Scenario)
export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Giai đoạn 1: Tăng dần từ 0 lên 20 VUs (Warm-up)
    { duration: '1m', target: 50 },   // Giai đoạn 2: Giữ tải ổn định ở 50 VUs (Peak traffic bình thường)
    { duration: '30s', target: 100 }, // Giai đoạn 3: Đẩy lên đỉnh điểm 100 VUs (Flash sale / Sự kiện)
    { duration: '30s', target: 0 },   // Giai đoạn 4: Hạ tải về 0 (Cool-down)
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],    // Tỷ lệ lỗi HTTP phải dưới 1%
    http_req_duration: ['p(95)<500'],  // 95% số request phải phản hồi dưới 500ms
    error_rate: ['rate<0.01'],
  },
};

export default function () {
  // Lấy BASE_URL và LOAD_TEST_SECRET từ biến môi trường
  const BASE_URL = __ENV.BASE_URL || 'https://160-30-157-229.sslip.io';
  const LOAD_TEST_SECRET = __ENV.LOAD_TEST_SECRET || '';

  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'k6-load-test/1.0',
  };

  // Nếu có truyền LOAD_TEST_SECRET thì thêm header bảo mật để bypass rate limiter an toàn
  if (LOAD_TEST_SECRET) {
    headers['X-Load-Test-Token'] = LOAD_TEST_SECRET;
  }

  const params = { headers };

  // 1. Khách hàng tải danh mục sản phẩm (Products - Truy vấn Database PostgreSQL)
  const resProducts = http.get(`${BASE_URL}/api/products`, params);
  productsLatency.add(resProducts.timings.duration);
  const successProducts = check(resProducts, {
    'products status 200': (r) => r.status === 200,
  });
  errorRate.add(!successProducts);

  sleep(0.5); // Nghỉ 0.5s giữa các thao tác như người dùng thật

  // 2. Khách hàng xem danh sách dịch vụ (Services - Truy vấn Database)
  const resServices = http.get(`${BASE_URL}/api/services`, params);
  servicesLatency.add(resServices.timings.duration);
  const successServices = check(resServices, {
    'services status 200': (r) => r.status === 200,
  });
  errorRate.add(!successServices);

  sleep(0.5);

  // 3. Khách hàng tải thông tin tiệm (Settings & Categories)
  const resSettings = http.get(`${BASE_URL}/api/settings`, params);
  check(resSettings, {
    'settings status 200': (r) => r.status === 200,
  });

  const resCategories = http.get(`${BASE_URL}/api/categories`, params);
  check(resCategories, {
    'categories status 200': (r) => r.status === 200,
  });

  sleep(1); // Người dùng dừng lại đọc nội dung (Think time)
}
