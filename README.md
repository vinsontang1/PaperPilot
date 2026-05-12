[**English**](README_EN.md) | 中文

<p align="center">
  <img src="figs/title.png" alt="PaperPilot" width="100%">
</p>

<p align="center">
  <b>PaperPilot</b> — 一个 AI Agent Skill，让你在对话中完成学术论文的阅读、标注、翻译与知识管理。
</p>

---

## 这是什么

PaperPilot 是一个 **Claude Code Skill**：你只需要在 Agent 对话框里用自然语言下达指令，Agent 就会自动调用后台服务完成论文解析、多层级摘要生成、逐段翻译、分类归档等全部工作。你不需要手动操作任何按钮——**对话即操作**。

## 功能

- **三档位阅读**
  - 档位 1（摘要）：AI 生成 ≤1000 字中文摘要 + 图表侧边栏
  - 档位 2（精解）：按论文 Section 逐节深入分析 + 内嵌图表 + KaTeX 公式
  - 档位 3（原文+翻译）：左侧 PDF 原文渲染 + 右侧逐段中文翻译
- **智能预处理**：一句话让 Agent 调用 MinerU 解析 PDF → 提取段落/图表/公式 → 并行生成摘要/精解/翻译
- **划词标注**：高亮 / 下划线 / 评论 / 向 Agent 提问
- **分类管理**：文件夹层级 + 拖拽迁移 + 对话式智能归档
- **分类引用文稿**：Agent 递归阅读分类下所有论文，生成带交叉引用的综述
- **数学公式**：KaTeX 渲染 `$...$` 和 `$$...$$`
- **浏览器上传**：首页直接上传 PDF，或放入 `data/origin/` 后 Rescan

## 快速开始

### 方式一：让 Agent 帮你安装（推荐）

在 Claude Code 对话框中直接说：

```
帮我安装 PaperPilot skill，仓库地址是 https://github.com/vinsontang1/PaperPilot
```

Agent 会自动完成：克隆仓库 → 安装依赖 → 注册 Skill → 引导你配置 MinerU Token → 启动服务。

### 方式二：手动安装

**1. 克隆项目**

```bash
git clone https://github.com/vinsontang1/PaperPilot.git
cd PaperPilot
```

**2. 安装 Python 依赖**

```bash
pip install -r requirements.txt
```

需要 Python 3.10+。

**3. 配置 MinerU API Token**

论文解析由 [MinerU](https://mineru.net/) 云端服务承担（免费 1000 页/天）。

```bash
# 1. 注册登录：https://mineru.net/
# 2. 复制 Token：https://mineru.net/apiManage/token
# 3. 设置环境变量：
export MINERU_TOKEN='粘贴你复制的 token'

# 建议写入 shell 配置（永久生效）
echo "export MINERU_TOKEN='你的token'" >> ~/.bashrc && source ~/.bashrc
```

**4. 注册 Skill**

```bash
mkdir -p ~/.claude/skills
ln -sf "$(pwd)/skill" ~/.claude/skills/paper_pilot
```

**5. 启动服务**

```bash
bash start.sh
```

浏览器打开 http://127.0.0.1:7856/ ，然后在 Agent 对话中说「处理最新的文献」即可开始使用。

## 与 Agent 对话示例

**预处理论文**

```
用户：处理最新的未处理文献

Agent：发现 1 篇未处理文献：2403-14144v2.pdf
       正在调用 MinerU 解析（10 页）…
       已提取 172 段 + 8 张图表
       标题：Understanding the Ranking Loss for Recommendation with Sparse User Feedback
       正在并行生成摘要/精解/翻译…
       ✅ 全部完成！建议归档到哪里？
       → recommendation/losses（推荐）
       → 新建分类
       → 暂不归档

用户：recommendation/losses

Agent：✅ 已归档到 recommendation/losses
```

**智能归档**

```
用户：把未归档的文献都归档一下

Agent：发现 3 篇未归档文献，逐篇分析中…
       1. ThinkRec → recommendation/llm4rec ✅
       2. SlideCoder → document-generation/slides ✅
       3. OpenOneRec → recommendation/llm4rec ✅
```

**分类综述**

```
用户：帮我总结 recommendation 分类下所有论文的联系

Agent：已读取 3 篇论文摘要，正在生成引用文稿…
       ✅ 已写入 recommendation 分类首页
```

**迁移论文**

```
用户：把 ThinkRec 迁移到 recommendation/llm4rec

Agent：✅ 已迁移
```

## 项目结构

```
PaperPilot/
├── skill/                     # Skill 文档（Agent 读取这些指令来工作）
│   ├── SKILL.md               # 入口：触发条件 + 规则 + 方法索引
│   └── methods/               # 12 个方法文件
│       ├── preprocess.md      # 预处理流程
│       ├── classify.md        # 智能分类
│       ├── archive.md         # 批量归档
│       ├── answer-question.md # 回答标注中的提问
│       ├── folder-analysis.md # 分类引用文稿
│       ├── _prompt-*.md       # Sub-agent prompt 模板
│       └── api-reference.md   # REST API 契约
├── server/                    # FastAPI 后端
├── web/                       # 前端（Tailwind + KaTeX + PDF.js）
├── scripts/
│   ├── mineru_extract.py      # MinerU API 适配器
│   └── preprocess_paper.py    # 一键预处理脚本
├── data/                      # 用户数据
├── start.sh / stop.sh
├── requirements.txt
└── figs/                      # README 图片
```

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.10+ / FastAPI / Uvicorn |
| 前端 | Vanilla JS / Tailwind CSS (CDN) / PDF.js / KaTeX / Marked.js |
| PDF 解析 | MinerU API (VLM model) |
| AI 集成 | Claude Code Skill 协议 |
| 数据存储 | 本地 JSON 文件（无数据库） |

## 环境变量

| 变量 | 必须 | 说明 |
|------|------|------|
| `MINERU_TOKEN` | 是 | MinerU API Token，获取：https://mineru.net/apiManage/token |

## License

MIT
