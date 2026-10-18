# 🌾 星露谷 Mod 交流平台（Stardew Mods Platform）

支持 **电脑 / 手机端** 访问的星露谷 Mod 分享社区：玩家可以上传**包含多个 Mod 的文件夹、`.zip` 压缩包或单个 Mod 文件**，平台自动解析 `manifest.json`、推断分类、生成文件树与预览，并提供**个人存储空间（2GB）/ 团队存储空间（10GB）/ 完全公开分享**。

- 技术栈：**React 18 + TypeScript + Vite**（前端） / **Node + Express + TypeScript**（后端）
- UI：[`animal-island-ui`](https://github.com/guokaigdg/animal-island-ui/tree/main) 可爱岛屿风格 + 自研响应式布局（手机优先，汉堡菜单、单列卡片、触屏友好的上传器）
- 后端与前端在**同一个目录**（本文件夹 Monorepo），ursor 开箱即用
- 数据存储：文件系统 + JSON 元数据库，**无需安装 MySQL / Postgres / Docker**，个人服务器 / NAS / 旧电脑都能跑

> 已验证：`tsc` 类型检查（前/后端/共享）全过、后端 7 个单测全过、21 项端到端链路（注册→上传→整理→下载→去重→团队）全过、前后端生产构建全过。

---

## 目录结构

```
stardew-mods-platform/
├── package.json            # Monorepo 根（bun workspaces）
├── shared/src/index.ts     # 前后端共享类型：Mod/团队/配额/分类推断
├── backend/
│   ├── src/
│   │   ├── index.ts        # 启动入口（建目录、加载库、监听端口）
│   │   ├── app.ts          # Express 装配：helmet/cors/限流/路由/错误处理
│   │   ├── config.ts       # 端口/JWT/配额/上限（均可 env 覆盖）
│   │   ├── db.ts           # 文件 JSON 数据库（原子落盘、串行写）
│   │   ├── types.ts        # 后端类型（与 shared 同步）
│   │   ├── middleware/     # auth（Bearer JWT）/ errorHandler
│   │   ├── routes/         # auth / mods / teams / storage
│   │   ├── services/
│   │   │   ├── modParser.ts      # ★自动整理：zip安全解压/manifest解析/分类/文件树
│   │   │   └── storageService.ts # 配额统计/文件落盘/预览图/删除清理
│   │   └── utils/          # auth(jwt/bcrypt) / validation(zod) / text
│   ├── tests/modParser.test.ts   # 解析器单测（bun test）
│   ├── data/               # 运行数据（db.json + storage/ + tmp/，git 不提交）
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── main.tsx / App.tsx / index.css   # 入口、路由、田园响应式样式
    │   ├── api/client.ts   # 类型化 API 封装（含上传进度）
    │   ├── context/AuthContext.tsx
    │   ├── components/     # island（可爱UI封装）/ Layout / ModCard / QuotaBar / UploadDropzone
    │   └── pages/          # Home（广场）/ Upload / MyMods / Team / ModDetail / Auth
    └── vite.config.ts      # /api 与 /files 代理到后端 :4000
```

---

## 快速启动（本地开发）

环境要求：**Bun ≥ 1.0**（本机无 Node 也可，Bun 兼容运行前后端；有 Node 则 `bun` 换成 `npm` 同样可用）。

```bash
cd stardew-mods-platform

# 1. 安装依赖（根目录一次装完三个包）
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

手机访问：保证手机与电脑同一 Wi-Fi，用电脑 IP 打开，如 `http://192.168.1.10:5173`（vite 已开 `--host`）。

---

## 生产构建与部署

```bash
# 构建前后端
bun run --filter backend build
bun run --filter frontend build

# 启动后端（生产）
cd backend && PORT=4000 JWT_SECRET=请换成随机长字符串 bun dist/index.js
# 或用 node：PORT=4000 JWT_SECRET=xxx node dist/index.js
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

---

## 核心功能说明

### 1. 三种上传形态（`POST /api/mods/upload`，multipart）

| 形态 | 前端操作 | 后端处理 |
|---|---|---|
| 单个 Mod 文件（`.dll` / `.json` / `.png` / `.xnb`…） | 「选文件」点选 1 个 | 原样存储，按扩展名/内容推断分类 |
| `.zip` 压缩包（含 1 个或 N 个 Mod） | 「选文件」点选 zip / 拖拽 | 安全解压 → 找出**所有** `manifest.json` → 1 个记为单 Mod，≥2 个记为**合集包**并汇总子 Mod 名单 |
| 整个文件夹 | 「选整个文件夹」（`webkitdirectory`，手机自动降级为文件选择）/ 多选拖拽 | 按 `relativePaths` 还原目录树 → 解析 → 打包为 `archive.zip` 供一键下载 |

字段：`files`（文件，可多个）＋ `relativePaths`（与文件顺序对齐的相对路径 JSON 数组）＋ `scope/teamId/visibility/title/description/category/tags`。

### 2. 自动整理（`backend/src/services/modParser.ts`）

- 兼容 SMAPI 标准 `manifest.json`（`Name/Author/Version/Description/UniqueID/ContentPackFor/Dependencies`），容忍 BOM；
- 分类推断（`Content Patcher / 美化贴图 / 人物肖像 / 农场地图 / 汉化 / 工具辅助 / SMAPI框架 / 功能玩法 / 合集包 / 其他`），多 Mod 自动归为**合集包**；
- 生成**文件树**（1200 节点上限）、统计文件数/体积、提取最多 6 张**预览图**（`preview/screenshot/cover` 优先）；
- 同一计费空间下 `UniqueID` 重复上传返回 **409 + 已有记录 id**，避免广场被重复包淹没；
- 安全：zip 条目路径穿越中和（不出目标目录）、zip 炸弹防护（条目数/解压体积上限）、文件名非法字符过滤。

### 3. 三种存储空间

- **🏠 个人空间**：默认私有，可单个公开；占用个人 2GB 配额；
- **👥 团队空间**：创建团队 → 用对方用户名邀请成员 → 上传时选该团队；团队内可见或公开；占用团队 10GB 配额；解散团队会一并删除其 Mod 文件；
- **🌍 完全公开**：上传时选「完全公开」（可署个人或团队名），进入广场列表，任何人可搜索/查看/下载；仍计入上传者所在空间配额。

### 4. 前端页面（全部适配手机）

- `/` 广场：搜索（Mod名/作者/UniqueID/标签多关键词）、分类 chips、最新/最热/最大排序、分页；
- `/upload` 上传：三形态选择器 → 空间/可见性 → 信息补充（留空即自动识别）→ 进度条 → 成功跳详情；
- `/mine` 我的空间：配额条、搜索、公开/取消公开、下载、删除；
- `/teams` 团队：创建、成员邀请/移除/退出、解散、团队 Mod 列表；
- `/mods/:id` 详情：子 Mod 清单（含 UniqueID/版本）、文件树、预览图、下载计数、上传者可编辑/删除；
- `/auth` 登录/注册。

---

## API 一览（`GET /api/health` 存活探针）

```
GET  /api/auth/captcha → {captchaId, svg}（5 分钟有效，一次性，用过即焚）
POST /api/auth/register {username, password, confirmPassword, captchaId, captcha} → {token, user}
POST /api/auth/login    {username, password, captchaId, captcha} → {token, user}
GET  /api/auth/me  (Bearer)

POST /api/mods/upload (Bearer, multipart) → ModRecord
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
```

统一错误格式：`{ "error": "中文原因" }`（去重上传 409 会多带 `existingId`）。

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
bun run --filter backend dev         # 后端开发（热重载 :4000）
bun run --filter frontend dev        # 前端开发（:5173）
bun run --filter backend test        # 后端单测（解析器 7 用例）
bun run --filter backend typecheck   # 后端类型检查
bun run --filter frontend typecheck  # 前端类型检查
bun run --filter backend build       # 后端构建到 backend/dist
bun run --filter frontend build      # 前端构建到 frontend/dist
```

## 已知取舍

1. 数据库用 **JSON 文件 + 原子落盘** 而非 Postgres：零运维、备份即拷贝 `backend/data/`；代价是超大规模并发写入不如专业数据库（交流平台量级足够）。
2. 解压/打包用 `adm-zip`（纯 JS 零原生依赖）：`.rar/.7z` 请先转成 `.zip` 再传；超大包（>500MB）会被拒。
3. `shared/` 类型与 `backend/src/types.ts` 双份维护：避免 workspace 协议在某些包管理器下的解析坑，改字段时请两边同步。
