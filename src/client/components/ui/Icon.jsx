import React from 'react';

const paths = {
  system: 'M3 12h4l3-7 4 14 3-7h4 M4 5V3h16v2 M4 19v2h16v-2',
  processes: 'M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3M7 7h10v10H7zM10 10h4v4h-4z',
  docker: 'M4 8h4v4H4zM9 8h4v4H9zM14 8h4v4h-4zM9 3h4v4H9zM2 14h17c2 0 3-1 3-3M3 14c0 5 3 7 8 7 5 0 8-3 9-7',
  pm2: 'M5 3v4m14-4v4M5 17v4m14-4v4M3 5h4m10 0h4M3 19h4m10 0h4M8 8h8v8H8z',
  services: 'M4 5h16v5H4zM4 14h16v5H4zM7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6',
  ollama: 'M12 3v3M8 3h8M5 7h14v13H5zM2 11h3m14 0h3M8 11h.01M16 11h.01M8 16h8',
  backups: 'M4 7h16v14H4zM3 3h18v4H3zM9 11h6M12 11v6m-3-3 3 3 3-3',
  traffic: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  databases: 'M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3M4 6v12c0 2 4 3 8 3s8-1 8-3V6M4 12c0 2 4 3 8 3s8-1 8-3',
  security: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zM8 12l3 3 5-6',
  monix: 'M3 12h4l3-7 4 14 3-7h4',
  integrations: 'M3 3h4v4H3zM10 3h4v4h-4zM17 3h4v4h-4zM3 10h4v4H3zM10 10h4v4h-4zM17 10h4v4h-4zM3 17h4v4H3zM10 17h4v4h-4zM17 17h4v4h-4z',
  settings: 'M9 3h6l1 4 4 1 1 6-4 2-1 4H9l-1-4-4-1-1-6 4-2zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  troubleshooting: 'm14 6 4-4a6 6 0 0 1-7 8L4 20l-3-3 10-7a6 6 0 0 1 0-8l-1 5z',
  search: 'M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14m5-2 6 6',
  refresh: 'M20 7V3m0 4h-4M4 17v4m0-4h4M20 7a9 9 0 0 0-15-2M4 17a9 9 0 0 0 15 2',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  key: 'M10 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0m-1 3 11 10m-4-4 3-3m-6 0 3-3',
  disk: 'M4 4h16l2 8v8H2v-8zM2 12h20M16 16h2',
  uptime: 'M9 2h6M12 5v3m0 4v4m7-9 2-2M21 14a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
};
export function Icon({ name, className = '', ...props }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...props}><path d={paths[name] || paths.system} /></svg>;
}
