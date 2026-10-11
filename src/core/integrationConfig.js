const INTEGRATIONS = ['pm2', 'services', 'traffic', 'backups', 'ollama', 'docker', 'databases', 'security', 'osUpdates', 'certbot'];
function integrationDefaults(env = process.env) {
  return Object.fromEntries(INTEGRATIONS.map(name => [name, env[`ENABLE_${name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`] === 'true']));
}
function validateIntegrations(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([name, enabled]) => INTEGRATIONS.includes(name) && typeof enabled === 'boolean');
}
module.exports = { INTEGRATIONS, integrationDefaults, validateIntegrations };
