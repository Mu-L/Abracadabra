/*
 * Copyright (C) 2025 SheepChef (a.k.a. Haruka Hokuto)
 *
 * 这是一个自由软件。
 * 在遵守AIPL-1.1许可证的前提下，
 * 你可以自由复制，修改，分发，使用它。
 *
 * 查阅 Academic Innovation Protection License(AIPL) 来了解更多 .
 * 本作品应随附一份完整的 AIPL-1.1 许可证全文。
 *
 */
import { Base64 } from "js-base64";
import MersenneTwister from "mersenne-twister"; //兼容性
import CryptoJS from "crypto-js";
import { random } from "@lukeed/csprng"; //密码学安全随机数的封装

const SIG_DECRYPT_JP = "桜込凪雫実沢";
const SIG_DECRYPT_CN = "玚俟玊欤瞐珏";

const NULL_STR = "孎"; //默认忽略的占位字符，一个生僻字。

let MTseed = Date.now();

var MT = new MersenneTwister(MTseed);
//获取密码学安全随机数，如果不支持WebCrypto API，回落到日期和时间。

export class PreCheckResult {
  constructor(output, isEncrypted = false) {
    this.output = output;
    this.isEncrypted = isEncrypted;
  }
}

export function RemovePadding(Base64String) {
  let PaddingCount = 0;
  for (let i = Base64String.length - 1; i >= Base64String.length - 4; i--) {
    if (Base64String[i] == "=") {
      PaddingCount++;
    }
  }
  return Base64String.slice(0, Base64String.length - PaddingCount);
}

export function AddPadding(Base64String) {
  if (Base64String.length % 4 == 3) {
    return Base64String + "=";
  } else if (Base64String.length % 4 == 2) {
    return Base64String + "==";
  } else {
    return Base64String;
  }
}

export function setCharOnIndex(string, index, char) {
  if (index > string.length - 1) return string;
  return string.substring(0, index) + char + string.substring(index + 1);
}

export function stringToUint8Array(str) {
  let tempBase64 = Base64.encode(str);
  return Base64.toUint8Array(tempBase64);
}

// 将WordArray转换为Uint8Array
export function wordArrayToUint8Array(data) {
  const dataArray = new Uint8Array(data.sigBytes);
  for (let i = 0x0; i < data.sigBytes; i++) {
    dataArray[i] = (data.words[i >>> 0x2] >>> (0x18 - (i % 0x4) * 0x8)) & 0xff;
  }
  return dataArray;
}

export function Uint8ArrayTostring(fileData) {
  let tempBase64 = Base64.fromUint8Array(fileData);
  return Base64.decode(tempBase64);
}

export function GetRandomIndex(length) {
  // 取随机数
  let Rand;

  try {
    Rand = Math.floor((random(1).at(0) / 256) * length);
  } catch (err) {
    Rand = Math.floor(MT.random() * length);
  }

  return Rand;
}

export function difference(arr1, arr2) {
  return arr1.filter((item) => !arr2.includes(item));
}

export function insertStringAtIndex(str, value, index) {
  // 分割字符串为两部分，并在中间插入新值
  return str.slice(0, index) + value + str.slice(index);
}

export function GetLuhnBit(Data) {
  let Digit = new Array();
  let num, digit;
  for (let i = 0; i < Data.byteLength; i++) {
    num = Data[i];
    while (num > 0) {
      digit = num % 10;
      Digit.push(digit);
      num = Math.floor(num / 10);
    }
  }

  // Digit应当是一个数位构成的数组。
  let sum = 0;
  let Check = 0;

  for (let i = 0; i < Digit.length; i++) {
    if (i % 2 != 0) {
      Digit[i] = Digit[i] * 2;
      if (Digit[i] >= 10) {
        Digit[i] = (Digit[i] % 10) + Math.floor(Digit[i] / 10); //计算数字之和
      }
    }
    sum = sum + Digit[i];
  }

  Check = 10 - (sum % 10);

  return Check;
}

export function CheckLuhnBit(Data) {
  let DCheck = Data[Data.byteLength - 1];
  let Check = GetLuhnBit(Data.subarray(0, Data.byteLength - 1));

  return Check == DCheck;
}

