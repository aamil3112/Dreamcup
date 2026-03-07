## Cashfree registration reliability

This backend now stores registration payloads at checkout time and finalizes Google Sheets write after payment verification.

### Why

Users sometimes close the tab on Cashfree success and do not wait for frontend verification. In that case, payment can be completed but registration may be missing.

### What changed

- `POST /api/checkout`
  - Accepts `registrationData` and `registrationToken`.
  - Creates order on Cashfree.
  - Stores pending registration against `orderId` in `data/pending-registrations.json`.

- `POST /api/paymentverification`
  - Verifies order with Cashfree.
  - Uses request registration data if present, otherwise falls back to stored pending registration.
  - Saves to Google Sheets and marks order as `REGISTERED`.

- `POST /api/cashfree/webhook`
  - Intended for Cashfree webhook callback.
  - Re-checks order status directly from Cashfree API.
  - If paid and pending registration exists, saves to Google Sheets.

### Required production setup

1. In Cashfree Dashboard, configure webhook URL:
   - `https://<your-backend-domain>/api/cashfree/webhook`
2. Keep backend disk persistent, or replace file storage with DB for long-term scale.
3. Monitor `data/pending-registrations.json` for `PAID_MISSING_REGISTRATION_DATA` records.

### Note

For fully robust production, move pending-registration storage from JSON file to a database table/collection.