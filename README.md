# 作品集 / SELECTED WORKS

一个零构建、单页面的交互式作品集站点。核心交互是**右侧轮盘导航**——拖拽 / 滚轮 / 方向键旋转，停稳后自动确认切换，也可直接点击某一段。

- 技术栈：原生 HTML / CSS / JavaScript + 本地 vendor 化的 GSAP 3.13、Lenis
- 无构建步骤、无外部 CDN、无后端；WebGL 背景为手写片元着色器
- 可直接双击 `index.html` 打开，也可托管在任意静态服务器

---

## 上线

见 [`DEPLOY.md`](./DEPLOY.md) —— 三条命令推到 GitHub Pages，
或用 `tools/push-to-github.sh` 一条命令做完（建仓库 + 推送 + 开 Pages）。


## 一、放置你的素材

把文件按下面的命名放进 `assets/works/01` … `assets/works/10`（编号与轮盘上的序号一一对应）。
**文件名必须一致**，放进去就会自动生效，页面不会出现裂图。

| 文件 | 用途 | 建议规格 | 必填 |
|---|---|---|---|
| `cover.jpg` | 轮盘中心盘读数 / 列表视图封面 | 3:4 竖版，900×1200 | 推荐 |
| `hero.jpg` | 详情页主视觉 | 16:9，2560×1440 | 推荐 |
| `poster.jpg` | 视频封面 | 16:9，1920×1080 | 有视频时 |
| `video.mp4` | 正片 / 预告片 | H.264 mp4 | 可选 |
| `still-01.jpg` … `still-06.jpg` | 剧照，进灯箱 | 16:9，1280×720 | 可选 |

### 作品编号对应关系

| 编号 | 目录 | 作品 |
|---|---|---|
| 01 | `assets/works/01` | 买到等身手办，她夜里觉醒了？ |
| 02 | `assets/works/02` | 重生拒嫁恶皇子，我转头当上太子妃 |
| 03 | `assets/works/03` | 从现在起，我将暂停世界一分钟 |
| 04 | `assets/works/04` | 这个邪神可太正了 |
| 05 | `assets/works/05` | 末日重启，魔女才是第一生产力 |
| 06 | `assets/works/06` | 斩仙台上何人？灵台方寸山关门弟子 |
| 07 | `assets/works/07` | 超能映射 |
| 08 | `assets/works/08` | 和平精英 |
| 09 | `assets/works/09` | 古相思曲 |
| 10 | `assets/works/10` | 大河密藏 |

**素材没到位时**，页面会自动渲染程序化生成的占位视觉（按每部作品的主题色生成海报 / 横幅 / 剧照），所以版式和交互现在就能完整预览。

---

## 二、替换文字内容

所有文案集中在 **`js/data.js`** 一个文件里：

- `WB.SITE` — 站点标题、年份、作者信息、联系方式、合作状态、能力条目、工作经历、工具链
- `WB.WORKS[i]` — 每部作品的：
  - `logline` 一句话简介（显示在标题下方、悬停预览卡里）
  - `synopsis` 剧情简介（数组，每个元素是一段）
  - `note` 创作手记 / 分镜思路
  - `facts` 作品信息表 `[["形态","竖屏短剧 · 9:16"], …]`
  - `tags` 标签数组
  - `links` 外链 `[{ label:"观看正片", href:"https://…", off:false }]`
  - `accent` / `accent2` 该作品的主题色（决定整站换色）
  - `role` 你在该项目里的角色（执行导演 · 主导制作 / 参与制作 …）

`data.js` 里凡是需要你填的地方都标了 `（待填写）` 或 `TODO`，搜索这两个词即可定位。

---

## 三、本地预览

```bash
# 任选一种
python -m http.server 8099
npx serve .
```

然后打开 <http://127.0.0.1:8099/>。直接双击 `index.html`（file:// 协议）也能跑。

- `?skipintro=1` 跳过开场加载动画
- `#作品id` 深链直达，例如 `#evil-god`

---

## 四、部署到 GitHub Pages

```bash
git init
git add .
git commit -m "portfolio"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

然后在仓库 **Settings → Pages** 里把 Source 设为 `Deploy from a branch`，分支选 `main`、目录选 `/ (root)`，保存。
一两分钟后访问 `https://<你的用户名>.github.io/<仓库名>/`。

仓库里已带 `.nojekyll`，避免 GitHub Pages 用 Jekyll 处理静态文件。

---

## 五、操作与快捷键

| 操作 | 方式 |
|---|---|
| 切换作品 | 拖拽轮盘 / 滚轮 / `↑` `↓` `←` `→` / 点击分段 / 上一部·下一部 |
| 直达第 N 部 | 数字键 `1` – `9`，`0` 代表第 10 部 |
| 第一部 / 最后一部 | `Home` / `End` |
| 上下滚动作品页 | `PageUp` / `PageDown` |
| 复制当前作品链接 | 作品页左上「复制链接」按钮，或 `C` |
| 列表视图 | 顶栏按钮 或 `L` |
| 关于 | 顶栏按钮 或 `A` |
| 全屏 | 顶栏按钮 或 `F` |
| 灯箱 | 点击剧照；`←` `→` 或左右滑动切换，双击图片放大，`Esc` 关闭 |
| 关闭任意覆盖层 | `Esc` |
| 快捷键面板 | `?` 或 `/` |

轮盘本身是可聚焦的 `role="slider"` 控件，支持键盘与读屏；列表视图是它的线性等价物，同时供搜索引擎抓取。
开启「减少动态效果」的系统设置后，站点会关闭惯性、扫光转场与颗粒动效。
覆盖层打开时 `Tab` 会被约束在层内；作品切换会通过 `aria-live` 播报给读屏。

---

## 六、目录结构

```
index.html            单页骨架（语义化，无脚本时可降级为线性列表）
css/
  tokens.css          设计令牌、重置、字体栈
  chrome.css          外壳、顶栏、底栏、HUD、光标、预加载
  wheel.css           右侧轮盘
  stage.css           作品详情舞台
  overlays.css        列表视图、关于、灯箱、提示条
  responsive.css      断点适配
js/
  data.js             ★ 唯一内容源（站点信息 + 10 部作品）
  util.js             数学、DOM、文本动效、颜色、程序化占位视觉
  gl.js               WebGL 背景（手写着色器）
  wheel.js            轮盘导航引擎
  stage.js            舞台渲染与转场
  ui.js               光标、灯箱、列表视图、关于、提示、预加载
  app.js              主编排与接线
vendor/               GSAP 3.13 / Lenis（本地化，无 CDN 依赖；实际用到的才留）
assets/works/01…10/   素材槽位
tools/shot.mjs        开发自检工具（CDP 截图 + 控制台采集），部署时可删
```
