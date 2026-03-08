import axios from "axios";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyxZRAYbTEqoDSbyMK8YODrE-kNN-4ggGf6D3kWgV8iRndJQQCcNg8LXbdEDs9byDa72Q/exec";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PENDING_REGISTRATIONS_FILE = path.join(__dirname, "..", "data", "pending-registrations.json");

const readPendingRegistrations = async () => {
  try {
    const raw = await fs.readFile(PENDING_REGISTRATIONS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
};

const writePendingRegistrations = async (data) => {
  await fs.mkdir(path.dirname(PENDING_REGISTRATIONS_FILE), { recursive: true });
  await fs.writeFile(PENDING_REGISTRATIONS_FILE, JSON.stringify(data, null, 2), "utf-8");
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const upsertPendingRegistration = async (orderId, payload) => {
  const allPending = await readPendingRegistrations();
  allPending[orderId] = {
    ...(allPending[orderId] || {}),
    ...payload,
    updatedAt: new Date().toISOString(),
  };
  await writePendingRegistrations(allPending);
};

const getPendingRegistration = async (orderId) => {
  const allPending = await readPendingRegistrations();
  return allPending[orderId] || null;
};

const markRegistrationSaved = async (orderId, paymentId) => {
  const allPending = await readPendingRegistrations();
  if (!allPending[orderId]) {
    return;
  }

  allPending[orderId] = {
    ...allPending[orderId],
    status: "REGISTERED",
    paymentId,
    savedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writePendingRegistrations(allPending);
};

const forwardToGoogleSheets = async (payload = {}) => {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { data } = await axios.post(GOOGLE_SCRIPT_URL, params.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 15000,
      });

      return data;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(400 * attempt);
      }
    }
  }

  throw lastError;
};

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
  const {
    amount,
    customerName,
    customerEmail,
    customerPhone,
    registrationData,
    registrationToken,
  } = req.body;

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
      customer_phone: (() => {
        const digitsOnly = String(customerPhone || "").replace(/\D/g, "");
        return digitsOnly.slice(-10);
      })(),
    },
  };

  if (!payload.customer_details.customer_phone || payload.customer_details.customer_phone.length !== 10) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit customer phone is required",
    });
  }

  const headers = {
    "x-client-id": process.env.CASHFREE_APP_ID,
    "x-client-secret": process.env.CASHFREE_SECRET_KEY,
    "x-api-version": "2023-08-01",
    "Content-Type": "application/json",
  };

  try {
    const { data } = await axios.post(url, payload, { headers });

    if (registrationData && typeof registrationData === "object") {
      await upsertPendingRegistration(data.order_id, {
        orderId: data.order_id,
        registrationToken: registrationToken || registrationData.registrationToken || null,
        registrationData,
        amount: orderAmount,
        customerName: customerName || null,
        customerEmail: customerEmail || null,
        customerPhone: payload.customer_details.customer_phone,
        status: "ORDER_CREATED",
        createdAt: new Date().toISOString(),
      });
    }

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
  const { orderId, registrationData, registrationToken } = req.body;

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

      const pendingRegistration = await getPendingRegistration(orderId);
      const finalRegistrationData =
        registrationData && typeof registrationData === "object"
          ? registrationData
          : pendingRegistration?.registrationData;

      const finalRegistrationToken =
        registrationToken ||
        finalRegistrationData?.registrationToken ||
        pendingRegistration?.registrationToken;

      if (finalRegistrationData && typeof finalRegistrationData === "object") {
        const payloadForSheets = {
          ...finalRegistrationData,
          paymentId,
          paymentRefId: paymentId,
          registrationToken: finalRegistrationToken,
        };

        try {
          await forwardToGoogleSheets(payloadForSheets);
          await markRegistrationSaved(orderId, paymentId);
        } catch (sheetError) {
          console.error("Error saving registration after payment:", sheetError?.response?.data || sheetError.message);
          return res.status(500).json({
            success: false,
            message: "Payment successful, but registration save failed. Please contact support.",
            paymentId,
          });
        }
      } else {
        await upsertPendingRegistration(orderId, {
          orderId,
          status: "PAID_MISSING_REGISTRATION_DATA",
          paymentId,
          paidAt: new Date().toISOString(),
        });
      }

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
    const data = await forwardToGoogleSheets(req.body || {});

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

export const cashfreeWebhook = async (req, res) => {
  try {
    const body = req.body || {};
    const extractedOrderId =
      body?.data?.order?.order_id ||
      body?.data?.order_id ||
      body?.order_id ||
      body?.orderId;

    if (!extractedOrderId) {
      return res.status(200).json({
        success: true,
        message: "Webhook acknowledged (test/handshake payload without order_id).",
      });
    }

    const baseUrl = getCashfreeBaseUrl();
    const url = `${baseUrl}/pg/orders/${extractedOrderId}`;
    const headers = {
      "x-client-id": process.env.CASHFREE_APP_ID,
      "x-client-secret": process.env.CASHFREE_SECRET_KEY,
      "x-api-version": "2023-08-01",
    };

    const { data } = await axios.get(url, { headers });

    if (data.order_status !== "PAID") {
      await upsertPendingRegistration(extractedOrderId, {
        orderId: extractedOrderId,
        status: `WEBHOOK_RECEIVED_${data.order_status}`,
      });

      return res.status(200).json({
        success: true,
        message: "Webhook received. Order not paid yet.",
      });
    }

    const primaryPayment =
      Array.isArray(data.payments) && data.payments.length > 0
        ? data.payments[0]
        : null;

    const paymentId =
      primaryPayment?.cf_payment_id ||
      primaryPayment?.payment_id ||
      extractedOrderId;

    const pendingRegistration = await getPendingRegistration(extractedOrderId);

    if (!pendingRegistration?.registrationData) {
      await upsertPendingRegistration(extractedOrderId, {
        orderId: extractedOrderId,
        status: "PAID_MISSING_REGISTRATION_DATA",
        paymentId,
      });

      return res.status(200).json({
        success: true,
        message: "Paid order received but registration data is missing.",
      });
    }

    if (pendingRegistration.status === "REGISTERED") {
      return res.status(200).json({
        success: true,
        message: "Registration already saved for this order.",
      });
    }

    const payloadForSheets = {
      ...pendingRegistration.registrationData,
      paymentId,
      paymentRefId: paymentId,
      registrationToken:
        pendingRegistration.registrationToken ||
        pendingRegistration.registrationData.registrationToken,
    };

    await forwardToGoogleSheets(payloadForSheets);
    await markRegistrationSaved(extractedOrderId, paymentId);

    return res.status(200).json({
      success: true,
      message: "Webhook processed and registration saved.",
      paymentId,
    });
  } catch (error) {
    console.error("Error processing Cashfree webhook:", error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
      error: error?.response?.data || error.message,
    });
  }
};

