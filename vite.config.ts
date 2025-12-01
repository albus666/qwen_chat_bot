import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import { defineConfig } from "vite";


const plugins = [react(), tailwindcss(), jsxLocPlugin()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // 优化构建配置，减少内存占用（针对低配置服务器）
    minify: "esbuild", // 使用 esbuild 而不是 terser，更快且内存占用更少
    sourcemap: false, // 禁用 sourcemap 生成，大幅减少内存占用
    chunkSizeWarningLimit: 1000, // 提高 chunk 大小警告阈值
    cssCodeSplit: false, // 禁用 CSS 代码分割，减少处理复杂度
    rollupOptions: {
      // 限制并发处理
      maxParallelFileOps: 1, // 限制并行文件操作数
      output: {
        // 手动分割代码块，减少单次处理的内存占用
        manualChunks: (id) => {
          // 更细粒度的代码分割
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('@radix-ui')) {
              return 'vendor-radix';
            }
            if (id.includes('@trpc')) {
              return 'vendor-trpc';
            }
            // 其他 node_modules 单独打包
            return 'vendor';
          }
        },
        // 减少输出文件数量
        compact: true,
      },
    },
    // 限制 esbuild 配置
    esbuild: {
      target: 'es2020',
      // 禁用一些优化以减少内存占用
      legalComments: 'none',
      treeShaking: true,
    },
    // 禁用报告压缩
    reportCompressedSize: false,
  },
  server: {
    host: true,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
