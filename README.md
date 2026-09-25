# AnhEmFarm

Website giới thiệu nông sản và danh mục quan tâm cho AnhEmFarm. Giai đoạn này tập trung vào dâu tằm, cà phê, trà và mật ong.

## Chạy tại máy

Yêu cầu Node.js 20.19+ hoặc 22.12+.

```bash
npm install
npm run dev
```

Mở địa chỉ do Vite hiển thị. Để tạo bản dùng cho hosting tĩnh:

```bash
npm run build
npm run preview
```

Thư mục xuất bản là `dist/`.

## Nội dung và trạng thái

- Danh mục nằm trong `src/catalog.ts`. Chỉnh tên, mô tả, ảnh và trạng thái ở đây.
- Ảnh minh họa được tạo riêng cho dự án, nằm trong `public/images/`.
- Giá, quy cách, tình trạng hàng và kênh liên hệ chưa được cung cấp nên website chưa hiển thị hoặc tự tạo các thông tin này.
- Trà và mật ong là các dòng giả định, được đánh dấu **Dự kiến** và không thể thêm vào danh sách.
- Danh sách quan tâm được lưu trên trình duyệt bằng `localStorage`. Người xem có thể sao chép danh sách, nhưng website chưa nhận đơn hoặc thanh toán trực tuyến.

## Khi chuẩn bị bán hàng trực tuyến

Xác nhận giá, quy cách, tồn kho, ảnh thật, thông tin kinh doanh và chính sách giao hàng; sau đó kết nối một hệ thống nhận đơn, thanh toán và quản lý sản phẩm. Đối với rượu dâu tằm, bổ sung thông tin sản phẩm và luồng kiểm soát độ tuổi phù hợp trước khi mở bán trực tuyến.

## Công nghệ

React, TypeScript, Vite và CSS thuần. Dữ liệu sản phẩm tách khỏi giao diện để dễ chuyển sang API hoặc CMS khi cần.
