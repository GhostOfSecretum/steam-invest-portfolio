require('dotenv').config();

const fs = require('fs');
const path = require('path');

function parseVlessUrl(raw) {
  const value = String(raw || '').trim();
  if (!value.startsWith('vless://')) return null;

  const withoutScheme = value.slice('vless://'.length);
  const hashIndex = withoutScheme.indexOf('#');
  const main = hashIndex >= 0 ? withoutScheme.slice(0, hashIndex) : withoutScheme;
  const atIndex = main.lastIndexOf('@');
  if (atIndex <= 0) return null;

  const uuid = decodeURIComponent(main.slice(0, atIndex));
  const hostPart = main.slice(atIndex + 1);
  const queryIndex = hostPart.indexOf('?');
  const hostPort = queryIndex >= 0 ? hostPart.slice(0, queryIndex) : hostPart;
  const query = new URLSearchParams(queryIndex >= 0 ? hostPart.slice(queryIndex + 1) : '');
  const colonIndex = hostPort.lastIndexOf(':');
  if (colonIndex <= 0) return null;

  return {
    uuid,
    server: hostPort.slice(0, colonIndex),
    port: Number(hostPort.slice(colonIndex + 1)),
    sni: query.get('sni') || '',
    publicKey: query.get('pbk') || '',
    shortId: query.get('sid') || '',
    fingerprint: query.get('fp') || 'chrome',
    grpcServiceName: query.get('serviceName') || '',
  };
}

function getVlessSettings() {
  const fromUrl = parseVlessUrl(process.env.VLESS_URL);
  const settings = {
    server: String(process.env.VLESS_SERVER || fromUrl?.server || '').trim(),
    port: Number(process.env.VLESS_PORT || fromUrl?.port || 443),
    uuid: String(process.env.VLESS_UUID || fromUrl?.uuid || '').trim(),
    sni: String(process.env.VLESS_SNI || fromUrl?.sni || '').trim(),
    publicKey: String(process.env.VLESS_PUBLIC_KEY || fromUrl?.publicKey || '').trim(),
    shortId: String(process.env.VLESS_SHORT_ID || fromUrl?.shortId || '').trim(),
    fingerprint: String(process.env.VLESS_FINGERPRINT || fromUrl?.fingerprint || 'chrome').trim(),
    grpcServiceName: String(process.env.VLESS_GRPC_SERVICE_NAME ?? fromUrl?.grpcServiceName ?? '').trim(),
    socksPort: Number(process.env.XRAY_SOCKS_PORT || 1080),
  };

  if (!settings.server || !settings.uuid || !settings.sni || !settings.publicKey || !settings.shortId) {
    throw new Error(
      'Set VLESS_URL or VLESS_SERVER, VLESS_UUID, VLESS_SNI, VLESS_PUBLIC_KEY, and VLESS_SHORT_ID in .env.',
    );
  }

  if (!Number.isFinite(settings.port) || settings.port < 1) {
    throw new Error('VLESS_PORT must be a positive number.');
  }

  if (!Number.isFinite(settings.socksPort) || settings.socksPort < 1) {
    throw new Error('XRAY_SOCKS_PORT must be a positive number.');
  }

  return settings;
}

function buildXrayConfig(settings) {
  return {
    log: { loglevel: 'warning' },
    inbounds: [{
      listen: '0.0.0.0',
      port: settings.socksPort,
      protocol: 'socks',
      settings: {
        auth: 'noauth',
        udp: true,
      },
      sniffing: {
        enabled: true,
        destOverride: ['http', 'tls'],
      },
    }],
    outbounds: [{
      protocol: 'vless',
      settings: {
        vnext: [{
          address: settings.server,
          port: settings.port,
          users: [{
            id: settings.uuid,
            encryption: 'none',
          }],
        }],
      },
      streamSettings: {
        network: 'grpc',
        security: 'reality',
        realitySettings: {
          show: false,
          fingerprint: settings.fingerprint,
          serverName: settings.sni,
          publicKey: settings.publicKey,
          shortId: settings.shortId,
        },
        grpcSettings: {
          serviceName: settings.grpcServiceName,
          multiMode: false,
        },
      },
    }],
  };
}

function main() {
  try {
    const outputPath = path.resolve(
      process.cwd(),
      process.env.XRAY_CONFIG_PATH || 'xray/config.json',
    );
    const settings = getVlessSettings();
    const config = buildXrayConfig(settings);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    console.log(`Wrote Xray config to ${outputPath}`);
  } catch (error) {
    console.error('[xray-config]', error.message || error);
    process.exit(1);
  }
}

main();
