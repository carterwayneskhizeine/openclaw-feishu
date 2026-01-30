# OpenClaw Feishu/Lark Plugin

[![NPM Version](https://img.shields.io/npm/v/@openclaw/feishu)](https://www.npmjs.com/package/@openclaw/feishu)
[![MIT License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![OpenClaw Version](https://img.shields.io/badge/OpenClaw-2026.1+-blue)](https://github.com/openclaw/openclaw)

飞书/Lark channel plugin for [OpenClaw](https://github.com/openclaw/openclaw).

## Features

### ✅ Implemented

- **WebSocket connection mode** - Receive events via WebSocket long connection
- **Webhook connection mode** - HTTP webhook receiver with signature verification
- **Direct messages (DM)** - Send and receive DMs
- **Group chats** - Send and receive group messages
- **Text messages** - Send and receive text messages
- **Media messages** - Send images and files
- **Message replies** - Reply to messages with context
- **@mention support** - Require mentions in group chats
- **User info** - Fetch user display names
- **Pairing flow** - DM approval workflow (pairing/open/allowlist policies)
- **Markdown card rendering** - Auto-detect code blocks and tables

### 🔄 In Progress

- **Event handling** - Bot added/removed events
- **Reactions** - Message reactions support

### 📋 Planned

- **Typing indicator** - Show "bot is typing"
- **Message read receipts** - Track message read status

## Installation

## Installation

### Method 1: Install from npm (recommended)

```bash
openclaw plugins install @openclaw/feishu
```

### Method 2: Install from source

```bash
# Clone and install dependencies
git clone https://github.com/yourusername/openclaw-feishu.git
cd openclaw-feishu
npm install

# Build
npm run build

# Install the plugin
openclaw plugins install ./dist
```

### Method 3: Manual installation

```bash
# Download the plugin
mkdir -p ~/.openclaw/extensions/feishu
cd ~/.openclaw/extensions/feishu

# Copy plugin files here
```

## Configuration

### Step 1: Create a Feishu Open Platform App

1. Go to [Feishu Open Platform](https://open.feishu.cn) (国内) or [Lark Developer Console](https://developer.larksuite.com) (国际)
2. Create a new self-built app
3. Get your App ID and App Secret from the Credentials page

### Step 2: Enable Required Permissions

Go to **Permissions** in your app settings and enable:

| Permission | Scope | Description |
|------------|-------|-------------|
| `im:message` | Messaging | Send and receive messages |
| `im:message.p2p_msg:readonly` | DM | Read direct messages to bot |
| `im:message.group_at_msg:readonly` | Group | Receive @mention messages in groups |
| `im:message:send_as_bot` | Send | Send messages as the bot |
| `im:resource` | Media | Upload and download images/files |
| `contact:user.base:readonly` | User Info | Get basic user info |

Optional permissions:

| Permission | Scope | Description |
|------------|-------|-------------|
| `im:message.group_msg` | Group | Read all group messages |
| `im:message:readonly` | Read | Get message history |
| `im:message.reactions:read` | Reactions | View message reactions |

### Step 3: Configure Event Subscriptions

Go to **Events & Callbacks** in your app settings:

1. **Event configuration method**: Select **Long connection** (recommended)
2. **Add event subscriptions**:
   - `im.message.receive_v1` - Receive messages (required)
   - `im.message.message_read_v1` - Message read receipts
   - `im.chat.member.bot.added_v1` - Bot added to group
   - `im.chat.member.bot.deleted_v1` - Bot removed from group
3. Submit for approval if needed

### Step 4: Configure OpenClaw

Add to your OpenClaw configuration (`~/.openclaw/openclaw.json`):

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

Or use the CLI:

```bash
openclaw configure --section channels
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable the channel |
| `appId` | string | - | Feishu App ID |
| `appSecret` | string | - | Feishu App Secret |
| `domain` | `"feishu"` \| `"lark"` | `"feishu"` | Domain for China or International |
| `connectionMode` | `"websocket"` \| `"webhook"` | `"websocket"` | Connection mode |
| `dmPolicy` | `"pairing"` \| `"open"` \| `"allowlist"` | `"pairing"` | DM policy |
| `groupPolicy` | `"open"` \| `"allowlist"` \| `"disabled"` | `"allowlist"` | Group chat policy |
| `requireMention` | boolean | `true` | Require @mention in groups |
| `mediaMaxMb` | number | `30` | Max media file size in MB |
| `renderMode` | `"auto"` \| `"raw"` \| `"card"` | `"auto"` | Reply render mode |

### Render Modes

- **`auto`** (default): Automatically detect and use card mode for messages with code blocks or tables
- **`raw`**: Always send plain text, markdown tables converted to ASCII
- **`card`**: Always use interactive cards with full markdown rendering

## Usage

### Start the Bot

```bash
# Restart OpenClaw gateway after configuration
openclaw gateway restart
```

### Find the Bot

1. Ensure your app is published (at least to test version)
2. Search for the bot name in Feishu search box
3. Check if your account is in the app's availability scope

### Commands

- `/new` - Start a new conversation

## Troubleshooting

### Bot cannot receive messages

- ✅ Check if event subscriptions are configured
- ✅ Ensure event configuration is set to "Long connection"
- ✅ Verify `im.message.receive_v1` event is added
- ✅ Check if all permissions are approved

### 403 error when sending messages

- ✅ Ensure `im:message:send_as_bot` permission is approved

### Cannot find the bot in Feishu

- ✅ Ensure the app is published (at least to test version)
- ✅ Search for the bot name in Feishu search box
- ✅ Check if your account is in the app's availability scope

## Development

```bash
# Install dependencies
npm installnpm run build



# Build
# Watch mode
npm run dev
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Pull requests are welcome! Please read our contributing guidelines before submitting PRs.

## Credits

This plugin is inspired by [clawdbot-feishu](https://github.com/m1heng/clawdbot-feishu) and adapted for OpenClaw.
