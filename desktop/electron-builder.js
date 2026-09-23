// Build configuration for electron-builder.
//
// Moved out of package.json so Windows code signing can be switched on only when
// the Azure Trusted Signing credentials are present. All four azureSignOptions
// fields are required by the schema, so a placeholder block in static JSON would
// break every unsigned build.
//
// Signing behaviour:
//   macOS  — code signing runs when a Developer ID certificate is available
//            (CSC_LINK + CSC_KEY_PASSWORD in CI, or the login keychain locally).
//            Notarization is enabled by default in electron-builder and only
//            activates once APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER
//            are set, so local builds keep working without credentials.
//   Windows — signed only when the AZURE_* variables below are set.

const azureSigning = process.env.AZURE_CODE_SIGNING_ACCOUNT
  ? {
    azureSignOptions: {
      endpoint: process.env.AZURE_CODE_SIGNING_ENDPOINT,
      codeSigningAccountName: process.env.AZURE_CODE_SIGNING_ACCOUNT,
      certificateProfileName: process.env.AZURE_CODE_SIGNING_PROFILE,
      // Must match the certificate subject exactly, otherwise NSIS signing fails.
      publisherName: process.env.AZURE_CODE_SIGNING_PUBLISHER,
    },
  }
  : {};

module.exports = {
  appId: 'pro.skinshead.desktop',
  productName: 'SkinsHead',
  artifactName: 'SkinsHead-${os}-${arch}.${ext}',
  directories: {
    output: '../downloads',
  },
  // Auto-updates read the release feed from the public GitHub repo, so no token
  // is needed on the client side. Uploading happens only when CI runs
  // electron-builder with `--publish always` and a GH_TOKEN.
  publish: [
    {
      provider: 'github',
      owner: 'GhostOfSecretum',
      repo: 'steam-invest-portfolio',
    },
  ],
  files: [
    'main.js',
    'preload.js',
    'preload-gc-qr.js',
    'inventory-merge.js',
    'gc-storage-sync.js',
    'gc-item-names.js',
    'i18n.js',
    'ui/**/*',
    'node_modules/**/*',
    'package.json',
  ],
  mac: {
    category: 'public.app-category.finance',
    hardenedRuntime: true,
    // Gatekeeper assessment needs the app to be notarized already, which it is
    // not at the point electron-builder would run the check.
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    target: [
      {
        target: 'dmg',
        arch: ['arm64', 'x64'],
      },
      // Squirrel.Mac can only install updates from a ZIP, so the DMG alone would
      // give users a download link but no working auto-update.
      {
        target: 'zip',
        arch: ['arm64', 'x64'],
      },
    ],
  },
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    ...azureSigning,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
  },
};
