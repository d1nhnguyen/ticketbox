import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Mode can be: 'success', 'timeout', 'failure'
let gatewayMode: 'success' | 'timeout' | 'failure' = (process.env.GATEWAY_MODE as any) || 'success';

// Idempotency store: a repeated idempotencyKey returns the SAME charge (same txnId)
// instead of charging again — mirrors how VNPAY/MoMo dedup retries / double-clicks.
const idempotencyStore = new Map<string, any>();

app.get('/pay', (req, res) => {
  const { orderId, amount, concertSlug } = req.query;

  if (!orderId || !amount) {
    return res.status(400).send('<h1>Lỗi</h1><p>Thiếu orderId hoặc amount trong yêu cầu.</p>');
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Cổng Thanh Toán Giả Lập — TicketBox</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
      <style>
        body {
          font-family: 'Outfit', sans-serif;
          background: radial-gradient(circle at top left, #0f172a 0%, #1e1b4b 100%);
          color: #f8fafc;
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          overflow-x: hidden;
        }
        .container {
          background: rgba(30, 41, 59, 0.7);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 40px;
          width: 100%;
          max-width: 480px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          text-align: center;
          animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .logo {
          font-size: 2rem;
          font-weight: 700;
          background: linear-gradient(135deg, #38bdf8 0%, #818cf8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 20px;
          letter-spacing: 0.5px;
        }
        .card {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.05) 100%);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 30px;
          text-align: left;
        }
        .card-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .card-row:last-child {
          margin-bottom: 0;
          padding-top: 12px;
          border-top: 1px dashed rgba(255, 255, 255, 0.1);
        }
        .label {
          color: #94a3b8;
          font-size: 0.9rem;
        }
        .value {
          font-weight: 600;
          color: #f1f5f9;
          word-break: break-all;
        }
        .amount {
          font-size: 1.5rem;
          color: #38bdf8;
          font-weight: 700;
        }
        .btn {
          width: 100%;
          padding: 16px;
          border-radius: 12px;
          border: none;
          font-size: 1.1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          margin-bottom: 15px;
        }
        .btn-success {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.3);
        }
        .btn-success:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px 0 rgba(16, 185, 129, 0.4);
        }
        .btn-fail {
          background: transparent;
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #f87171;
        }
        .btn-fail:hover {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }
        .footer {
          margin-top: 20px;
          font-size: 0.8rem;
          color: #64748b;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">TICKETBOX GATEWAY</div>
        <p style="color: #94a3b8; margin-top: -10px; margin-bottom: 30px;">Cổng thanh toán giả lập dành cho môi trường thử nghiệm</p>
        
        <div class="card">
          <div class="card-row">
            <span class="label">Mã đơn hàng</span>
            <span class="value" style="font-family: monospace; font-size: 0.95rem;">${orderId}</span>
          </div>
          <div class="card-row">
            <span class="label">Trạng thái</span>
            <span class="value" style="color: #fbbf24;">Chờ thanh toán</span>
          </div>
          <div class="card-row">
            <span class="label">Số tiền</span>
            <span class="amount">${Number(amount).toLocaleString('vi-VN')} VNĐ</span>
          </div>
        </div>

        <button class="btn btn-success" onclick="pay(true)">XÁC NHẬN THANH TOÁN THÀNH CÔNG</button>
        <button class="btn btn-fail" onclick="pay(false)">HỦY GIAO DỊCH (THANH TOÁN THẤT BẠI)</button>
        
        <div class="footer">
          Trang web này đóng vai trò giả lập xử lý ngân hàng.<br>Không sử dụng tài khoản/thông tin thẻ thật tại đây.
        </div>
      </div>

      <script>
        function pay(success) {
          if (success) {
            window.location.href = 'http://localhost:5173/orders/${orderId}/success';
          } else {
            const slug = '${concertSlug || ''}';
            if (slug) {
              window.location.href = 'http://localhost:5173/concert/' + slug + '?payment_error=cancelled&orderId=${orderId}';
            } else {
              window.location.href = 'http://localhost:5173/?payment_error=failed';
            }
          }
        }
      </script>
    </body>
    </html>
  `);
});

app.post('/pay', (req, res) => {
  const { orderId, amount, idempotencyKey } = req.body;

  if (!orderId || !amount) {
    return res.status(400).json({ error: 'Missing orderId or amount' });
  }

  // Replay a prior successful charge for the same key — do NOT charge twice.
  if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
    const prior = idempotencyStore.get(idempotencyKey);
    console.log(`REPLAY ${prior.txnId} key=${idempotencyKey} (no second charge)`);
    return res.status(200).json(prior);
  }

  const txnId = `txn_${crypto.randomUUID()}`;

  switch (gatewayMode) {
    case 'success': {
      const payload = { status: 'success', txnId, orderId, amount };
      if (idempotencyKey) idempotencyStore.set(idempotencyKey, payload);
      console.log(`CHARGE ${txnId} order=${orderId} amount=${amount} key=${idempotencyKey}`);
      return res.status(200).json(payload);
    }

    case 'timeout':
      // Delay for a long time to simulate timeout (e.g., 10 seconds)
      setTimeout(() => {
        res.status(200).json({
          status: 'success',
          txnId,
          orderId,
          amount
        });
      }, 10000);
      break;

    case 'failure':
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Payment gateway failed to process the request'
      });
      
    default:
      return res.status(200).json({ status: 'success', txnId, orderId, amount });
  }
});

app.post('/admin/mode', (req, res) => {
  const { mode } = req.body;
  if (['success', 'timeout', 'failure'].includes(mode)) {
    gatewayMode = mode;
    return res.status(200).json({ message: `Gateway mode updated to ${gatewayMode}` });
  }
  return res.status(400).json({ error: 'Invalid mode. Must be success, timeout, or failure.' });
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Mock Payment Gateway listening on port ${PORT}`);
  console.log(`Initial Mode: ${gatewayMode}`);
});
