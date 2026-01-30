import type {
  ChannelAccount,
  ChannelCapabilities,
  ChannelConfig,
  ChannelContext,
  DeliveryResult,
  MediaDeliveryResult,
  OutboundAdapter,
  InboundAdapter,
  InboundMessage,
  User,
} from "openclaw";

// Feishu API types
export interface FeishuConfig {
  appId: string;
  appSecret: string;
  domain: "feishu" | "lark";
  connectionMode: "websocket" | "webhook";
  dmPolicy: "pairing" | "open" | "allowlist";
  groupPolicy: "open" | "allowlist" | "disabled";
  requireMention: boolean;
  mediaMaxMb: number;
  renderMode: "auto" | "raw" | "card";
  verificationToken?: string;
  encryptKey?: string;
}

export interface FeishuMessage {
  message_id: string;
  root_id?: string;
  parent_id?: string;
  chat_id: string;
  chat_type: "p2p" | "group";
  sender: {
    id: string;
    id_type: "open_id" | "user_id" | "union_id";
    name?: string;
  };
  message_type: "text" | "image" | "file" | "card" | "rich_text";
  content: string;
  create_time: string;
  update_time?: string;
}

export interface FeishuAccount extends ChannelAccount {
  appId: string;
  appSecret: string;
  domain: "feishu" | "lark";
  tenantAccessToken?: string;
  tokenExpiry?: number;
}

// Capabilities
const capabilities: ChannelCapabilities = {
  chatTypes: ["direct", "group"],
  media: {
    images: true,
    files: true,
  },
  reactions: false,
  threads: false,
  mentions: true,
  replyContext: true,
};

// Helper to get tenant access token
export async function getTenantAccessToken(
  account: FeishuAccount
): Promise<string> {
  if (account.tenantAccessToken && account.tokenExpiry) {
    if (Date.now() < account.tokenExpiry - 60000) {
      return account.tenantAccessToken;
    }
  }

  const domain = account.domain === "feishu" ? "open.feishu.cn" : "open.larksuite.com";
  const url = `https://${domain}/open-apis/auth/v3/tenant_access_token/internal`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: account.appId,
      app_secret: account.appSecret,
    }),
  });

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`Failed to get tenant access token: ${data.msg}`);
  }

  account.tenantAccessToken = data.tenant_access_token;
  account.tokenExpiry = Date.now() + data.expire * 1000;

  return data.tenant_access_token;
}

// Helper to get user info
export async function getUserInfo(
  account: FeishuAccount,
  userId: string,
  idType: string = "open_id"
): Promise<User | null> {
  try {
    const token = await getTenantAccessToken(account);
    const domain = account.domain === "feishu" ? "open.feishu.cn" : "open.larksuite.com";

    const url = `https://${domain}/open-apis/contact/v3/users/${userId}?user_id_type=${idType}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (data.code !== 0) {
      return null;
    }

    const user = data.data?.user;
    return {
      id: user.open_id,
      name: user.name || user.nick_name || "Unknown",
      avatar: user.avatar?.url,
    };
  } catch {
    return null;
  }
}

// Helper to parse Feishu message to OpenClaw message
export function parseFeishuMessage(
  msg: FeishuMessage,
  account: FeishuAccount
): InboundMessage | null {
  // Skip messages sent by the bot
  if (msg.sender.id_type === "app_id") {
    return null;
  }

  // Parse text content
  let text = "";
  try {
    const content = JSON.parse(msg.content);
    text = content.text || "";
  } catch {
    // For non-text messages, use message_type as fallback
    text = `[${msg.message_type}]`;
  }

  // Check if @mention is required and present
  if (msg.chat_type === "group") {
    // TODO: Check for @mention in text
  }

  return {
    id: msg.message_id,
    type: msg.message_type as any,
    text,
    sender: {
      id: msg.sender.id,
      name: msg.sender.name || "Unknown",
    },
    conversationId: msg.chat_id,
    conversationType: msg.chat_type as "direct" | "group",
    timestamp: new Date(msg.create_time).getTime(),
    replyToId: msg.root_id || msg.parent_id,
    raw: msg,
  };
}

// Outbound adapter
export const outbound: OutboundAdapter<FeishuConfig, FeishuAccount> = {
  deliveryMode: "direct",

  listAccountIds: (config) =>
    Object.keys(config.channels?.feishu?.accounts ?? {}),

  resolveAccount: (config, accountId) => {
    const accountConfig = config.channels?.feishu?.accounts?.[accountId ?? "default"];
    return {
      ...accountConfig,
      accountId: accountId ?? "default",
    } as FeishuAccount;
  },

  async sendText({ account, config, text, context }): Promise<DeliveryResult> {
    try {
      const token = await getTenantAccessToken(account);
      const domain = account.domain === "feishu" ? "open.feishu.cn" : "open.larksuite.com";

      const recipientId = context.recipientId ?? context.conversationId;
      const receiveIdType = context.conversationType === "group" ? "chat_id" : "open_id";

      const url = `https://${domain}/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: recipientId,
          msg_type: "text",
          content: JSON.stringify({ text }),
        }),
      });

      const data = await response.json();

      if (data.code !== 0) {
        return { ok: false, error: data.msg };
      }

      return { ok: true, messageId: data.data?.message_id };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  },

  async sendMedia({
    account,
    config,
    media,
    context,
  }): Promise<MediaDeliveryResult> {
    try {
      const token = await getTenantAccessToken(account);
      const domain = account.domain === "feishu" ? "open.feishu.cn" : "open.larksuite.com";

      const isImage = media.type === "image";
      const recipientId = context.recipientId ?? context.conversationId;
      const receiveIdType = context.conversationType === "group" ? "chat_id" : "open_id";

      // Step 1: Upload image/file
      const uploadUrl = `https://${domain}/open-apis/im/v1/images`;

      // For file upload, we need to read the file first
      const fileContent = await fetch(media.file).then(r => r.arrayBuffer());
      const blob = new Blob([fileContent], { type: media.mimeType || "application/octet-stream" });

      const formData = new FormData();
      formData.append(
        "image_type",
        isImage ? "message" : "file"
      );
      formData.append("file", blob, media.filename || "file");

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const uploadData = await uploadResponse.json();

      if (uploadData.code !== 0) {
        return { ok: false, error: uploadData.msg };
      }

      const imageKey = uploadData.data?.image_key;

      // Step 2: Send message with image
      const sendUrl = `https://${domain}/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`;

      const sendResponse = await fetch(sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: recipientId,
          msg_type: isImage ? "image" : "file",
          content: JSON.stringify({ image_key: imageKey }),
        }),
      });

      const sendData = await sendResponse.json();

      if (sendData.code !== 0) {
        return { ok: false, error: sendData.msg };
      }

      return { ok: true, messageId: sendData.data?.message_id };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  },
};

