export const ENV = {
  dashscopeApiKey: process.env.DASHSCOPE_API_KEY ?? "",
  isProduction: process.env.NODE_ENV === "production",
};
