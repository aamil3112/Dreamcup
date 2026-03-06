import axios from "axios";

// Helper to get Cashfree API base URL based on environment
const getCashfreeBaseUrl = () => {
  const env = (process.env.CASHFREE_ENV || "sandbox").toLowerCase();
  return env === "production"
    ? "https://api.cashfree.com"
    : "https://sandbox.cashfree.com";
};

// POST /api/checkout
export const checkout = async (req, res) => {
  const { amount, customerName, customerEmail, customerPhone } = req.body;

  if (!amount) {
    return res.status(400).json({ success: false, message: "Amount is required" });
  }

  const orderAmount = Number(amount);
  if (Number.isNaN(orderAmount) || orderAmount <= 0) {
    return res.status(400).json({ success: false, message: "Invalid amount" });
  }

  const baseUrl = getCashfreeBaseUrl();
  const url = `${baseUrl}/pg/orders`;
  const orderId = `order_${Date.now()}`;

  const rawCustomerId = customerEmail || customerPhone || orderId;
  const safeCustomerId =
    (rawCustomerId && rawCustomerId.toString().replace(/[^a-zA-Z0-9_-]/g, "")) ||
    orderId;

  const payload = {
    order_id: orderId,
    order_amount: orderAmount,
    order_currency: "INR",
    customer_details: {
      customer_id: safeCustomerId,
      customer_name: customerName || "Guest",
      customer_email: customerEmail,
      customer_phone: customerPhone,
    },
  };

  const headers = {
    "x-client-id": process.env.CASHFREE_APP_ID,
    "x-client-secret": process.env.CASHFREE_SECRET_KEY,
    "x-api-version": "2023-08-01",
    "Content-Type": "application/json",
  };

  try {
    const { data } = await axios.post(url, payload, { headers });
    return res.status(200).json({
      success: true,
      orderId: data.order_id,
      paymentSessionId: data.payment_session_id,
    });
  } catch (error) {
    console.error("Error creating Cashfree order:", error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to create Cashfree order",
      error: error?.response?.data || error.message,
    });
  }
};

// POST /api/paymentverification
export const paymentVerification = async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ success: false, message: "orderId is required for verification" });
  }

  const baseUrl = getCashfreeBaseUrl();
  const url = `${baseUrl}/pg/orders/${orderId}`;

  const headers = {
    "x-client-id": process.env.CASHFREE_APP_ID,
    "x-client-secret": process.env.CASHFREE_SECRET_KEY,
    "x-api-version": "2023-08-01",
  };

  try {
    const { data } = await axios.get(url, { headers });

    if (data.order_status === "PAID") {
      const primaryPayment =
        Array.isArray(data.payments) && data.payments.length > 0
          ? data.payments[0]
          : null;

      const paymentId =
        primaryPayment?.cf_payment_id ||
        primaryPayment?.payment_id ||
        orderId;

      return res.status(200).json({
        success: true,
        message: "Payment verified successfully",
        paymentId,
      });
    }

    return res.status(400).json({
      success: false,
      message: `Payment not successful. Current status: ${data.order_status}`,
      orderStatus: data.order_status,
    });
  } catch (error) {
    console.error("Error verifying Cashfree order:", error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to verify payment with Cashfree",
      error: error?.response?.data || error.message,
    });
  }
};

// POST /api/submitregistration
// Proxy to Google Apps Script — sends JSON so Apps Script can read via e.postData.contents
export const submitRegistration = async (req, res) => {
  try {
    const scriptUrl =
      "https://script.google.com/macros/s/AKfycbwK4zTYkmBYHHGmnQQrCon3CHOz7-Y-nmS3ku-bMSIrzGERqJJ22s9EBIDiXWckkWcE/exec";

    const { data } = await axios.post(scriptUrl, req.body, {
      headers: {
        "Content-Type": "application/json",  // ✅ JSON instead of form-encoded
      },
      maxBodyLength: 10 * 1024 * 1024,   // ✅ 10MB limit for images
      maxContentLength: 10 * 1024 * 1024,
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error forwarding registration to Google Sheets:", error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to submit registration to Google Sheets",
      error: error?.response?.data || error.message,
    });
  }
};