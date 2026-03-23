# OpenAshare

🤖 AI-Powered Chinese Stock Market Analysis. 一个基于 AI 的 A 股智能分析系统，提供技术分析、交易信号和智能投资建议。内置 **OpenClaw 内核**，Agent 编排与记忆采用本地优先、分层记忆与心跳总结，支持单股分析、消息与热点追踪、持仓管理与统一问答。

当前主界面：

- `FastAPI + Next.js`：面向“单股分析 + 消息 + 热点 + 持仓 + Agent”主链路。

**如果你喜欢这个项目，欢迎在 GitHub 点个 Star ⭐**

## 界面预览

**首页 · 一站式 A 股智能盘面**

![OpenAshare 首页](assets/screenshots/home.png)

**消息页 · 全球新闻与 Agent 今日判断**

![OpenAshare 消息页](assets/screenshots/news.png)

**单股分析页 · 技术分析、相关新闻与 AI 分析**

![OpenAshare 单股分析页](assets/screenshots/single-stock.png)

## Features

- 单股分析：整合技术指标、信号总结和 AI 解读
- 消息与热点：追踪个股新闻、全球消息和主题热点
- 持仓管理：支持录入、修改、删除和组合分析
- Agent 对话：将分析、消息、热点和持仓能力编排到统一问答入口
- 双部署方式：支持本机运行和 Docker 部署
- 可扩展能力层：支持开发者按自己的工作流接入本地 skill、工具或外部数据源

## 当前能力

- 保留原有技术分析与 AI 分析引擎
- 新增统一 API：
  - `GET /api/stocks/search`
  - `GET /api/stocks/{code}/analysis`
  - `GET /api/stocks/{code}/news`
  - `GET /api/hotspots`
  - `GET /api/portfolio`
  - `POST /api/portfolio/positions`
  - `PUT /api/portfolio/positions/{id}`
  - `DELETE /api/portfolio/positions/{id}`
  - `GET /api/portfolio/analysis`
  - `POST /api/agent/query`
- 新增 Next.js 页面：
  - 首页
  - 单股分析页
  - 持仓页
  - 消息页
  - 热点页
  - Agent 对话页

## 架构

```text
Next.js 前端
    ↓
FastAPI API 层
    ↓
ashare 分析引擎 / monitor 新闻热点模块 / portfolio SQLite
    ↓
AkShare + LLM
```

## Agent 设计说明

项目中的 Agent 编排和记忆机制借鉴了 OpenClaw 的部分思考模式，重点体现在：

- 本地优先的记忆存储，而不是把完整历史长期塞进模型上下文
- 将短期对话、长期偏好和阶段性总结分层管理
- 用 heartbeat / summary 的方式定期压缩上下文，降低推理成本
- 在回答时优先做任务路由和上下文整理，再决定调用分析、资讯或组合能力

这里是思路借鉴，不要求运行 OpenClaw 本体；当前仓库仍然是独立的 `FastAPI + Next.js` 应用。

## Extensibility

这个项目默认提供独立的应用层和 Agent 编排层，开发者可以在不修改整体产品形态的前提下自行扩展能力，例如：

- 接入本地安装的 skill
- 增加自定义数据源或资讯源
- 替换或补充 LLM 提供商
- 为 Agent 增加新的工具路由和任务类型

建议将这类扩展保持在本地配置、环境变量或独立服务层中，而不是把个人私有 skill 和密钥直接写进公开仓库。

## 快速启动

项目支持两种部署方式：

- 本机运行：适合开发和调试
- Docker 部署：适合快速拉起完整环境

### 方式一：本机运行

#### 1. Python 依赖

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements_api.txt
```

如果你还需要旧分析链路依赖或本地图表扩展，再额外安装：

```bash
pip install -r requirements.txt
```

#### 2. Node 依赖

```bash
npm install
```

#### 3. 环境变量

项目根目录创建本地 `.env`，至少建议配置：

```env
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
MONITOR_DB_PATH=./data/monitor.db
```

也可以从示例开始：

```bash
cp config/.env.example .env
```

#### 4. 启动后端 API

```bash
./scripts/run_api.sh
```

默认地址：`http://127.0.0.1:8000`

#### 5. 启动前端

```bash
npm run dev
```

默认地址：`http://127.0.0.1:3000`

如果后端不在本机 `8000` 端口，启动前设置：

