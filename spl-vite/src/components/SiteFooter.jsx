import { Link } from 'react-router-dom';

const SiteFooter = () => {
  return (
    <footer className="site-footer" aria-label="Footer links">
      <p className="site-footer-links">
        <Link to="/privacy-policy">Privacy Policy</Link>
        {' | '}
        <Link to="/terms-and-conditions">Terms & Conditions</Link>
        {' | '}
        <Link to="/refund-policy">Refund Policy</Link>
        {' | '}
        <Link to="/contact-us">Contact Us</Link>
      </p>
      <p className="site-footer-operator">
        DangerCup is operated by Animesh Jain, Damoh, Madhya Pradesh, India
      </p>
    </footer>
  );
};

export default SiteFooter;
