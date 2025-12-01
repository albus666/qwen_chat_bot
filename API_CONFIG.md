# Qwen3 Chat Bot API 配置文档

本文档详细说明了 Qwen3 Chat Bot 项目的所有 API 配置、路由、环境变量和使用方法。

## 目录

- [环境变量配置](#环境变量配置)
- [服务器配置](#服务器配置)
- [API 路由结构](#api-路由结构)
- [RESTful API](#restful-api)
- [tRPC API](#trpc-api)
- [请求/响应格式](#请求响应格式)
- [错误处理](#错误处理)
- [Docker 配置](#docker-配置)
- [部署配置](#部署配置)

---

## 环境变量配置

### 必需的环境变量

| 变量名 | 说明 | 示例值 | 位置 |
|--------|------|--------|------|
| `DASHSCOPE_API_KEY` | 阿里云 DashScope API 密钥（用于 Qwen3 模型） | `sk-xxxxxxxxxxxxx` | `.env` / `docker-compose.yml` |
| `NODE_ENV` | 运行环境 | `development` / `production` | 系统环境 / `docker-compose.yml` |
| `PORT` | 服务器端口（可选，默认 3000） | `3000` | 系统环境 / `docker-compose.yml` |

### 环境变量文件位置

- **开发环境**: `.env` 文件（项目根目录）
- **生产环境**: `docker-compose.yml` 中的 `environment` 部分

### 配置示例

#### `.env` 文件示例

```env
# DashScope API 配置
DASHSCOPE_API_KEY=sk-1a2e962a0dc54ac3a006644f3aa415dd

# Node 环境（可选，默认为 development）
NODE_ENV=development

# 服务器端口（可选，默认为 3000）
PORT=3000
```

#### `docker-compose.yml` 环境变量配置

```yaml
environment:
  # DashScope API Configuration (Qwen3)
  - DASHSCOPE_API_KEY=${DASHSCOPE_API_KEY}
  
  # Node Environment
  - NODE_ENV=production
```

---

## 服务器配置

### 服务器入口

**文件位置**: `server/_core/index.ts`

### 主要配置

#### 1. Express 应用配置

```typescript
const app = express();
const server = createServer(app);

// Body 解析器配置（支持大文件上传）
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
```

**配置说明**:
- **JSON 请求体限制**: 50MB（用于支持大文件上传）
- **URL 编码限制**: 50MB

#### 2. 端口配置

```typescript
const preferredPort = parseInt(process.env.PORT || "3000");
const port = await findAvailablePort(preferredPort);
```

**端口查找逻辑**:
- 默认端口: `3000`
- 如果端口被占用，自动查找可用端口（范围: `preferredPort` 到 `preferredPort + 20`）
- 如果找不到可用端口，抛出错误

#### 3. 开发/生产模式

```typescript
if (process.env.NODE_ENV === "development") {
  await setupVite(app, server);  // 开发模式：使用 Vite 开发服务器
} else {
  serveStatic(app);  // 生产模式：提供静态文件
}
```

---

## API 路由结构

### 路由前缀规则

**重要**: 所有 API 路径必须以 `/api/` 开头，以便网关正确路由。

### 路由注册

```typescript
// Chat API (RESTful)
app.use("/api", chatRouter);

// tRPC API
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);
```

### 路由映射表

| 路由类型 | 基础路径 | 说明 |
|---------|---------|------|
| RESTful API | `/api/chat/*` | 聊天相关 RESTful 接口 |
| tRPC API | `/api/trpc/*` | 类型安全的 RPC 接口 |

---

## RESTful API

### 基础路径

所有 RESTful API 的基础路径为: `/api`

### 1. 流式聊天接口

#### 端点信息

- **URL**: `POST /api/chat/stream`
- **Content-Type**: `application/json`
- **响应类型**: `text/event-stream` (Server-Sent Events)

#### 请求格式

```typescript
interface ChatRequest {
  messages: Message[];      // 消息历史数组
  system?: string;          // 系统提示词（可选）
  model?: string;           // 模型名称（可选，默认: qwen3-235b-a22b-thinking-2507）
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}
```

#### 请求示例

```bash
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ],
    "system": "你是一个有用的助手",
    "model": "qwen3-235b-a22b-thinking-2507"
  }'
```

#### 响应格式（SSE 流）

响应使用 Server-Sent Events (SSE) 格式，包含以下事件类型：

##### 1. 请求 ID 事件

```json
{
  "type": "request_id",
  "request_id": "uuid-string"
}
```

##### 2. 思考过程事件（如果模型支持）

```json
{
  "type": "reasoning",
  "content": "思考内容..."
}
```

##### 3. 答案开始事件

```json
{
  "type": "answer_start"
}
```

##### 4. 答案内容事件（流式）

```json
{
  "type": "answer",
  "content": "部分答案内容..."
}
```

##### 5. 使用量信息事件

```json
{
  "type": "usage",
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 200,
    "total_tokens": 300
  }
}
```

##### 6. 完成事件

```json
{
  "type": "done"
}
```

##### 7. 停止事件

```json
{
  "type": "stopped"
}
```

##### 8. 错误事件

```json
{
  "type": "error",
  "error": "错误消息"
}
```

#### 响应头

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

#### 客户端示例（JavaScript）

```javascript
const response = await fetch("/api/chat/stream", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    messages: [
      { role: "user", content: "你好" }
    ],
    system: "你是一个有用的助手",
    model: "qwen3-235b-a22b-thinking-2507"
  }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = JSON.parse(line.slice(6));
      
      switch (data.type) {
        case "request_id":
          console.log("Request ID:", data.request_id);
          break;
        case "reasoning":
          console.log("Reasoning:", data.content);
          break;
        case "answer":
          console.log("Answer chunk:", data.content);
          break;
        case "done":
          console.log("Stream completed");
          break;
        case "error":
          console.error("Error:", data.error);
          break;
      }
    }
  }
}
```

### 2. 停止生成接口

#### 端点信息

- **URL**: `POST /api/chat/stop`
- **Content-Type**: `application/json`

#### 请求格式

```typescript
interface StopRequest {
  request_id: string;  // 从流式响应中获取的 request_id
}
```

#### 请求示例

```bash
curl -X POST http://localhost:3000/api/chat/stop \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "uuid-string"
  }'
```

#### 响应格式

**成功停止**:
```json
{
  "status": "stopped",
  "request_id": "uuid-string"
}
```

**任务未找到**:
```json
{
  "status": "not_found",
  "request_id": "uuid-string"
}
```

---

## tRPC API

### 基础路径

所有 tRPC API 的基础路径为: `/api/trpc`

### tRPC 配置

**文件位置**: `server/_core/trpc.ts`

#### 配置项

- **Transformer**: `superjson`（支持 Date、Map、Set 等复杂类型）
- **Context**: 包含 `req`、`res`、`user`

### 可用路由

#### 1. 系统路由 (`system`)

##### 健康检查

- **路径**: `system.health`
- **类型**: `query`
- **输入**: 
  ```typescript
  {
    timestamp: number;  // 时间戳（必须 >= 0）
  }
  ```
- **输出**:
  ```typescript
  {
    ok: true;
  }
  ```

**客户端调用示例**:

```typescript
import { trpc } from "@/lib/trpc";

const result = await trpc.system.health.query({
  timestamp: Date.now()
});
```

#### 2. 认证路由 (`auth`)

##### 获取当前用户

- **路径**: `auth.me`
- **类型**: `query`
- **输入**: 无
- **输出**: `User | null`

**客户端调用示例**:

```typescript
const user = await trpc.auth.me.query();
```

##### 登出

- **路径**: `auth.logout`
- **类型**: `mutation`
- **输入**: 无
- **输出**:
  ```typescript
  {
    success: true;
  }
  ```

**客户端调用示例**:

```typescript
await trpc.auth.logout.mutate();
```

### tRPC 过程类型

#### 1. `publicProcedure`

- **说明**: 公开过程，无需认证
- **使用场景**: 健康检查、公开信息查询

#### 2. `protectedProcedure`

- **说明**: 受保护过程，需要用户认证
- **错误**: 如果未认证，返回 `UNAUTHORIZED` 错误

#### 3. `adminProcedure`

- **说明**: 管理员过程，需要管理员权限
- **错误**: 如果非管理员，返回 `FORBIDDEN` 错误

---

## 请求/响应格式

### RESTful API 请求格式

#### Content-Type

- `application/json`（所有 POST 请求）

#### 请求体大小限制

- **JSON**: 最大 50MB
- **URL 编码**: 最大 50MB

### tRPC API 请求格式

tRPC 使用 HTTP POST 请求，请求体格式由 tRPC 客户端自动处理。

**请求 URL 格式**:
```
POST /api/trpc/{procedurePath}
```

**示例**:
```
POST /api/trpc/system.health
POST /api/trpc/auth.me
POST /api/trpc/auth.logout
```

---

## 错误处理

### RESTful API 错误响应

#### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求错误 |
| 401 | 未授权 |
| 403 | 禁止访问 |
| 404 | 未找到 |
| 500 | 服务器错误 |

#### 错误响应格式

```json
{
  "error": "错误消息"
}
```

#### SSE 流错误

在 SSE 流中，错误通过事件发送：

```json
{
  "type": "error",
  "error": "错误消息"
}
```

### tRPC API 错误响应

#### 错误代码

| 代码 | HTTP 状态码 | 说明 |
|------|------------|------|
| `UNAUTHORIZED` | 401 | 未授权 |
| `FORBIDDEN` | 403 | 禁止访问 |
| `NOT_FOUND` | 404 | 未找到 |
| `INTERNAL_SERVER_ERROR` | 500 | 服务器错误 |

#### 错误消息常量

**文件位置**: `shared/const.ts`

```typescript
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
```

---

## Docker 配置

### Docker Compose 配置

**文件位置**: `docker-compose.yml`

#### 服务配置

```yaml
services:
  qwen3-chat-bot:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: qwen3-chat-bot
    ports:
      - "4399:3000"  # 主机端口:容器端口
    environment:
      - DASHSCOPE_API_KEY=${DASHSCOPE_API_KEY}
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 5s
    volumes:
      - ./logs:/app/logs
    networks:
      - qwen3-network
```

#### 端口映射

- **主机端口**: `4399`
- **容器端口**: `3000`
- **访问地址**: `http://localhost:4399`

#### 健康检查

- **检查间隔**: 30 秒
- **超时时间**: 10 秒
- **重试次数**: 3 次
- **启动等待期**: 5 秒

#### 卷挂载

- **日志目录**: `./logs` → `/app/logs`

#### 网络配置

- **网络名称**: `qwen3-network`
- **驱动**: `bridge`

---

## 部署配置

### 环境变量设置

#### 开发环境

1. 在项目根目录创建 `.env` 文件
2. 添加必要的环境变量：

```env
DASHSCOPE_API_KEY=your-api-key-here
NODE_ENV=development
PORT=3000
```

#### 生产环境（Docker）

1. 在 `docker-compose.yml` 中配置环境变量
2. 或使用外部环境变量文件：

```bash
# 设置环境变量
export DASHSCOPE_API_KEY=your-api-key-here

# 启动服务
docker compose up --build
```

### 启动命令

#### 开发环境

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

#### 生产环境（Docker）

```bash
# 构建并启动
docker compose up --build

# 后台运行
docker compose up -d --build

# 查看日志
docker compose logs -f

# 停止服务
docker compose down
```

### 端口配置

#### 修改 Docker 端口映射

编辑 `docker-compose.yml`:

```yaml
ports:
  - "你的端口:3000"  # 例如: "8080:3000"
```

#### 修改应用端口

设置环境变量 `PORT`:

```bash
export PORT=8080
```

或在 `.env` 文件中：

```env
PORT=8080
```

---

## 认证配置

### Cookie 配置

**文件位置**: `server/_core/cookies.ts`

#### Cookie 名称

```typescript
export const COOKIE_NAME = "app_session_id";
```

#### Cookie 选项

```typescript
{
  httpOnly: true,      // 防止 JavaScript 访问
  path: "/",           // Cookie 路径
  sameSite: "none",    // 跨站请求
  secure: true/false   // HTTPS 时启用（自动检测）
}
```

#### 安全检测逻辑

- 检测 `req.protocol === "https"`
- 检测 `X-Forwarded-Proto` 头
- 自动设置 `secure` 标志

---

## 模型配置

### 支持的模型

#### 默认模型

- **模型名称**: `qwen3-235b-a22b-thinking-2507`
- **说明**: Qwen3 235B 思考模型

#### DashScope API 配置

**API 端点**: `https://dashscope.aliyuncs.com/compatible-mode/v1`

**配置位置**: `server/routes/chat.ts`

```typescript
const client = new OpenAI({
  apiKey: DASHSCOPE_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});
```

### 切换模型

在请求中指定 `model` 参数：

```json
{
  "messages": [...],
  "model": "qwen3-其他模型名称"
}
```

---

## 性能优化

### 请求体大小限制

- **JSON**: 50MB（可调整）
- **URL 编码**: 50MB（可调整）

**调整位置**: `server/_core/index.ts`

```typescript
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
```

### 流式响应优化

- 使用 Server-Sent Events (SSE) 实现流式传输
- 禁用响应缓冲: `X-Accel-Buffering: no`
- 保持连接: `Connection: keep-alive`

---

## 安全配置

### API 密钥安全

1. **不要**将 API 密钥提交到版本控制系统
2. 使用环境变量或密钥管理服务
3. 在生产环境中使用 Docker secrets 或云服务密钥管理

### CORS 配置

当前配置允许所有来源（开发环境）。生产环境建议配置 CORS：

```typescript
import cors from "cors";

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  credentials: true,
}));
```

---

## 故障排查

### 常见问题

#### 1. API 密钥未设置

**错误**: `DASHSCOPE_API_KEY environment variable is not set`

**解决方案**:
- 检查 `.env` 文件是否存在
- 检查环境变量是否正确设置
- 检查 Docker 环境变量配置

#### 2. 端口被占用

**错误**: `Port 3000 is busy`

**解决方案**:
- 应用会自动查找可用端口（3000-3019）
- 或手动指定其他端口: `PORT=8080`

#### 3. SSE 连接断开

**可能原因**:
- 网络超时
- 代理服务器缓冲
- 客户端未正确处理流

**解决方案**:
- 检查网络连接
- 配置代理服务器禁用缓冲
- 确保客户端正确处理 SSE 事件

---

## API 使用示例

### 完整聊天流程示例

```typescript
// 1. 发送消息并接收流式响应
const response = await fetch("/api/chat/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: [{ role: "user", content: "你好" }],
    system: "你是一个有用的助手",
  }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();
let requestId: string | null = null;
let fullResponse = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  const lines = text.split("\n");

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = JSON.parse(line.slice(6));

      if (data.type === "request_id") {
        requestId = data.request_id;
      } else if (data.type === "answer") {
        fullResponse += data.content;
        // 实时更新 UI
      } else if (data.type === "done") {
        // 完成处理
      }
    }
  }
}

// 2. 如果需要停止生成
if (requestId) {
  await fetch("/api/chat/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request_id: requestId }),
  });
}
```

---

## 更新日志

### 版本信息

- **项目名称**: qwen3-chat-bot
- **版本**: 1.0.0
- **最后更新**: 2024

---

## 参考资源

- [DashScope API 文档](https://help.aliyun.com/zh/dashscope/)
- [tRPC 文档](https://trpc.io/)
- [Express.js 文档](https://expressjs.com/)
- [Server-Sent Events 规范](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

---

## 联系与支持

如有问题或建议，请查看项目文档或提交 Issue。
