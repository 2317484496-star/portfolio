# 上线到 GitHub Pages

站点已经是纯静态的，不需要任何构建步骤。本地仓库、首次提交、`.nojekyll`、
`robots.txt`、`404.html` 都已就绪，只差「推到 GitHub」这一步。

---

## 方式 A：三条命令（推荐，你自己跑）

在项目目录下打开终端（Git Bash / PowerShell / CMD 都行）：

```bash
cd C:/Users/EDY/WorkBuddy/2026-10-16-13-21-52/portfolio

# 1) 在 GitHub 上新建一个公开仓库，名字填 portfolio，不要勾选任何初始化文件
#    地址：https://github.com/new

# 2) 关联远程并推送
git remote add origin https://github.com/2317484496-star/portfolio.git
git push -u origin main
```

第一次 `git push` 会弹出浏览器让你登录 GitHub 授权，授权一次之后就不用再登了。

**3) 开启 Pages**

仓库页 → `Settings` → 左侧 `Pages` →
`Build and deployment` 的 `Source` 选 **Deploy from a branch** →
`Branch` 选 **main**，目录选 **/ (root)** → 保存。

等 1～2 分钟，站点就会出现在：

```
https://2317484496-star.github.io/portfolio/
```

---

## 方式 B：一条命令（脚本代劳，需要 token）

如果你不想手动点，`tools/push-to-github.sh` 会把建仓库、推送、开 Pages 一次做完：

```bash
cd C:/Users/EDY/WorkBuddy/2026-10-16-13-21-52
bash tools/push-to-github.sh <你的 GitHub Token> [仓库名]
```

Token 需要一个 **classic token 勾选 `repo` + `workflow`**，
或 **fine-grained token 授予 `Contents: Read and write` + `Pages: Read and write` + `Administration: Read and write`**。
用完建议立刻在 GitHub 设置里撤销。

---

## 本地预览

```bash
# 站点
node ../tools/serve.mjs 8099
# 打开 http://127.0.0.1:8099/
```

也可以直接双击 `index.html`（文件协议下 `U.DEV` 判定为真，素材槽位提示会显示）。

---

## 素材与文案替换

页面上的主视觉、剧照、视频目前都是**程序化占位视觉** —— 由每个作品的主题色
实时生成，用来确认版式与交互。真实素材按下面的命名放进对应目录即可自动替换，
不需要改任何代码。

| 文件 | 用途 | 建议尺寸 |
| --- | --- | --- |
| `assets/works/NN/cover.jpg` | 轮盘中心封面 / 列表卡片 / 悬停卡 | 900 × 1200（3:4） |
| `assets/works/NN/hero.jpg` | 作品页主视觉 | 竖屏作品 1440 × 2560；横屏作品 2560 × 1440 |
| `assets/works/NN/poster.jpg` | 视频封面帧 | 同 hero |
| `assets/works/NN/video.mp4` | 成片（有则自动播放，没有就退回静态） | 1080 × 1920 或 1920 × 1080 |
| `assets/works/NN/still-01…06.jpg` | 剧照带 | 1280 × 720（第 4 张按 3:4 裁切） |

`NN` = `01` … `10`，对应作品的编号顺序。

文字内容全部集中在 `js/data.js`：

- `WB.SITE` —— 站点名、署名、联系方式、合作状态、能力条目、工作流程、工具链
- `WB.WORKS[i]` —— 每部作品的 `logline`（一句话）、`synopsis`（梗概）、
  `note`（导演/设计说明）、`facts`（规格）、`credits`（演职员）、
  `palette`（色彩配方）、`links`（外部链接）、`tags`

文件顶部有一段 **待填写清单**，逐条替换即可。

---

## 方式 C：只有 api.github.com 通、`git push` 走不通时

有些网络环境（公司代理、部分云开发环境）只放行 `api.github.com`，
连 `github.com:443` 会卡在 `CONNECT tunnel 502`。这时用 Git Data API 推送：

```bash
python tools/push-api.py <你的 GitHub Token> "提交说明"
```

它不依赖本地 git 历史：拉远端最新 tree → 每个文件算 blob 哈希比对 →
只上传真正变了的文件 → 建树 → 建 commit → 移动 main。重复运行是幂等的
（内容一致就直接退出），所以可以当作「同步一下」随手用。

---

## 需要注意的两件事

1. **每一层的真实素材检测都是惰性的**：某个文件缺失只会退化成占位视觉，
   不会报错、不会裂图，也不会影响其余部分。补齐后刷新即可。
2. **`U.DEV` 门控**：素材槽位清单、命名规范这类「写给作者看」的提示，
   只在本地（`127.0.0.1` / `localhost` / `file://`）或显式加 `?dev` 时显示，
   线上自动隐藏 —— 所以线上页面不会挂着施工说明。
