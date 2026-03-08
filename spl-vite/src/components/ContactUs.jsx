const ContactUs = () => {
  return (
    <main className="policy-page">
      <section className="policy-card">
        <h1>Contact Us</h1>
        <p>
          For registrations, payments, refunds, or general support, please contact DangerCup
          using the details below.
        </p>

        <h2>Business Information</h2>
        <p><strong>Legal Name:</strong> Animesh Jain (operating DangerCup)</p>
        <p><strong>Brand Name:</strong> DangerCup</p>
        <p>
          <strong>Website:</strong>
          {' '}
          <a href="https://dangercup.online" target="_blank" rel="noreferrer">https://dangercup.online</a>
        </p>

        <h2>Support Details</h2>
        <p>
          <strong>Email:</strong>
          {' '}
          <a href="mailto:animeshjain26012001@gmail.com">animeshjain26012001@gmail.com</a>
        </p>
        <p><strong>Phone (Animesh Jain):</strong> +91 70890 90821</p>
        <p><strong>Phone (Aamil Khan):</strong> +91 9516081609</p>

        <h2>Business Address</h2>
        <p>Damoh, Madhya Pradesh, India</p>

        <h2>Support Hours</h2>
        <p>Monday - Sunday, 10:00 AM - 6:00 PM IST</p>

        <h2>Payment Support</h2>
        <p>
          Online transactions are handled via Cashfree Payments. For payment issues, share your
          transaction reference in your support request for faster assistance.
        </p>
      </section>
    </main>
  );
};

export default ContactUs;
