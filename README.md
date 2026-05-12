中文 | [**English**](README_EN.md)

# PaperPilot

> AI Agent 驱动的学术论文阅读、标注、翻译与知识管理系统

【【宣传图 prompt: A clean, modern hero banner for an academic paper reading tool called "PaperPilot". Split-screen layout showing a PDF paper on the left and Chinese translation with highlighted annotations on the right. Indigo/violet accent color scheme, minimal flat design, dark sidebar with folder tree navigation. Include subtle icons for highlight, underline, comment, and AI chat. Text overlay: "PaperPilot — AI-Powered Academic Reading". 16:9 aspect ratio, suitable for GitHub README header.】】

## 功能一览

【【功能概览截图 prompt: Screenshot-style illustration showing PaperPilot's main interface with left sidebar (folder tree with categories like "recommendation/llm4rec"), center area with paper cards showing title, status badges (preprocessed/unprocessed), and action buttons (open, move, delete). Notion/Linear style UI with indigo accent colors. Clean and minimal.】】

- **三档位阅读**
  - 档位 1（摘要）：AI 生成 ≤1000 字中文摘要 + 图表侧边栏
  - 档位 2（精解）：按论文 Section 逐节深入分析 + 内嵌图表 + KaTeX 公式渲染
  - 档位 3（原文+翻译）：左侧 PDF 原文渲染 + 右侧逐段中文翻译
- **智能预处理**：一条命令调用 MinerU API 解析 PDF → 自动提取段落/图表/公式 → 重命名 → 并行生成摘要/精解/翻译
- **划词标注**：在翻译/摘要/精解上划词 → 高亮 / 下划线 / 评论 / 向 Agent 提问
- **分类管理**：文件夹层级分类 + 拖拽迁移 + 智能归档
- **分类引用文稿**：Agent 递归阅读分类下所有论文摘要，生成带交叉引用的综述文稿
- **数学公式**：KaTeX 渲染 `$...$` 和 `$$...$$`
- **图表展示**：从 PDF 自动提取图/表，按文中顺序排列，点击放大查看
- **浏览器上传**：首页点击"添加文献"直接上传 PDF

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/vinsontang1/PaperPilot.git
cd PaperPilot
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

需要 Python 3.10+。

### 3. 配置 MinerU API Token

论文解析由 [MinerU](https://mineru.net/) 云端服务承担（免费额度 1000 页/天）。

1. 打开 https://mineru.net/ ，注册并登录
2. 进入 Token 管理页面：https://mineru.net/apiManage/token
3. 点击「复制」获取你的 API Token
4. 设置环境变量：

```bash
export MINERU_TOKEN='粘贴你复制的 token'

# 建议写入 shell 配置文件（永久生效）
echo "export MINERU_TOKEN='你的token'" >> ~/.bashrc
source ~/.bashrc
```

### 4. 启动服务

```bash
bash start.sh
```

浏览器打开 http://127.0.0.1:7856/ 即可使用。

### 5. 注册 Agent Skill（可选，让 AI Agent 自动驱动）

```bash
mkdir -p ~/.codebuddy/skills
ln -sf "$(pwd)/skill" ~/.codebuddy/skills/paper_pilot
```

## 与 Agent 对话示例

```
用户：处理最新的未处理文献

Agent：发现 1 篇未处理文献：2403-14144v2.pdf
       正在调用 MinerU 解析（10 页）…
       已提取 172 段 + 8 张图表
       标题推断：Understanding the Ranking Loss for Recommendation with Sparse User Feedback
       正在并行生成摘要/精解/翻译…
       ✅ 全部完成！建议归档到哪里？
       → recommendation/losses（推荐）
       → 新建分类
       → 暂不归档

用户：recommendation/losses

Agent：✅ 已归档到 recommendation/losses
       访问：http://127.0.0.1:7856/#/paper/understanding-the-ranking-loss-...
```

```
用户：帮我总结 recommendation 分类下所有论文

Agent：已读取 3 篇论文摘要，正在生成引用文稿…
       ✅ 已写入 recommendation 分类首页
```

更多使用方式请查看[完整中文文档](README_ZH.md)。

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.10+ / FastAPI / Uvicorn |
| 前端 | Vanilla JS / Tailwind CSS (CDN) / PDF.js / KaTeX / Marked.js |
| PDF 解析 | MinerU API (VLM model) |
| AI 集成 | CodeBuddy Code Skill 协议 |
| 数据存储 | 本地 JSON 文件（无数据库） |

## License

MIT
