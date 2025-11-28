import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Streamdown } from "streamdown";
import { Send, Square, RotateCcw, Trash2, ChevronDown, ChevronUp, Plus, MessageCircle, Menu, X } from "lucide-react";
import { APP_LOGO, APP_TITLE } from "@/const";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  systemPrompt: string;
  createdAt: Date;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [currentResponse, setCurrentResponse] = useState("");
  const [currentReasoning, setCurrentReasoning] = useState("");
  const [isSystemDrawerOpen, setIsSystemDrawerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([
    {
      id: "1",
      title: "对话 1",
      messages: [],
      systemPrompt: "",
      createdAt: new Date(),
    },
  ]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("1");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentResponse]);

  const createNewSession = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: `对话 ${sessions.length + 1}`,
      messages: [],
      systemPrompt: "",
      createdAt: new Date(),
    };
    setSessions([...sessions, newSession]);
    setCurrentSessionId(newId);
    setMessages([]);
    setSystemPrompt("");
    setCurrentResponse("");
    setCurrentReasoning("");
  };

  const switchSession = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      setCurrentSessionId(sessionId);
      setMessages(session.messages);
      setSystemPrompt(session.systemPrompt);
      setCurrentResponse("");
      setCurrentReasoning("");
    }
  };

  const deleteSession = (sessionId: string) => {
    const newSessions = sessions.filter((s) => s.id !== sessionId);
    setSessions(newSessions);
    
    if (currentSessionId === sessionId) {
      if (newSessions.length > 0) {
        setCurrentSessionId(newSessions[0].id);
        switchSession(newSessions[0].id);
      }
    }
  };

  const updateCurrentSession = () => {
    if (currentSessionId) {
      setSessions(
        sessions.map((s) =>
          s.id === currentSessionId
            ? { ...s, messages, systemPrompt }
            : s
        )
      );
    }
  };

  useEffect(() => {
    updateCurrentSession();
  }, [messages, systemPrompt]);

  const handleSubmit = async () => {
    if (!input.trim() || isGenerating) return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsGenerating(true);
    setCurrentResponse("");
    setCurrentReasoning("");

    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          system: systemPrompt || undefined,
          model: "qwen3-235b-a22b-thinking-2507",
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to fetch");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No reader available");
      }

      let buffer = "";
      let assistantMessage: Message = {
        role: "assistant",
        content: "",
        reasoning: "",
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "request_id":
                  setCurrentRequestId(data.request_id);
                  break;

                case "reasoning":
                  assistantMessage.reasoning += data.content;
                  setCurrentReasoning((prev) => prev + data.content);
                  break;

                case "answer_start":
                  // 初始化响应内容，确保流式显示立即开始
                  setCurrentResponse("");
                  break;

                case "answer":
                  assistantMessage.content += data.content;
                  setCurrentResponse((prev) => prev + data.content);
                  break;

                case "done":
                  setMessages((prev) => [...prev, assistantMessage]);
                  setCurrentResponse("");
                  setCurrentReasoning("");
                  setIsGenerating(false);
                  setCurrentRequestId(null);
                  break;

                case "stopped":
                  // 保留当前显示的内容，使用函数式更新确保获取最新值
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: "assistant",
                      content: assistantMessage.content || "",
                      reasoning: assistantMessage.reasoning || "",
                    },
                  ]);
                  setCurrentResponse("");
                  setCurrentReasoning("");
                  setIsGenerating(false);
                  setCurrentRequestId(null);
                  break;

                case "error":
                  console.error("Stream error:", data.error);
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: "assistant",
                      content: `错误: ${data.error}`,
                    },
                  ]);
                  setCurrentResponse("");
                  setCurrentReasoning("");
                  setIsGenerating(false);
                  setCurrentRequestId(null);
                  break;
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", e);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        // 如果是手动停止，内容已经在 handleStop 中保存，这里只清理状态
        setIsGenerating(false);
        setCurrentRequestId(null);
        // currentResponse 和 currentReasoning 已经在 handleStop 中清理
      } else {
        console.error("Chat error:", error);
        // 如果是其他错误，保存当前内容（如果有）然后显示错误
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: currentResponse || `错误: ${error.message}`,
            reasoning: currentReasoning,
          },
        ]);
        setIsGenerating(false);
        setCurrentResponse("");
        setCurrentReasoning("");
        setCurrentRequestId(null);
      }
    }
  };

  const handleStop = async () => {
    // 先保存当前显示的内容到消息列表，使用函数式更新确保获取最新值
    setMessages((prev) => {
      // 使用函数式更新获取最新的 currentResponse 和 currentReasoning
      // 注意：这里需要使用闭包来获取最新的状态值
      const latestResponse = currentResponse;
      const latestReasoning = currentReasoning;
      
      if (latestResponse || latestReasoning) {
        return [
          ...prev,
          {
            role: "assistant",
            content: latestResponse,
            reasoning: latestReasoning,
          },
        ];
      }
      return prev;
    });

    if (currentRequestId) {
      try {
        await fetch("/api/chat/stop", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            request_id: currentRequestId,
          }),
        });
      } catch (error) {
        console.error("Failed to stop:", error);
      }
    }

    // 中止请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 清理状态
    setCurrentResponse("");
    setCurrentReasoning("");
    setIsGenerating(false);
    setCurrentRequestId(null);
  };

  const handleClearHistory = () => {
    setMessages([]);
    setCurrentResponse("");
    setCurrentReasoning("");
  };

  const handleRegenerate = async (messageIndex: number) => {
    if (messages.length === 0) return;

    const messagesToKeep = messages.slice(0, messageIndex + 1);
    setMessages(messagesToKeep);

    const userMessage = messages[messageIndex];
    setIsGenerating(true);
    setCurrentResponse("");
    setCurrentReasoning("");

    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: messagesToKeep.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          system: systemPrompt || undefined,
          model: "qwen3-235b-a22b-thinking-2507",
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to fetch");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No reader available");
      }

      let buffer = "";
      let assistantMessage: Message = {
        role: "assistant",
        content: "",
        reasoning: "",
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "request_id":
                  setCurrentRequestId(data.request_id);
                  break;

                case "reasoning":
                  assistantMessage.reasoning += data.content;
                  setCurrentReasoning((prev) => prev + data.content);
                  break;

                case "answer_start":
                  // 初始化响应内容，确保流式显示立即开始
                  setCurrentResponse("");
                  break;

                case "answer":
                  assistantMessage.content += data.content;
                  setCurrentResponse((prev) => prev + data.content);
                  break;

                case "done":
                  setMessages((prev) => [...prev, assistantMessage]);
                  setCurrentResponse("");
                  setCurrentReasoning("");
                  setIsGenerating(false);
                  setCurrentRequestId(null);
                  break;

                case "stopped":
                  // 保留当前显示的内容，使用函数式更新确保获取最新值
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: "assistant",
                      content: assistantMessage.content || "",
                      reasoning: assistantMessage.reasoning || "",
                    },
                  ]);
                  setCurrentResponse("");
                  setCurrentReasoning("");
                  setIsGenerating(false);
                  setCurrentRequestId(null);
                  break;

                case "error":
                  console.error("Stream error:", data.error);
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: "assistant",
                      content: `错误: ${data.error}`,
                    },
                  ]);
                  setCurrentResponse("");
                  setCurrentReasoning("");
                  setIsGenerating(false);
                  setCurrentRequestId(null);
                  break;
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", e);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        // 如果是手动停止，内容已经在 handleStop 中保存，这里只清理状态
        setIsGenerating(false);
        setCurrentRequestId(null);
        // currentResponse 和 currentReasoning 已经在 handleStop 中清理
      } else {
        console.error("Chat error:", error);
        // 如果是其他错误，保存当前内容（如果有）然后显示错误
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: currentResponse || `错误: ${error.message}`,
            reasoning: currentReasoning,
          },
        ]);
        setIsGenerating(false);
        setCurrentResponse("");
        setCurrentReasoning("");
        setCurrentRequestId(null);
      }
    }
  };

  return (
    <div className="h-screen flex bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } transition-all duration-300 bg-white border-r border-slate-200 flex flex-col overflow-hidden`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-700">历史记录</h2>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`flex items-center gap-2 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors group cursor-pointer ${
                currentSessionId === session.id ? "bg-blue-50 border-l-4 border-l-blue-500" : ""
              }`}
              onClick={() => switchSession(session.id)}
            >
              <MessageCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">
                  {session.title}
                </p>
                <p className="text-xs text-slate-400">
                  {session.messages.length} 条消息
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                title="删除对话"
              >
                <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
              </button>
            </div>
          ))}
        </div>

        {/* New Chat Button */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <Button
            onClick={createNewSession}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            新建对话
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-4 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-slate-600 hover:text-slate-800"
              >
                <Menu className="w-5 h-5" />
              </Button>
              {APP_LOGO && (
                <img src={APP_LOGO} alt="Logo" className="w-10 h-10 object-contain" />
              )}
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Qwen3 Chat Bot</h1>
                <p className="text-sm text-slate-500">
                  本WebUI基于Qwen3打造,实现聊天机器人功能。
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSystemDrawerOpen(!isSystemDrawerOpen)}
              className="text-slate-600 hover:text-slate-800 flex-shrink-0"
            >
              {isSystemDrawerOpen ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
              <span className="ml-1 text-sm">设置</span>
            </Button>
          </div>

          {/* System Drawer */}
          {isSystemDrawerOpen && (
            <div className="border-t bg-white/80 backdrop-blur-sm">
              <div className="px-4 py-4">
                <Card className="p-4 bg-white/90 backdrop-blur-sm shadow-sm">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    System 预设指令
                  </label>
                  <Textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="输入系统预设指令(可选)..."
                    className="min-h-[80px] resize-none"
                    disabled={isGenerating}
                  />
                </Card>
              </div>
            </div>
          )}
        </header>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 p-6">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"} group`}
              >
                <Card
                  className={`max-w-[70%] p-4 ${
                    message.role === "user"
                      ? "bg-blue-500 text-white"
                      : "bg-white shadow-sm"
                  }`}
                >
                  {message.reasoning && (
                    <div className="mb-3 pb-3 border-b border-slate-200">
                      <p className="text-xs font-semibold text-slate-600 mb-2">思考过程</p>
                      <p className="text-sm text-slate-600 whitespace-pre-wrap">
                        {message.reasoning}
                      </p>
                    </div>
                  )}
                  <Streamdown>{message.content}</Streamdown>
                </Card>
                
                {/* Retry button for user messages - always visible, right-aligned */}
                {message.role === "user" && (
                  <button
                    onClick={() => handleRegenerate(index)}
                    disabled={isGenerating}
                    className="mt-2 text-slate-500 hover:text-slate-700 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
                    title="重试"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}

            {(currentResponse || isGenerating) && (
              <div className="flex justify-start">
                <Card className="max-w-[70%] p-4 bg-white shadow-sm">
                  {currentReasoning && (
                    <div className="mb-3 pb-3 border-b border-slate-200">
                      <p className="text-xs font-semibold text-slate-600 mb-2">思考过程</p>
                      <p className="text-sm text-slate-600 whitespace-pre-wrap">
                        {currentReasoning}
                      </p>
                    </div>
                  )}
                  {currentResponse ? (
                    <Streamdown>{currentResponse}</Streamdown>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
                      <span className="text-sm">正在思考...</span>
                    </div>
                  )}
                </Card>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t bg-white/90 backdrop-blur-sm p-6 flex-shrink-0 relative">
            {/* Clear History Button - Positioned above textarea */}
            <button
              onClick={handleClearHistory}
              disabled={messages.length === 0}
              className="absolute -top-16 right-6 w-10 h-10 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white rounded-full flex items-center justify-center shadow-lg transition-colors disabled:cursor-not-allowed"
              title="清除历史"
            >
              <Trash2 className="w-5 h-5" />
            </button>

            <div className="relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.ctrlKey) {
                    handleSubmit();
                  }
                }}
                placeholder="输入消息..."
                className="resize-none pr-16 w-full"
                disabled={isGenerating}
                rows={4}
              />

              {/* Send/Stop Button - Circular, positioned at bottom right */}
              {!isGenerating ? (
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className="absolute bottom-3 right-3 w-10 h-10 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-full flex items-center justify-center shadow-lg transition-colors disabled:cursor-not-allowed"
                  title="发送"
                >
                  <Send className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="absolute bottom-3 right-3 w-10 h-10 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg transition-colors"
                  title="停止"
                >
                  <Square className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