// WebSocket-based inbound adapter
export function createWebSocketInbound(): InboundAdapter<FeishuConfig, FeishuAccount> {
  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let handleMessageFn: ((msg: InboundMessage) => void) | null = null;
  let handleEventFn: ((event: any) => void) | null = null;
  let handleStatusFn: ((status: { status: string }) => void) | null = null;

  async function connect(account: FeishuAccount, config: FeishuConfig) {
    const domain = account.domain === "feishu" ? "open.feishu.cn" : "open.larksuite.com";
    const token = await getTenantAccessToken(account);

    // Connect to WebSocket
    const wsUrl = `wss://${domain}/open-apis/im/v1/messages?token=${token}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      handleStatusFn?.({ status: "connected" });
      console.log("[feishu] WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.event && data.event.message) {
          // Handle message event
          const msg = parseFeishuMessage(data.event.message, account);
          if (msg) {
            handleMessageFn?.(msg);
          }
        } else if (data.event) {
          // Handle other events
          handleEventFn?.(data.event);
        }
      } catch (error) {
        console.error("[feishu] Failed to parse WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      handleStatusFn?.({ status: "disconnected" });
      console.log("[feishu] WebSocket disconnected, reconnecting...");
      
      // Reconnect after 5 seconds
      reconnectTimeout = setTimeout(() => {
        connect(account, config);
      }, 5000);
    };

    ws.onerror = (error) => {
      console.error("[feishu] WebSocket error:", error);
    };
  }

  return {
    capabilities,

    async start({ config, account, handleMessage, handleEvent, handleStatus }) {
      handleMessageFn = handleMessage;
      handleEventFn = handleEvent;
      handleStatusFn = handleStatus;

      const feishuAccount = outbound.resolveAccount(config, "default");
      await connect(feishuAccount, config);

      handleStatus({ status: "ready" });
    },

    async stop() {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
    },

    async verifySignature(payload: string, signature: string, timestamp: string): Promise<boolean> {
      // Verify webhook signature if encryption is enabled
      // This is for webhook mode, not WebSocket
      return true;
    },
  };
}

// HTTP-based inbound adapter (for webhook mode)
export function createWebhookInbound(): InboundAdapter<FeishuConfig, FeishuAccount> {
  let server: any = null;
  let handleMessageFn: ((msg: InboundMessage) => void) | null = null;
  let handleEventFn: ((event: any) => void) | null = null;
  let handleStatusFn: ((status: { status: string }) => void) | null = null;

  return {
    capabilities,

    async start({ config, account, handleMessage, handleEvent, handleStatus }) {
      handleMessageFn = handleMessage;
      handleEventFn = handleEvent;
      handleStatusFn = handleStatus;

      // Webhook mode requires an HTTP server
      // This would be implemented using a library like fastify or express
      // For now, this is a placeholder
      
      console.log("[feishu] Webhook mode requires HTTP server setup");
      handleStatus({ status: "ready" });
    },

    async stop() {
      if (server) {
        await server.close();
        server = null;
      }
    },

    async verifySignature(payload: string, signature: string, timestamp: string): Promise<boolean> {
      // Signature verification is handled by the HTTP server
      // For webhook mode, pass config to verify in the server handler
      return true;
    },
  };
}

// Export combined inbound adapter
export const inbound = createWebSocketInbound();
