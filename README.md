<p align="center">
  <img src="public/favicon.svg" alt="OpenAshare Logo" width="128" />
</p>

<h1 align="center">OpenAshare</h1>

<p align="center">
  <a href="README.md"><strong>中文</strong></a>
  ·
  <a href="README.en.md">English</a>
</p>

<p align="center">
  <strong>面向 A 股与港股的 AI 研究工作台。</strong><br />
  行情、技术面、新闻、热点、持仓和 Agent，一站式完成。
</p>

<p align="center">
  <a href="https://github.com/ZhiweiChen-coder/OpenAshare/stargazers"><img src="https://img.shields.io/github/stars/ZhiweiChen-coder/OpenAshare?style=flat&amp;label=GitHub%20Stars&amp;color=0f766e" alt="GitHub Stars" /></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-15.5-000000?logo=nextdotjs&amp;logoColor=white" alt="Next.js" /></a>
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&amp;logoColor=white" alt="FastAPI" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&amp;logoColor=white" alt="Python" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-16a34a" alt="MIT License" /></a>
</p>

<p align="center">
  <a href="#快速开始">立即运行</a>
  ·
  <a href="#产品一览">查看功能</a>
  ·
  <a href="#加入微信群">加入微信群</a>
</p>

<p align="center">
  <img src="assets/screenshots/agent-research-beta.png" alt="OpenAshare Agent 研究工作台：分析比亚迪并保留对话上下文" width="960" />
</p>

> **云端 Beta 正在开放。** 也可以直接本地运行，自己掌控数据与模型。

输入股票代码，快速完成：**看行情 → 查新闻 → 问 Agent → 做跟踪**。

## 加入微信群

欢迎大家加入 OpenAshare 体验群，交流使用体验、研究想法和项目反馈。请使用微信扫描下方二维码加入群聊：

<p align="center">
  <img src="assets/community/wechat-group.png" alt="OpenAshare 微信群活码" width="400" />
</p>

> 这是 OpenAshare 微信群活码，欢迎扫码加入。

> 重要提示：本项目仅用于研究、学习和工具搭建，不构成投资建议。市场有风险，所有决策请自行负责。

## Star 增长

<p align="center">
  <a href="https://star-history.com/#ZhiweiChen-coder/OpenAshare&amp;Date">
    <img src="https://api.star-history.com/svg?repos=ZhiweiChen-coder/OpenAshare&amp;type=Date" alt="OpenAshare GitHub Star 增长曲线" width="720" />
  </a>
</p>

