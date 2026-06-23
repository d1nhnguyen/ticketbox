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
