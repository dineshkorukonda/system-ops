export const CATEGORIES = [
  { id: 'discovery', label: 'Overview', views: ['discovery'] },
  { id: 'host', label: 'Host', views: ['system', 'processes'] },
  { id: 'apps', label: 'Applications', views: ['pm2', 'docker', 'services', 'ollama'] },
  { id: 'network', label: 'Network & security', views: ['tls', 'traffic', 'security'] },
  { id: 'storage', label: 'Storage', views: ['databases', 'backups'] },
  { id: 'configuration', label: 'Settings', views: ['integrations', 'settings', 'troubleshooting'] },
];
export const VIEWS = {
  discovery: ['Server overview', null], system: ['Resources', null], processes: ['Processes', null],
  pm2: ['PM2 apps', 'pm2'], docker: ['Containers', 'docker'], services: ['Services', 'systemd'],
  ollama: ['Ollama', 'ollama'], tls: ['SSL certificates', 'tls'], traffic: ['Traffic', 'traffic'],
  security: ['Firewall & security', 'security'], databases: ['Databases', 'databases'], backups: ['Backups', 'backups'],
  integrations: ['Setup guides', null], settings: ['General', null], troubleshooting: ['Diagnostics', null],
};
export function visibleViews(category, capabilities, hidden = []) {
  return category.views.filter(id => {
    const key = VIEWS[id][1], cap = capabilities?.[key];
    return !hidden.includes(id) && (!key || cap?.available || cap?.configured || cap?.enabled);
  });
}
export function routeFromHash(hash) {
  const id = hash.replace(/^#/, '').split('/')[0];
  return Object.hasOwn(VIEWS, id) ? id : 'discovery';
}
