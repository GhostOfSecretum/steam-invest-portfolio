import { ProtoWriter, decode } from './proto.js';

export const EMsg = {
  Multi: 1,
  ClientHeartBeat: 703,
  ClientLogOff: 706,
  ClientLogOnResponse: 751,
  ClientLoggedOff: 757,
  ClientGamesPlayedWithDataBlob: 5410,
  ClientToGC: 5452,
  ClientFromGC: 5453,
  ClientLogon: 5514,
  ServiceMethodCallFromClientNonAuthed: 9804,
  ClientHello: 9805,
};

export const PROTO_MASK = 0x80000000;
export const JOBID_NONE = 0xffffffffffffffffn;
export const PROTOCOL_VERSION = 65580;
const EResultOK = 1;

const CM_LIST_URL = 'https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/?cellid=0';
// Must stay within the connect-src of the manifest CSP.
const CM_ENDPOINT = /^[a-z0-9-]+\.steamserver\.net:\d{2,5}$/;
const CONNECT_TIMEOUT_MS = 15000;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_MULTI_BYTES = 32 * 1024 * 1024;

export function steamError(eresult, what) {
  const err = new Error(`${what}: EResult ${eresult}`);
  err.eresult = eresult;
  return err;
}

async function pickServer() {
  const res = await fetch(CM_LIST_URL, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`Steam directory HTTP ${res.status}`);
  const list = (await res.json())?.response?.serverlist || [];
  const candidates = list
    .filter((s) => s.type === 'websockets' && s.realm === 'steamglobal' && CM_ENDPOINT.test(s.endpoint))
    .sort((a, b) => a.wtd_load - b.wtd_load)
    .slice(0, 5);
  if (!candidates.length) throw new Error('No Steam servers available');
  return candidates[Math.floor(Math.random() * candidates.length)].endpoint;
}

// Steam CMs answer 403 to any WebSocket handshake whose Origin is not Valve's own
// site, and an extension page always sends chrome-extension://<id>. Dropping the
// header matches what native clients send. The rule is limited to this extension's
// own WebSocket requests to steamserver.net, so other sites are unaffected.
const ORIGIN_RULE_ID = 1;

async function allowCmHandshake() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ORIGIN_RULE_ID],
    addRules: [{
      id: ORIGIN_RULE_ID,
      priority: 1,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] },
      condition: {
        requestDomains: ['steamserver.net'],
        resourceTypes: ['websocket'],
        initiatorDomains: [chrome.runtime.id],
      },
    }],
  });
}

async function gunzip(bytes, maxBytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Steam message exceeds size limit');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function randomJobId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  bytes[0] &= 0x7f;
  return new DataView(bytes.buffer).getBigUint64(0, false);
}

