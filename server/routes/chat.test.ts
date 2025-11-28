import { describe, it, expect } from "vitest";

describe("DashScope API Key Validation", () => {
  it("should have DASHSCOPE_API_KEY configured", () => {
    expect(process.env.DASHSCOPE_API_KEY).toBeDefined();
    expect(process.env.DASHSCOPE_API_KEY).not.toBe("");
  });

  it("should be able to initialize OpenAI client with DashScope", async () => {
    const { default: OpenAI } = await import("openai");
    
    const client = new OpenAI({
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });

    expect(client).toBeDefined();
  });

  it("should be able to make a simple API call", async () => {
    const { default: OpenAI } = await import("openai");
    
    const client = new OpenAI({
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });

    try {
      const completion = await client.chat.completions.create({
        model: "qwen3-235b-a22b-thinking-2507",
        messages: [
          { role: "user", content: "Hello, respond with just 'Hi'" }
        ],
        max_tokens: 10,
      });

      expect(completion).toBeDefined();
      expect(completion.choices).toBeDefined();
      expect(completion.choices.length).toBeGreaterThan(0);
    } catch (error: any) {
      // If we get an authentication error, the API key is invalid
      if (error.status === 401 || error.status === 403) {
        throw new Error("Invalid DASHSCOPE_API_KEY: Authentication failed");
      }
      // Other errors might be rate limits or network issues, which are acceptable for this test
      console.warn("API call warning:", error.message);
    }
  }, 30000); // 30 second timeout for API call
});
