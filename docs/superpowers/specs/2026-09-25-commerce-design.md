# AnhEmFarm — đặc tả website bán hàng v1

Trạng thái: chờ chủ dự án duyệt bản đặc tả. Chưa có implementation plan được duyệt.

## 1. Quyết định đã được xác nhận

Chủ dự án đã duyệt hướng xây dựng cửa hàng hoàn chỉnh và COD, sau đó yêu cầu backend Node.js vì đây là stack làm việc thực tế và xác nhận “DUYỆT”. Stack chính là React, Node.js + TypeScript và PostgreSQL. Django đã bị loại khỏi phương án triển khai.

Mục tiêu: khách đăng ký, đăng nhập, chọn sản phẩm, đặt đơn COD và theo dõi đơn; admin quản lý sản phẩm, khách hàng, tồn kho, bán hàng và xử lý đơn. Dữ liệu phải tồn tại sau khi server khởi động lại. Giữ thương hiệu AnhEmFarm, tiếng Việt, tông đỏ, sử dụng được trên điện thoại.

V1 gồm một cửa hàng, một kho, tiền VND và giao nội địa. Thanh toán trực tuyến, đồng bộ hãng vận chuyển, nhiều người bán, mã giảm giá và tích điểm nằm ngoài v1. Nội dung chính sách và thông tin kinh doanh cần chủ cửa hàng xác nhận trước khi công khai nhận đơn.

## 2. Kiến trúc đề xuất

- Frontend: giữ React + TypeScript + Vite; thêm router, quản lý dữ liệu API, tách App.tsx thành các tính năng.
- Backend: Node.js 24 LTS + TypeScript, NestJS với Express; một ứng dụng chia module, không dùng microservice.
- Database: PostgreSQL; Prisma quản lý schema, migration và truy vấn. Checkout và thay đổi tồn kho dùng transaction; truy vấn khóa đặc thù phải tham số hóa.
- API REST `/api/v1`; frontend/API cùng origin qua reverse proxy. Session phía server; không lưu token đăng nhập trong localStorage.
- Ảnh: adapter storage, local dùng volume bền vững, production dùng S3-compatible object storage; database lưu metadata và object key.
- Email: SMTP, hộp thư thử nghiệm ở local, PostgreSQL outbox và worker để retry bền vững. Chưa cần Redis.
- Repository giữ `src/` cho frontend, thêm `server/`, `e2e/`, `deploy/` và `docs/operations/`. Phiên bản dependency và lockfile được pin trong kế hoạch triển khai.

