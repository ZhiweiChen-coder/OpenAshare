# Agent Backend Eval Loop Implementation Plan
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立一个可重复运行的 Agent 后端评测闭环，验证工具调用、澄清行为、回答简洁度、结果引用和 SSE 完成信号。

**Scope:** 只评估可观察行为，不收集或暴露隐藏 chain-of-thought；不发送真实用户持仓到外部模型。

**Architecture:** 用共享的评测 case/schema 描述期望，用纯 Python evaluator 计算每个 case 的 checks，用 CLI runner 对本地 HTTP API 做真实回归；pytest 覆盖 evaluator 本身和关键边界。

## Task 1: 定义评测协议和 case 集

**Files:**
- Create: `api/agent_eval.py`
- Create: `tests/agent_eval_cases.py`
- Create: `tests/test_agent_eval.py`

1. 定义 `EvalCase`、`EvalObservation`、`EvalFailure` 和工具别名归一化。
2. 将验收标准建模为 `expected_tools`、`forbidden_tools`、`clarification`、`max_chars`、`required_terms` 和 `require_citation`。
3. 覆盖问候、模糊股票问题、股票分析、新闻、热点、联网搜索和多轮上下文；私有持仓 case 默认只允许离线测试。
4. 为 evaluator 写纯单元测试，确保失败原因可读且不会输出完整 payload。

## Task 2: 实现真实 HTTP eval runner

**Files:**
- Create: `scripts/run_agent_eval.py`

1. 使用独立 session id 执行每个公开 case。
2. 只输出状态、工具名、摘要长度、引用数和失败规则；默认不打印新闻正文或持仓数据。
3. 支持 `--base-url`、`--case`、`--json-out` 和 `--include-private`；服务不可达时以明确的 blocked 状态结束。
4. 返回非零退出码表示有失败，方便 CI 或本地 loop 使用。

## Task 3: 接入后端回归测试

**Files:**
- Modify: `tests/test_api_app.py`

1. 保留现有 SSE 顺序测试，并补充 evaluator 对 `AgentResponse` 的集成断言。
2. 验证简单问候不触发工具、缺少标的时要求澄清、股票查询包含工具结果、引用可被消费。
3. 运行 `python -m pytest tests/test_api_app.py tests/test_agent_eval.py -q`。

## Task 4: 运行真实 loop 并记录使用方式

1. 先启动本地 API，再执行 `python scripts/run_agent_eval.py --base-url http://127.0.0.1:8001`。
2. 对真实模型/新闻源失败进行逐 case 记录，不把单一新闻源失败误判为 Agent 失败。
3. 最后运行完整后端回归，检查 `git diff --check`，并把剩余失败按“模型策略 / 工具数据 / 服务配置 / 测试假设”分类。
