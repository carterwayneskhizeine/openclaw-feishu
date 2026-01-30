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

export interface FeishuEvent {
  event_id: string;
  event_type: string;
  create_time: string;
  token: string;
  app_id: string;
  tenant_key: string;
}

// Pairing state storage interface
interface PairingState {
  pendingUsers: Set<string>; // Users waiting for approval
  pairedUsers: Set<string>;  // Users who are approved
  allowlist: Set<string>;    // Users in allowlist (auto-approved)
}

// Create pairing state manager
function createPairingManager(config: FeishuConfig): PairingState {
  const state: PairingState = {
    pendingUsers: new Set(),
    pairedUsers: new Set(),
    allowlist: new Set(),
  };

  // Load allowlist from config
  const allowlist = config.channels?.feishu?.accounts?.default?.allowlist || [];
  if (Array.isArray(allowlist)) {
    allowlist.forEach(id => state.allowlist.add(id));
  }

  return state;
}

// Check if user is allowed to interact
function checkPairingPolicy(
  userId: string,
  policy: "pairing" | "open" | "allowlist",
  state: PairingState
): { allowed: boolean; reason: "pending" | "denied" | "allowed" } {
  if (policy === "open") {
    return { allowed: true, reason: "allowed" };
  }
  
  if (policy === "allowlist") {
    if (state.allowlist.has(userId) || state.pairedUsers.has(userId)) {
      return { allowed: true, reason: "allowed" };
    }
    return { allowed: false, reason: "pending" };
  }
  
  // pairing policy
  if (state.pairedUsers.has(userId)) {
    return { allowed: true, reason: "allowed" };
  }
  if (state.allowlist.has(userId)) {
    state.pairedUsers.add(userId);
    return { allowed: true, reason: "allowed" };
  }
  if (!state.pendingUsers.has(userId)) {
    state.pendingUsers.add(userId);
  }
  return { allowed: false, reason: "pending" };
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
    text = `[${msg.message_type}]`;
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

// Helper to format text as Feishu card
function formatAsCard(text: string): string {
  return JSON.stringify({
    msg_type: "interactive",
    card: {
      config: {
        wide_screen_mode: true,
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "plain_text",
            content: text,
          },
        },
      ],
    },
  });
}

