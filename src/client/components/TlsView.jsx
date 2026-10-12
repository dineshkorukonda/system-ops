import React from 'react';
export function TlsView({ systemData }) {
  const certificates = systemData?.tls || [];
  return <section className="source-section"><div className="section-heading"><div><h2>SSL certificates</h2><p>Expiry observations from configured certificate files and live HTTPS endpoints.</p></div></div>
    {!certificates.length ? <div className="empty-state">No certificate observations yet. Configure TLS_HOSTS or active Nginx SSL configuration.</div> : <div className="source-grid">{certificates.map((cert,index) => <article className="source-card" key={`${cert.target}-${index}`}><h3>{cert.target}</h3><p className={cert.valid ? '' : 'error-message'}>{cert.statusText}</p><dl><dt>Source</dt><dd>{cert.source}</dd><dt>Expires</dt><dd>{cert.formattedValidTo}</dd><dt>Issuer</dt><dd>{cert.issuer || 'Unknown'}</dd></dl><small>Expiry status alone does not establish certificate trust.</small></article>)}</div>}
  </section>;
}
