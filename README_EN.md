[**中文**](README_ZH.md) | English

# PaperPilot

> AI Agent-powered academic paper reading, annotation, translation & knowledge management system

【【Hero banner prompt: A clean, modern hero banner for an academic paper reading tool called "PaperPilot". Split-screen layout showing a PDF paper on the left and Chinese translation with highlighted annotations on the right. Indigo/violet accent color scheme, minimal flat design, dark sidebar with folder tree navigation. Include subtle icons for highlight, underline, comment, and AI chat. Text overlay: "PaperPilot — AI-Powered Academic Reading". 16:9 aspect ratio, suitable for GitHub README header.】】

## Features

【【Feature overview screenshot prompt: Screenshot-style illustration showing PaperPilot's main interface with left sidebar (folder tree with categories like "recommendation/llm4rec"), center area with paper cards showing title, status badges (preprocessed/unprocessed), and action buttons (open, move, delete). Notion/Linear style UI with indigo accent colors. Clean and minimal.】】

- **Three-tier Reading**
  - Tier 1 (Summary): AI-generated ≤1000-word Chinese summary + figure sidebar
  - Tier 2 (Deep Analysis): Section-by-section explanation + embedded figures + KaTeX formulas
  - Tier 3 (Original + Translation): PDF rendering on the left + paragraph-aligned Chinese translation on the right
- **Smart Preprocessing**: One command to call MinerU API → extract paragraphs/figures/formulas → rename → parallel generation of summary/analysis/translation
- **Text Annotation**: Select text in translation/summary/analysis → highlight / underline / comment / ask Agent
- **Category Management**: Hierarchical folder classification + drag-and-drop migration + smart archiving
- **Citation Articles**: Agent recursively reads all paper summaries under a category and generates a cross-referenced overview
- **Math Rendering**: KaTeX support for `$...$` and `$$...$$`
- **Figure Display**: Auto-extracted figures/tables from PDF, ordered by appearance, click to zoom
- **Browser Upload**: Upload PDF directly from the homepage

## Quick Start

### 1. Clone

```bash
git clone https://github.com/vinsontang1/PaperPilot.git
cd PaperPilot
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

Requires Python 3.10+.

### 3. Configure MinerU API Token

PDF parsing is powered by [MinerU](https://mineru.net/) cloud service (free quota: 1000 pages/day).

1. Go to https://mineru.net/ and sign up
2. Visit Token management: https://mineru.net/apiManage/token
3. Click "Copy" to get your API Token
4. Set environment variable:

```bash
export MINERU_TOKEN='paste your token here'

# Recommended: persist in shell config
echo "export MINERU_TOKEN='your_token'" >> ~/.bashrc
source ~/.bashrc
```

### 4. Start the Server

```bash
bash start.sh
```

Open http://127.0.0.1:7856/ in your browser.

### 5. Register Agent Skill (Optional)

```bash
mkdir -p ~/.codebuddy/skills
ln -sf "$(pwd)/skill" ~/.codebuddy/skills/paper_pilot
```

## Usage

### Add Papers

- **Option A**: Click "📎 Add Paper" on the homepage to upload PDF
- **Option B**: Place PDF files in `data/origin/`, then click Rescan on the homepage

### Preprocess Papers (Chat with Agent)

【【Tier navigation screenshot prompt: Screenshot showing PaperPilot's tier navigation - three tabs labeled "Summary", "Analysis", "Original+Translation" with the summary tab active. Below shows a Chinese summary with metadata block, key method points, and a figure placeholder rendered as an embedded image with caption. Indigo accent, clean typography.】】

Tell the Agent:

```
User: Process the latest unprocessed paper
```

The Agent will automatically:
1. Call MinerU to parse the PDF (paragraphs + figures + formulas)
2. Infer the paper title and rename
3. Generate three tiers of content in parallel (summary / analysis / translation)
4. Ask you which category to archive into

### Read Papers

【【Reading interface screenshot prompt: Screenshot of PaperPilot's tier 2 (detail) view. Left sidebar shows figure thumbnails (fig001-fig008). Center shows a Chinese detailed explanation with section headings, KaTeX formulas rendered beautifully, and GFM tables. Right sidebar shows annotation list with highlight/underline/comment items. Clean academic reading experience.】】

| Tier | Best For | Content |
|------|----------|---------|
| Summary | Quick overview | ≤1000 words + figure sidebar |
| Analysis | Deep understanding | Section-by-section + formulas + tables |
| Original+Translation | Side-by-side reading | Left: PDF, Right: Chinese translation |

### Annotation & Q&A

Select text in summary/analysis/translation, then use the fixed toolbar:

- 🟨 **Highlight** (5 colors)
- **U̲ Underline**
- 💬 **Comment** (supports Markdown)
- 🤖 **Ask Agent**

### Smart Archiving

```
User: Archive all unfiled papers
```

Agent reads each summary → proposes categories → you confirm.

### Category Overview

```
User: Summarize all papers under the recommendation category
```

Agent generates a citation-style article with cross-reference links.

## Chat Examples

```
User: Process this paper

Agent: Found 1 unprocessed paper: 2403-14144v2.pdf
       Calling MinerU to parse (10 pages)...
       Extracted 172 paragraphs + 8 figures
       Title: Understanding the Ranking Loss for Recommendation with Sparse User Feedback
       Generating summary/analysis/translation in parallel...
       ✅ Done! Where should we archive it?
       → recommendation/losses (Recommended)
       → Create new category
       → Skip archiving

User: recommendation/losses

Agent: ✅ Archived to recommendation/losses
```

## Project Structure

```
PaperPilot/
├── skill/                     # Agent Skill docs
│   ├── SKILL.md               # Entry: triggers + rules + method index
│   └── methods/               # 12 method files
├── server/                    # FastAPI backend
├── web/                       # Frontend (Tailwind + KaTeX + PDF.js)
├── scripts/
│   ├── mineru_extract.py      # MinerU API adapter
│   └── preprocess_paper.py    # One-click preprocessing script
├── data/                      # User data
├── start.sh / stop.sh
├── requirements.txt
└── .gitignore
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.10+ / FastAPI / Uvicorn |
| Frontend | Vanilla JS / Tailwind CSS (CDN) / PDF.js / KaTeX / Marked.js |
| PDF Parsing | MinerU API (VLM model) |
| AI Integration | CodeBuddy Code Skill Protocol |
| Storage | Local JSON files (no database) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MINERU_TOKEN` | Yes | MinerU API Token. Get it at: https://mineru.net/apiManage/token |

## Stop the Server

```bash
bash stop.sh
```

## License

MIT