export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * 工具函数
 *
 * 将四个 0/1（或 true/false）和一个 0..15 整数打包成一个 0..255 的字节值
 * 用于包装高级加密的配置位
 *
 * @param {number|boolean} b0 - 最低位（bit0）
 * @param {number|boolean} b1 - bit1
 * @param {number|boolean} b2 - bit2
 * @param {number|boolean} b3 - bit3
 * @param {number} size - 0..15，存放在高 4 位
 * @returns {number} 0..255 的字节（Number）。如果需要 Uint8Array，可用 Uint8Array.of(byte)[0] 或 new Uint8Array([byte])
 */
export function packByte(b0, b1, b2, b3, size) {
  // 规范化为 0 或 1
  const bits = [b0, b1, b2, b3].map((x) => (x ? 1 : 0));
  if (!Number.isInteger(size) || size < 0 || size > 15) {
    throw new RangeError("size 必须是整数且在 0..15 范围内");
  }
  const byte =
    (size << 4) | // 高 4 位
    (bits[3] << 3) |
    (bits[2] << 2) |
    (bits[1] << 1) |
    (bits[0] << 0);
  // 确保返回 0..255
  return byte & 0xff;
}

/**
 * 工具函数
 *
 * 用于解包装高级加密的配置位
 *
 * @param {number} byte - 0..255
 * @returns {object} { byte, size, bits: [b0,b1,b2,b3] (数字 0/1), flags: {b0,b1,b2,b3} (布尔值) }
 */
export function unpackByte(byte) {
  if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
    throw new RangeError("byte 必须是 0..255 的整数");
  }
  const size = (byte >> 4) & 0x0f; // 高 4 位
  const b0 = (byte >> 0) & 1;
  const b1 = (byte >> 1) & 1;
  const b2 = (byte >> 2) & 1;
  const b3 = (byte >> 3) & 1;
  return {
    byte: byte & 0xff,
    size,
    bits: [b0, b1, b2, b3],
    flags: {
      b0: Boolean(b0),
      b1: Boolean(b1),
      b2: Boolean(b2),
      b3: Boolean(b3),
    }, // 方便需要布尔值时使用
  };
}

/**
 * 工具函数
 *
 * 将四个分段传输参数(合共48位，6字节)打包成字节值
 *
 * @param{number} lengthToBoundary - 检测到标头的位置距离边界还有多少个载荷字(0~511)
 * @param{number} messageID - 消息辨识ID(0~4095)
 * @param{number} SerialNumber - 消息序号(0~4095)
 * @param{boolean} UseAONT - 本段消息是否使用了AONT(全有或全无转换)
 * @param{string} key - 明文密钥，若提供则自动执行 AES-CTR 局部加密
 * @param{number} iv - 14bit的初始向量 (0~16383)
 * @returns{Uint8Array} 一个字节数组，长度为6。
 */
