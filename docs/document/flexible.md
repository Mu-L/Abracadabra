# 灵活分段传输

灵活分段传输 是魔曰针对超长文本或二进制文件传输设计的核心扩展机制。

## 实用功能与应用场景

在实际使用中，灵活分段传输能提供以下关键的实用体验：

- **多渠道分发传输**：由于数据被拆分为数个独立的密文段，你可以将它们通过不同的社交平台、论坛贴文或聊天窗口分别发出，最后由接收方一并收集并解密。
- **乱序接收与自动重组**：每个分段密文中均嵌有隐藏的序列号(SerialNumber)和消息标识(MessageID)。接收方可以杂乱无章地导入密文，系统会自动按发送方归类、按顺序重组并恢复明文，对传输顺序和通道没有任何要求。
- **消除字频统计特征**：超长密文如果单条转换并大段发送，容易暴露句式重复率或呈现字频特征。分段传输使用一维值噪声(`ValueNoise1D`)对数据进行动态长度切片，允许用户分开甚至跨平台发送密文，可有效减弱长文本在统计学上的特征关联。
- **全有或全无保护(AONT)**：开启 AONT 后，密文分段深度纠缠。解密时必须集齐 100% 的分段，即便只缺失任意一个分段，也无法还原出明文的任何局部片段，有效防止信息局部泄露。

## 核心实现机制

为了支持分批分发与无序重组，魔曰在底层实现了四项核心机制：

### 一维值噪声切分

程序使用一维值噪声(`ValueNoise1D`)与余弦平滑插值，在设定的上下限区间内平滑、自适应地产生每一段的分段大小。这种长度分布相比纯随机数更具平滑度，使生成的古文段落长短过渡更加自然。

### AONT(全有或全无)混淆

在分段加密前，调用 MGF1-SHA256 掩码派生算法对明文字节执行异或编码，并在数据尾部附加一个 32 字节的种子校验控制块。这使得每个密文分段彼此纠缠，防止了分段传输时的局部信息泄露。

### 固定 10 字符标头

每个加密后的分段 Base64 数据中，都会被随机插入一个固定长度为 10 字符的标头，格式为 `... /=xxxxxxxx ...`。

- `"/="` 为灵活分段的魔数标识。
- 后续 8 字符(48 bits)承载经主密钥 CTR 局部混淆的元数据：包含用于定位结束位置以重置转轮(`RoundReset`)的 `lengthToBoundary` (9 bits)、局部 `iv` (14 bits)、`messageID` (12 bits)、`SerialNumber` (12 bits) 和 AONT 状态。

### 转轮状态隔离与排序还原

解密时，解映射器通过 `lengthToBoundary` 精确识别出当前分段的边界，在分段交界处重置三重转轮的状态以避免跨段状态污染。随后，按照 MessageID 归类，并在同一消息下基于 SerialNumber 升序排列，合并拼接后执行 DeAONT 与解密。

::: tip 提示

当一次性导入多个属于不同消息(即 `MessageID` 不同)的密文段落进行合并解密时，**所有消息的加密密码必须保持一致**。

由于解密函数在单次运行中仅接受单一密钥参数，若各消息的密码不同，将无法在同一次调用中成功解密。

:::

::: warning 警告

单条消息分段传输的分段数量上限为 4096 段。

同时，两条本应是不同 ID 的消息，有 1/4096 (0.024%) 的概率发生 `MessageID` 碰撞。一旦发生 ID 碰撞，将无法将这两条 ID 相同的消息混在一起进行合并解密。

:::

## 核心配置参数

在调用 `WenyanInput` 加密时，可在配置项中传入 `FlexibleTransfer` 的相关参数：

- **Enable** (Boolean, 默认 `false`)：是否启用灵活分段传输。
- **UseAONT** (Boolean, 默认 `true`)：是否开启全有或全无转换。开启后防篡改/防局部破解能力最强，但会带来 32 字节的长度开销。
- **MessageID** (Number, 默认 `-1`)：消息辨识 ID(0~4095)。若设为 -1，系统会随机生成一个，用于在混合接收时自动剥离不同发送方的消息。
- **RandomParagraphing** (Array, 默认 `[20, 80]`)：指定分段的字节数量上下限。范围为 `[10, 380]`，区间越小密文段落越短。

::: tip 提示

此处的自适应分段是**最外层(字节级)**的切片分段，与文言文仿真层中的**自适应分段**是两个独立且不相干的机制。

在开启灵活分段传输时，数据在最外层(字节级)进行切片分段，每段被独立加密成 Base64。此后各加密段被分别送入文言仿真层，并再次遵循文言文的自适应上限规则进行字符段落切分。

:::

## 灵活分段传输流程

### 加密与分段流程

```mermaid
flowchart TD
    Start([原始数据 Uint8Array]) --> AONT_Check{是否启用 AONT?}
    AONT_Check -- 是 --> EnAONT[EnAONT 混淆<br/>附加 32 字节控制块]
    AONT_Check -- 否 --> SegDist[分段长度计算]
    EnAONT --> SegDist

    SegDist --> SliceData["根据 ValueNoise1D 噪声<br/>自适应切片 [min, max] 字节"]
    SliceData --> LoopStart[遍历数据块]

    LoopStart --> EncryptChunk[逐块 AES-CTR 加密]
    EncryptChunk --> Base64Chunk[转为 Base64 并去除 Padding]
    Base64Chunk --> InsertHeader["随机插入 10 字符标头<br/>/=xxxxxxxx"]
    InsertHeader --> WenyanMap[文言文仿真映射]

    WenyanMap --> LoopNext{是否处理完所有块?}
    LoopNext -- 否 --> LoopStart
    LoopNext -- 是 --> Output[输出多段文言文密文]
```

### 解密与重组流程

```mermaid
flowchart TD
    Input([多段汉字密文]) --> deMap[解映射 deMap]
    deMap --> ScanMagic{检测到魔数 /=?}

    ScanMagic -- 是 --> ReadHeader["提取并解密 8 字符标头<br/>获取边界距离 lengthToBoundary"]
    ReadHeader --> ReachBoundary{到达当前分段边界?}
    ReachBoundary -- 是 --> SaveChunk["隔离保存分段数据<br/>重置转轮状态 RoundReset"]
    ReachBoundary -- 否 --> ContinueRead[继续解混淆 Base64 字符]
    ContinueRead --> ReachBoundary

    ScanMagic -- 否 --> OutputArray[输出分段数据对象数组]
    SaveChunk --> ScanMagic

    OutputArray --> GroupMsg[按 MessageID 分类归群]
    GroupMsg --> SortMsg[各分组内按 SerialNumber 升序排序]
    SortMsg --> DecryptMsg[逐段解密并合并字节流]
    DecryptMsg --> AONT_CheckD{分段是否含 AONT?}
    AONT_CheckD -- 是 --> DeAONT[执行反 AONT 逆变换]
    AONT_CheckD -- 否 --> Restore[还原出原始数据]
    DeAONT --> Restore
    Restore --> Finish([解密完成])
```
