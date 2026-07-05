/**
 * 跨环境初始化密码学安全的随机数提供者 (CSPRNG)
 * 在模块加载时只执行一次，避免每次调用都做环境判断
 */
const getCryptoProvider = () => {
  // 1. 现代浏览器 / Deno / Bun / Node.js 19+ (Web Crypto API)
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    return {
      getRandomValues: (arr) => globalThis.crypto.getRandomValues(arr),
    };
  }

  // 2. 旧版 Node.js (CommonJS)
  // 使用 typeof require 避免在 Webpack/Vite 等构建工具中报错
  if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node &&
    typeof require === "function"
  ) {
    try {
      const crypto = require("crypto");
      // Node.js 15+ 提供的 webcrypto 属性
      if (
        crypto.webcrypto &&
        typeof crypto.webcrypto.getRandomValues === "function"
      ) {
        return {
          getRandomValues: (arr) => crypto.webcrypto.getRandomValues(arr),
        };
      }
      // Node.js 旧版的回退方案
      if (typeof crypto.randomFillSync === "function") {
        return {
          getRandomValues: (arr) => crypto.randomFillSync(arr),
        };
      }
    } catch (e) {
      // 捕获可能因构建工具导致的 require 错误
    }
  }

  return null;
};

const cryptoProvider = getCryptoProvider();

/**
 * 密码学安全的 0~1 浮点数生成器
 * 行为类似于 Math.random()，输出范围 [0, 1)
 */
export function secureRandom() {
  if (!cryptoProvider) {
    throw new Error("当前环境不支持密码学安全的随机数生成器 (CSPRNG)");
  }

  // 生成 64 位（8字节）的随机数据
  const buffer = new Uint32Array(2);
  cryptoProvider.getRandomValues(buffer);

  // Math.random() 需要 53 位的精度 (IEEE 754 双精度浮点数)
  // 我们保留第一个 32 位整数的 21 位 (buffer[0] >>> 11)
  // 以及第二个整数的全部 32 位 (buffer[1])
  // 2^21 = 2097152, 2^32 = 4294967296, 2^53 = 9007199254740992
  const high = buffer[0] >>> 11;
  const low = buffer[1];

  // 计算公式: (high * 2^32 + low) / 2^53
  return (high * 4294967296 + low) / 2 ** 53;
}

// 如果需要同时支持 CommonJS 和 ESM 默认导出
export default secureRandom;
export { secureRandom as random };
