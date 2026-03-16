import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './PlayerProfile.css';

const API_BASE_URL = import.meta.env.PROD
  ? ''
  : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000');

const PlayerProfile = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/player/${orderId}`);
        if (response.data?.success) {
          setProfile(response.data.profile);
        } else {
          setError('Profile not found');
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        setError(err.response?.data?.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchProfile();
    }
  }, [orderId]);

  if (loading) {
    return (
      <div className="player-profile-overlay">
        <div className="loading-spinner">Loading Profile...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="player-profile-overlay">
        <div className="error-container">
          <h2>Error</h2>
          <p>{error || 'Something went wrong'}</p>
          <button onClick={() => navigate('/')}>Back to Home</button>
        </div>
      </div>
    );
  }

  const { registrationData, status } = profile;
  const isPaid = status === 'REGISTERED' || status.includes('PAID');

  // Format name for the banner (split by space)
  const nameParts = registrationData.fullname?.split(' ') || ['PLAYER'];
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
  const firstNames = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : nameParts[0];

  return (
    <div className="player-profile-overlay">
      <div className="profile-card">
        <div className="header-logo">
          SPL <span>CRICKET</span>
        </div>
        
        <div className="profile-header">
          <div className="profile-title">Player Profile</div>
          <button className="close-btn" onClick={() => navigate('/')}>
            &times;
          </button>
        </div>

        <div className="profile-content">
          <div className="left-panel">
            <div className="profile-photo-container">
              {registrationData.passportpic ? (
                <img 
                  src={`data:image/jpeg;base64,${registrationData.passportpic}`} 
                  alt="Profile" 
                  className="profile-photo"
                />
              ) : (
                <div className="no-photo">NO PHOTO</div>
              )}
            </div>
            <div className="name-banner">
              {firstNames}<br />{lastName}
            </div>
          </div>

          <div className="right-panel">
            <table className="profile-table">
              <tbody>
                <tr>
                  <td className="label-cell">Name:</td>
                  <td className="value-cell">{registrationData.fullname}</td>
                </tr>
                <tr>
                  <td className="label-cell">Registration Type:</td>
                  <td className="value-cell">{registrationData.category || 'Standard'}</td>
                </tr>
                <tr>
                  <td className="label-cell">DOB:</td>
                  <td className="value-cell">{registrationData.dob}</td>
                </tr>
                <tr>
                  <td className="label-cell">Email:</td>
                  <td className="value-cell">{registrationData.email}</td>
                </tr>
                <tr>
                  <td className="label-cell">Phone:</td>
                  <td className="value-cell">{registrationData.mobilenumber}</td>
                </tr>
                {registrationData.city && (
                  <tr>
                    <td className="label-cell">City:</td>
                    <td className="value-cell">{registrationData.city}</td>
                  </tr>
                )}
                {registrationData.address && (
                  <tr>
                    <td className="label-cell">Address:</td>
                    <td className="value-cell">{registrationData.address}</td>
                  </tr>
                )}
                <tr>
                  <td className="label-cell">Your role in the team:</td>
                  <td className="value-cell">{registrationData.role}</td>
                </tr>
                <tr>
                  <td className="label-cell">Batting:</td>
                  <td className="value-cell">{registrationData.batting}</td>
                </tr>
                <tr>
                  <td className="label-cell">Batting Style:</td>
                  <td className="value-cell">{registrationData.battingOrder}</td>
                </tr>
                <tr>
                  <td className="label-cell">Bowling:</td>
                  <td className="value-cell">{registrationData.bowling}</td>
                </tr>
                <tr>
                  <td className="label-cell">Payment Status:</td>
                  <td className="value-cell">
                    <span className="status-badge">
                      {isPaid ? 'PAID' : 'PENDING'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerProfile;
