# Antigravity Workspace Rules

## Tự Động Push Lên Git (Auto Git Commit & Push - Bắt Buộc)

- **Nguyên tắc cốt lõi**: Bất cứ khi nào hoàn thành một tính năng, sửa lỗi, cập nhật giao diện hoặc chỉnh sửa mã nguồn theo yêu cầu của người dùng, bạn **PHẢI TỰ ĐỘNG** thực hiện toàn bộ quy trình:
  1. Kiểm tra unit test bằng `npm test` để đảm bảo không lỗi.
  2. Stage toàn bộ thay đổi: `git add .`
  3. Tạo commit với thông điệp rõ ràng: `git commit -m "<commit message chuẩn Conventional Commits>"`
  4. Đẩy trực tiếp lên kho chứa: `git push origin main`
- **Tuyệt đối không đợi người dùng nhắc nhở**: Người dùng đã ra lệnh rõ ràng: *"tự đẩy lên git giúp tôi từ giờ và về sau"*.
- Luôn thông báo ngắn gọn mã commit hoặc trạng thái đẩy mã thành công trong câu trả lời cuối cùng.