曲线由 [Star History](https://star-history.com/#ZhiweiChen-coder/OpenAshare&Date) 提供，会随公开 Star 数据更新。点击图表可查看交互式历史；如果这个项目对你有帮助，点一颗 Star 会直接推动下一段曲线。

## 核心功能

- **行情与技术分析**：K 线、指标、信号和市场状态
- **新闻与热点**：个股新闻、市场消息和关联标的
- **Agent 研究**：基于股票、新闻和组合上下文持续追问
- **持仓与监控**：组合盈亏、风险分析、观察清单和策略跟踪

## 产品一览

| Agent 研究台 | 图表与技术面 |
| --- | --- |
| ![Agent 工作台](assets/screenshots/agent-research-beta.png) | ![OpenAshare 全屏图表](public/marketing/openashare-beta-chart.png) |

### 研究工作台与 Agent

- 股票名称 / 代码搜索，行情快照、技术指标和 AI insight 同屏展示
- 跨页面统一的研究问答入口，支持会话上下文与工具调用进度
- 可调取个股、热点、新闻和组合信息；智能引擎不可用时回退到规则分析
- 盘前、盘中、午间、盘后不同研究节奏提示

### 市场、热点与图表

- A 股、港股与美股统一搜索；A 股研究数据以 Ashare / AkShare 为主，港股支持如 `00700.HK`
- 个股新闻、市场消息、热点聚合、热度分数与关联标的
- K 线、技术指标、信号和市场状态（risk-on / neutral / risk-off）辅助判断

### 持仓与策略

- 本地组合、成本与数量管理
- 组合盈亏、集中度风险、再平衡建议与观察清单
- 策略候选筛选、状态跟踪与复盘提示

## 架构

```mermaid
flowchart LR
  User["研究者 / 交易复盘"] --> UI["Next.js App Router"]
  UI --> API["FastAPI 服务层"]
  API --> Stock["股票分析服务"]
  API --> News["新闻与热点服务"]
  API --> Portfolio["组合与策略服务"]
  API --> Agent["Agent 编排"]
  Stock --> AkShare["AkShare / pandas"]
  Portfolio --> SQLite["SQLite 本地数据"]
  Agent --> LLM["OpenAI-compatible LLM"]
```

## 技术栈

- **Frontend**：Next.js App Router、React 19、TypeScript、lightweight-charts
- **Backend**：FastAPI、Pydantic、SSE progress events
- **Data & Analysis**：AkShare、pandas、自定义技术分析与策略服务
- **Storage**：SQLite、本地 JSON 设置文件
- **AI**：可配置 base URL、model 和 API key 的 OpenAI-compatible API

## 快速开始

### 环境要求

- Python 3.12+
- Node.js 20+
- npm

### 1. 安装依赖

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements_api.txt
npm install
```

如需旧分析链路或更多本地分析能力，再安装：

```bash
pip install -r requirements.txt
```

### 2. 配置模型（可选）

在项目根目录创建 `.env`。没有模型配置时，部分 Agent 能力会回退到规则分析路径。

```env
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
MONITOR_DB_PATH=./data/monitor.db
```

如需东方财富在线股票搜索补全，可配置 `EASTMONEY_TOKEN`；请勿提交真实 token。

### 3. 启动 API 与前端

默认端口：

```bash
./scripts/run_api.sh      # http://127.0.0.1:8000
npm run dev               # http://127.0.0.1:3000
```

如果已有服务占用 `8000` / `3000`，可并行启动一套开发实例：

```bash
API_PORT=8001 ./scripts/run_api.sh
```

然后创建 `.env.local`：

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001
```

重启 Next.js 后运行：

```bash
npm run dev -- -p 3001
```

## 页面

- `/`：中英文产品首页与云端 Beta 入口
- `/work`：研究工作台与 Agent 主入口（`/agent` 会跳转至此）
- `/stocks`：股票搜索与单股分析
- `/charts`：K 线图与技术指标
- `/news`：市场消息与个股新闻
- `/hotspots`：热点主题与关联标的
- `/portfolio`：持仓、组合风险与策略复盘
- `/settings`：模型与服务配置

## 项目结构

```text
.
├── api/          # FastAPI 入口、schemas、SSE 与服务编排
├── app/          # Next.js App Router 页面
├── components/   # 前端 UI 组件
├── lib/          # 前端 API client、共享类型和工具
├── ashare/       # 分析引擎、行情搜索、监控与数据模块
├── scripts/      # 本地启动脚本
├── tests/        # API 与搜索相关测试
└── assets/       # 产品截图与其他资源
```

## 验证

```bash
python -m pytest tests/test_api_app.py -q
npm run build
```

## Roadmap

- 云端 Beta 的登录申请与反馈闭环
- 更多中国 / 香港市场数据源、缓存策略与引用追踪
- 回测、交易日历与策略绩效面板
- 更细颗粒度的 Agent 工具调用、引用与研究记忆
- 团队协作、权限和一键部署模板

## 贡献

欢迎 Issue、Discussion 和 Pull Request。提交前请注意：

- 优先提交小而聚焦的改动
- API contract 变更时同步更新 `api/schemas.py` 与 `lib/types.ts`
- 不提交真实 API key、私有配置或机器本地文件
- 保持产品主线：股票分析、新闻、热点、持仓、策略和 Agent 对话

## License

[MIT](LICENSE)
