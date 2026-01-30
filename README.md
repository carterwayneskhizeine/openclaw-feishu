# OpenClaw 飞书/Lark 插件

[English](README_EN.md)

[![NPM Version](https://img.shields.io/npm/v/@openclaw/feishu)](https://www.npmjs.com/package/@openclaw/feishu)
[![MIT License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![OpenClaw Version](https://img.shields.io/badge/OpenClaw-2026.1+-blue)](https://github.com/openclaw/openclaw)

[OpenClaw](https://github.com/openclaw/openclaw) 的飞书/Lark 渠道插件。

## 功能特性

### ✅ 已实现

- **WebSocket 连接模式** - 通过 WebSocket 长连接接收事件
- **Webhook 连接模式** - 支持签名验证的 HTTP Webhook 接收器
- **私聊消息（DM）** - 收发私聊消息
- **群组聊天** - 收发群组消息
- **文本消息** - 收发文本消息
- **媒体消息** - 发送图片和文件
- **消息回复** - 带上下文的消息回复
- **@提及支持** - 群聊中支持 @提及触发
- **用户信息** - 获取用户显示名称
- **配对流程** - 私聊审批工作流（配对/开放/白名单策略）
- **Markdown 卡片渲染** - 自动识别代码块和表格

### 🔄 开发中

- **事件处理** - 机器人被添加/移除事件
- **表情反应** - 消息表情反应支持

### 📋 计划中

- **输入指示器** - 显示“机器人正在输入”
- **消息已读回执** - 跟踪消息已读状态

## 安装

### 方法 1：通过 npm 安装（推荐）

```bash
openclaw plugins install @openclaw/feishu
```

### 方法 2：从源码安装

```bash
# 克隆仓库并安装依赖
git clone https://github.com/yourusername/openclaw-feishu.git
cd openclaw-feishu
npm install

# 构建
npm run build

# 安装插件
openclaw plugins install ./dist
```

### 方法 3：手动安装

```bash
# 创建插件目录
mkdir -p ~/.openclaw/extensions/feishu
cd ~/.openclaw/extensions/feishu

# 将插件文件复制至此目录
```

## 配置

### 步骤 1：创建飞书开放平台应用

1. 访问 [飞书开放平台](https://open.feishu.cn)（国内）或 [Lark Developer Console](https://developer.larksuite.com)（国际版）
2. 创建一个新的自建应用
3. 在凭证页面获取 App ID 和 App Secret

### 步骤 2：启用所需权限

在应用设置的 **权限管理** 中启用以下权限：

| 权限 | 范围 | 说明 |
|------|------|------|
| `im:message` | 消息 | 收发消息 |
| `im:message.p2p_msg:readonly` | 私聊 | 读取发送给机器人的私聊消息 |
| `im:message.group_at_msg:readonly` | 群组 | 接收群组中的 @提及消息 |
| `im:message:send_as_bot` | 发送 | 以机器人身份发送消息 |
| `im:resource` | 媒体 | 上传和下载图片/文件 |
| `contact:user.base:readonly` | 用户信息 | 获取用户基础信息 |

可选权限：

| 权限 | 范围 | 说明 |
|------|------|------|
| `im:message.group_msg` | 群组 | 读取所有群组消息 |
| `im:message:readonly` | 读取 | 获取消息历史记录 |
| `im:message.reactions:read` | 表情 | 查看消息表情反应 |

### 步骤 3：配置事件订阅

在应用设置的 **事件与回调** 中进行配置：

1. **事件配置方式**：选择 **长连接**（推荐）
2. **添加事件订阅**：
   - `im.message.receive_v1` - 接收消息（必需）
   - `im.message.message_read_v1` - 消息已读回执
   - `im.chat.member.bot.added_v1` - 机器人被添加到群组
   - `im.chat.member.bot.deleted_v1` - 机器人被移出群组
3. 如有需要，提交审核

### 步骤 4：配置 OpenClaw

在 OpenClaw 配置文件（`~/.openclaw/openclaw.json`）中添加：

```json
{
  "plugins": {
    "entries": {
      "feishu": {
        "enabled": true,
        "appId": "your_app_id",
        "appSecret": "your_app_secret",
        "domain": "feishu",
        "connectionMode": "websocket",
        "dmPolicy": "pairing",
        "groupPolicy": "allowlist",
        "requireMention": true,
        "mediaMaxMb": 30,
        "renderMode": "auto"
      }
    }
  }
}
```

或使用 CLI 配置：

```bash
openclaw configure --section channels
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 启用该渠道 |
| `appId` | string | - | 飞书 App ID |
| `appSecret` | string | - | 飞书 App Secret |
| `domain` | `"feishu"` \| `"lark"` | `"feishu"` | 选择国内（feishu）或国际版（lark）域名 |
| `connectionMode` | `"websocket"` \| `"webhook"` | `"websocket"` | 连接模式 |
| `dmPolicy` | `"pairing"` \| `"open"` \| `"allowlist"` | `"pairing"` | 私聊策略 |
| `groupPolicy` | `"open"` \| `"allowlist"` \| `"disabled"` | `"allowlist"` | 群聊策略 |
| `requireMention` | boolean | `true` | 群聊中是否需要 @提及 |
| `mediaMaxMb` | number | `30` | 媒体文件最大大小（MB） |
| `renderMode` | `"auto"` \| `"raw"` \| `"card"` | `"auto"` | 回复渲染模式 |

### 渲染模式

- **`auto`**（默认）：自动检测含代码块或表格的消息并使用卡片模式
- **`raw`**：始终发送纯文本，Markdown 表格转换为 ASCII 格式
- **`card`**：始终使用支持完整 Markdown 渲染的交互式卡片

## 使用方法

### 启动机器人

```bash
# 配置完成后重启 OpenClaw 网关
openclaw gateway restart
```

### 查找机器人

1. 确保应用已发布（至少为测试版本）
2. 在飞书搜索框中搜索机器人名称
3. 检查您的账号是否在应用的可见范围内

### 命令

- `/new` - 开启新对话

## 故障排查

### 机器人无法接收消息

- ✅ 检查事件订阅是否已配置
- ✅ 确认事件配置方式为“长连接”
- ✅ 验证是否已添加 `im.message.receive_v1` 事件
- ✅ 检查所有权限是否已获批

### 发送消息时出现 403 错误

- ✅ 确保 `im:message:send_as_bot` 权限已获批

### 在飞书中找不到机器人

- ✅ 确保应用已发布（至少为测试版本）
- ✅ 在飞书搜索框中搜索机器人名称
- ✅ 检查您的账号是否在应用的可见范围内

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 监听模式
npm run dev
```

## 许可证

MIT 许可证 - 详情见 [LICENSE](LICENSE)。

## 贡献

欢迎提交 Pull Request！提交前请阅读我们的贡献指南。

## 致谢

本插件受 [clawdbot-feishu](https://github.com/m1heng/clawdbot-feishu) 启发，并针对 OpenClaw 进行了适配开发。