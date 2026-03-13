import axios from "axios";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const GOOGLE_SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbykZk0siaLiBfSbvBKovS9WI4Ca2_vic3m7ewr592IgSdSDDg8G6KGxhaBnYdA1BlartQ/exec";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PENDING_REGISTRATIONS_FILE = path.join(__dirname, "..", "data", "pending-registrations.json");
const orderSaveLocks = new Map();

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

const withOrderSaveLock = async (orderId, task) => {
  const existing = orderSaveLocks.get(orderId);
  if (existing) {
    return existing;
  }

  const current = (async () => {
    try {
      return await task();
    } finally {
      orderSaveLocks.delete(orderId);
    }
  })();

  orderSaveLocks.set(orderId, current);
  return current;
};

const hasBase64File = (value) => {
  return typeof value === "string" && value.trim().length > 120;
};

const getMissingDocumentFields = (registrationData = {}) => {
  const requiredFields = ["passportpic", "aadhaar"];
  return requiredFields.filter((field) => !hasBase64File(registrationData[field]));
};

const TERMINAL_NON_PAID_STATUSES = new Set(["FAILED", "EXPIRED", "CANCELLED", "TERMINATED"]);

const buildPendingSheetPayload = ({ orderId, registrationData = {}, registrationToken, amount }) => {
  return {
    ...registrationData,
    orderId,
    registrationToken: registrationToken || registrationData.registrationToken || null,
    paymentStatus: "PENDING",
    paymentId: "",
    paymentRefId: "",
    amount,
    operation: "upsert_by_order_id",
    rowAction: "PENDING_CREATE",
    createdAt: new Date().toISOString(),
  };
};

const buildSuccessSheetPayload = ({ orderId, paymentId, registrationToken, registrationData = {} }) => {
  return {
    fullname: registrationData.fullname || "",
    mobilenumber: registrationData.mobilenumber || "",
    dob: registrationData.dob || "",
    email: registrationData.email || "",
    role: registrationData.role || "",
    batting: registrationData.batting || "",
    bowling: registrationData.bowling || "",
    battingOrder: registrationData.battingOrder || "",
    orderId,
    paymentStatus: "SUCCESS",
    paymentId,
    paymentRefId: paymentId,
    registrationToken,
    operation: "upsert_by_order_id",
    rowAction: "PAYMENT_SUCCESS",
    paidAt: new Date().toISOString(),
  };
};

const deletePendingSheetRow = async ({ orderId, reason }) => {
  await forwardToGoogleSheets({
    orderId,
    operation: "delete_by_order_id",
    rowAction: "DELETE_PENDING",
    paymentStatus: "DELETED",
    deleteReason: reason || "UNSPECIFIED",
    updatedAt: new Date().toISOString(),
  });
};

