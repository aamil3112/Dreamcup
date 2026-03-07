import { Link, useLocation, useNavigate } from 'react-router-dom';

const Home = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const paymentSuccess = location.state?.paymentSuccess;
  const paymentId = location.state?.paymentId;
  const registrationToken = location.state?.registrationToken;

  const handlePaymentSuccessClose = () => {
    navigate('/', { replace: true, state: {} });
  };

  return (
    <div className="main-container">
      <header>
        <div className="main-body" id="home">
          <video autoPlay muted loop playsInline preload="none">
            <source src="/res/backdrop/Stock Footage - Stadium at Night_1080p.mp4" type="video/mp4" />
          </video>
          <div className="main-body-objective">
            <div className="objective-title">DANGER CUP 2026</div>
            <div className="objective-subtitle highlight-text-dark">
              THE AUCTION CRICKET TOURNAMENT
            </div>
      
          </div>
        </div>

        <div className="section-divider">
          <marquee behavior="scroll" direction="left" scrollamount="10" onMouseOver={(e) => e.target.stop()} onMouseOut={(e) => e.target.start()}>
            <span className="scroll-item"><i className="fa-solid fa-trophy"></i> DANGER CUP 2026 !!</span>
            <span className="scroll-item"><i className="fa-solid fa-gavel"></i> SELECTION VIA AUCTION</span>
            <span className="scroll-item"><i className="fa-solid fa-hand-peace"></i> REGISTER NOW!</span>
            <span className="scroll-item"><i className="fa-solid fa-life-ring"></i> APPLICATION IS LIVE</span>
          </marquee>
        </div>
      </header>

      {/* Payment Success Modal - Only shown after backend verification */}
      {paymentSuccess && (
        <div className="payment-success-overlay" role="dialog" aria-modal="true" aria-labelledby="payment-success-title">
          <div className="payment-success-modal">
            <i className="fa-solid fa-circle-check payment-success-icon" aria-hidden="true"></i>
            <h3 id="payment-success-title">Registration Successful!</h3>
            <p className="payment-success-message">Your payment has been verified and processed successfully.</p>
            <p className="payment-success-id">Payment ID: <strong>{paymentId}</strong></p>
            {registrationToken && (
              <p className="payment-success-id">
                Registration Token: <strong>{registrationToken}</strong>
              </p>
            )}
            <p className="payment-success-thanks">Thank you for registering for the DANGER CUP 2026!</p>
            <button type="button" className="payment-success-btn" onClick={handlePaymentSuccessClose}>
              Return to Home
            </button>
          </div>
        </div>
      )}

      {/* Prize Pool Section */}
      <div className="prize-pool-section" id="prizes">
        <h2 className="prize-pool-title highlight-text-dark">Prize Pool</h2>
        <div className="prize-pool-cards">
          <div className="prize-card prize-winner">
            <i className="fa-solid fa-trophy"></i>
            <h3>Winner</h3>
            <p className="prize-amount">₹75,000 + Trophy</p>
          </div>
          <div className="prize-card prize-runner">
            <i className="fa-solid fa-medal"></i>
            <h3>Runner-Up</h3>
            <p className="prize-amount">₹40,000 + Trophy</p>
          </div>
          <div className="prize-card prize-entry">
            <i className="fa-solid fa-users"></i>
            <h3>Team Entry Fee</h3>
            <p className="prize-amount">₹15,000</p>
          </div>
        </div>
      </div>

      {/* Events Section */}
      <div className="events-container" id="events">
        <h2 className="events-title highlight-text-dark">RULES</h2>
        <div className="events-content">
          <h3 className="events-heading">DANGER CUP 2026: THE AUCTION CRICKET TOURNAMENT</h3>
          
          <div className="events-rules">
            <p>• All players will be selected through auction.</p>
            <p>• Each team will have 16 players:</p>
            <p className="indent">• 12 from Damoh district</p>
            <p className="indent">• 4 from Sagar division</p>
            <p>• 8 Damoh players must play in playing 11</p>
            <p>• Maximum 3 outside Damoh can play</p>
            <p>• Total 20 teams will participate</p>
            <p>• Selection will be coin-based.</p>
            <p>• No match fee will be given.</p>
            <p>• Travel, food and stay arranged by owner.</p>
            <p>• If any player demands money, 3-year ban.</p>
            <p>• Each team can retain 2 players.</p>
          </div>
          <div className="event-btns">
            <Link to="/registration" className="register-button">Registration<i className="fa-solid fa-up-right-from-square"></i></Link>
          </div>
        </div>
      </div>

      {/* Organisers */}
      <div className="partners-container" id="partners">
        <h2 className="partners-title highlight-text-dark">Our Organisers</h2>
        <ul className="partner-list">
          <li>
            <div className="partner-info">
              <img src="/images/partners/Deepak.png" alt="Deepak" className="partner-logo" />
              <div className="partner-details">
                <p className="partner-description"><strong>DEEPAK SHRIVASTAVA</strong></p>
                
              </div>
            </div>
          </li>
          <li>
            <div className="partner-info">
              <img src="/images/partners/Rohit.png" alt="Rohit" className="partner-logo" />
              <div className="partner-details">
                <p className="partner-description"><strong>ROHIT ATHIYA</strong></p>
                
              </div>
            </div>
          </li>
          <li>
            <div className="partner-info">
              <img src="/images/partners/Rahul_Jain.png" alt="Rahul Jain" className="partner-logo" />
              <div className="partner-details">
                <p className="partner-description"><strong>RAHUL JAIN</strong></p>
                
              </div>
            </div>
          </li>
          <li>
            <div className="partner-info">
              <img src="/images/partners/Ganesh.png" alt="Ganesh" className="partner-logo" />
              <div className="partner-details">
                <p className="partner-description"><strong>GANESH AGRAWAL</strong></p>
                
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default Home;
