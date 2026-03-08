import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import './App.css'
import Home from './components/Home'
import SeniorRegistration from './components/SeniorRegistration'
import PrivacyPolicy from './components/PrivacyPolicy'
import TermsConditions from './components/TermsConditions'
import RefundCancellationPolicy from './components/RefundCancellationPolicy'
import ContactUs from './components/ContactUs'
import SiteFooter from './components/SiteFooter'

function App() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate loading time
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)
    
    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return <div className="loading-screen">Loading...</div>
  }

  return (
    <Router>
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/registration" element={<SeniorRegistration />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-and-conditions" element={<TermsConditions />} />
          <Route path="/refund-policy" element={<RefundCancellationPolicy />} />
          <Route path="/contact-us" element={<ContactUs />} />
        </Routes>
        <SiteFooter />
      </div>
    </Router>
  )
}

export default App