const saveRegistrationOnce = async ({ orderId, paymentId, registrationData, registrationToken }) => {
  return withOrderSaveLock(orderId, async () => {
    const latestPending = await getPendingRegistration(orderId);
    if (latestPending?.status === "REGISTERED") {
      return {
        alreadySaved: true,
        paymentId: latestPending.paymentId || paymentId,
      };
    }

    const missingDocumentFields = getMissingDocumentFields(registrationData);
    if (missingDocumentFields.length > 0) {
      await upsertPendingRegistration(orderId, {
        orderId,
        paymentId,
        status: "PAID_MISSING_DOCUMENT_FILES",
        missingDocumentFields,
        paidAt: new Date().toISOString(),
      });

      return {
        alreadySaved: false,
        missingDocumentFields,
        paymentId,
      };
    }

    await forwardToGoogleSheets(
      buildSuccessSheetPayload({
        orderId,
        paymentId,
        registrationToken,
        registrationData,
      })
    );
    await markRegistrationSaved(orderId, paymentId);

    return {
      alreadySaved: false,
      paymentId,
    };
  });
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

const getAppBaseUrl = () => {
  return (process.env.APP_BASE_URL || "https://dangercup.online").replace(/\/$/, "");
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
    order_meta: {
      return_url: `${getAppBaseUrl()}/registration?order_id=${orderId}`,
    },
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
    const response = await axios.post(url, payload, { headers });
    const data = response.data;

    // Validate response is valid JSON/object
    if (!data || typeof data !== "object" || !data.order_id) {
      console.error("Invalid Cashfree response format:", {
        status: response.status,
        contentType: response.headers["content-type"],
        dataType: typeof data,
        preview: typeof data === "string" ? data.substring(0, 500) : JSON.stringify(data).substring(0, 500),
      });
      return res.status(502).json({
        success: false,
        message: "Invalid response from Cashfree API",
      });
    }

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

      // Fire and forget sheets update to avoid blocking Cashfree checkout (prevents 499 timeouts)
      forwardToGoogleSheets(
        buildPendingSheetPayload({
          orderId: data.order_id,
          registrationData,
          registrationToken,
          amount: orderAmount,
        })
      )
        .then(() => {
          return upsertPendingRegistration(data.order_id, {
            status: "PENDING_SHEETS_SAVED",
            pendingSavedAt: new Date().toISOString(),
          });
        })
        .catch((sheetError) => {
          console.error("Async error saving pending registration before payment:", sheetError?.response?.data || sheetError.message);
        });
    }

    return res.status(200).json({
      success: true,
      orderId: data.order_id,
      paymentSessionId: data.payment_session_id,
    });
  } catch (error) {
    console.error("Error creating Cashfree order:", {
      message: error.message,
      status: error?.response?.status,
      contentType: error?.response?.headers?.["content-type"],
      dataPreview: typeof error?.response?.data === "string" 
        ? error.response.data.substring(0, 500)
        : JSON.stringify(error?.response?.data || {}).substring(0, 500),
    });
    return res.status(500).json({
      success: false,
      message: "Failed to create Cashfree order",
      error: error?.response?.status ? `HTTP ${error.response.status}` : error.message,
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
    const response = await axios.get(url, { headers });
    const data = response.data;

    // Validate response is valid JSON/object
    if (!data || typeof data !== "object" || !data.order_id) {
      console.error("Invalid Cashfree verification response:", {
        status: response.status,
        contentType: response.headers["content-type"],
        dataType: typeof data,
        preview: typeof data === "string" ? data.substring(0, 500) : JSON.stringify(data).substring(0, 500),
      });
      return res.status(502).json({
        success: false,
        message: "Invalid response from Cashfree API",
      });
    }

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
          ? {
              ...(pendingRegistration?.registrationData || {}),
              ...registrationData,
            }
          : pendingRegistration?.registrationData;

      const finalRegistrationToken =
        registrationToken ||
        finalRegistrationData?.registrationToken ||
        pendingRegistration?.registrationToken;

      if (finalRegistrationData && typeof finalRegistrationData === "object") {
        await upsertPendingRegistration(orderId, {
          orderId,
          registrationToken: finalRegistrationToken,
          registrationData: finalRegistrationData,
          status: "PAID_VERIFIED",
          paymentId,
          paidAt: new Date().toISOString(),
        });
      }

      if (finalRegistrationData && typeof finalRegistrationData === "object") {
        try {
          const saveResult = await saveRegistrationOnce({
            orderId,
            paymentId,
            registrationData: finalRegistrationData,
            registrationToken: finalRegistrationToken,
          });

          if (saveResult.missingDocumentFields?.length) {
            return res.status(422).json({
              success: false,
              message: "Payment successful, but required document files are missing. Please re-upload documents.",
              paymentId: saveResult.paymentId,
              missingDocumentFields: saveResult.missingDocumentFields,
            });
          }

          if (saveResult.alreadySaved) {
            return res.status(200).json({
              success: true,
              message: "Payment already verified and registration already saved",
              paymentId: saveResult.paymentId,
            });
          }
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

    if (TERMINAL_NON_PAID_STATUSES.has(data.order_status)) {
      const existing = await getPendingRegistration(orderId);
      if (existing?.status !== "REGISTERED") {
        try {
          await deletePendingSheetRow({
            orderId,
            reason: `PAYMENT_${data.order_status}`,
          });
        } catch (sheetDeleteError) {
          console.error("Error deleting pending sheet row:", sheetDeleteError?.response?.data || sheetDeleteError.message);
        }

        await upsertPendingRegistration(orderId, {
          orderId,
          status: `PAYMENT_${data.order_status}_PENDING_DELETED`,
          failedAt: new Date().toISOString(),
        });
      }
    }

    return res.status(400).json({
      success: false,
      message: `Payment not successful. Current status: ${data.order_status}`,
      orderStatus: data.order_status,
    });
  } catch (error) {
    console.error("Error verifying Cashfree order:", {
      message: error.message,
      status: error?.response?.status,
      contentType: error?.response?.headers?.["content-type"],
      dataPreview: typeof error?.response?.data === "string"
        ? error.response.data.substring(0, 500)
        : JSON.stringify(error?.response?.data || {}).substring(0, 500),
    });
    return res.status(500).json({
      success: false,
      message: "Failed to verify payment with Cashfree",
      error: error?.response?.status ? `HTTP ${error.response.status}` : error.message,
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

    const { data: responseData } = await axios.get(url, { headers });
    
    // Validate response is valid JSON/object
    if (!responseData || typeof responseData !== "object" || !responseData.order_id) {
      console.error("Invalid Cashfree webhook response:", {
        status: responseData?.status,
        contentType: responseData?.headers?.["content-type"],
        dataType: typeof responseData,
        preview: typeof responseData === "string" ? responseData.substring(0, 500) : JSON.stringify(responseData).substring(0, 500),
      });
      return res.status(200).json({
        success: true,
        message: "Webhook acknowledged but invalid response from Cashfree API.",
      });
    }

    const data = responseData;

    if (data.order_status !== "PAID") {
      if (TERMINAL_NON_PAID_STATUSES.has(data.order_status)) {
        try {
          await deletePendingSheetRow({
            orderId: extractedOrderId,
            reason: `WEBHOOK_${data.order_status}`,
          });
        } catch (sheetDeleteError) {
          console.error("Error deleting pending sheet row via webhook:", sheetDeleteError?.response?.data || sheetDeleteError.message);
        }
      }

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

    const saveResult = await saveRegistrationOnce({
      orderId: extractedOrderId,
      paymentId,
      registrationData: pendingRegistration.registrationData,
      registrationToken:
        pendingRegistration.registrationToken ||
        pendingRegistration.registrationData.registrationToken,
    });

    if (saveResult.missingDocumentFields?.length) {
      return res.status(200).json({
        success: true,
        message: "Payment is successful but document files are missing for this order.",
        paymentId: saveResult.paymentId,
        missingDocumentFields: saveResult.missingDocumentFields,
      });
    }

    if (saveResult.alreadySaved) {
      return res.status(200).json({
        success: true,
        message: "Registration already saved for this order.",
        paymentId: saveResult.paymentId,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Webhook processed and registration saved.",
      paymentId,
    });
  } catch (error) {
    console.error("Error processing Cashfree webhook:", {
      message: error.message,
      status: error?.response?.status,
      contentType: error?.response?.headers?.["content-type"],
      dataPreview: typeof error?.response?.data === "string"
        ? error.response.data.substring(0, 500)
        : JSON.stringify(error?.response?.data || {}).substring(0, 500),
    });
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
      error: error?.response?.status ? `HTTP ${error.response.status}` : error.message,
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

  // Validate response is valid JSON/object
  if (!data || typeof data !== "object" || !data.order_id) {
    console.error("Invalid Cashfree recovery response:", {
      orderId,
      dataType: typeof data,
      preview: typeof data === "string" ? data.substring(0, 500) : JSON.stringify(data).substring(0, 500),
    });
    return {
      orderId,
      success: false,
      skipped: true,
      reason: "INVALID_CASHFREE_RESPONSE",
    };
  }

  if (data.order_status !== "PAID") {
    if (TERMINAL_NON_PAID_STATUSES.has(data.order_status)) {
      try {
        await deletePendingSheetRow({
          orderId,
          reason: `RECOVERY_${data.order_status}`,
        });
      } catch (sheetDeleteError) {
        console.error("Error deleting pending sheet row via recovery:", sheetDeleteError?.response?.data || sheetDeleteError.message);
      }
    }

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

  await saveRegistrationOnce({
    orderId,
    paymentId,
    registrationData: pendingRegistration.registrationData,
    registrationToken:
      pendingRegistration.registrationToken ||
      pendingRegistration.registrationData.registrationToken,
  });

  const latestPending = await getPendingRegistration(orderId);
  if (latestPending?.status === "PAID_MISSING_DOCUMENT_FILES") {
    return {
      orderId,
      success: false,
      skipped: true,
      reason: "MISSING_DOCUMENT_FILES",
      paymentId,
      missingDocumentFields: latestPending.missingDocumentFields || ["passportpic", "aadhaar"],
    };
  }

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
