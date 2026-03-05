import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import './App.css'
import Home from './components/Home'
import SeniorRegistration from './components/SeniorRegistration'

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
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/registration" element={<SeniorRegistration />} />
      </Routes>
    </Router>
  )
}

export default App
