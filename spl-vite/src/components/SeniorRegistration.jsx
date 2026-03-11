
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE_URL = import.meta.env.PROD
  ? ''
  : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000');

const PENDING_ORDER_ID_KEY = 'dangercupPendingOrderId';
const PENDING_REGISTRATION_TOKEN_KEY = 'dangercupPendingRegistrationToken';

const SeniorRegistration = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullname: '',
    mobilenumber: '',
    dob: '',
    email: '',
    passportpic: null,
    aadhaar: null,
    role: '',
    batting: '',
    bowling: '',
    battingOrder: '',
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCashfreeReady, setIsCashfreeReady] = useState(false);
  const [paymentStatusText, setPaymentStatusText] = useState('');
  const amount = 360; // Gross amount for ₹350+tax pricing

  const verifyReturnedOrder = async (orderId, registrationTokenHint = '') => {
    try {
      const verifyRes = await axios.post(`${API_BASE_URL}/api/paymentverification`, {
        orderId,
        registrationToken: registrationTokenHint || undefined,
      }, { timeout: 120000 });

      if (!verifyRes.data?.success) {
        alert(verifyRes.data?.message || 'Payment verification failed. Please contact support.');
        return;
      }

      const paymentId = verifyRes.data.paymentId;
      localStorage.removeItem(PENDING_ORDER_ID_KEY);
      localStorage.removeItem(PENDING_REGISTRATION_TOKEN_KEY);
      navigate('/', {
        state: {
          paymentSuccess: true,
          paymentId,
          registrationToken: registrationTokenHint || undefined,
        },
      });
    } catch (error) {
      console.error('Error verifying returned order:', error);
      alert('We could not verify your payment yet. Please wait a minute and try again.');
    } finally {
      setIsSubmitting(false);
      setPaymentStatusText('');
    }
  };

  useEffect(() => {
    // Add the CSS link to the head
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/styles/styles.css';
    document.head.appendChild(link);

    // Set the title
    document.title = 'Registration Form';

    // Load Cashfree JS SDK
    const cashfreeScript = document.createElement('script');
    cashfreeScript.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    cashfreeScript.async = true;
    cashfreeScript.onload = () => setIsCashfreeReady(true);
    cashfreeScript.onerror = () => setIsCashfreeReady(false);
    document.body.appendChild(cashfreeScript);

    // Cleanup function
    return () => {
      document.head.removeChild(link);
      if (document.body.contains(cashfreeScript)) {
        document.body.removeChild(cashfreeScript);
      }
      setIsCashfreeReady(false);
    };
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const orderFromQuery = query.get('order_id') || query.get('orderId') || query.get('cf_order_id');
    const orderFromStorage = localStorage.getItem(PENDING_ORDER_ID_KEY);
    const registrationTokenHint = localStorage.getItem(PENDING_REGISTRATION_TOKEN_KEY) || '';

    const orderToVerify = orderFromQuery || orderFromStorage;
    if (!orderToVerify) {
      return;
    }

    setIsSubmitting(true);
    setPaymentStatusText('Verifying your recent payment...');
    verifyReturnedOrder(orderToVerify, registrationTokenHint);
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    
    if (type === 'file') {
      setFormData({
        ...formData,
        [name]: files[0]
      });
    } else if (type === 'checkbox') {
      setFormData({
        ...formData,
        [name]: checked
      });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  // Helper function to convert File to base64
  const convertFileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  const isImageFile = (file) => Boolean(file?.type?.startsWith('image/'));

  const compressImageFile = async (file) => {
    if (!isImageFile(file)) {
      return file;
    }

    const imageBitmap = await createImageBitmap(file);
    const maxDimension = 1280;
    const scale = Math.min(1, maxDimension / Math.max(imageBitmap.width, imageBitmap.height));
    const targetWidth = Math.max(1, Math.round(imageBitmap.width * scale));
    const targetHeight = Math.max(1, Math.round(imageBitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');

    if (!context) {
      return file;
    }

    context.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

    const preferredType = file.type === 'image/png' ? 'image/jpeg' : file.type;
    const quality = 0.75;

    const compressedBlob = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), preferredType, quality);
    });

    if (!compressedBlob || compressedBlob.size >= file.size) {
      return file;
    }

    const extension = preferredType.includes('jpeg') ? 'jpg' : 'img';
    const compressedName = file.name.replace(/\.[^.]+$/, `.${extension}`);

    return new File([compressedBlob], compressedName, {
      type: preferredType,
      lastModified: Date.now(),
    });
  };

  const generateRegistrationToken = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const datePart = `${day}${month}`;

    const storageKey = `dangercup_registration_count_${datePart}`;
    const lastCount = Number.parseInt(localStorage.getItem(storageKey) || '-1', 10);
    const nextCount = Number.isNaN(lastCount) ? 0 : lastCount + 1;

    localStorage.setItem(storageKey, String(nextCount));

    return `${datePart}${String(nextCount).padStart(2, '0')}`;
  };

  // Function to initiate Cashfree payment
  const initiatePayment = async () => {
    try {
      if (!window.Cashfree) {
        alert('Cashfree SDK failed to load. Please check your internet connection.');
        return;
      }

      const normalizedPhone = String(formData.mobilenumber || '').replace(/\D/g, '').slice(-10);
      if (normalizedPhone.length !== 10) {
        alert('Please enter a valid 10-digit mobile number.');
        return;
      }

      const cashfree = window.Cashfree({
        // In production, this must be "production" to match your live keys
        mode: "production",
      });

      setPaymentStatusText('Connecting to payment gateway...');

      // Generate registration token format: DDMM00, DDMM01, DDMM02...
      const registrationToken = generateRegistrationToken();
      setPaymentStatusText('Preparing registration...');
      const registrationDataForCheckout = await buildRegistrationPayload(registrationToken, {
        includeFiles: true,
      });

      const checkoutPayload = {
        amount,
        customerName: formData.fullname,
        customerEmail: formData.email,
        customerPhone: normalizedPhone,
        registrationData: registrationDataForCheckout,
        registrationToken,
      };

      // Create order on backend and get payment session (retry once for cold-start/network hiccups)
      let data;
      try {
        const res = await axios.post(`${API_BASE_URL}/api/checkout`, checkoutPayload, { timeout: 30000 });
        data = res.data;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const retryRes = await axios.post(`${API_BASE_URL}/api/checkout`, checkoutPayload, { timeout: 30000 });
        data = retryRes.data;
      }

      if (!data?.success) {
        throw new Error(data?.message || 'Failed to create order');
      }

      const { paymentSessionId, orderId } = data;
      localStorage.setItem(PENDING_ORDER_ID_KEY, orderId);
      localStorage.setItem(PENDING_REGISTRATION_TOKEN_KEY, registrationToken);

      setPaymentStatusText('Opening payment gateway...');
      const result = await cashfree.checkout({
        paymentSessionId,
        // Use SDK modal flow for better mobile browser compatibility
        redirectTarget: "_modal",
      });

      if (result?.error) {
        console.error('Cashfree payment error:', result.error);
        alert('Payment failed. Please try again.');
        return;
      }

      setPaymentStatusText('Checking payment status...');

      // Send full payload as fallback in case pending-row insert did not happen.
      const registrationDataForVerification = await buildRegistrationPayload(registrationToken, {
        includeFiles: true,
      });

      // Verify payment and persist registration on backend using orderId
      const verifyRes = await axios.post(`${API_BASE_URL}/api/paymentverification`, {
        orderId,
        registrationData: registrationDataForVerification,
        registrationToken,
      }, { timeout: 120000 });

      if (!verifyRes.data?.success) {
        console.error('Payment verification failed:', verifyRes.data);
        alert(verifyRes.data?.message || 'Payment verification failed. Please contact support.');
        return;
      }

      const paymentId = verifyRes.data.paymentId;
      localStorage.removeItem(PENDING_ORDER_ID_KEY);
      localStorage.removeItem(PENDING_REGISTRATION_TOKEN_KEY);

      setPaymentStatusText('Saving registration...');

      // Redirect only after payment + registration save is confirmed
      navigate('/', { 
        state: { 
          paymentSuccess: true, 
          paymentId,
          registrationToken,
        } 
      });
    } catch (error) {
      console.error('Error initiating payment:', error);
      const serverMessage = error?.response?.data?.message || error?.response?.data?.error?.message;
      const fallbackMessage = error?.message || error?.response?.statusText;
      alert(serverMessage ? `Payment error: ${serverMessage}` : fallbackMessage ? `Payment error: ${fallbackMessage}` : 'Error initiating payment. Please try again.');
    } finally {
      setIsSubmitting(false);
      setPaymentStatusText('');
    }
  };

  // Build registration payload to be saved by backend after payment verification
  const buildRegistrationPayload = async (registrationToken, options = {}) => {
    const { includeFiles = true } = options;

    // Create an object to store form data
    const dataForSheets = {};
    
    // Process form data including file uploads
    for (const key in formData) {
      if (formData[key] instanceof File && formData[key]) {
        if (!includeFiles) {
          dataForSheets[`${key}Name`] = formData[key].name;
          continue;
        }

        // For file inputs, convert to base64
        try {
          const fileForUpload = await compressImageFile(formData[key]);
          const base64Data = await convertFileToBase64(fileForUpload);
          dataForSheets[key] = base64Data.split(',')[1]; // Remove the data:image/jpeg;base64, part
        } catch (error) {
          console.error(`Error converting ${key} to base64:`, error);
          throw new Error(`Unable to process ${key}. Please re-upload and try again.`);
        }
      } else {
        // For regular inputs
        dataForSheets[key] = formData[key];
      }
    }
    
    dataForSheets.registrationToken = registrationToken;

    return dataForSheets;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setPaymentStatusText('Starting payment...');
    
    try {
      // Validate form data here if needed
      
      // Initiate payment
      await initiatePayment();
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Error submitting form: ' + error.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="reg-container">
      <div className="form-container">
        <h2>Registration Form</h2>
        <form id="registrationForm" onSubmit={handleSubmit} encType="multipart/form-data">
          <label htmlFor="fullname">Full Name:</label>
          <input 
            type="text" 
            id="fullname" 
            name="fullname" 
            value={formData.fullname}
            onChange={handleChange}
            required 
          />
          
          <label htmlFor="mobilenumber">Mobile Number:</label>
          <input 
            type="tel" 
            id="mobilenumber" 
            name="mobilenumber" 
            value={formData.mobilenumber}
            onChange={handleChange}
            required 
          />
          
          <label htmlFor="dob">Date of Birth:</label>
          <input 
            type="date" 
            id="dob" 
            name="dob" 
            value={formData.dob}
            onChange={handleChange}
            required 
          />

          <label htmlFor="email">Email:</label>
          <input 
            type="email" 
            id="email" 
            name="email" 
            value={formData.email}
            onChange={handleChange}
            required 
          />

          <label htmlFor="passportpic">Passport Size Pic:</label>
          <input 
            type="file" 
            id="passportpic" 
            name="passportpic" 
            onChange={handleChange}
            accept="image/*" 
            required 
          />

          <label htmlFor="aadhaar">Aadhaar Card:</label>
          <input 
            type="file" 
            id="aadhaar" 
            name="aadhaar" 
            onChange={handleChange}
            accept="image/*,application/pdf" 
            required 
          />

          <label htmlFor="role">Playing Role:</label>
          <select 
            id="role" 
            name="role" 
            value={formData.role}
            onChange={handleChange}
            required
          >
            <option value="bowler">Bowler</option>
            <option value="batsman">Batsman</option>
            <option value="wicketkeeper">Wicketkeeper</option>
            <option value="allrounder">Allrounder</option>
          </select>

          <label htmlFor="batting">Batting (L/R):</label>
          <select 
            id="batting" 
            name="batting" 
            value={formData.batting}
            onChange={handleChange}
            required
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>

          <label htmlFor="bowling">Bowling Style:</label>
          <input 
            type="text" 
            id="bowling" 
            name="bowling" 
            value={formData.bowling}
            onChange={handleChange}
            placeholder="e.g. Fast, Spin, Medium" 
            required 
          />

          <label htmlFor="battingOrder">Preferred Batting Order:</label>
          <select 
            id="battingOrder" 
            name="battingOrder" 
            value={formData.battingOrder}
            onChange={handleChange}
            required
          >
            <option value="">Select Batting Position</option>
            <option value="opener">Opener</option>
            <option value="topOrder">Top Order (1-3)</option>
            <option value="middleOrder">Middle Order (4-6)</option>
            <option value="lowerOrder">Lower Order (7-11)</option>
          </select>

          <p className="register-now-text">Register now to confirm your spot.</p>
          {isSubmitting && paymentStatusText && (
            <p className="register-now-text" aria-live="polite">{paymentStatusText}</p>
          )}

          <div className="button-container">
            <button 
              type="submit" 
              className="submit-btn" 
              disabled={isSubmitting || !isCashfreeReady}
            >
              {isSubmitting ? paymentStatusText || 'Processing...' : isCashfreeReady ? 'Pay & Register (₹350+tax)' : 'Loading payment...'}
            </button>
            <Link to="/" className="cancel-btn">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SeniorRegistration; 