// Helper to render markdown as card
function renderMarkdownCard(text: string): string {
  const lines = text.split("\n");
  const elements: any[] = [];

  for (const line of lines) {
    if (line.startsWith("```")) {
      continue;
    } else if (line.startsWith("#")) {
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: line,
        },
      });
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: line,
        },
      });
    } else if (line.match(/^\d+\./)) {
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: line,
        },
      });
    } else {
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: line,
        },
      });
    }
  }

  return JSON.stringify({
    msg_type: "interactive",
    card: {
      config: {
        wide_screen_mode: true,
      },
      elements,
    },
  });
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

      let msgType = "text";
      let content: string;

      const renderMode = config.channels?.feishu?.renderMode || "auto";
      
      if (renderMode === "card") {
        msgType = "interactive";
        content = renderMarkdownCard(text);
      } else if (renderMode === "auto") {
        if (text.includes("```") || text.includes("|")) {
          msgType = "interactive";
          content = renderMarkdownCard(text);
        } else {
          content = JSON.stringify({ text });
        }
      } else {
        content = JSON.stringify({ text });
      }

      const url = `https://${domain}/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: recipientId,
          msg_type: msgType,
          content,
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

      const uploadUrl = `https://${domain}/open-apis/im/v1/images`;

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
  let currentAccount: FeishuAccount | null = null;
  let currentConfig: FeishuConfig | null = null;
  let pairingState: PairingState | null = null;

  async function connect(account: FeishuAccount, config: FeishuConfig) {
    currentAccount = account;
    currentConfig = config;
    pairingState = createPairingManager(config);

    const domain = account.domain === "feishu" ? "open.feishu.cn" : "open.larksuite.com";
    const token = await getTenantAccessToken(account);

    const wsUrl = `wss://${domain}/open-apis/im/v1/messages?token=${token}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      handleStatusFn?.({ status: "connected" });
      console.log("[feishu] WebSocket connected");
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.event && data.event.message) {
          const msg = parseFeishuMessage(data.event.message, account);
          if (msg) {
            // Check pairing policy for DMs
            if (msg.conversationType === "direct") {
              const policy = config.channels?.feishu?.dmPolicy || "pairing";
              const check = checkPairingPolicy(msg.sender.id, policy, pairingState!);
              
              if (!check.allowed && check.reason === "pending") {
                // Send pairing request message
                const user = await getUserInfo(account, msg.sender.id);
                const userName = user?.name || msg.sender.name;
                await outbound.sendText({
                  account,
                  config,
                  text: `你好 ${userName}！我是 Cas，你的 AI 助理。\n\n请发送 "/approve ${msg.sender.id}" 来批准此用户的请求。`,
                  context: {
                    conversationId: msg.conversationId,
                    conversationType: "direct",
                    recipientId: msg.sender.id,
                  },
                });
                return; // Don't forward message to agent
              }
            }
            
            handleMessageFn?.(msg);
          }
        } else if (data.event) {
          handleEventFn?.(data.event);
        }
      } catch (error) {
        console.error("[feishu] Failed to parse WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      handleStatusFn?.({ status: "disconnected" });
      console.log("[feishu] WebSocket disconnected, reconnecting...");
      
      if (currentAccount && currentConfig) {
        reconnectTimeout = setTimeout(() => {
          connect(currentAccount!, currentConfig!);
        }, 5000);
      }
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
  let currentAccount: FeishuAccount | null = null;
  let currentConfig: FeishuConfig | null = null;
  let pairingState: PairingState | null = null;

  async function startHttpServer(account: FeishuAccount, config: FeishuConfig) {
    currentAccount = account;
    currentConfig = config;
    pairingState = createPairingManager(config);

    const http = require("http");
    const port = process.env.FEISHU_WEBHOOK_PORT || 8080;

    server = http.createServer(async (req: any, res: any) => {
      if (req.method === "POST" && req.url === "/webhook") {
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const data = JSON.parse(body);
            
            if (config.verificationToken) {
              const timestamp = req.headers["x-feishu-request-timestamp"] || "";
              const signature = req.headers["x-feishu-signature"] || "";
              
              const crypto = require("crypto");
              const sign = crypto
                .createHmac("sha256", config.verificationToken)
                .update(timestamp + config.verificationToken)
                .digest("base64");

              if (signature !== sign) {
                console.error("[feishu] Invalid webhook signature");
                res.writeHead(401);
                res.end("Invalid signature");
                return;
              }
            }

            if (data.type === "url_verification") {
              res.writeHead(200);
              res.end(JSON.stringify({ challenge: data.challenge }));
              return;
            }

            if (data.event) {
              if (data.event.message) {
                const msg = parseFeishuMessage(data.event.message, account);
                if (msg) {
                  // Check pairing policy for DMs
                  if (msg.conversationType === "direct") {
                    const policy = config.channels?.feishu?.dmPolicy || "pairing";
                    const check = checkPairingPolicy(msg.sender.id, policy, pairingState!);
                    
                    if (!check.allowed && check.reason === "pending") {
                      const user = await getUserInfo(account, msg.sender.id);
                      const userName = user?.name || msg.sender.name;
                      await outbound.sendText({
                        account,
                        config,
                        text: `你好 ${userName}！我是 Cas，你的 AI 助理。\n\n请发送 "/approve ${msg.sender.id}" 来批准此用户的请求。`,
                        context: {
                          conversationId: msg.conversationId,
                          conversationType: "direct",
                          recipientId: msg.sender.id,
                        },
                      });
                      res.writeHead(200);
                      res.end("OK");
                      return;
                    }
                  }
                  handleMessageFn?.(msg);
                }
              } else {
                handleEventFn?.(data.event);
              }
            }

            res.writeHead(200);
            res.end("OK");
          } catch (error) {
            console.error("[feishu] Webhook error:", error);
            res.writeHead(500);
            res.end("Error");
          }
        });
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(port, () => {
        console.log(`[feishu] Webhook server listening on port ${port}`);
        resolve();
      });
    });
  }

  return {
    capabilities,

    async start({ config, account, handleMessage, handleEvent, handleStatus }) {
      handleMessageFn = handleMessage;
      handleEventFn = handleEvent;
      handleStatusFn = handleStatus;

      const feishuAccount = outbound.resolveAccount(config, "default");
      await startHttpServer(feishuAccount, config);

      handleStatus({ status: "ready" });
    },

    async stop() {
      if (server) {
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
        server = null;
      }
    },

    async verifySignature(payload: string, signature: string, timestamp: string): Promise<boolean> {
      return true;
    },
  };
}

// Export inbound adapter based on connection mode
export function createInboundAdapter(mode: "websocket" | "webhook" = "websocket"): InboundAdapter<FeishuConfig, FeishuAccount> {
  if (mode === "webhook") {
    return createWebhookInbound();
  }
  return createWebSocketInbound();
}

// Default export
export const inbound = createWebSocketInbound();
