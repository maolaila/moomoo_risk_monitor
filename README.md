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
data/risk-monitor/repairs/      AI 自动修复记录
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
- US Commerce press releases HTML，失败或返回空时自动打开 Chrome 兜底抓取
- BIS export controls press releases HTML
- USTR trade policy press releases HTML

新闻源：
- Yahoo Finance ticker RSS，按当前持仓自动生成
- Seeking Alpha Market Currents
- CNBC Top News
- MarketWatch Top Stories
- AI/半导体行业 RSS：TechCrunch AI、The Verge、VentureBeat AI、MIT Technology Review、Semiconductor Engineering、EE Times、NVIDIA Blog、NVIDIA Technical Blog、Google AI、OpenAI News、Intel Newsroom
- Bing News RSS 搜索，按持仓 ticker 和风险关键词自动生成
- AI 产业链搜索：GPU/ASIC、HBM、先进封装、半导体设备、光通信/硅光、800G/1.6T、数据中心电力和冷却、云厂商 AI capex
- AI/半导体政策搜索：BIS、Entity List、Federal Register、USTR Section 301、CHIPS Act、CFIUS、对华出口管制、关税

社交/政策冲击源：
- Trump Truth Social RSS
- X 关键账号浏览器采集，已启用，可使用本机登录态。默认覆盖 Trump/White House/Fed/Treasury/Commerce/USTR/BIS，以及 NVIDIA、OpenAI、Anthropic、Google DeepMind、Meta AI、Microsoft、AWS、Intel、AMD、ASML、TSMC、Micron、Marvell 等 AI 上下游关键账号
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
RISK_MONITOR_RSS_FEEDS=https://seekingalpha.com/market_currents.xml,https://www.cnbc.com/id/100003114/device/rss/rss.html,https://www.marketwatch.com/rss/topstories,https://techcrunch.com/category/artificial-intelligence/feed/,https://semiengineering.com/feed/
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

每个来源都可以配置 `browserFallback`。主采集方式为 RSS/API/普通 HTML 时，如果请求报错，或返回 0 条并且 `onEmpty=true`，监控会自动改用本机 Chrome 打开网页抓取链接。Commerce.gov 已启用这个兜底：

```json
{
  "id": "commerce-press-releases",
  "adapter": "html_static",
  "url": "https://www.commerce.gov/news/press-releases",
  "browserFallback": {
    "urls": [
      "https://www.commerce.gov/news/press-release",
      "https://www.commerce.gov/news/press-releases"
    ],
    "headless": false,
    "profileDir": "./.browser/news-profile",
    "waitMs": 8000,
    "selectors": {
      "item": "a[href*=\"/news/press-releases/\"]"
    }
  }
}
```

`headless=false` 会打开可见 Chrome。遇到 Cloudflare、政府站点人机验证或 Cookie 弹窗时，你可以在这个窗口里处理一次；`.browser/news-profile` 会保存本机浏览器状态，后续扫描复用。兜底失败只影响当前来源，不会阻塞其他 RSS、政策源、X、AI 分析或邮件告警。

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
    "CommerceGov",
    "USTradeRep",
    "BISgov",
    "nvidia",
    "OpenAI",
    "AnthropicAI",
    "GoogleDeepMind",
    "MetaAI",
    "Microsoft",
    "awscloud",
    "Intel",
    "AMD",
    "ASMLcompany",
    "TSMC",
    "MicronTech",
    "MarvellTech"
  ],
  "cadenceMinutes": 10,
  "throttleMs": 10000,
  "maxItemsPerAccount": 5,
  "profileDir": "./.browser/x-profile",
  "headless": false
}
```

第一次运行会打开一个独立 Chrome profile。你在这个窗口里登录 X，之后监控会复用该登录态；如果登录失效或账号主页抓不到有效推文，采集器会自动降级到未登录搜索页 `from:账号` 继续尝试。每个账号之间默认等待 10 秒，整组账号默认 10 分钟跑一次。`.browser/` 已加入 `.gitignore`，登录态不会提交。

社交媒体采集是失败隔离的：单个 X 账号失败会跳过该账号继续下一个账号；整个 X 来源失败也只会返回空结果并写日志，不会影响 SEC、新闻、政策源、AI 分析或邮件告警。

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

## AI 自动修复

监控主流程出现未捕获异常时，会调用 Codex 尝试自动修复本地程序，使下一轮扫描能继续跑完整工作流。默认配置：

```env
AI_REPAIR_ENABLED=true
AI_REPAIR_ALLOW_CODE_EDITS=true
AI_REPAIR_COOLDOWN_MINUTES=30
AI_REPAIR_TIMEOUT_MS=600000
AI_REPAIR_VALIDATION_COMMANDS=npm run build,npm test
```

修复过程使用 `workspace-write`，但修复提示限制它不要修改 `.env`、`secrets/`、`data/`、`.browser/`、`node_modules/`、`dist/`，也不要执行 `git reset`、强制清理或启动长驻 `npm run monitor`。修复结束后会自动跑配置里的验证命令，并把记录写入 `data/risk-monitor/repairs/`。修复失败不会阻塞主循环，监控会继续等待下一轮扫描。

## 安全边界

Codex 只接收精简后的持仓暴露、事件摘要、规则命中和 URL。不会传入 `.env`、API key、私钥、Moomoo 账号 ID、broker order ID 或完整账户 JSON。Codex 以 `--sandbox read-only`、`approval_policy=never`、`--ephemeral` 运行。
