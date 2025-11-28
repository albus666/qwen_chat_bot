import express, { Router, Request, Response } from "express";
import { Readable } from "stream";

const router = Router();

// 初始化 OpenAI 客户端
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

interface Message {
  role: string;
  content: string;
}

interface ChatRequest {
  messages: Message[];
  system?: string;
  model?: string;
}

interface StopRequest {
  request_id: string;
}

// 用于存储活跃的生成任务
const activeTasks: Record<string, { stopped: boolean }> = {};

// 生成聊天流式响应
async function* generateChatStream(
  messages: Array<{ role: string; content: string }>,
  model: string,
  requestId: string
): AsyncGenerator<string, void, unknown> {
  try {
    // 动态导入 openai
    const { default: OpenAI } = await import("openai");

    if (!DASHSCOPE_API_KEY) {
      throw new Error("DASHSCOPE_API_KEY environment variable is not set");
    }

    const client = new OpenAI({
      apiKey: DASHSCOPE_API_KEY,
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });

    // 创建聊天完成请求
    const completion = await client.chat.completions.create({
      model: model,
      messages: messages as any,
      stream: true,
    });

    let reasoningContent = "";
    let answerContent = "";
    let isAnswering = false;

    for await (const chunk of completion) {
      // 检查是否被停止
      if (activeTasks[requestId]?.stopped) {
        yield `data: ${JSON.stringify({ type: "stopped" })}\n\n`;
        break;
      }

      if (!chunk.choices || chunk.choices.length === 0) {
        // 返回使用量信息
        if (chunk.usage) {
          yield `data: ${JSON.stringify({ type: "usage", usage: chunk.usage })}\n\n`;
        }
      } else {
        const delta = chunk.choices[0].delta;

        // 处理思考过程
        if ((delta as any).reasoning_content) {
          reasoningContent += (delta as any).reasoning_content;
          yield `data: ${JSON.stringify({ type: "reasoning", content: (delta as any).reasoning_content })}\n\n`;
        } else {
          // 开始回复
          if (delta.content && !isAnswering) {
            isAnswering = true;
            yield `data: ${JSON.stringify({ type: "answer_start" })}\n\n`;
          }

          // 返回回复内容
          if (delta.content) {
            answerContent += delta.content;
            yield `data: ${JSON.stringify({ type: "answer", content: delta.content })}\n\n`;
          }
        }
      }
    }

    // 发送完成信号
    yield `data: ${JSON.stringify({ type: "done" })}\n\n`;
  } catch (error: any) {
    yield `data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`;
  } finally {
    // 清理任务
    if (activeTasks[requestId]) {
      delete activeTasks[requestId];
    }
  }
}

// 流式聊天接口
router.post("/chat/stream", async (req: Request, res: Response) => {
  try {
    const { messages, system, model = "qwen3-235b-a22b-thinking-2507" } =
      req.body as ChatRequest;

    // 构建消息列表
    const messageList: Array<{ role: string; content: string }> = [];

    // 添加 system 消息
    if (system) {
      messageList.push({ role: "system", content: system });
    }

    // 添加对话历史
    for (const msg of messages) {
      messageList.push({ role: msg.role, content: msg.content });
    }

    // 生成请求 ID
    const { randomUUID } = await import("crypto");
    const requestId = randomUUID();

    // 注册任务
    activeTasks[requestId] = { stopped: false };

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // 首先发送请求 ID
    res.write(
      `data: ${JSON.stringify({ type: "request_id", request_id: requestId })}\n\n`
    );

    // 然后发送聊天流
    for await (const chunk of generateChatStream(
      messageList,
      model,
      requestId
    )) {
      res.write(chunk);
    }

    res.end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 停止生成接口
router.post("/chat/stop", (req: Request, res: Response) => {
  const { request_id } = req.body as StopRequest;

  if (activeTasks[request_id]) {
    activeTasks[request_id].stopped = true;
    res.json({ status: "stopped", request_id });
  } else {
    res.json({ status: "not_found", request_id });
  }
});

export default router;
