# Sonic Topography

Sonic Topography 是一个在线音乐可视化程序，使用 React、Three.js、Vite 构建前端，通过 Cloudflare Pages Functions 代理接入网易云音乐 API。它可以搜索和播放在线音乐，并用音频频谱驱动地形、波纹和流星效果。

## 功能

- 3D 音频响应式地形可视化
- 在线搜索网易云音乐（支持 VIP 歌曲解析）
- 歌单收藏（浏览器本地存储）
- 支持顺序播放、随机播放和单曲循环
- 支持系统音频捕获
- 搜索结果封面直链（网易云 CDN）
- 搜索结果无限滚动加载
- 浏览器媒体控件集成（MediaSession API）

## 技术栈

**前端：**
- React 19
- Three.js / React Three Fiber
- Vite
- Tailwind CSS

**API 代理：**
- Cloudflare Pages Functions（代理 meting API）

**音乐 API：**
- [meting-api](https://api.qijieya.cn/meting/) - 网易云音乐解析

## 部署

### Cloudflare Pages（推荐）

```bash
npm install && npm run build
```
构建输出目录为 `dist`。

这会自动构建前端并部署到 Cloudflare Pages，API Functions 会一起部署。

### 环境变量

在 Cloudflare Pages 项目设置中添加环境变量：

- `METING_API` = `https://api.qijieya.cn/meting`（可选，有默认值）

### 开发模式

```bash
# 仅前端开发（需要单独启动 Worker 或使用 mock）
npm run dev

# 完整开发（前端 + Functions 代理）
npm run dev:full
```

`dev:full` 使用 `wrangler pages dev` 同时启动前端和 API 代理，端口 3000。

## 致谢

- 音乐 API 提供：[meting-api](https://github.com/injahow/meting-api)
