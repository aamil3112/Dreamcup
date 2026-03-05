# Razorpay Payment Security

## Current Implementation (Secure)

The payment flow **correctly** verifies payments on the backend before showing success:

1. **Order creation** (`POST /api/checkout`) – Backend creates Razorpay order
2. **Payment handler** – On Razorpay success, the handler sends `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature` to backend
3. **Verification** (`POST /api/paymentverification`) – Backend verifies the signature using Razorpay's secret
4. **Success redirect** – Only after verification succeeds, the frontend navigates with `paymentSuccess: true`

The frontend **never** trusts the payment success solely from Razorpay's callback. The `navigate()` with success state happens **only after** `axios.post('/api/paymentverification', ...)` resolves successfully.

## Required Backend Verification

Your backend must verify using Razorpay's crypto:

```javascript
// Node.js example
const crypto = require('crypto');

function verifyPayment(orderId, paymentId, signature, secret) {
  const body = orderId + '|' + paymentId;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return expected === signature;
}
```

## Recommendations

1. **Verify backend implements signature verification** – Ensure `/api/paymentverification` uses Razorpay secret to verify the signature before saving or returning success.
2. **Never trust `location.state` alone** – The payment success modal should only appear after backend verification. Current flow is correct: verification runs first, then navigate.
3. **Consider server-side confirmation** – For critical flows, fetch payment status from your backend when the home page loads with `paymentSuccess` in state, to guard against browser-back/fake state.
4. **Use env variables** – Ensure Razorpay keys (especially secret) are in env vars, not hardcoded.