export function packFlexibleTransferConfig(
  lengthToBoundary,
  messageID,
  SerialNumber,
  UseAONT,
  key = null,
  iv = 0
) {
  // 1. 安全掩码截断：防止外部传入的数值过大导致位溢出
  const len = lengthToBoundary & 0x1ff; // 9 bits (最大 511)
  const msg = messageID & 0xfff; // 12 bits (最大 4095)
  const ser = SerialNumber & 0xfff; // 12 bits (最大 4095)
  const aont = UseAONT ? 1 : 0; // 1 bit

  const safeIv = iv & 0x3fff; // 14 bits (最大 16383)

  // 2. 避免 JS 32位位移溢出，将 48 位切割为高 24 位与低 24 位
  const high24 = (len << 15) | (msg << 3) | (ser >> 9);
  const low24 = ((ser & 0x1ff) << 15) | (aont << 14) | safeIv;

  // 3. 将 24 位区块映射为 Uint8Array (大端序 Big-Endian)
  const buffer = new Uint8Array(6);
  buffer[0] = (high24 >> 16) & 0xff;
  buffer[1] = (high24 >> 8) & 0xff;
  buffer[2] = high24 & 0xff;
  buffer[3] = (low24 >> 16) & 0xff;
  buffer[4] = (low24 >> 8) & 0xff;
  buffer[5] = low24 & 0xff;

  // 4. CryptoJS 局部加密逻辑 (若传入了 KEY)
  if (key) {
    // 【步骤 A】：派生 AES 的实际加密 Key -> SHA256(KEY)
    const hash1 = CryptoJS.SHA256(key);

    // 【步骤 B】：派生实际的 IV (CTR 计数器块)
    // 14bit 扩充填充到 16bit (2字节)
    const ivByte0 = (safeIv >> 8) & 0xff;
    const ivByte1 = safeIv & 0xff;

    // 手动将 2 字节转换为 CryptoJS 的 WordArray 格式，避免版本兼容问题
    const ivWord = (ivByte0 << 24) | (ivByte1 << 16);
    const ivWordArr = CryptoJS.lib.WordArray.create([ivWord], 2);

    // actualIV = SHA256( Hash1 + 2字节的IV )
    const concatData = hash1.clone().concat(ivWordArr);
    const actualIV = CryptoJS.SHA256(concatData);

    // 【步骤 C】：生成 CTR 密钥流 (Keystream)
    // 截取 actualIV 的前 16 字节(128 bit)作为 AES 的计数器块
    const counterBlock = CryptoJS.lib.WordArray.create(
      actualIV.words.slice(0, 4),
      16
    );

    // 用 hash1 (第一层哈希) 作密钥，以 ECB 模式加密 counterBlock，
    // 这在密码学上等价于输出了 CTR 模式的第一块密钥流。
    const encryptedBlock = CryptoJS.AES.encrypt(counterBlock, hash1, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.NoPadding,
    });

    // 将 CryptoJS 的 WordArray 输出无损转换为标准的 Uint8Array
    const keystream = new Uint8Array(16);
    const words = encryptedBlock.ciphertext.words;
    for (let i = 0; i < 16; i++) {
      keystream[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }

    // 【步骤 D】：掩码异或，精准加密前 34 bits
    buffer[0] ^= keystream[0];
    buffer[1] ^= keystream[1];
    buffer[2] ^= keystream[2];
    buffer[3] ^= keystream[3];
    // 0xC0 = 11000000，精准异或高 2 位 (载荷)，保留低 6 位和第 5 字节的 8 位(合计 14bit IV) 绝对明文
    buffer[4] ^= keystream[4] & 0xc0;
  }

  return buffer;
}

/**
 * 工具函数
 *
 * 将四个分段传输参数(合共48位，6字节)逆向拆包
 * 用于将 6 字节的 Uint8Array 还原为具体的配置参数
 *
 * @param {Uint8Array} buffer - 长度为 6 的字节数组 (需为解密后的数据)
 */
function unpackFlexibleTransferConfig(buffer) {
  if (buffer.length !== 6) throw new Error("Buffer must be exactly 6 bytes");

  // 1. 避免 JS 32位带符号整数溢出，将 6 字节分为高 24 位与低 24 位分别合并
  const high24 = (buffer[0] << 16) | (buffer[1] << 8) | buffer[2];
  const low24 = (buffer[3] << 16) | (buffer[4] << 8) | buffer[5];

  // 2. 按约定的位宽与偏移量逐个提取字段
  // [Length 9位]：提取 high24 的前 9 位 (右移 15 位，掩码 0x1FF)
  const lengthToBoundary = (high24 >> 15) & 0x1ff;

  // [MessageID 12位]：提取 high24 的中间 12 位 (右移 3 位，掩码 0xFFF)
  const messageID = (high24 >> 3) & 0xfff;

  // [SerialNumber 12位]：跨越了高低 24 位的分界线，需拆解并重新缝合
  const serHigh3 = high24 & 0x7; // 截取 high24 剩余的低 3 位
  const serLow9 = (low24 >> 15) & 0x1ff; // 截取 low24 开头的高 9 位
  const SerialNumber = (serHigh3 << 9) | serLow9; // 重新拼装为 12 位的完整序号

  // [UseAONT 1位]：提取 low24 中紧接其后的 1 位
  const UseAONT = ((low24 >> 14) & 0x1) === 1;

  // [IV 14位]：提取 low24 最后剩余的 14 位 (掩码 0x3FFF)
  const iv = low24 & 0x3fff;

  return { lengthToBoundary, messageID, SerialNumber, UseAONT, iv };
}

