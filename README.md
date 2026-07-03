<p align="center">
  <img src="public/favicon.svg" alt="Perler" width="80" />
</p>

<h1 align="center">DotArt</h1>

<p align="center">
  把喜欢的图片变成<strong>拼豆图纸</strong> —— 上传图片，自动匹配豆色，生成可编辑的网格图纸，支持导出 Excel。
</p>

<p align="center">
  🔗 <a href="https://jxufe-acm.cn/perler/"><strong>在线使用</strong></a>
</p>

---

## ✨ 功能

| 功能 | 说明 |
|------|------|
| 🖼️ **图片上传 & 裁剪** | 支持上传图片，自由裁剪或按固定比例裁剪，支持套索选区 |
| 🎨 **智能配色** | 多种色卡可选，自动将每个像素格匹配到最接近的豆色 |
| 🌈 **三种抖动算法** | 无抖动 / Floyd-Steinberg / Atkinson，让渐变过渡更自然 |
| 🔬 **像素采样模式** | **融合采样**（区域平均，平滑）/ **主色提取**（最频色，扁平风格） |
| ✏️ **图纸编辑** | 画笔 / 橡皮擦 / 油漆桶 / 吸管，支持撤销重做 |
| 🧺 **色卡管理** | 内置色卡 + 自定义创建，支持增删改查，数据存储在浏览器 IndexedDB |
| 📊 **Excel 导出** | 导出为 `.xlsx`，记录每个格子的色号，方便照着拼 |
| 🎬 **流畅动画** | GSAP 驱动的页面过渡与卡片动效 |

## 🛠️ 技术栈

- **React 19** + **TypeScript**
- **Vite** 构建
- **Zustand** 状态管理
- **GSAP** 动画
- **IndexedDB** (idb) 本地持久化
- **ExcelJS** 导出
- **OKLab** 色彩空间做色差计算

## 🚀 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

## 📦 部署

部署在 [jxufe-acm.cn/perler/](https://jxufe-acm.cn/perler/)

构建后 `dist/` 目录即为静态文件，部署到任意静态服务器即可。如果部署在子路径（如 `/perler/`），需在 `vite.config.ts` 中配置 `base: '/perler/'`。

## 📄 License

MIT
