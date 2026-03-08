import { Link } from 'react-router-dom';

const SiteFooter = () => {
  return (
    <footer className="site-footer" aria-label="Footer links">
      <p>
        <Link to="/privacy-policy">Privacy Policy</Link>
        {' | '}
        <Link to="/terms-and-conditions">Terms & Conditions</Link>
        {' | '}
        <Link to="/refund-policy">Refund Policy</Link>
        {' | '}
        <Link to="/contact-us">Contact Us</Link>
      </p>
    </footer>
  );
};

export default SiteFooter;
