
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
  const [isCashfreeReady, setIsCashfreeReady] = useState(false);
  const amount = 1; // Registration fee amount in INR (hardcoded)

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

      // Create order on backend and get payment session
      const { data } = await axios.post(`${API_BASE_URL}/api/checkout`, {
        amount,
        customerName: formData.fullname,
        customerEmail: formData.email,
        customerPhone: normalizedPhone,
      });

      if (!data?.success) {
        throw new Error(data?.message || 'Failed to create order');
      }

      const { paymentSessionId, orderId } = data;

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

      // Verify payment on backend using orderId
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
      
      // Redirect to home page with success message and token
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
      alert(serverMessage ? `Payment error: ${serverMessage}` : 'Error initiating payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Function to submit data to Google Sheets
  const submitToGoogleSheets = async (paymentId, registrationToken) => {
    // Create an object to store form data
    const dataForSheets = {};
    
    // Process form data including file uploads
    for (const key in formData) {
      if (formData[key] instanceof File && formData[key]) {
        // For file inputs, convert to base64
        try {
          const base64Data = await convertFileToBase64(formData[key]);
          dataForSheets[key] = base64Data.split(',')[1]; // Remove the data:image/jpeg;base64, part
        } catch (error) {
          console.error(`Error converting ${key} to base64:`, error);
        }
      } else {
        // For regular inputs
        dataForSheets[key] = formData[key];
      }
    }
    
    // Add payment and tracking data
    dataForSheets.paymentId = paymentId;
    dataForSheets.paymentRefId = paymentId;
    dataForSheets.registrationToken = registrationToken;
    
    try {
      // Submit to backend, which forwards to Google Sheets (avoids CORS issues)
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

          <div className="button-container">
            <button 
              type="submit" 
              className="submit-btn" 
              disabled={isSubmitting || !isCashfreeReady}
            >
              {isSubmitting ? 'Processing...' : isCashfreeReady ? 'Pay & Register (₹1)' : 'Loading payment...'}
            </button>
            <Link to="/" className="cancel-btn">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SeniorRegistration; 