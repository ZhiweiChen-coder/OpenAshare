# OpenAshare

面向 A 股研究的本地优先智能分析工作台。

[![Next.js](https://img.shields.io/badge/Next.js-15.5.12-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Agent](https://img.shields.io/badge/Agent-多轮分析-111827)]()
[![Local First](https://img.shields.io/badge/Local%20First-本地优先-2563eb)]()
[![Open Source](https://img.shields.io/badge/Open%20Source-100%25%20透明-16a34a)]()
[![License](https://img.shields.io/badge/License-MIT-111827)](LICENSE)

OpenAshare 把单股分析、新闻解读、热点追踪、组合分析和 Agent 对话收进同一个工作流。它面向研究和展示场景，强调本地优先、可扩展和可解释的分析体验。

## 核心卖点

- 一屏完成股票研究主流程
- 技术指标、K 线、新闻与 AI 观点联动展示
- 单股、热点、持仓、问答四条主线互相贯通
- 支持本地优先的运行方式，适合研究和自托管
- 公开展示时也能保持清晰的产品边界

## 产品能力

- **单股分析**：行情、技术指标、K 线、AI 解读
- **新闻浏览**：个股新闻与全局新闻
- **热点追踪**：主题热度、关联标的与趋势观察
- **持仓管理**：组合录入、调整与组合分析
- **Agent 对话**：跨页面统一问答入口
- **演示访问**：轻量访问控制，适合公开展示

## 截图预览

截图文件都放在 `assets/screenshots/` 目录下。

| 首页 | 消息页 | 单股分析页 |
| --- | --- | --- |
| ![OpenAshare 首页](assets/screenshots/home.png) | ![OpenAshare 消息页](assets/screenshots/news.png) | ![OpenAshare 单股分析页](assets/screenshots/single-stock.png) |

## 技术栈

- 前端：Next.js App Router
- 后端：FastAPI
- 数据处理：AkShare、pandas、自定义分析服务
- 存储：SQLite，用于本地持仓和设置数据

## 本地开发

### 环境要求

- Python 3.12+
- Node.js 18+
- npm

### 1. 安装 Python 依赖

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements_api.txt
```

如果你还需要旧分析链路的额外依赖：

```bash
pip install -r requirements.txt
```

### 2. 安装 Node 依赖

```bash
npm install
```

### 3. 配置环境变量

在项目根目录创建 `.env`，至少配置：

```env
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
MONITOR_DB_PATH=./data/monitor.db
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

### 4. 启动后端

```bash
./scripts/run_api.sh
```

默认地址：`http://127.0.0.1:8000`

### 5. 启动前端

另开一个终端：

```bash
npm run dev
```

默认地址：`http://127.0.0.1:3000`

## 项目结构

- `api/`：FastAPI 入口、schema 和服务层
- `app/`：Next.js App Router 页面与路由
- `components/`：前端公共组件
- `lib/`：前端 API 客户端与共享类型
- `ashare/`：分析引擎、监控和数据模块
- `scripts/`：本地运行辅助脚本

## 验证方式

```bash
python -m pytest tests/test_api_app.py -q
npm run build
```

## 贡献

欢迎提交 Issue 和 Pull Request。请尽量保持改动聚焦，避免不必要的大范围重构，并尽量保留当前产品形态：

- 单股分析
- 新闻
- 热点
- 持仓
- Agent 问答

## 许可

MIT License