export class CmConnection {
  #ws = null;
  #steamId = 0n;
  #sessionId = 0;
  #loggedOn = false;
  #closed = false;
  #heartbeat = null;
  #jobs = new Map();
  #handlers = new Map();
  #closers = new Set();
  #incoming = Promise.resolve();
  #resolveClosed;
  // Resolves with the reason once the connection is gone; never rejects.
  closed = new Promise((resolve) => { this.#resolveClosed = resolve; });

  static async open() {
    await allowCmHandshake();
    const cm = new CmConnection();
    await cm.#connect(await pickServer());
    return cm;
  }

  get steamId() {
    return this.#steamId;
  }

  #connect(endpoint) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://${endpoint}/cmsocket/`);
      ws.binaryType = 'arraybuffer';
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('Steam connection timed out'));
      }, CONNECT_TIMEOUT_MS);
      ws.onopen = () => {
        clearTimeout(timer);
        this.#ws = ws;
        this.send(EMsg.ClientHello, new ProtoWriter().uint(1, PROTOCOL_VERSION));
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Could not connect to Steam'));
      };
      ws.onclose = () => this.#teardown(new Error('Steam connection closed'));
      ws.onmessage = (event) => {
        const packet = new Uint8Array(event.data);
        this.#incoming = this.#incoming
          .then(() => this.#receive(packet))
          .catch((err) => this.#teardown(err));
      };
    });
  }

  async #receive(packet) {
    if (packet.length < 8) throw new Error('Malformed Steam packet');
    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    const rawEmsg = view.getUint32(0, true);
    // Everything this client talks to is protobuf; legacy struct messages are ignored.
    if (!(rawEmsg & PROTO_MASK)) return;
    const emsg = (rawEmsg & ~PROTO_MASK) >>> 0;
    const headerLength = view.getUint32(4, true);
    if (8 + headerLength > packet.length) throw new Error('Malformed Steam packet');
    const header = decode(packet.subarray(8, 8 + headerLength));
    const body = packet.subarray(8 + headerLength);

    if (emsg === EMsg.Multi) {
      await this.#receiveMulti(body);
      return;
    }

    const sessionId = header.int(2, 0);
    if (sessionId) this.#sessionId = sessionId;

    const targetJob = header.big(11);
    const job = targetJob !== undefined && this.#jobs.get(targetJob);
    if (job) {
      this.#jobs.delete(targetJob);
      job.resolve({ eresult: header.int(13, 2), errorMessage: header.str(14), body });
      return;
    }

    if (emsg === EMsg.ClientLogOnResponse && header.big(1)) this.#steamId = header.big(1);
    if (emsg === EMsg.ClientLoggedOff) {
      this.#teardown(new Error('Logged off by Steam'));
      return;
    }
    for (const handler of this.#handlers.get(emsg) || []) handler(body);
  }

  async #receiveMulti(body) {
    const multi = decode(body);
    let payload = multi.bytes(2) || new Uint8Array();
    const unzippedSize = multi.uint(1, 0);
    if (unzippedSize) {
      if (unzippedSize > MAX_MULTI_BYTES) throw new Error('Steam message exceeds size limit');
      payload = await gunzip(payload, MAX_MULTI_BYTES);
    }
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    let pos = 0;
    while (pos + 4 <= payload.length) {
      const size = view.getUint32(pos, true);
      pos += 4;
      if (pos + size > payload.length) throw new Error('Malformed Steam multi-message');
      await this.#receive(payload.subarray(pos, pos + size));
      pos += size;
    }
  }

  send(emsg, body, { jobName, jobId, routingAppId } = {}) {
    if (this.#closed || !this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Steam');
    }
    const unauthenticated = emsg === EMsg.ClientHello || emsg === EMsg.ServiceMethodCallFromClientNonAuthed;
    const header = new ProtoWriter()
      .fixed64(1, unauthenticated ? 0n : this.#steamId)
      .uint(2, unauthenticated ? 0 : this.#sessionId)
      .uint(3, routingAppId)
      .fixed64(10, jobId ?? JOBID_NONE)
      .fixed64(11, JOBID_NONE)
      .string(12, jobName)
      .uint(32, jobName ? 1 : undefined)
      .finish();
    const bodyBytes = body instanceof ProtoWriter ? body.finish() : body;
    const packet = new Uint8Array(8 + header.length + bodyBytes.length);
    const view = new DataView(packet.buffer);
    view.setUint32(0, (emsg | PROTO_MASK) >>> 0, true);
    view.setUint32(4, header.length, true);
    packet.set(header, 8);
    packet.set(bodyBytes, 8 + header.length);
    this.#ws.send(packet);
  }

  // Unauthenticated service call, e.g. 'Authentication.BeginAuthSessionViaQR#1'.
  call(jobName, body) {
    const jobId = randomJobId();
    return new Promise((resolve, reject) => {
      const fail = (err) => settle(reject, err);
      const settle = (fn, value) => {
        clearTimeout(timer);
        this.#jobs.delete(jobId);
        this.#closers.delete(fail);
        fn(value);
      };
      const timer = setTimeout(() => fail(new Error(`${jobName} timed out`)), REQUEST_TIMEOUT_MS);
      this.#jobs.set(jobId, {
        resolve: ({ eresult, body: responseBody }) => {
          if (eresult !== EResultOK) settle(reject, steamError(eresult, jobName));
          else settle(resolve, decode(responseBody));
        },
      });
      this.#closers.add(fail);
      try {
        this.send(EMsg.ServiceMethodCallFromClientNonAuthed, body, { jobName, jobId });
      } catch (err) {
        fail(err);
      }
    });
  }

  on(emsg, handler) {
    if (!this.#handlers.has(emsg)) this.#handlers.set(emsg, new Set());
    this.#handlers.get(emsg).add(handler);
    return () => this.#handlers.get(emsg).delete(handler);
  }

  waitFor(emsg, timeoutMs, match = () => true) {
    return new Promise((resolve, reject) => {
      const fail = (err) => settle(reject, err);
      const settle = (fn, value) => {
        clearTimeout(timer);
        off();
        this.#closers.delete(fail);
        fn(value);
      };
      const timer = setTimeout(() => fail(new Error('Steam did not respond in time')), timeoutMs);
      const off = this.on(emsg, (body) => {
        if (match(body)) settle(resolve, body);
      });
      this.#closers.add(fail);
    });
  }

  async logOn(steamId, logonBody) {
    this.#steamId = steamId;
    const response = this.waitFor(EMsg.ClientLogOnResponse, REQUEST_TIMEOUT_MS);
    this.send(EMsg.ClientLogon, logonBody);
    const result = decode(await response);
    const eresult = result.int(1, 2);
    if (eresult !== EResultOK) throw steamError(eresult, 'Steam login');
    this.#loggedOn = true;
    const seconds = Math.max(5, result.int(3, 9));
    this.#heartbeat = setInterval(() => {
      try {
        this.send(EMsg.ClientHeartBeat, new ProtoWriter());
      } catch { /* teardown handles the closed socket */ }
    }, seconds * 1000);
    return result;
  }

  close() {
    if (this.#closed) return;
    if (this.#loggedOn) {
      try {
        this.send(EMsg.ClientLogOff, new ProtoWriter());
      } catch { /* already gone */ }
    }
    this.#ws?.close();
    this.#teardown(new Error('Steam connection closed'));
  }

  #teardown(err) {
    if (this.#closed) return;
    this.#closed = true;
    this.#resolveClosed(err);
    clearInterval(this.#heartbeat);
    for (const fail of [...this.#closers]) fail(err);
    this.#jobs.clear();
    this.#handlers.clear();
    if (this.#ws && this.#ws.readyState <= WebSocket.OPEN) this.#ws.close();
  }
}
