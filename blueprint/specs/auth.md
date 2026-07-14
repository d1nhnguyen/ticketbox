# Đặc tả xác thực và phân quyền RBAC

## Mô tả

Hệ thống sử dụng JWT Bearer không trạng thái và phân quyền theo vai trò (RBAC) với ba vai trò: `AUDIENCE`, `ORGANIZER`, `SCANNER`. Mật khẩu được băm bằng bcrypt và không bao giờ được lưu hay trả về ở dạng văn bản thuần. JWT mang payload `{ sub, email, role }`; các endpoint khai báo bảo vệ bằng `@UseGuards(JwtAuthGuard, RolesGuard)` và `@Roles(...)`.

Mã nguồn nằm tại `src/backend/src/auth/`.

## Luồng chính

```mermaid
sequenceDiagram
  participant C as Máy khách
  participant API as AuthController
  participant S as AuthService
  participant DB as PostgreSQL
  C->>API: POST /auth/register { email, password }
  API->>S: register()
  S->>DB: findUnique(email)
  alt Email chưa tồn tại
    S->>S: bcrypt.hash(password)
    S->>DB: Tạo User với role AUDIENCE
    S-->>C: 201 { id, email, role }
  else Email đã tồn tại
    S-->>C: 400 Bad Request
  end
  C->>API: POST /auth/login { email, password }
  API->>S: login()
  S->>DB: findUnique(email)
  S->>S: bcrypt.compare(password, passwordHash)
  S-->>C: { access_token }
  C->>API: GET /protected (Bearer token)
  Note over API: JwtAuthGuard → JwtStrategy.validate → req.user
  Note over API: RolesGuard đối chiếu @Roles() với user.role
  API-->>C: 200 (được phép) / 403 (sai vai trò)
```

1. **Đăng ký:** `POST /auth/register` nhận `{ email, password }`. Service từ chối email trùng, băm mật khẩu với salt riêng rồi tạo người dùng. Vì lý do an toàn, tự đăng ký luôn gán vai trò `AUDIENCE`; tài khoản `ORGANIZER` và `SCANNER` được cấp sẵn bằng seed hoặc quy trình quản trị.
2. **Đăng nhập:** `POST /auth/login` nhận `{ email, password }`, so sánh mật khẩu bằng bcrypt, ký JWT `{ sub: user.id, email, role }` và trả `{ access_token }`.
3. **Yêu cầu đã xác thực:** Máy khách gửi `Authorization: Bearer <token>`. `JwtAuthGuard` gọi `JwtStrategy` để kiểm tra chữ ký, hạn dùng bằng `JWT_SECRET`, rồi gắn `{ userId, email, role }` vào `req.user`.
4. **Phân quyền:** `RolesGuard` đọc metadata của `@Roles(...)` qua `Reflector`. Nếu không khai báo metadata, mọi người dùng đã xác thực đều được qua; nếu có, vai trò phải thuộc tập được yêu cầu.

## Kịch bản lỗi

- Email đăng ký đã tồn tại → `400 Bad Request` (`This email is existed!`).
- Email không tồn tại hoặc sai mật khẩu → `401 Unauthorized` với cùng thông báo chung để hạn chế dò tài khoản.
- Token thiếu, sai định dạng hoặc hết hạn trên route được bảo vệ → `401 Unauthorized`.
- Token hợp lệ nhưng không đủ vai trò → `403 Forbidden`.

## Ràng buộc

- Không ghi log hoặc trả về mật khẩu thuần hay `passwordHash`.
- JWT được ký bằng `JWT_SECRET` từ `@nestjs/config`.
- Không có session phía máy chủ, refresh token hay danh sách thu hồi token.
- `JwtAuthGuard` phải chạy trước `RolesGuard`.
- `GET /concerts` và `GET /concerts/:slug` cố ý là API công khai.
- Đăng ký công khai không được nhận vai trò do client cung cấp.

## Tiêu chí chấp nhận

- Đăng ký thành công trả người dùng có vai trò `AUDIENCE`; sau đó đăng nhập trả JWT hợp lệ với payload đúng.
- Tài khoản `ORGANIZER` và `SCANNER` được seed có thể đăng nhập và nhận JWT đúng vai trò.
- Token `AUDIENCE` gọi endpoint yêu cầu `ORGANIZER` → `403`.
- Không có token hoặc token không hợp lệ gọi endpoint được bảo vệ → `401`.
- Sai mật khẩu → `401`; email đăng ký trùng → `400`.
