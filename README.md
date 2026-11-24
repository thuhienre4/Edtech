# Website giới thiệu sản phẩm

Website bán hai phần mềm hỗ trợ dạy học:

- **Lớp học chung Offline**: cả lớp trả lời bằng điện thoại qua Wi-Fi của lớp, không cần Internet.
- **EngineLab Công nghệ**: học và dạy môn Công nghệ THPT lớp 10–12 với mô hình 3D, thí nghiệm ảo, trợ lí AI, phòng quiz và kho đề.

Liên hệ Zalo: 0336 501 225

## Thư mục

| Đường dẫn | Nội dung |
|---|---|
| `docs/` | Website hoàn chỉnh, đưa thẳng lên mạng được |
| `src/` | Trang gốc để sửa: `index.html` (trang chủ), `lop-hoc-chung.html`, `engine-lab.html` |
| `thong-tin.json` | Giá, số Zalo, email, tên người bán: **chỗ duy nhất cần điền** |
| `xuat-web.js` | Điền `thong-tin.json` vào các trang trong `src/` rồi xuất ra `docs/` |

## Sửa và cập nhật

1. Sửa `thong-tin.json` hoặc các trang trong `src/`.
2. Chạy `node xuat-web.js` để tạo lại `docs/`.
3. Commit và push.

Ô nào trong `thong-tin.json` còn trống sẽ hiện khung đỏ "điền ..." trên web.

## Đưa lên mạng

- **GitHub Pages**: Settings → Pages → Branch `main`, thư mục `/docs` → Save. Web chạy tại `https://thuhienre4.github.io/Edtech/`.
- **Netlify**: kéo thả thư mục `docs` vào app.netlify.com/drop. Form đặt hàng và đăng ký chỉ nhận được đơn khi chạy trên Netlify (xem trong mục Forms).
