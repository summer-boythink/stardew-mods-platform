# 🌾 星露谷 Mod 交流平台（Stardew Mods Platform）

支持 **电脑 / 手机端** 访问的星露谷 Mod 分享社区：玩家可以上传**包含多个 Mod 的文件夹、`.zip` 压缩包或单个 Mod 文件**，也可以直接粘贴 **Nexus Mods / CurseForge** 页面链接，由服务端通过官方 API 下载并自动整理；平台自动解析 `manifest.json`、推断分类、生成文件树与预览，并提供**个人存储空间（2GB）/ 团队存储空间（10GB）/ 完全公开分享**。

- 技术栈：**React 18 + TypeScript + Vite**（前端） / **Bun + Express + TypeScript**（后端）
- UI：**[Pixelvale UI](https://github.com/summer-boythink/pixelvale-ui)** 星露谷像素风（木框 / 羊皮纸 / 金色描边 / 像素字体）+ 自研响应式布局；组件源码以 workspace 形式内置，离线可构建
- 界面支持 **白天 / 秋日 / 夜晚** 三套主题、界面音效开关、移动端抽屉导航、像素风确认弹窗与 Toast
- 组件演示站：<https://summer-boythink.github.io/pixelvale-ui/>
- 后端与前端在**同一个目录**（本文件夹 Monorepo），开箱即用
- 数据存储：**SQLite（bun:sqlite，WAL + 事务）** + 文件系统存 Mod 本体，**无需安装 MySQL / Postgres / Docker**，个人服务器 / NAS / 旧电脑都能跑；首次启动会自动把旧版 `db.json` 迁移进 SQLite 并备份

> 已验证：`tsc` 类型检查（前/后端/共享）全过、49 个单测全过、36 项端到端链路（注册→上传→整理→下载→去重→覆盖更新→拆分发布→多zip→团队→登录锁定）全过；Nexus/CurseForge 通过模拟官方 API 跑通「下载→自动整理→来源写回→重复覆盖→合集拆分」全链路；前后端生产构建全过。

---

## 目录结构

```
stardew-mods-platform/
├── package.json            # Monorepo 根（bun workspaces）
├── packages/pixelvale-ui/  # @pixelvale/ui 源码（同步自 pixelvale-ui 仓库）
├── shared/src/index.ts     # 前后端共享类型：Mod/团队/配额/分类推断
├── backend/
│   ├── src/
│   │   ├── index.ts        # 启动入口（建目录、初始化 SQLite、优雅退出、监听端口）
│   │   ├── app.ts          # Express 装配：helmet/cors/限流/路由/错误处理
│   │   ├── config.ts       # 端口/JWT/配额/上限（均可 env 覆盖）
│   │   ├── db.ts           # ★SQLite 数据层（bun:sqlite，WAL/事务/唯一约束/旧数据自动迁移）
│   │   ├── types.ts        # 后端类型（与 shared 同步）
│   │   ├── middleware/     # auth（Bearer JWT）/ errorHandler（asyncHandler）
│   │   ├── routes/         # auth / mods / teams / storage / import
│   │   ├── services/
│   │   │   ├── modParser.ts      # ★自动整理：zip安全解压/manifest解析/分类/文件树/多zip
│   │   │   ├── modImport.ts      # ★Nexus/CurseForge 官方 API 解析与下载（ModDrop 手动兜底）
│   │   │   └── storageService.ts # 文件落盘/打包/覆盖替换/预览图/删除清理
│   │   └── utils/          # auth(jwt/bcrypt) / attempts(防爆破) / errors(HttpError) / validation(zod) / text
│   ├── tests/              # 单测：db / modParser / authGuards / modImport（bun test）
│   ├── data/               # 运行数据（app.db + storage/ + tmp/，git 不提交）
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── main.tsx / App.tsx / index.css   # 入口、路由、田园响应式样式
    │   ├── api/client.ts   # 类型化 API 封装（含上传进度/覆盖/拆分参数）
    │   ├── context/AuthContext.tsx
    │   ├── components/     # Layout / Feedback（确认弹窗+Toast）/ ModCard / QuotaBar / UploadDropzone / ImportFromSite / DownloadButton / AuthedImage / PageHeading / TextArea
    │   ├── utils/mergeSplit.ts              # 拆分上传两轮结果合并（确认覆盖后）
    │   └── pages/          # Home（广场）/ Upload / MyMods / Team / ModDetail / Auth
    └── vite.config.ts      # /api 代理到后端 :4000
```

---

## UI：PixelVale UI

- 入口在 `frontend/src/App.tsx`：`PixelValeProvider`（`locale="zh-CN"`）+ `ToastProvider` + 确认弹窗宿主
- 页面使用 `Panel / Button / TextField / Select / Tabs / Checkbox / TagInput / Steps / ProgressBar / Pagination / TreeView / Alert / EmptyState / Skeleton` 等组件
- 主题通过 `data-pv-theme` 与 CSS 变量切换；像素字体 `Fusion Pixel` 与 `Pixelify Sans` 本地打包，不请求外部字体（Fusion Pixel 的 OFL 许可见 `frontend/public/FUSION-PIXEL-OFL.txt`）
- 上传覆盖、删除、公开、退出团队等操作统一使用像素风 `Dialog`，替代原生 `window.confirm`；成功/失败反馈使用 `Toast`
- 组件库源码位于 `packages/pixelvale-ui`，与上游 [`pixelvale-ui`](https://github.com/summer-boythink/pixelvale-ui) 的 `packages/ui/src` 同步；更新时复制源码目录并运行 `bun install` 即可，无需发布 npm 包
- 在线组件演示：<https://summer-boythink.github.io/pixelvale-ui/>

## 快速启动（本地开发）

环境要求：**Bun ≥ 1.0**（后端数据库用 `bun:sqlite`，需 Bun 运行；前端也可用 Node + npm 跑，把 `bun` 换成 `npm` 即可）。

```bash
cd stardew-mods-platform

# 1. 安装依赖（根目录一次装完全部 workspace）
bun install

# 2. 启动后端（:4000）
bun run --filter backend dev

# 3. 另开终端启动前端（:5173，自动代理 /api 到后端）
bun run --filter frontend dev
```

浏览器打开 **http://localhost:5173**：
1. 右上角「登录 / 注册」创建一个账号；
2. 「上传」页选择空间并上传（三种形态都可）；
3. 上传成功后自动跳详情页，可一键下载。

> **常见问题**：页面能打开但登录/上传提示「无法连接后端服务（网络错误）」= **后端没在运行**。
> 前端 dev 只负责页面与代理，上传必须同时启动后端（第 2 步）。上传页在提交前会自动探活，
> 后端未启动时会直接提示，不会白传文件。
>
> 停止/重启后端：`kill $(lsof -ti :4000)` 后重新执行 `bun run --filter backend dev`。

手机访问：保证手机与电脑同一 Wi-Fi，用电脑 IP 打开，如 `http://192.168.1.10:5173`（vite 已开 `--host`）。
此时前端默认仍请求**同源相对路径** `/api`，手机上会指向手机自身而失败；
请把 `frontend/.env.local` 改为电脑局域网 IP 直连后端后重启前端：

```bash
# frontend/.env.local（不提交，仅本机生效，优先级高于 .env）
VITE_API_BASE=http://192.168.1.10:4000/api
```

前端后端地址配置（`frontend/src/api/client.ts` 统一拼接）：

| 文件 | 是否提交 | 说明 |
|---|---|---|
| `frontend/.env` | ✅ 提交 | 默认值 `VITE_API_BASE=/api`（dev 走 vite 代理、生产走同源） |
| `frontend/.env.local` | ❌ 不提交 | 本机覆盖，优先级更高；手机联调用上面示例 |

---

## 生产构建与部署

```bash
# 构建前后端
bun run --filter backend build
bun run --filter frontend build

# 启动后端（生产，需 Bun）
cd backend && PORT=4000 JWT_SECRET=请换成随机长字符串 bun dist/index.js
```

把 `frontend/dist/` 用任意静态服务器托管（nginx / `bunx serve` / NAS Web Station），并将 `/api` 反代到后端 `:4000` 即可。示例 nginx：

```nginx
location /api/ { proxy_pass http://127.0.0.1:4000; }
location / { root /srv/stardew/frontend/dist; try_files $uri /index.html; }
```

环境变量（见 `backend/.env.example`）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `4000` | 后端端口 |
| `JWT_SECRET` | `dev-only-secret-change-me` | **生产务必更换** |
| `JWT_EXPIRES_IN` | `7d` | 登录有效期 |
| `MAX_UPLOAD_BYTES` | `524288000`（500MB） | 单次上传上限 |
| `PERSONAL_QUOTA_BYTES` | `2147483648`（2GB） | 个人空间配额 |
| `TEAM_QUOTA_BYTES` | `10737418240`（10GB） | 团队空间配额 |
| `LOGIN_MAX_FAILS` | `5` | 登录防爆破：每窗口最多失败次数 |
| `LOGIN_WINDOW_MS` | `3600000`（1 小时） | 登录防爆破窗口 |
| `CAPTCHA_TTL_MS` | `300000`（5 分钟） | 图形验证码有效期 |
| `TRUST_PROXY` | `0` | 反代后部署设为 `1` |
| `NEXUS_API_KEY` | 空 | Nexus Mods v3 API Key；自动导入下载必需 |
| `CURSEFORGE_API_KEY` | 空 | CurseForge API Key；自动导入必需 |
| `CURSEFORGE_GAME_ID` | 自动发现 | 可选，Stardew Valley 的 CurseForge gameId |
| `IMPORT_MAX_BYTES` | `524288000` | 自动导入单文件上限 |
| `IMPORT_TIMEOUT_MS` | `300000` | 上游请求 / 下载超时 |

---

## 核心功能说明

### 1. 上传形态与发布模式（`POST /api/mods/upload`，multipart）

| 形态 | 前端操作 | 后端处理 |
|---|---|---|
| 单个 Mod 文件（`.dll` / `.json` / `.png` / `.xnb`…） | 「选文件」点选 1 个 | 原样存储，按扩展名/内容推断分类 |
| `.zip` 压缩包（含 1 个或 N 个 Mod） | 「选文件」点选 zip / 拖拽 | 安全解压 → 找出**所有** `manifest.json` → 1 个记为单 Mod，≥2 个记为**合集包**并汇总子 Mod 名单 |
| **多个 zip 一次选择** | 文件选择器多选 zip | 逐个安全解压后合并分析（合集包），或勾选「拆分发布」后每个 Mod 独立成一条记录 |
| 整个文件夹 | 「选整个文件夹」（`webkitdirectory`，手机自动降级为文件选择）/ 多选拖拽 | 按 `relativePaths` 还原目录树 → 解析 → 打包为 `archive.zip` 供一键下载 |

**发布模式**

- **合并模式（默认）**：内容合并为一条记录（多 Mod 时分类为「合集包」）；
- **拆分模式**（`split=1`，上传页勾选「拆分发布」）：内容里的每个 Mod 拆成独立记录单独发布（各自标题/分类/文件树/预览图，zip 内保留原目录名）。有重复时逐条跳过并在结果面板列出原因；
- **重复覆盖**：同一计费空间内 `UniqueID` 重复时返回 **409 + `existingId` + `canOverwrite`**，前端弹窗询问是否覆盖；确认后带 `overwriteIds` 重传即可——**保留原 id、发布时间、下载次数与可见性**，只替换文件与信息（存储目录安全替换，失败自动回滚）。拆分模式同理：先跳过全部重复，再一键确认覆盖。

字段：`files`（文件，可多个）＋ `relativePaths`（与文件顺序对齐的相对路径 JSON 数组）＋ `scope/teamId/visibility/title/description/category/tags` ＋ `split`（'0'/'1'）＋ `overwriteIds`（JSON 数组，仅覆盖这些记录 id）＋ `overwrite`（'1' 直接覆盖全部重复）。

### 2. 自动整理（`backend/src/services/modParser.ts`）

- 兼容 SMAPI 标准 `manifest.json`（`Name/Author/Version/Description/UniqueID/ContentPackFor/Dependencies`），容忍 BOM；
- 分类推断（`Content Patcher / 美化贴图 / 人物肖像 / 农场地图 / 汉化 / 工具辅助 / SMAPI框架 / 功能玩法 / 合集包 / 其他`），多 Mod 自动归为**合集包**（拆分模式则各自归类）；
- 生成**文件树**（1200 节点上限）、统计文件数/体积、提取最多 6 张**预览图**（`preview/screenshot/cover` 优先）；
- 同一计费空间下 `UniqueID` 重复上传返回 **409 + 已有记录 id + canOverwrite**，前端弹窗确认后可覆盖更新（详见上文「发布模式」）；
- 安全：zip 条目路径穿越中和（不出目标目录）、zip 炸弹防护（声明体积预检 + 条目数/解压体积上限）、文件名非法字符过滤。

### 3. 三种存储空间

- **🏠 个人空间**：默认私有，可单个公开；占用个人 2GB 配额；
- **👥 团队空间**：创建团队 → 用对方用户名邀请成员 → 上传时选该团队；团队内可见或公开；占用团队 10GB 配额；解散团队会一并删除其 Mod 文件；
- **🌍 完全公开**：上传时选「完全公开」（可署个人或团队名），进入广场列表，任何人可搜索/查看/下载；仍计入上传者所在空间配额。

### 4. 前端页面（全部适配手机）

- `/` 广场：像素 Hero、搜索（Mod名/作者/UniqueID/标签多关键词）、分类筛选、最新/最热/最大排序、骨架屏、分页；
- `/upload` 上传：步骤条 + 「上传文件 / 从网站导入」双模式；三形态选择器（含多 zip 一次选）或 Nexus / CurseForge 链接 → 空间/可见性/拆分发布 → 信息补充（标签输入、留空自动识别）→ 进度/加载提示 → 成功提示；重复时像素风确认弹窗询问覆盖；拆分结果逐条展示（新建/覆盖/跳过原因）；
- `/mine` 我的空间：配额进度、搜索、公开/取消公开、下载、删除、分页；
- `/teams` 团队：创建、成员邀请/移除/退出、解散、团队 Mod 列表与分页；
- `/mods/:id` 详情：子 Mod 清单（含 UniqueID/版本）、可展开文件树、预览图、下载计数、来源站 Badge、上传者可编辑/删除；
- `/auth` 登录/注册：标签页切换、图形验证码、锁定倒计时提示；
- 全局：白天 / 秋日 / 夜晚主题、界面音效开关、移动端抽屉导航、Toast 通知、焦点陷阱与键盘可用的弹窗。

### 手机端体验

- 底部四栏快捷导航（广场 / 上传 / 我的空间 / 团队），当前页高亮；点当前标签回到顶部
- 顶部品牌栏 + Drawer 设置：主题、音效、账号与退出登录
- 广场分类横向滑动；搜索框与搜索按钮同排，排序单独一行，减少首屏占用
- 我的空间使用紧凑横向卡片，封面 / 标题 / 标签 / 操作一屏可见；分页改为大号上一页 / 下一页
- 团队页在手机上优先展示所选团队详情，创建团队表单自动后置；没有团队时表单保持前置
- 页面切换自动回到顶部；分页后自动滚回结果列表 / 团队 Mod 列表
- 输入框统一 16px，避免 iOS Safari 聚焦缩放；主要触控目标不小于 40px
- 适配刘海屏与底部 Home 指示条：`env(safe-area-inset-*)` 应用于头部、底部导航、Toast、弹窗与抽屉
- 键盘输入时自动隐藏底部导航，避免遮挡；短横屏自动收起底部导航
- Toast 在手机上从顶部改为底部导航上方；确认弹窗按钮在窄屏保持并排且易点按

---

## 从 Nexus / CurseForge 自动导入

上传页的「从网站导入」支持粘贴以下链接：

```text
https://www.nexusmods.com/stardewvalley/mods/2400
https://www.curseforge.com/stardewvalley/mods/content-patcher
https://www.curseforge.com/projects/309243
```

流程：服务端解析链接 → 官方 API 读取元数据 → 申请最新主文件下载地址 → 下载到临时目录 → **复用现有上传整理流程**（查重/配额/覆盖/拆分/解析/打包/预览）→ 写入来源信息 → 清理临时文件。

### 服务器配置

| 变量 | 说明 |
|---|---|
| `NEXUS_API_KEY` | Nexus Mods v3 API Key；留空只能解析公开元数据，不能下载 |
| `NEXUS_APPLICATION_NAME` / `NEXUS_APPLICATION_VERSION` | 请求头中的应用标识 |
| `CURSEFORGE_API_KEY` | CurseForge for Studios API Key；留空无法解析 CurseForge |
| `CURSEFORGE_GAME_ID` | 可选，Stardew Valley 的 CurseForge gameId；留空自动发现 |
| `IMPORT_MAX_BYTES` | 自动导入单文件上限，默认 500MB |
| `IMPORT_TIMEOUT_MS` | 上游 API / 下载超时，默认 5 分钟 |
| `IMPORT_UPLOAD_TIMEOUT_MS` | 回环上传整理超时，默认 10 分钟 |

- **Nexus**：公开部署前请按 [Nexus API AUP](https://help.nexusmods.com/article/114-api-acceptable-use-policy) 注册应用；下载是否允许取决于 API Key（Premium）或作者是否为文件开启直接下载。免费账号被拒绝时，页面会提示到原站手动下载。
- **CurseForge**：需要申请 API Key；作者显式关闭第三方下载（`allowModDistribution=false`）时不会绕过，直接提示手动上传。
- **ModDrop**：其公共 API 只提供元数据，**没有文件下载端点**。平台不会抓取网页或绕过客户端权限，会在导入面板提示打开原页面下载后使用「上传文件」。
- **公开分享限制**：自动导入只允许存入个人或团队**私有空间**。公开到广场属于再分发，可能超出作者授权；如确有许可，请使用「上传文件」手动发布。后端也会拒绝带 `public` 的自动导入请求。
- 来源信息会写入数据库并通过 `source` 字段展示为 Nexus / CurseForge / ModDrop Badge，点击可回到原 Mod 页面。

## API 一览（`GET /api/health` 存活探针）

```
GET  /api/auth/captcha → {captchaId, svg}（5 分钟有效，一次性，用过即焚）
POST /api/auth/register {username, password, confirmPassword, captchaId, captcha} → {token, user}
POST /api/auth/login    {username, password, captchaId, captcha} → {token, user}
GET  /api/auth/me  (Bearer)

POST /api/mods/upload (Bearer, multipart) → 单条: ModRecord & {mode:'single', replaced?} ｜ 拆分: {mode:'split', created[], skipped[]}
GET  /api/mods?q=&category=&sort=newest|popular|biggest&page=&pageSize=
GET  /api/mods/mine (Bearer)
GET  /api/mods/team/:teamId (Bearer + 成员)
GET  /api/mods/:id  (公开随意；私有/团队按权限)
PATCH /api/mods/:id (Bearer, 上传者/团队创建者)
DELETE /api/mods/:id (Bearer, 上传者/团队创建者)
GET  /api/mods/:id/download  → 文件流（中文文件名兼容），下载数 +1
GET  /api/mods/:id/preview/:file → 预览图（缓存 1 天）

POST /api/teams (Bearer) {name, description}
GET  /api/teams/mine (Bearer)
GET  /api/teams/:id (Bearer + 成员，含 members)
POST /api/teams/:id/members (Bearer + 成员) {username}
DELETE /api/teams/:id/members/:userId (队长可移除他人；成员可自己退)
DELETE /api/teams/:id (仅创建者，级联删 Mod 文件)

GET  /api/storage/quota (Bearer) → {personal, teams[], serverLimits}

GET  /api/import/providers → { providers[] }  # 是否配置 API Key（不泄露密钥）
POST /api/import/resolve (Bearer) { url } → { preview }
POST /api/import (Bearer) { url, scope, teamId, visibility, split, title, description, category, tags, overwriteIds } → 同 /api/mods/upload 返回
```

统一错误格式：`{ "error": "中文原因" }`（去重上传 409 会多带 `existingId` 与 `canOverwrite`）。

**数据一致性策略（SQLite）**
- 用户名唯一、团队成员唯一由**数据库唯一约束**兜底，并发注册/重复邀请不可能成功；
- 「查重 + 配额 + 写入 / 覆盖」全部放进同一个 **IMMEDIATE 事务**，并发上传不会绕过检查；
- WAL 模式读写并发安全；优雅退出时自动关闭数据库（`SIGINT`/`SIGTERM`）；
- 首次启动检测到旧 `db.json` 会**自动迁移进 SQLite 并改名备份**（`.bak`），不会丢数据。

**登录安全策略**
- 注册需**两次输入密码**（前后端双重比对，不一致 400）＋**图形验证码**（SVG，一次性、用过即焚，5 分钟过期）；
- 登录同样需要图形验证码；密码错误时 401 会告知**本小时剩余尝试次数**；
- **每 1 小时内，同一 IP 或同一账号累计失败满 5 次即锁定**（双维度任一超限即锁，正确密码也被拒），返回 429 `登录失败次数过多，请 1 小时后再试` ＋ `retryAfter` 秒数；登录成功则清零双维度计数；
- 验证码端点另有 60 次/分钟/IP 限流；注册同 IP 每小时最多 10 个账号；
- 反代（nginx）部署请设 `TRUST_PROXY=1` 以取真实 IP；直连保持 `0` 防伪造。

---

## 常用命令

```bash
bun install                          # 安装全部依赖
bun run --filter backend dev         # 后端开发（热重载 :4000，bun --watch）
bun run --filter frontend dev        # 前端开发（:5173）
bun test                             # 前后端全部单测（后端 24 + 前端 12）
bun run typecheck                    # 三个包类型检查
bun run build                        # 构建 shared/backend/frontend
```

## 已知取舍

1. 数据库用 **SQLite（bun:sqlite）** 而非 Postgres：零安装、单文件、事务与唯一约束齐全；备份即拷贝 `backend/data/app.db`（或 `sqlite3 app.db ".backup x.db"`）。多实例横向扩展时再换 Postgres 即可（DAL 已集中在 `db.ts`）。
2. 后端需 **Bun 运行**（`bun:sqlite`）；前端构建产物是纯静态文件，任意静态服务器可托管。
3. 解压/打包用 `adm-zip`（纯 JS 零原生依赖）：`.rar/.7z` 请先转成 `.zip` 再传；超大包（>500MB）会被拒。
4. `shared/` 类型与 `backend/src/types.ts` 双份维护：避免 workspace 协议在某些包管理器下的解析坑，改字段时请两边同步。