const tryRecoverSingleOrder = async (orderId) => {
  const pendingRegistration = await getPendingRegistration(orderId);

  if (!pendingRegistration) {
    return {
      orderId,
      success: false,
      skipped: true,
      reason: "ORDER_NOT_FOUND_IN_PENDING_STORE",
    };
  }

  if (pendingRegistration.status === "REGISTERED") {
    return {
      orderId,
      success: true,
      skipped: true,
      reason: "ALREADY_REGISTERED",
      paymentId: pendingRegistration.paymentId || null,
    };
  }

  if (!pendingRegistration.registrationData) {
    return {
      orderId,
      success: false,
      skipped: true,
      reason: "MISSING_REGISTRATION_DATA",
    };
  }

  const baseUrl = getCashfreeBaseUrl();
  const url = `${baseUrl}/pg/orders/${orderId}`;
  const headers = {
    "x-client-id": process.env.CASHFREE_APP_ID,
    "x-client-secret": process.env.CASHFREE_SECRET_KEY,
    "x-api-version": "2023-08-01",
  };

  const { data } = await axios.get(url, { headers });

  if (data.order_status !== "PAID") {
    await upsertPendingRegistration(orderId, {
      status: `RECOVERY_SKIPPED_${data.order_status}`,
      lastRecoveryAt: new Date().toISOString(),
    });

    return {
      orderId,
      success: false,
      skipped: true,
      reason: `ORDER_NOT_PAID_${data.order_status}`,
    };
  }

  const primaryPayment =
    Array.isArray(data.payments) && data.payments.length > 0
      ? data.payments[0]
      : null;

  const paymentId =
    primaryPayment?.cf_payment_id ||
    primaryPayment?.payment_id ||
    orderId;

  const payloadForSheets = {
    ...pendingRegistration.registrationData,
    paymentId,
    paymentRefId: paymentId,
    registrationToken:
      pendingRegistration.registrationToken ||
      pendingRegistration.registrationData.registrationToken,
  };

  await forwardToGoogleSheets(payloadForSheets);
  await markRegistrationSaved(orderId, paymentId);

  return {
    orderId,
    success: true,
    skipped: false,
    paymentId,
  };
};

export const getPendingRecoveryOrders = async (req, res) => {
  try {
    const allPending = await readPendingRegistrations();
    const entries = Object.values(allPending || {});
    const actionable = entries.filter((entry) => entry?.status !== "REGISTERED");

    return res.status(200).json({
      success: true,
      total: entries.length,
      actionableCount: actionable.length,
      actionable,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch pending recovery orders",
      error: error?.message,
    });
  }
};

export const retryPendingOrder = async (req, res) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId is required",
      });
    }

    const result = await tryRecoverSingleOrder(orderId);
    return res.status(200).json({
      success: true,
      result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retry order recovery",
      error: error?.response?.data || error?.message,
    });
  }
};

export const retryAllPendingOrders = async (req, res) => {
  try {
    const allPending = await readPendingRegistrations();
    const orderIds = Object.keys(allPending || {});
    const targets = orderIds.filter((orderId) => allPending[orderId]?.status !== "REGISTERED");

    const results = [];
    for (const orderId of targets) {
      try {
        const result = await tryRecoverSingleOrder(orderId);
        results.push(result);
      } catch (error) {
        results.push({
          orderId,
          success: false,
          skipped: false,
          reason: "RECOVERY_ERROR",
          error: error?.response?.data || error?.message,
        });
      }
    }

    const recovered = results.filter((r) => r.success && !r.skipped).length;
    const failed = results.filter((r) => !r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;

    return res.status(200).json({
      success: true,
      attempted: targets.length,
      recovered,
      failed,
      skipped,
      results,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retry pending orders",
      error: error?.message,
    });
  }
};
