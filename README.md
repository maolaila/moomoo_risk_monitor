# Moomoo Risk Monitor

本项目是独立于 `moomoo_trade_reports` 的本地风控监控器。它从 Moomoo 快照读取当前持仓，持续监控 SEC、官方政策 RSS、持仓 ticker 新闻、财经新闻 RSS、搜索 RSS、HTML 官方网页爬虫、社交媒体、可选动态浏览器爬虫、可选新闻 API 和可选价格事件，用规则引擎筛选风险，再让 Codex 对高风险候选事件做结构化综合评估。

不自动交易，不调用 Moomoo 下单、改单、撤单、解锁交易接口。所有告警都会先写入本地 `data/risk-monitor/alerts/`，达到邮件阈值时再通过 Gmail SMTP 发送到 `maolaila1+moomoo-risk-monitor@gmail.com`。

## 一行启动

```powershell
npm run monitor
```

启动后命令行会用中文显示心跳，包括当前任务、最近一次扫描时间、下一次扫描时间、持仓数量、候选事件和告警数量。

## 初始化

```powershell
npm install
Copy-Item .env.example .env
npm run build
npm test
```

本机已默认写好发送账号和收件地址。你只需要把 `maolaila2@gmail.com` 的 Gmail App Password 写入：

```text
secrets/gmail_app_password.txt
```

Gmail 这里不能填普通登录密码。需要在 Google 账号里开启两步验证后生成 App Password。

默认从平级项目读取最新持仓快照：

```text
../moomoo_trade_reports/data/raw/moomoo-api/snapshot_*.json
```

如果快照目录不同，在 `.env` 设置：

```env
MOOMOO_SNAPSHOT_DIR=D:/path/to/data/raw/moomoo-api
```

## 常用命令

```powershell
npm run scan
npm run monitor
npm run check-codex
npm run test-codex
npm run test-email
npm run update-social-watchlist
npm run daily
```

`scan` 只扫一次并退出。`monitor` 常驻运行。`check-codex` 检查 `gpt-5.5` 和 `xhigh` 是否可用。`test-codex` 用假高风险事件验证 Codex JSON 输出。`test-email` 发送一封 Gmail SMTP 测试告警。`update-social-watchlist` 根据当前持仓强制更新关键人物社媒账号列表。

Codex 默认使用：

```text
model = gpt-5.5
reasoning = xhigh
speed tier = fast
service tier = fast
sandbox = read-only
approval_policy = never
```

## 数据目录

```text
data/risk-monitor/raw/          原始事件
data/risk-monitor/normalized/   标准化事件
data/risk-monitor/candidates/   规则候选事件
data/risk-monitor/codex/        Codex 结果或失败记录
data/risk-monitor/alerts/       本地告警
data/risk-monitor/emails/       邮件发送记录或失败记录
data/risk-monitor/logs/         JSONL 日志
data/risk-monitor/social-watchlist.json  持仓派生的关键社媒账号列表
data/risk-monitor/seen.jsonl    去重索引
```

新闻池自动清理默认开启：

```env
NEWS_POOL_CLEANUP_ENABLED=true
NEWS_POOL_RETENTION_HOURS=24
```

每轮扫描开始时会删除 `raw/normalized/candidates` 中修改时间超过 24 小时的临时事件文件，避免本地新闻数据长期堆积。`alerts/codex/emails/logs/seen.jsonl` 不会被清理，用于告警审计、AI 结果追溯和去重。

## 邮件告警

默认配置：

```env
ALERT_EMAIL_ENABLED=true
ALERT_EMAIL_TO=maolaila1+moomoo-risk-monitor@gmail.com
ALERT_EMAIL_FROM="Moomoo Risk Monitor <maolaila2@gmail.com>"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=maolaila2@gmail.com
SMTP_PASS_FILE=./secrets/gmail_app_password.txt
```

`+moomoo-risk-monitor` 是 Gmail 子地址，会直接进 `maolaila1@gmail.com` 的收件箱。监控只会在 Codex 判断 `should_email=true` 且级别达到 `RISK_ALERT_MIN_SEVERITY` 时发送邮件。SMTP 密码缺失或发送失败时，监控不会退出，会把失败记录写到 `data/risk-monitor/emails/failed/`。

## 信息源

默认信息源分三层：

