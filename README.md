# 🧠 MindGraph — AI 原生个人知识管理系统

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

**零配置、开箱即用的第二大脑。内置 AI 助手，帮你自动整理知识。**

---

## ✨ 为什么选择 MindGraph？

| | Obsidian | Notion | **MindGraph** |
|---|---|---|---|
| 数据所有权 | ✅ 本地文件 | ❌ 云端 | ✅ **本地数据库** |
| AI 能力 | 需插件 | ✅ 付费 | ✅ **内置免费** |
| 双向链接 | ✅ | ✅ | ✅ |
| 知识图谱 | ✅ | ❌ | ✅ **可交互拖拽** |
| 图片管理 | 本地引用 | ✅ 云端 | ✅ **粘贴即上传** |
| 上手难度 | 需配置插件 | 需注册 | ✅ **双击即用** |
| 自动标签 | ❌ | ❌ | ✅ **AI 推荐** |
| 一键摘要 | ❌ | ❌ | ✅ **AI 生成** |

### 🎯 核心理念

> **"打开就能用，AI 帮你理"**

- 🚫 不需要注册账号
- 🚫 不需要选择 Vault 文件夹
- 🚫 不需要安装任何插件
- 🚫 不需要配置同步
- ✅ 双击 `MindGraph.exe`，一切就绪

---

## 🚀 快速开始

### 方式一：双击启动（推荐）

```
双击 MindGraph.exe → 点击「🚀 启动 MindGraph」→ 浏览器自动打开
```

### 方式二：命令行

```bash
# 1. 克隆项目
git clone https://github.com/ly99LLL/mindgraph.git
cd mindgraph

# 2. 配置 AI（可选，不配置也能用基础功能）
cp .env.example .env
# 编辑 .env，填入你的 DeepSeek API Key

# 3. 安装依赖
npm install

# 4. 启动
npm start
# → 浏览器打开 http://localhost:3456
```

---

## 🤖 AI 功能

MindGraph 内置 DeepSeek AI 助手，在编辑器工具栏一键使用：

| 功能 | 按钮 | 说明 |
|------|------|------|
| 🤖🏷️ **推荐标签** | 点击后 AI 分析内容，推荐 3-5 个标签，点击即可添加 |
| 🤖📝 **生成摘要** | AI 自动总结笔记要点，帮你快速回顾 |
| 🤖💡 **改进建议** | AI 给出内容优化建议 + 推荐相关笔记链接 |

### 获取 API Key

1. 访问 [platform.deepseek.com](https://platform.deepseek.com)
2. 注册并获取 API Key
3. 在项目根目录创建 `.env` 文件：
   ```
   DEEPSEEK_API_KEY=sk-你的密钥
   ```

> 即使不配置 AI，笔记编辑、双向链接、知识图谱等核心功能完全正常使用。

---

## 📝 功能详情

### 🔗 双向链接

使用 `[[笔记标题]]` 语法创建链接。MindGraph 会自动：

- 创建从当前笔记到目标笔记的链接
- 在目标笔记显示**反向链接**
- 将连接加入知识图谱

如果链接的笔记不存在，会自动创建一个**存根笔记**，等你后续填充。

### 🕸️ 知识图谱

点击顶栏「知识图谱」按钮打开交互式可视化：

- 🖱️ **拖拽**节点自由排列
- 🔍 **滚动**放大缩小
- 👆 **双击**节点直接打开笔记
- 📏 节点大小反映连接数量

### 🖼️ 图片粘贴

在编辑器中直接 `Ctrl+V` 粘贴图片，自动上传到本地存储，插入 Markdown 图片语法。

### 📅 每日日记

点击顶栏「今日日记」自动创建当天日记。适合每日记录、会议笔记、个人反思。

### 🏷️ 标签系统

在内容中使用 `#标签名`，系统自动提取标签。点击任意标签筛选相关笔记。

### 🌓 暗色模式

点击顶栏 🌓 按钮一键切换。

### 📥 导出

支持将笔记导出为 Markdown 文件（含 YAML frontmatter）。

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+N` | 新建笔记 |
| `Ctrl+S` | 手动保存（已开启自动保存） |
| `Ctrl+V` | 粘贴图片 |
| `Ctrl+G` | 知识图谱（Electron 桌面版） |
| `Esc` | 关闭图谱弹窗、关闭搜索结果 |

---

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| **后端** | Node.js + Express |
| **数据库** | SQLite（sql.js，纯 WASM，零原生依赖） |
| **前端** | 原生 JavaScript（ES Modules）|
| **可视化** | D3.js v7（力导向图）|
| **Markdown** | marked.js |
| **AI** | DeepSeek API（OpenAI 兼容）|
| **桌面** | Electron + 自定义 C# 启动器 |

---

## 📁 项目结构

```
mindgraph/
├── MindGraph.exe          ← 双击启动！
├── .env.example           # AI 配置模板
├── server.js              # 服务器入口
├── server-lib.js          # Express 应用（Electron 共享）
├── main.js                # Electron 主进程
├── preload.js             # Electron 预加载脚本
├── db/
│   └── database.js        # 数据库层（笔记/链接/标签 CRUD）
├── routes/
│   ├── notes.js           # 笔记 API + 图片上传
│   ├── search.js          # 搜索 API
│   ├── graph.js           # 图谱数据 API
│   └── ai.js              # AI API（标签/摘要/增强）
├── public/
│   ├── index.html         # SPA 布局
│   ├── css/
│   │   └── style.css      # 完整样式表
│   └── js/
│       ├── api.js         # API 客户端
│       └── app.js         # 主应用逻辑
└── package.json
```

---

## 🖥️ Electron 桌面版

```bash
# 开发模式
npm run electron

# 打包为安装程序（需要网络下载 Electron 二进制）
npm run build:win
```

---

## 📄 License

MIT © ly99LLL

---

<p align="center">
  <b>🧠 用 MindGraph，构建你的第二大脑</b><br>
  <sub>AI 原生 · 零配置 · 开箱即用</sub>
</p>
