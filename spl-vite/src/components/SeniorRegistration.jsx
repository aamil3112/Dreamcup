import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

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
  const amount = 1; // Registration fee amount in INR (hardcoded)

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/styles/styles.css';
    document.head.appendChild(link);

    document.title = 'Registration Form';

    const cashfreeScript = document.createElement('script');
    cashfreeScript.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    cashfreeScript.async = true;
    document.body.appendChild(cashfreeScript);

    return () => {
      document.head.removeChild(link);
      if (document.body.contains(cashfreeScript)) {
        document.body.removeChild(cashfreeScript);
      }
    };
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    
    if (type === 'file') {
      setFormData({ ...formData, [name]: files[0] });
    } else if (type === 'checkbox') {
      setFormData({ ...formData, [name]: checked });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const convertFileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  // ✅ FIXED: Use "_modal" so it works on both desktop and mobile
  const initiatePayment = async () => {
    try {
      if (!window.Cashfree) {
        alert('Cashfree SDK failed to load. Please check your internet connection.');
        return;
      }

      const cashfree = window.Cashfree({
        mode: "production",
      });

      // Create order on backend
      const { data } = await axios.post(`${API_BASE_URL}/api/checkout`, {
        amount,
        customerName: formData.fullname,
        customerEmail: formData.email,
        customerPhone: formData.mobilenumber,
      });

      if (!data?.success) {
        throw new Error(data?.message || 'Failed to create order');
      }

      const { paymentSessionId, orderId } = data;

      // ✅ "_modal" works on all devices including mobile browsers
      const result = await cashfree.checkout({
        paymentSessionId,
        redirectTarget: "_modal",
      });

      if (result?.error) {
        console.error('Cashfree payment error:', result.error);
        alert('Payment failed. Please try again.');
        return;
      }

      // ✅ Handle cancelled payment
      if (result?.paymentDetails?.paymentStatus === "CANCELLED") {
        alert('Payment was cancelled. Please try again.');
        setIsSubmitting(false);
        return;
      }

      // Verify payment on backend
      const verifyRes = await axios.post(`${API_BASE_URL}/api/paymentverification`, {
        orderId,
      });

      if (!verifyRes.data?.success) {
        console.error('Payment verification failed:', verifyRes.data);
        alert('Payment verification failed. Please contact support.');
        return;
      }

      const paymentId = verifyRes.data.paymentId;

      // Generate registration token: DC26-DDMM-XXXX
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const countPart = String(now.getTime()).slice(-4);
      const registrationToken = `DC26-${day}${month}-${countPart}`;

      // Submit to Google Sheets
      await submitToGoogleSheets(paymentId, registrationToken);
      
      // Redirect to home with success state
      navigate('/', { 
        state: { 
          paymentSuccess: true, 
          paymentId,
          registrationToken,
        } 
      });
    } catch (error) {
      console.error('Error initiating payment:', error);
      alert('Error initiating payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitToGoogleSheets = async (paymentId, registrationToken) => {
    const dataForSheets = {};
    
    for (const key in formData) {
      if (formData[key] instanceof File && formData[key]) {
        try {
          const base64Data = await convertFileToBase64(formData[key]);
          dataForSheets[key] = base64Data.split(',')[1];
        } catch (error) {
          console.error(`Error converting ${key} to base64:`, error);
        }
      } else {
        dataForSheets[key] = formData[key];
      }
    }
    
    dataForSheets.paymentId = paymentId;
    dataForSheets.paymentRefId = paymentId;
    dataForSheets.registrationToken = registrationToken;
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/submit-registration`, dataForSheets);
      console.log('Google Sheets submission result:', response.data);
    } catch (error) {
      console.error('Error submitting to Google Sheets:', error);
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
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

          <div className="button-container">
            <button 
              type="submit" 
              className="submit-btn" 
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processing...' : 'Pay & Register (₹1)'}
            </button>
            <Link to="/" className="cancel-btn">Cancel</Link>
          </div>
        </form>
        {/* ✅ Removed cf_checkout div — no longer needed with _modal */}
      </div>
    </div>
  );
};

export default SeniorRegistration;