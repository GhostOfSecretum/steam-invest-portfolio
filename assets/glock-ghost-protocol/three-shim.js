const _T = globalThis.THREE;
if (!_T) throw new Error('THREE global missing — load three.min.js first');
export const Absolute = 0;
const handler = {
  get(_t, prop) { return _T[prop]; },
  ownKeys() { return Reflect.ownKeys(_T); },
  getOwnPropertyDescriptor(_t, prop) {
    return Object.getOwnPropertyDescriptor(_T, prop) || { configurable: true, enumerable: true, value: _T[prop] };
  }
};
export default new Proxy({}, handler);
// For `import * as THREE`, esbuild converts to require of module.exports or star import.
// Simplest: export every common symbol + default