/**
 * 标准整数到字节串的转换 (I2OSP) - 32 位大端序
 * 将循环的计数器转换为 4 个字节的 Uint8Array
 *
 * @param {number} counter - 当前的循环计数器
 * @returns {Uint8Array} - 4字节的大端序字节数组
 */
export function i2osp(counter) {
  const c = new Uint8Array(4);
  // 使用无符号右移 (>>>) 和位与 (&) 提取各个字节
  c[0] = (counter >>> 24) & 0xff;
  c[1] = (counter >>> 16) & 0xff;
  c[2] = (counter >>> 8) & 0xff;
  c[3] = counter & 0xff;
  return c;
}

/**
 * 工具函数
 *
 * 获取TOTP加密时候，十六个步长选项对应的实际步长(秒数)
 *
 * @param{number} key 整数(0~15)
 *
 */
export function getStep(key) {
  let second = 0;
  /* v8 ignore next 50 */
  switch (key) {
    case 0:
      second = 180;
      break;
    case 1:
      second = 300;
      break;
    case 2:
      second = 600;
      break;
    case 3:
      second = 1800;
      break;
    case 4:
      second = 7200;
      break;
    case 5:
      second = 21600;
      break;
    case 6:
      second = 43200;
      break;
    case 7:
      second = 86400;
      break;
    case 8:
      second = 259200;
      break;
    case 9:
      second = 432000;
      break;
    case 10:
      second = 604800;
      break;
    case 11:
      second = 1814400;
      break;
    case 12:
      second = 2419200;
      break;
    case 13:
      second = 4838400;
      break;
    case 14:
      second = 14515200;
      break;
    case 15:
      second = 31557600;
      break;
  }
  return second;
}

export class ValueNoise1D {
  /**
   * 工具函数
   * 一个基于伪随机的一维值噪声生成器
   *
   * 在一些不适合纯随机分布的情况下适用。
   *
   * **/
  constructor(seed = Math.random()) {
    this.seed = seed;
  }

  // 伪随机哈希，固定输入产生固定输出
  random(x) {
    let n = Math.sin(x * 12.9898 + this.seed) * 43758.5453;
    return n - Math.floor(n);
  }

  // 余弦平滑插值
  interpolate(a, b, blend) {
    const theta = blend * Math.PI;
    const f = (1 - Math.cos(theta)) * 0.5;
    return a * (1 - f) + b * f;
  }

  // 获取噪声值
  get(x) {
    const intX = Math.floor(x);
    const fracX = x - intX;

    const v1 = this.random(intX);
    const v2 = this.random(intX + 1);

    return this.interpolate(v1, v2, fracX);
  }
}

export function preCheck_OLD(inp) {
  let input = String(inp);
  let size = input.length; //第一次遍历字符数组的函数，负责判断给定的输入类型。
  let temp, temp2, group;
  let isEncrypted = false; //判定该文本是否为加密文本

  let isJPFound = false; //如果检查出一个日语标志位，则标记为真
  let isCNFound = false; //如果检查出一个汉字标志位，则标记为真
  for (let i = 0; i < size; i++) {
    temp = input[i];

    if (i != size - 1) {
      //一次遍历两个字符，遇到倒数第一个的时候防止越界
      temp2 = input[i + 1];
    } else {
      temp2 = NULL_STR;
    }
    group = temp + temp2;

    //判断这个符号是不是标识符，标识符用空字符进行占位操作
    if (SIG_DECRYPT_JP.indexOf(temp) != -1) {
      input = setCharOnIndex(input, i, NULL_STR);
      isJPFound = true;
      continue;
    }
    if (SIG_DECRYPT_CN.indexOf(temp) != -1) {
      input = setCharOnIndex(input, i, NULL_STR);
      isCNFound = true;
      continue;
    }
  }

  if (isJPFound && isCNFound) {
    isEncrypted = true;
  }
  let Result = new PreCheckResult(stringToUint8Array(input), isEncrypted);
  return Result;
}