```bash
export NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

### Vercel + Oracle 部署

如果前端部署到 Vercel、后端部署到 Oracle VM，建议这样配置：

前端 Vercel 环境变量：

```env
BACKEND_BASE_URL=https://your-backend-domain.com
```

后端环境变量：

```env
CORS_ALLOWED_ORIGINS=https://your-project.vercel.app,https://your-custom-domain.com
```

如果你想允许 Vercel preview deployment，可以再加：

```env
CORS_ALLOWED_ORIGIN_REGEX=https://.*\.vercel\.app
```

如果还要保留本地开发：

```env
CORS_ALLOWED_ORIGINS=https://your-project.vercel.app,http://localhost:3000,http://127.0.0.1:3000
```

说明：
- 前端所有 `/api/*` 请求会先进入 Vercel，再由 Next.js 的代理路由转发到后端。
- 后端只需要允许你的 Vercel 域名，不需要对外开放 `*`。

### 方式二：Docker 部署

#### 1. 准备环境变量

```bash
cp .env.docker.example .env
```

然后在 `.env` 中填入你的真实配置，至少包括：

```env
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
MONITOR_DB_PATH=/app/data/monitor.db
```

#### 2. 启动容器

```bash
docker compose up --build -d
```

启动后访问：

- 前端：`http://127.0.0.1:3000`
- 后端：`http://127.0.0.1:8000`

停止容器：

```bash
docker compose down
```

查看日志：

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

说明：

- `docker-compose.yml` 会同时启动前端和后端
- `./data` 与 `./logs` 会挂载到容器内，保留本地运行数据
- 前端通过容器内地址 `http://backend:8000` 转发到后端，无需额外改代码
- Docker 部署建议优先使用 [`.env.docker.example`](/Users/peter/Desktop/项目/Ashare-AI-Strategy-Analyst/.env.docker.example) 生成本地 `.env`

## 目录说明

```text
api/                  FastAPI 入口、schema 和服务层
app/                  Next.js App Router 页面
components/           前端交互组件
lib/                  前端 API 客户端与类型
ashare/               分析引擎、监控与数据模块
scripts/run_api.sh    API 启动脚本
scripts/run_monitor.sh 监控服务启动脚本
docker/               Docker 镜像定义
docker-compose.yml    Docker 编排文件
```

## API 返回模型

核心类型：

- `StockAnalysisResponse`
- `NewsItem`
- `HotspotItem`
- `PortfolioPosition`
- `PortfolioAnalysisResponse`
- `AgentResponse`

这些类型分别定义在 `api/schemas.py` 和 `lib/types.ts` 中。

## 已完成验证

- `python -m pytest tests/test_api_app.py -q`
- `npm run build`

## 说明

- 新版前端首版以打通主链路为主，图表仍是轻量展示。
- 持仓页已经支持录入、修改、删除和组合分析。
- Agent 页当前是轻量对话编排层，负责在单股分析、消息、热点、持仓之间路由请求。
- 旧版 `Streamlit` 和命令行主程序入口已经移除，统一使用 Next.js 前端 + FastAPI API。

## 开源发布建议

- 公开仓库建议只保留代码、测试、示例配置和静态样例数据。
- 本地运行状态不要公开，包括密钥、用户设置、Agent 记忆、监控数据库、持仓数据库和日志。
- 发布前不要直接执行 `git add .`，先运行 `git status --short`，再按文件精确选择要提交的内容。
- 若保留 Agent 相关说明，尽量描述公开的架构思路，不要写入私有本地 skill、个人工作流或机器相关配置。

## 风险提示

本项目仅供学习和研究使用，不构成投资建议。投资有风险，决策需自行承担责任。

## 发布到 GitHub 前的安全检查

- 不要提交任何真实密钥或账号信息：确保 `.env`、`data/user_settings.json`、邮件配置、Webhook 配置都没有进入暂存区。
- 不要提交任何本地状态文件：确保 `data/*.db`、`data/agent_memory/`、`logs/`、`.DS_Store` 没有被 `git add`。
- 建议只提交示例配置：如 `config/.env.example`，并在其中使用占位符，例如 `your_api_key`。
- 若提交 README 或 Agent 设计文档，只保留通用架构说明，不公开私有 skill 名、API key 或本机 agent wiring。
- 发布前至少执行一次 `git status --short` 和 `git diff --cached --stat`，确认暂存区里没有本机数据。
- 若曾错误提交过敏感信息，不要只删工作区文件；还需要清理 Git 历史，并立即在对应服务中轮换密钥。
