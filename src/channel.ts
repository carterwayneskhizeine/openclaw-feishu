import type {
  ChannelAccount,
  ChannelCapabilities,
  ChannelConfig,
  ChannelContext,
  DeliveryResult,
  MediaDeliveryResult,
  OutboundAdapter,
  InboundAdapter,
  Message,
  User,
} from "openclaw";

// Feishu API types
interface FeishuConfig {
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

interface FeishuMessage {
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

interface FeishuAccount extends ChannelAccount {
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
async function getTenantAccessToken(
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

      // Step 1: Upload image/file
      const uploadUrl = `https://${domain}/open-apis/im/v1/images`;

      const formData = new FormData();
      formData.append(
        "image_type",
        media.type === "image" ? "message" : "file"
      );
      formData.append("rootDir", media.file);

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
      const recipientId = context.recipientId ?? context.conversationId;
      const receiveIdType = context.conversationType === "group" ? "chat_id" : "open_id";

      const sendUrl = `https://${domain}/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`;

      const sendResponse = await fetch(sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: recipientId,
          msg_type: media.type === "image" ? "image" : "file",
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

// Inbound adapter (for WebSocket mode)
export const inbound: InboundAdapter<FeishuConfig, FeishuAccount> = {
  capabilities,

  async start({ config, handleMessage, handleEvent, handleStatus }) {
    // WebSocket connection setup would go here
    // For webhook mode, this would set up an HTTP server
    handleStatus({ status: "ready" });
  },

  async stop() {
    // Cleanup WebSocket or HTTP server
  },

  async verifySignature(payload: string, signature: string, timestamp: string): Promise<boolean> {
    // Verify webhook signature if encryption is enabled
    return true;
  },
};
