// Configuration dynamique : complète app.json.
// - google-services.json (Android, notifications) est ajouté seulement s'il existe.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  // google-services.json doit contenir le nom du paquet Android de l'application (sinon la compilation échoue)
  const gsPath = path.join(__dirname, 'google-services.json');
  let hasGoogleServices = false;
  if (fs.existsSync(gsPath)) {
    const pkg = config.android?.package;
    const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
    hasGoogleServices = (gs.client ?? []).some((c) => c.client_info?.android_client_info?.package_name === pkg);
    if (!hasGoogleServices)
      console.warn(`⚠ google-services.json ne contient pas l'application Android « ${pkg} » : notifications désactivées. Ajoutez cette application dans la console Firebase et remplacez google-services.json.`);
  }
  return {
    ...config,
    android: {
      ...config.android,
      ...(hasGoogleServices ? { googleServicesFile: './google-services.json' } : {}),
    },
    plugins: [
      ...(config.plugins ?? []).filter((p) => (Array.isArray(p) ? p[0] : p) !== 'expo-notifications'),
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#D7AB3E',
          defaultChannel: 'default',
        },
      ],
    ],
  };
};
