import axios from "axios";

// Helper to get Cashfree API base URL based on environment
const getCashfreeBaseUrl = () => {
  const env = (process.env.CASHFREE_ENV || "sandbox").toLowerCase();
  return env === "production"
    ? "https://api.cashfree.com"
    : "https://sandbox.cashfree.com";
};

// POST /api/checkout
// Creates a Cashfree order and returns payment session details to the frontend
export const checkout = async (req, res) => {
  const { amount, customerName, customerEmail, customerPhone } = req.body;

  if (!amount) {
    return res.status(400).json({
      success: false,
      message: "Amount is required",
    });
  }

  const orderAmount = Number(amount);
  if (Number.isNaN(orderAmount) || orderAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid amount",
    });
  }

  const baseUrl = getCashfreeBaseUrl();
  const url = `${baseUrl}/pg/orders`;

  // Generate a simple unique order ID on our side
  const orderId = `order_${Date.now()}`;

  // Cashfree requires customer_id to be alphanumeric with optional _ or -
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
// Verifies the order status with Cashfree
export const paymentVerification = async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({
      success: false,
      message: "orderId is required for verification",
    });
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

    // An order is successful when order_status is PAID
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

// Proxy endpoint to submit registration data to Google Sheets without CORS issues
export const submitRegistration = async (req, res) => {
  try {
    const scriptUrl =
      "https://script.google.com/macros/s/AKfycbwpsp69Bdh_hVXar008HQxj8Jvwb1gGfWweMKFXU8vE3yPE7gr-3yfk0gb-tQuILHS91g/exec";

    const params = new URLSearchParams();
    Object.entries(req.body || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });

    const { data } = await axios.post(scriptUrl, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error forwarding registration to Google Sheets:", error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to submit registration to Google Sheets",
      error: error?.response?.data || error.message,
    });
  }
};
