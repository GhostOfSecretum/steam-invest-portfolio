import { EMsg, JOBID_NONE, PROTO_MASK } from './cm.js';
import { ProtoWriter, decode } from './proto.js';

const APP_CS2 = 730;
const GCMsg = {
  SO_Create: 21,
  SO_UpdateMultiple: 26,
  ItemCustomizationNotification: 1090,
  CasketItemLoadContents: 1094,
  ClientWelcome: 4004,
  ClientHello: 4006,
};
const CASKET_CONTENTS_NOTIFICATION = 1012;
const SO_TYPE_ITEM = 1;
export const STORAGE_UNIT_DEF_INDEX = 1201;
const GC_CONNECT_TIMEOUT_MS = 90000;
const CASKET_TIMEOUT_MS = 30000;

function attributeView(attributes, defIndex) {
  const bytes = attributes.get(defIndex)?.bytes(3);
  if (!bytes || bytes.length < 4) return undefined;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

const attributeUint32 = (attributes, defIndex) => attributeView(attributes, defIndex)?.getUint32(0, true);
const attributeFloat = (attributes, defIndex) => attributeView(attributes, defIndex)?.getFloat32(0, true);

// Attribute numbers follow globaloffensive's _processSOEconItem.
function parseItem(bytes) {
  const msg = decode(bytes);
  const attributes = new Map(msg.msgs(12).map((attr) => [attr.uint(1), attr]));
  const casketLow = attributeUint32(attributes, 272);
  const casketHigh = attributeUint32(attributes, 273);
  const customNameBytes = attributes.get(111)?.bytes(3);
  const paintIndex = attributeFloat(attributes, 6);
  const tradableAfter = attributeUint32(attributes, 75);
  const stickerIds = [];
  for (let slot = 0; slot <= 5; slot++) {
    const id = attributeUint32(attributes, 113 + slot * 4);
    if (id !== undefined) stickerIds.push(id);
  }
  return {
    id: msg.big(1),
    defIndex: msg.uint(4),
    quantity: msg.uint(5, 1),
    quality: msg.uint(7),
    rarity: msg.uint(19),
    customName: msg.str(10)
      || (customNameBytes && customNameBytes.length > 2 ? new TextDecoder().decode(customNameBytes.subarray(2)) : undefined),
    paintIndex: paintIndex === undefined ? undefined : Math.round(paintIndex),
    paintWear: attributeFloat(attributes, 8),
    tradableAfter: tradableAfter ? new Date(tradableAfter * 1000) : null,
    statTrak: attributes.has(80),
    musicIndex: attributeUint32(attributes, 166),
    kitId: stickerIds[0] ?? attributeUint32(attributes, 299) ?? attributeUint32(attributes, 321),
    casketId: casketLow !== undefined && casketHigh !== undefined
      ? (BigInt(casketHigh) << 32n) | BigInt(casketLow)
      : null,
    casketItemCount: attributeUint32(attributes, 270) ?? 0,
  };
}

export class Cs2GameCoordinator {
  #cm;
  #items = new Map();
  #listeners = new Set();
  #welcomed = false;

  constructor(cm) {
    this.#cm = cm;
    cm.on(EMsg.ClientFromGC, (body) => this.#receive(body));
  }

  #receive(body) {
    const msg = decode(body);
    if (msg.uint(1) !== APP_CS2) return;
    const rawType = msg.uint(2, 0);
    const payload = msg.bytes(3);
    if (!payload || !(rawType & PROTO_MASK) || payload.length < 8) return;
    const type = (rawType & ~PROTO_MASK) >>> 0;
    const headerLength = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getInt32(4, true);
    if (headerLength < 0 || 8 + headerLength > payload.length) return;
    const data = payload.subarray(8 + headerLength);

    switch (type) {
      case GCMsg.ClientWelcome:
        this.#welcomed = true;
        for (const cache of decode(data).msgs(3)) {
          for (const typed of cache.msgs(2)) {
            if (typed.int(1) !== SO_TYPE_ITEM) continue;
            for (const object of typed.all(2)) this.#addItem(parseItem(object));
          }
        }
        break;
      case GCMsg.SO_Create: {
        const so = decode(data);
        if (so.int(2) === SO_TYPE_ITEM && so.bytes(3)) this.#addItem(parseItem(so.bytes(3)));
        break;
      }
      case GCMsg.SO_UpdateMultiple:
        for (const so of decode(data).msgs(2)) {
          if (so.int(1) === SO_TYPE_ITEM && so.bytes(2)) this.#addItem(parseItem(so.bytes(2)));
        }
        break;
      default:
        break;
    }
    for (const listener of this.#listeners) listener(type, data);
  }

  #addItem(item) {
    if (item.id !== undefined) this.#items.set(item.id, item);
  }

  #send(type, body) {
    const gcHeader = new ProtoWriter().fixed64(10, JOBID_NONE).finish();
    const bodyBytes = body.finish();
    const payload = new Uint8Array(8 + gcHeader.length + bodyBytes.length);
    const view = new DataView(payload.buffer);
    view.setUint32(0, (type | PROTO_MASK) >>> 0, true);
    view.setInt32(4, gcHeader.length, true);
    payload.set(gcHeader, 8);
    payload.set(bodyBytes, 8 + gcHeader.length);
    this.#cm.send(EMsg.ClientToGC,
      new ProtoWriter().uint(1, APP_CS2).uint(2, (type | PROTO_MASK) >>> 0).bytes(3, payload),
      { routingAppId: APP_CS2 });
  }

  #waitFor(type, timeoutMs, match = () => true) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#listeners.delete(listener);
        fn(value);
      };
      const listener = (receivedType, data) => {
        if (receivedType === type && match(data)) settle(resolve, data);
      };
      const timer = setTimeout(() => settle(reject, new Error('CS2 Game Coordinator did not respond in time')), timeoutMs);
      this.#listeners.add(listener);
      this.#cm.closed.then((err) => settle(reject, err));
    });
  }

  async connect() {
    this.#cm.send(EMsg.ClientGamesPlayedWithDataBlob,
      new ProtoWriter().message(1, new ProtoWriter().fixed64(2, APP_CS2)));

    const welcome = this.#waitFor(GCMsg.ClientWelcome, GC_CONNECT_TIMEOUT_MS);
    let delayMs = 1000;
    const sendHello = () => {
      if (this.#welcomed) return;
      try {
        this.#send(GCMsg.ClientHello, new ProtoWriter().uint(1, 2000244).uint(3, 0).uint(4, 0).uint(9, 0));
      } catch {
        return;
      }
      delayMs = Math.min(15000, delayMs * 2);
      helloTimer = setTimeout(sendHello, delayMs);
    };
    let helloTimer = setTimeout(sendHello, 500);
    try {
      await welcome;
    } finally {
      clearTimeout(helloTimer);
    }
  }

  backpackItems() {
    return [...this.#items.values()].filter((item) => item.casketId === null);
  }

  storageUnits() {
    return [...this.#items.values()].filter((item) => item.defIndex === STORAGE_UNIT_DEF_INDEX);
  }

  async loadCasketContents(casket) {
    if (!casket.casketItemCount) return [];
    const done = this.#waitFor(GCMsg.ItemCustomizationNotification, CASKET_TIMEOUT_MS, (data) => {
      const notification = decode(data);
      return notification.uint(2) === CASKET_CONTENTS_NOTIFICATION && notification.bigs(1)[0] === casket.id;
    });
    this.#send(GCMsg.CasketItemLoadContents, new ProtoWriter().uint(1, casket.id).uint(2, casket.id));
    await done;
    return [...this.#items.values()].filter((item) => item.casketId === casket.id);
  }
}