```text
官方源：
- SEC submissions API
- White House Briefings & Statements RSS
- Federal Reserve press releases RSS
- Federal Reserve speeches RSS
- US Treasury press releases HTML
- OFAC recent actions HTML
- US Commerce press releases HTML

新闻源：
- Yahoo Finance ticker RSS，按当前持仓自动生成
- Seeking Alpha Market Currents
- CNBC Top News
- MarketWatch Top Stories
- Bing News RSS 搜索，按持仓 ticker 和风险关键词自动生成

社交/政策冲击源：
- Trump Truth Social RSS
- X 关键账号浏览器采集，已启用，可使用本机登录态
- X/Twitter 通用动态浏览器源占位，默认关闭
```

对应配置：

```env
ENABLE_SEC_MONITOR=true
ENABLE_POLICY_RSS_MONITOR=true
ENABLE_TICKER_NEWS_MONITOR=true
ENABLE_RSS_MONITOR=true
ENABLE_SOCIAL_MONITOR=true
SOURCE_REGISTRY_ENABLED=true
SOURCE_REGISTRY_PATH=./config/sources.json
RISK_MONITOR_RSS_FEEDS=https://seekingalpha.com/market_currents.xml,https://www.cnbc.com/id/100003114/device/rss/rss.html,https://www.marketwatch.com/rss/topstories
RISK_MONITOR_POLICY_FEEDS=https://www.whitehouse.gov/briefings-statements/feed/,https://www.federalreserve.gov/feeds/press_all.xml,https://www.federalreserve.gov/feeds/speeches.xml
RISK_MONITOR_SOCIAL_FEEDS=https://truthsocial.com/@realDonaldTrump.rss
```

主要来源现在由 `config/sources.json` 管理。每个来源都有：

```text
adapter          rss / ticker_rss / search_rss / html_static / browser_dynamic / x_browser
tier             fast / normal / slow
cadenceMinutes   监控模式下的采集间隔
category         official / news / social / policy / industry / search
enabled          是否启用
```

`browser_dynamic` 用 `playwright-core` 调本机 Chrome，适合动态页面兜底。通用占位源默认关闭，因为 X/Twitter 等平台经常需要登录或 API 权限。若你有可信 RSS 转换源、RSSHub、内部抓取服务或官方 API 代理，优先用 RSS/API 方式接入。

X/Twitter 已启用 `x_browser` adapter 作为第二条路径。它不会保存账号密码，只复用本机 Chrome profile。默认配置在 `config/sources.json`：

```json
{
  "id": "x-key-accounts-browser",
  "enabled": true,
  "adapter": "x_browser",
  "accounts": [
    "realDonaldTrump",
    "WhiteHouse",
    "POTUS",
    "FederalReserve",
    "USTreasury",
    "CommerceGov"
  ],
  "cadenceMinutes": 10,
  "throttleMs": 10000,
  "maxItemsPerAccount": 5,
  "profileDir": "./.browser/x-profile",
  "headless": false
}
```

第一次运行会打开一个独立 Chrome profile。你在这个窗口里登录 X，之后监控会复用该登录态；每个账号之间默认等待 10 秒，整组账号默认 10 分钟跑一次。`.browser/` 已加入 `.gitignore`，登录态不会提交。

关键人物账号列表由 Codex 按当前持仓生成并缓存到：

```text
data/risk-monitor/social-watchlist.json
```

监控每轮会先计算持仓指纹。持仓没变时直接复用本地账号列表，不调用 AI；持仓变化时才调用 Codex 更新列表。如果 Codex 更新失败，会使用内置官方/政策账号兜底。手动强制更新：

```powershell
npm run update-social-watchlist
```

`NEWS_LOOKBACK_HOURS` 默认 48 小时。RSS/社交/政策源会跳过发布时间早于该窗口的条目；没有发布时间的条目仍会进入去重流程。

## 采集和 AI 成本控制

监控模式每 10 分钟进入一轮扫描，但不是每个来源都每轮采集。`config/sources.json` 里的 `cadenceMinutes` 控制来源分频：

```text
fast    通常 10 分钟：SEC、政策 RSS、持仓新闻、普通财经新闻、关键社交源、风险搜索
normal  通常 30 分钟：Fed speeches、Treasury/OFAC 页面
slow    通常 60 分钟：Commerce 等低频官方页面
```

采集到的事件先落原始记录，再标准化、去重、规则预筛。只有“新增、关联当前持仓、命中规则、达到 AI 介入门槛”的候选事件才调用 Codex。网页爬虫扩大覆盖面，但不会让每条网页都上 AI。

## 安全边界

Codex 只接收精简后的持仓暴露、事件摘要、规则命中和 URL。不会传入 `.env`、API key、私钥、Moomoo 账号 ID、broker order ID 或完整账户 JSON。Codex 以 `--sandbox read-only`、`approval_policy=never`、`--ephemeral` 运行。