Node 24 thuộc LTS theo [lịch phát hành chính thức](https://nodejs.org/en/about/previous-releases). [Tài liệu NestJS](https://docs.nestjs.com/) mô tả module, guard, validation và testing. NestJS/Prisma là lựa chọn kỹ thuật đề xuất ở đây, không phải yêu cầu của Superpowers.

## 3. Module và dữ liệu

| Module | Trách nhiệm | Dữ liệu |
| --- | --- | --- |
| Identity | Tài khoản, xác minh email, mật khẩu, session, quyền | User, Session, AccountToken |
| Catalog | Danh mục, sản phẩm, SKU/biến thể, ảnh | Category, Product, Variant, Media |
| Inventory | Tồn khả dụng và lịch sử điều chỉnh | Variant stock, InventoryMovement |
| Cart | Giỏ và hợp nhất giỏ khách vãng lai | Cart, CartItem |
| Orders | Báo giá, checkout, đơn, giao nhận COD | CheckoutQuote, Order, OrderItem, OrderEvent |
| Operations | Admin, báo cáo, audit, cấu hình và nội dung | AuditLog, StoreSettings, ShippingZone, ContentPage |
| Infrastructure | Email, storage, health check, cấu hình | EmailOutbox |

Mọi thay đổi trạng thái đơn và tồn kho phải qua service nghiệp vụ. Controller hoặc công cụ admin không được bỏ qua các quy tắc này.

## 4. Trang và trải nghiệm

| Nhóm | Route dự kiến | Chức năng |
| --- | --- | --- |
| Công khai | `/`, `/san-pham`, `/san-pham/:slug` | Tìm kiếm, lọc, sắp xếp, phân trang, chi tiết, chọn biến thể |
| Xác thực | `/dang-ky`, `/dang-nhap`, `/xac-minh-email`, `/quen-mat-khau`, `/dat-lai-mat-khau` | Form, validation, trạng thái gửi, lỗi và hướng khắc phục |
| Mua hàng | `/gio-hang`, `/thanh-toan` | Số lượng, địa chỉ, báo giá, phí giao, xác nhận COD |
| Cá nhân | `/tai-khoan`, `/tai-khoan/dia-chi`, `/tai-khoan/don-hang`, `/tai-khoan/don-hang/:id` | Hồ sơ, địa chỉ, xác nhận đơn, danh sách và lịch sử đơn của chính mình |
| Nội dung | `/ve-chung-toi`, `/lien-he`, `/chinh-sach/:slug` | Nội dung được duyệt, trang 404 và lỗi có đường quay lại |
| Quản trị | `/admin` và các trang con | Tổng quan, sản phẩm, danh mục, kho, đơn, khách, nội dung/cấu hình |

Khách vãng lai được xem và tạo giỏ trên thiết bị; checkout yêu cầu tài khoản hoạt động, email đã xác minh. Giỏ hợp nhất sau đăng nhập bằng khóa yêu cầu để refresh không cộng lại. Logout xóa cache tài khoản trên giao diện; giỏ server vẫn thuộc đúng tài khoản cũ.

Mỗi trang có loading/empty/error/success; bộ lọc nằm trong URL. Form hiển thị lỗi theo trường và giữ dữ liệu hợp lệ khi retry. Modal quản lý focus/Escape/trả focus; hiệu ứng tôn trọng reduced motion. Kiểm tra mốc 360px, 768px, 1440px và không tràn ngang.

Trang sản phẩm có metadata riêng và nội dung đọc được khi crawler không chạy JavaScript, bằng rendering/prerender phía server; không thay toàn bộ stack vì yêu cầu này. Không cache công khai tài khoản/admin; không đưa các trang riêng tư vào sitemap.

## 5. Tài khoản và bảo vệ quyền

- CUSTOMER và ADMIN. Đăng ký công khai luôn tạo CUSTOMER; request chứa role đặc quyền không được cấp quyền.
- Email chuẩn hóa, unique ở database. Mật khẩu 12–128 ký tự, băm Argon2id bằng thư viện được duy trì; không log mật khẩu/token.
- Token xác minh email hết hạn 24 giờ; reset mật khẩu 1 giờ. Token ngẫu nhiên, database lưu digest, chỉ dùng một lần; phát lại vô hiệu token cũ cùng mục đích.
- Session cookie HttpOnly, Secure trên production, SameSite=Lax; TTL khách 7 ngày, admin 12 giờ. Logout thu hồi session hiện tại. Reset/đổi mật khẩu hoặc khóa tài khoản thu hồi mọi session.
- Mutation có kiểm tra origin và CSRF, kể cả đăng nhập. Mọi request kiểm tra user hoạt động, role và quyền sở hữu; khách không được xem đơn/địa chỉ người khác. Không trả hash/session/token trong response thông thường.
- Login dùng thông báo lỗi chung. Reset/resend trả thông báo trung tính dù email không tồn tại. Bộ đếm rate limit dùng chung giữa các process; trả 429 và Retry-After.
- Mặc định: login 10 lần/15 phút/cặp IP-email và 60 lần/15 phút/IP; đăng ký 10 lần/giờ/IP; email xác minh/reset 3 lần/giờ/tài khoản và 20 lần/giờ/IP. Cấu hình thay đổi được, có kiểm thử.
- Admin đầu tiên được tạo bằng lệnh vận hành, không có mật khẩu mặc định trong source. Admin UI quản lý CUSTOMER. Cấp thêm ADMIN qua lệnh vận hành có audit, không qua form đăng ký hoặc form sửa khách.

## 6. Sản phẩm, biến thể và ảnh

Product: slug unique, tên, mô tả, danh mục, ảnh, DRAFT/PUBLISHED/ARCHIVED. Variant: SKU unique, nhãn biến thể, giá VND nguyên dương, tồn nguyên không âm, trạng thái bán và phiên bản dữ liệu. Khách mua SKU cụ thể, ví dụ Robusta rang hạt hoặc xay khi admin cấu hình.

Đơn lưu snapshot tên/SKU/biến thể/giá; sửa sản phẩm không sửa đơn cũ. Sản phẩm đã có đơn được archive, không xóa phá lịch sử. Phân trang API có giới hạn, sort theo allowlist và tiebreaker ổn định.

Trà/mật ong giả định, sản phẩm chưa xác nhận giá/quy cách và SKU hết kho không được checkout. Demo seed chỉ chạy khi có cờ explicit ở dev/test, không tự chạy production. Ảnh hiện tại là minh họa đến khi thay ảnh thật. Rượu dâu khóa bán mặc định; chủ cửa hàng chỉ bật sau khi xác nhận thông tin và điều kiện bán, với xác nhận 18+ trong checkout.

Upload chỉ ADMIN, tối đa 5MB/ảnh, kiểm tra nội dung thực JPEG/PNG/WebP và giới hạn pixel; tái mã hóa, loại metadata, tên object ngẫu nhiên. Không fetch URL tùy ý từ client. Chỉ public ảnh sau xử lý thành công.

## 7. Giỏ, báo giá và checkout COD

Tiền là số nguyên VND. Tổng đơn = tổng giá SKU × số lượng + phí giao; giá sản phẩm là giá cuối cùng hiển thị, không thêm phí/thuế chưa công bố. Server không tin giá và tổng client gửi.

1. Số lượng nguyên 1–99 mỗi SKU, tối đa 50 dòng. SKU không bán/không tồn tại bị từ chối.
2. Thu tên người nhận, số điện thoại, tỉnh/thành thuộc vùng phục vụ, địa chỉ chi tiết, ghi chú tối đa 500 ký tự. Validation server không phụ thuộc một danh sách đơn vị hành chính cũ hardcode.
3. Báo giá lưu DB, hiệu lực 15 phút, gắn user/dòng hàng/địa chỉ/phí giao. Vùng chưa có ShippingZone đang bật không được đặt đơn; phí giao do admin cấu hình.
4. Xác nhận bằng quote ID và `Idempotency-Key`. Giá/trạng thái hàng/phí thay đổi làm quote không hợp lệ; trả 409 và yêu cầu xác nhận báo giá mới.
5. Trong một transaction: khóa SKU theo thứ tự ổn định, kiểm tra/trừ tồn khả dụng, tạo đơn và dòng hàng/lịch sử, đánh dấu quote đã dùng. Một quote chỉ tạo một đơn ngay cả khi đổi key.
6. Key unique theo user. Cùng key/cùng nội dung trả đơn cũ, cùng key/khác nội dung trả 409. Retry hoặc hai request đồng thời không trừ kho hai lần.
7. Giỏ có version; tạo quote ghi nhận version và số lượng từng dòng. Khi checkout, chỉ xóa các dòng mua nếu giỏ vẫn cùng version; nếu giỏ đã đổi, giữ giỏ và báo khách kiểm tra lại. Không làm mất món thêm trong lúc checkout.
8. Ghi email outbox cùng transaction, gửi ngoài transaction. SMTP lỗi không hủy đơn thành công. Transaction thất bại rollback toàn bộ; deadlock/serialization failure retry có giới hạn, hết lượt trả lỗi có thể thử lại.

Không giữ transaction trong lúc gọi dịch vụ ngoài. API lỗi có code ổn định, thông báo tiếng Việt, lỗi theo trường; không lộ stack trace. Lưu snapshot người nhận để chỉnh sổ địa chỉ không thay đơn cũ.

## 8. Vòng đời đơn và tồn kho

| Từ | Sang | Quyền và điều kiện |
| --- | --- | --- |
| PENDING | CONFIRMED | ADMIN nhận xử lý |
| PENDING | CANCELLED | Chủ đơn hoặc ADMIN, có lý do |
| CONFIRMED | CANCELLED | ADMIN, chưa gửi hàng, có lý do |
| CONFIRMED | SHIPPING | ADMIN ghi đơn vị/mã vận đơn hoặc ghi cửa hàng tự giao |
| SHIPPING | DELIVERED | ADMIN xác nhận đã giao |
| SHIPPING | RETURNED | ADMIN xác nhận giao thất bại và đã thực nhận lại hàng |

Không được bỏ bước hoặc chuyển ngược. Khách không tự sửa tổng/trạng thái/địa chỉ đơn; muốn đổi địa chỉ trước xác nhận thì hủy và đặt lại. PENDING quá 24 giờ được đánh dấu cần xử lý, không tự hủy.

CANCELLED hoàn tồn một lần trong cùng transaction chuyển trạng thái. RETURNED yêu cầu số lượng nhập lại từng SKU trong khoảng 0 đến số đã giao; phần hỏng không tăng tồn. Stock movement ghi actor/lý do/đơn. Điều chỉnh tồn admin cũng dùng khóa/phiên bản để không ghi đè checkout; stock không âm.

COD tách trạng thái DUE/COLLECTED. Chỉ ADMIN được đánh dấu COLLECTED khi đơn DELIVERED và xác nhận đã thu. Bấm lặp không tạo lần thu thứ hai. Sửa thu nhầm về DUE cần lý do và audit, giữ lịch sử cũ. Không có hoàn tiền tự động hoặc workflow hoàn hàng sau khi đã nhận ở v1; ngoại lệ được xử lý thủ công và ghi chú, không tạo giao dịch tiền giả.

## 9. Quản trị và báo cáo

Layout React riêng cho admin; mọi `/api/v1/admin` kiểm tra ADMIN tại server. Chức năng: CRUD danh mục/sản phẩm/biến thể/ảnh, publish/archive, điều chỉnh kho có lý do, tìm khách, xem lịch sử mua, khóa/mở CUSTOMER, lọc/xử lý đơn, chỉnh phí giao và nội dung.

Audit cho thay đổi sản phẩm, kho, tài khoản, trạng thái/thu COD, phí giao và nội dung: actor/thời gian/đối tượng/thay đổi cần thiết, giảm thiểu thông tin nhạy cảm. API không cho sửa hoặc xóa audit.

Dashboard dùng múi giờ Asia/Ho_Chi_Minh, khoảng ngày gồm ngày đầu/cuối, query theo UTC. “Giá trị đơn đã giao” = tổng đơn DELIVERED theo ngày giao. “COD đã thu” = tiền đang COLLECTED theo thời điểm ghi thu; thao tác sửa thu sai được loại khỏi chỉ số này nhưng còn audit. “COD chưa thu” = đơn DELIVERED/DUE. Không tính đơn CANCELLED/RETURNED vào doanh số đã giao, không gọi những chỉ số này là lợi nhuận. Phân trang danh sách và giới hạn khoảng truy vấn báo cáo.

## 10. Nội dung và triển khai

- Admin chỉnh trang giới thiệu/liên hệ/chính sách bằng text hoặc Markdown được sanitize. Draft có trạng thái rõ; chưa duyệt không giả làm chính sách có hiệu lực.
- Docker/Compose cho local/staging. Production: một origin HTTPS, frontend/reverse proxy, API/worker, PostgreSQL bền vững, object storage. Không dùng Vite dev server cho production.
- `.env.example` không chứa secret. Production fail-fast khi thiếu origin, DB, session secret, SMTP/storage bắt buộc hoặc đang dùng cấu hình demo.
- Migration versioned, chạy riêng trước đổi traffic; không schema reset/push phá dữ liệu. Tài liệu rollback và restore phải được kiểm tra.
- Liveness kiểm tra process; readiness kiểm tra DB/schema. Response health công khai không lộ credentials hoặc topology.
- Log có request ID, độ trễ và mức lỗi; redact cookie/token/mật khẩu/email/địa chỉ. Error UI có retry an toàn.
- Backup DB hằng ngày và trước migration, lưu ngoài máy ứng dụng, ít nhất 30 ngày; ảnh có versioning/backup tương ứng. Restore thử trên môi trường cô lập, kiểm tra đơn/tồn/ảnh và vô hiệu session sau restore.
- Worker email có lease phục hồi sau crash, retry backoff có giới hạn, theo dõi lỗi hết lượt. SMTP timeout có thể gây email trùng nhưng không tạo đơn trùng.
- Chỉ mở nhận đơn thật khi có giá/SKU/stock, phí/vùng giao, thông tin kinh doanh/hỗ trợ, chính sách được duyệt, domain/HTTPS và email hoạt động. Khi thiếu đầu vào, vẫn phát triển/test bằng fixture tách biệt; ghi rõ chưa đạt điều kiện launch.

## 11. Kiểm chứng bắt buộc

TDD cho auth, phân quyền, giá, checkout, tồn kho, trạng thái. Unit test quy tắc thuần; integration test PostgreSQL thật cho transaction/constraints; E2E browser cho khách và admin. Không thay PostgreSQL bằng SQLite trong kiểm thử tranh chấp kho.

1. Đăng ký → xác minh → login → đổi/reset mật khẩu → logout; token hết hạn/dùng lại bị từ chối, khóa user thu hồi session.
2. CUSTOMER không vào API admin hoặc xem/sửa đơn/địa chỉ người khác; payload role không nâng quyền.
3. Nháp/thiếu giá/hết kho không checkout; validation và rate limit đúng; input đặc biệt không được thực thi HTML/SQL.
4. Tổng client sửa không có hiệu lực; giá/phí đổi sau quote yêu cầu xác nhận lại.
5. Hai người tranh món cuối chỉ một đơn thành công; request lặp/quote dùng lại không tạo đơn trùng; lỗi transaction không để lại đơn/kho dở dang.
6. Hủy hoàn tồn một lần; trạng thái trái phép bị từ chối; nhập lại không vượt số giao; sửa kho đồng thời với mua không mất cập nhật.
7. Mutation thiếu CSRF/session bị từ chối; ảnh giả định dạng/quá lớn bị chặn; lỗi SMTP không mất đơn.
8. E2E khách mua COD → admin xác nhận/giao/ghi thu → khách thấy trạng thái; refresh/restart giữ dữ liệu, logout không lộ cache tài khoản.
9. Build/typecheck/test/CI đạt; kiểm tra mobile/keyboard/reduced motion/metadata và restore trước khi tuyên bố production-ready.

Mỗi lần kiểm chứng ghi lệnh, môi trường và kết quả thực. Frontend build xanh không chứng minh backend hoặc deployment hoạt động.

## 12. Chia công việc cho kế hoạch sau duyệt

A. Foundation: Node/TypeScript, DB/migration, CI, auth/session/email và phân quyền.
B. Catalog: trang công khai, SKU/media, admin và tồn kho.
C. Commerce: giỏ, quote/COD/đơn, admin fulfillment, báo cáo và audit.
D. Completion: nội dung, accessibility/responsive/SEO, deploy, backup/restore, review cuối.

Đây là các nhóm phụ thuộc trong bản phát hành, chưa phải implementation plan. Kế hoạch sau duyệt phải chỉ rõ file/API contracts/test thất bại/bước triển khai/lệnh kiểm chứng cho từng task. Agent đọc spec cùng plan và cập nhật bàn giao; không ghi khống approval, review hoặc test.

## 13. Tự rà soát

Đã rà soát: Node.js thay Django; prototype tách dữ liệu bán thật; quyền và ownership; tiền VND; khóa tồn, quote/idempotency, hủy/hoàn về; email ngoài transaction; doanh số tách thu COD; đầu vào vận hành tách khỏi fixture test. Không có placeholder kỹ thuật chưa định nghĩa. Các thông tin giá/liên hệ/cấu hình dịch vụ là dữ liệu vận hành do chủ cửa hàng cung cấp, không được tự bịa. Bản đặc tả này vẫn chờ chủ dự án review.
