export { COOKIE_NAME } from "@shared/const";

export const APP_TITLE = "Qwen3 Chat Bot";

export const APP_LOGO = "https://placehold.co/128x128/E1E7EF/1F2937?text=Qwen3";

// No login required - authentication is disabled
export const getLoginUrl = () => {
  return "/";
};
