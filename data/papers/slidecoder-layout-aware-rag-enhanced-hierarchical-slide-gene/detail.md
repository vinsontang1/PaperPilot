# SlideCoder: Layout-aware RAG-enhanced Hierarchical Slide Generation from Design

## 阅读导引

这篇论文研究的是一个非常具体但很实用的问题：给定一张参考幻灯片图片或设计稿，自动生成可编辑的 PowerPoint slide。它不是传统的“输入一段自然语言，生成几页 PPT”，而是更接近“把不可编辑的视觉设计复刻成可执行、可编辑的 `python-pptx` 代码，再导出 pptx”。论文把这个任务称为 Reference Image to Slide Generation，核心挑战不只是看懂图片内容，还要把视觉布局、元素类型、颜色、位置、层级关系和 `python-pptx` API 调用精确连接起来。

阅读时可以抓住三条主线：

1. **任务与评测如何定义**：作者提出 Slide2Code benchmark，并设计 Slide Complexity Metric，把 slide 按 simple / medium / complex 分层。
2. **SlideCoder 怎样把复杂图片拆成可生成的代码任务**：它用 CGSeg 做布局分块，用 Layout-aware Prompt 注入坐标，用 H-RAG 检索 `python-pptx` 的类型知识和函数语法。
3. **为什么实验能显著超过 baseline**：性能提升主要来自三件事的组合：分治复杂视觉布局、显式约束空间位置、显式补足 API 语法知识。

一句话概括：**SlideCoder 把“看图生成 PPT”改造成“先按布局分块理解，再按块生成代码，最后带坐标和语法知识组装”的层次化代码生成问题。**

---

## Abstract / 摘要译述

论文指出，人工制作 slide 很耗时，而且需要设计经验。已有基于自然语言的 LLM slide 生成方法很难准确表达视觉设计中的细节，例如布局、颜色、形状风格、元素对齐和空间密度。因此作者正式定义 Reference Image to Slide Generation：输入参考 slide 图片，输出能通过 `python-pptx` 执行并生成相似 slide 的 Python 代码。

为评测这个任务，作者构建了 **Slide2Code**，这是一个带难度分层的 benchmark，包含 300 个样本。难度分层基于他们提出的 **Slide Complexity Metric**，综合考虑元素数量、元素类型多样性和视觉覆盖密度。

方法上，作者提出 **SlideCoder**：一个 layout-aware、RAG-enhanced 的框架。它包含：

- **CGSeg**：Color Gradient-based Segmentation，用颜色梯度把复杂 slide 图像分割成局部区域；
- **Layout-aware Prompt**：把分块位置转成 `python-pptx` 坐标单位，帮助模型控制空间布局；
- **H-RAG**：Hierarchical Retrieval-Augmented Generation，用两级知识库补充 `python-pptx` 的对象类型和函数调用语法；
- **SlideMaster**：基于 Qwen2.5-VL-7B-Instruct 微调的 7B 开源模型，训练数据来自更强的 PPTX reverse-engineering tool。

实验显示，SlideCoder 在 Slide2Code 的不同复杂度层级上都超过 AutoPresent 等 baseline，最高整体分数提升 40.5 分；在 SLIDESBENCH 上也有明显优势。

---

## Introduction / 动机

### 从“文生 PPT”到“图生可编辑 PPT”

论文的出发点是：现实中的 slide 设计往往已经以不可编辑形式存在，例如 PDF、PNG、网页设计稿、截图，用户想要的是把它们转换成可编辑的 pptx，而不是重新用自然语言描述一遍。自然语言描述对内容组织有用，但对视觉细节表达很弱：一个“蓝色标题 + 三列布局 + 图标 + 箭头连接”的描述，远远不足以复现原图中的字号、边距、对齐、层级、色块、图形和视觉节奏。

[[FIG_2|从设计图生成幻灯片的使用场景，以及 MLLM 常见的遗漏、样式错误和布局错乱问题|medium]]

作者把现有 MLLM 在这个任务上的错误归纳为三类：

- **miss**：元素漏掉，例如图形一角、某个小图标、某段文字没有生成；
- **incorrect**：样式不对，例如标题没有加粗、颜色不一致、形状类型错误；
- **disorder**：空间关系错乱，例如三列标题没有对齐，元素重叠或越界。

这三类错误其实对应了 slide 生成的三个层次：内容覆盖、视觉属性、布局几何。传统 NL-to-slide 方法主要解决内容覆盖，无法充分解决后两者。

### 为什么 `python-pptx` 代码生成很难

AutoPresent 的思路是用 LLM 从自然语言生成 Python code，再调用基于 `python-pptx` 封装的 SLIDESLIB。这个方向降低了 API 使用门槛，但也带来限制：SLIDESLIB 只覆盖少量高层操作，适合简单 slide，不适合复杂视觉设计。

如果直接生成原生 `python-pptx` 代码，模型又会遇到另一类困难：

- 对 `python-pptx` 对象体系理解不足，例如 shape、text box、placeholder、connector、table 的差异；
- 函数调用语法不稳定，例如参数、返回值、单位转换、样式设置方式；
- 复杂 slide 需要大量坐标和样式细节，长代码容易出现上下文冲突；
- 一旦生成代码不可执行，最终 slide 质量直接归零。

因此，SlideCoder 的核心不是“让模型一次性看图写完整 PPT 代码”，而是把任务拆成多个更稳定的子任务：看局部、写局部代码、带坐标组装、出错自修复。

---

## Related Work / Problem setup

### Multimodal Large Language Models for Code Generation

论文把 SlideCoder 放在“视觉输入到代码输出”的研究谱系中。相关任务包括 UI code generation、SVG code generation、视觉化编程题、视觉代码修复等。共同特点是：输入不是纯文本，而是包含布局、形状、颜色、图像等视觉信息；输出不是描述，而是可执行代码。

Slide 生成和 UI / SVG 生成相似，但也有自己的特殊性：

- slide 是固定画布，空间位置极其重要；
- slide 元素混合文本、图片、几何形状、表格、连接线、placeholder；
- 输出目标是 `pptx` 文件，而不是网页或 SVG；
- 评估既要看渲染图相似度，也要看可编辑文件内部结构。

### Slide Generation and Understanding

以往 slide generation 更关注从文档抽取内容，或者基于模板组织文本。近年的 LLM 方法开始尝试生成 structured visuals，比如 AutoPresent 从自然语言生成 slide code。但这些方法多依赖自然语言输入，缺乏对参考设计图的直接复刻能力。

本文的问题设定更严格：给定参考图 $I_0$ 和对应原始 slide 文件 $F_0$，生成框架 $G$ 调用 MLLM $M$ 产生代码

$C_g = G_M(I_0)$

执行代码得到生成 slide 文件 $F_g$，再渲染成图片 $I_g$。由于原始 slide 的代码 $C_0$ 不可得，评估只能比较两组对象：

- 图片层面：$I_0$ vs. $I_g$，衡量视觉相似度；
- 文件结构层面：$F_0$ vs. $F_g$，衡量内容和位置是否一致；
- 代码执行层面：$C_g$ 是否能无错误运行。

这个设定很合理，因为最终用户真正关心的不是代码文本长得像不像，而是：能不能运行、生成的 pptx 能不能编辑、视觉效果是否接近原设计。

---

## Benchmark: Slide2Code and Slide Complexity Metric

### Slide2Code 的构造目标

Slide2Code 用来评测 MLLM 在 Reference Image to Slide Generation 上的能力。每个样本包含一张参考 slide 图片和对应的 PPTX slide。作者强调 benchmark 需要覆盖不同复杂度，因为简单 slide 上的成功不代表复杂 slide 上也能成功。

数据来源上，作者从 Zenodo10k 中随机采样约 32,000 个 slide 实例，并合并 SLIDESBENCH 样本，构成候选集合 $Y$。然后用 Slide Complexity Metric 给所有 slide 计算复杂度分数，再用 KMeans 聚成 simple、medium、complex 三类。最终每类采样 100 个样本，形成 300 个样本的 Slide2Code。

[[FIG_3|Slide2Code、Zenodo10k 与 SLIDEBENCH 在 simple、medium、complex 三个复杂度层级上的样本比例对比|medium]]

图中显示，Zenodo10k 和 SLIDEBENCH 的样本分布偏向 simple / medium，而 Slide2Code 在三个难度层级上更均衡。这一点很关键：如果 benchmark 主要由简单页面组成，模型可能只要生成标题、几个文本框和少量图片就能取得较高分，无法暴露复杂布局下的真实短板。

### Slide Complexity Metric：把复杂度拆成三个维度

作者提出的 Slide Complexity Metric（SCM）综合三类信息：

1. **element count**：元素数量，反映制作操作的数量；
2. **element type count**：元素类型数量，反映对象种类和样式控制难度；
3. **Element Coverage Ratio**：元素覆盖比例，反映视觉密度和画面复杂度。

其中，元素覆盖比例来自 CGSeg：把图片分成网格，检测颜色梯度活跃区域，计算被激活网格占总网格的比例。这个指标弥补了一个重要缺陷：视觉复杂度和制作复杂度并不总是一致。例如插入一张视觉复杂的大图，操作上很简单，但视觉上很密集；反过来，大量小文本框操作复杂，但画面未必特别花。

对每个原始维度 $x_i \in \{c_i, e_i, v_i\}$，作者先做标准化并过 sigmoid：

$$
\tilde{x}_i = \sigma\left(\frac{x_i - \mu}{\sqrt{\sigma^2} + \epsilon}\right)
$$

其中 $c_i$ 是元素数量，$e_i$ 是元素类型数量，$v_i$ 是元素覆盖比例。最终复杂度分数为：

$$
z_i = \alpha \cdot \tilde{c}_i + \beta \cdot \tilde{e}_i + \gamma \cdot \tilde{v}_i
$$

并满足 $\alpha + \beta + \gamma = 1$。

这个公式的意义是：SCM 不追求绝对复杂度，而是在候选集合中给出相对复杂度排序。它适合 benchmark 分层，但如果跨数据集比较，仍要注意候选集合 $Y$ 的分布会影响标准化结果。

---

## Method: SlideCoder framework

SlideCoder 是一个端到端框架，输入参考设计图和可能的嵌入图片，输出可执行的 `python-pptx` 代码。整体由三个核心模块组成：CGSeg、H-RAG-based Code Generation、Layout-aware Prompt，并在此基础上训练 SlideMaster。

[[FIG_4|SlideCoder 的整体框架：CGSeg 分块，Describer/Coder/Assembler 三个 agent 协作，并结合 H-RAG 与 layout-aware prompt 生成代码|large]]

### 1. CGSeg：用颜色梯度做递归分块

CGSeg 的动机很直接：复杂 slide 对 MLLM 来说信息量太大，如果让模型一次性理解整页，就容易漏元素、错布局或生成不可执行代码。因此，作者用一种基于颜色梯度的规则算法把图像分成语义上更集中的区域。

CGSeg 的基本流程如下：

1. 把输入图像 $I$ 按 $g \times g$ 网格划分；
2. 对每个网格块计算 Sobel gradient magnitude，衡量颜色变化强度；
3. 以中位数梯度 $C_{mid}$ 和阈值 $T$ 判断哪些块是 activated block；
4. 对二值 mask 做 flood-fill，把相邻活跃块合并成连通区域；
5. 裁剪出每个区域对应的子图 $I_m$ 和位置 $p_m$；
6. 对子图递归重复上述过程，直到达到最大深度 $D_{max}$。

[[FIG_5|CGSeg 示例的原始输入参考图|small]]

[[FIG_6|CGSeg 计算颜色梯度后得到的 activated grid blocks|small]]

[[FIG_7|CGSeg 对激活块进行 flood-fill 后得到的连通区域|small]]

[[FIG_8|CGSeg 递归分割后的最终区域结果|small]]

CGSeg 的优点是简单、可解释、无需训练。它利用 slide 设计中的一个常见事实：视觉元素边界通常伴随颜色或亮度变化，因此梯度活跃区域可以作为布局切分线索。它也有局限：规则阈值不一定适配所有风格，尤其是低对比度设计、渐变背景、透明叠层、细线元素或大量图片纹理时，分割可能过细或过粗。

### 2. Generation Process：Describer、Coder、Assembler 三阶段协作

SlideCoder 不让一个模型直接输出整页代码，而是设计了三个 agent：

- **Describer**：输入整体设计图和 CGSeg 分块，生成 Overall Description 和每个 block 的 Block Description；
- **Coder**：根据每个 block 的描述生成局部 `python-pptx` 代码片段；
- **Assembler**：把局部代码片段、整体描述、图片路径、位置坐标和语法知识合并成完整可执行脚本。

如果生成代码不可执行，Assembler 会使用 error message 做 self-refinement，最多尝试若干轮。实验设置中 Coder 和 Assembler 都允许最多三次 self-refinement，取第一次成功运行的结果；如果 Coder 多次失败则丢弃对应 block，如果 Assembler 失败则整个样本记为 execution failure。

这个流程本质上是把复杂任务分解为：

1. **视觉理解**：这块区域里有什么；
2. **局部实现**：这些元素如何用 `python-pptx` 画出来；
3. **全局布局**：所有局部元素如何放回原 slide 画布；
4. **可执行性修复**：根据运行错误修正语法和 API 调用。

### 3. H-RAG：TS-KB 与 OF-KB 两级知识库

论文提出 Hierarchical Retrieval-Augmented Generation（H-RAG），用来弥补 MLLM 对 `python-pptx` 的知识不足。它包含两个层级的知识库：

- **TS-KB / Shape Type Knowledge Base**：对象类型知识库，整理 `python-pptx` 中不同 shape 类型及其描述，例如 Auto Shape、Picture、Graphic Frame、Group Shape、Line / Connector 等；
- **OF-KB / Operation Function Knowledge Base**：操作函数知识库，记录函数名、参数、返回值、示例和说明，帮助模型生成正确 API 调用。

作者用 BGE M3-Embedding 对知识库条目向量化。给定 prompt $p$，计算向量 $q_p$，再用 cosine similarity $\cos(q_p, k_i)$ 检索相关条目，并把 top-k 内容插入 prompt。由于 TS-KB 相对较小，Describer 阶段会包含所有类型知识，确保元素识别覆盖面；Coder 和 Assembler 阶段则根据需求检索具体函数语法。

Appendix 中给出了知识库示例：Shape Type KB 用自然语言说明对象类别；Operation Function KB 则把 `pptx.Presentation` 这样的函数拆成参数、返回值、示例和用途。

[[FIG_14|作者的 reverse-engineering tool 支持的对象类型与样式：覆盖 textbox、rectangle、placeholder、freeform、connector、table、triangle 等|medium]]

[[FIG_15|AutoPresent reverse-engineering tool 支持的对象类型与样式：覆盖范围更窄，主要是 title、textbox、bullet points、image、background color|medium]]

H-RAG 的关键作用不是提供外部事实，而是提供**代码生成约束**：模型可能知道“我要加一个文本框”，但不一定稳定记得 `python-pptx` 中该如何设置位置、字体、填充、段落、连接线、表格单元格等。把 API 语法放进 prompt，可以显著降低不可执行代码和版本不一致错误。

### 4. Layout-aware Prompt：把视觉坐标转成 `python-pptx` 坐标

Assembler 的难点在于：局部代码本身可能能画出元素，但如果没有全局坐标，拼起来仍会错位、重叠、越界。因此作者设计 Layout-aware Prompt，把 CGSeg 得到的区域位置映射到 slide 坐标系。

具体来说，CGSeg 得到每个 block 的像素级位置 $<x, y, w, h>$。由于参考图分辨率和实际 slide 尺寸不同，需要按比例缩放，转换成 `python-pptx` 使用的 inches 单位，记为 $<Position^*>$。Assembler 的 prompt 会同时包含：

- `<Design>`：参考图；
- `<Overall Description>`：全局描述；
- `<Code Snippets>`：各 block 的局部代码；
- `<Position*>`：每个 block 的 slide 坐标；
- `<Grammar>`：从 H-RAG 检索出的语法模式；
- 图片和背景路径。

Appendix E 给出的 Layout-aware prompt 明确要求用 Blank Layout，使用 `Inches()` 和 `Pt` 进行单位转换，并保存到指定输出路径。

Layout-aware Prompt 解决的是“代码片段之间的空间一致性”。这也是 ablation 中 w/o Layout 在 complex level 位置分数明显下降的原因：复杂样本被 CGSeg 切成更多块，如果没有坐标约束，Assembler 很难仅凭自然语言描述恢复相对位置。

---

## SlideMaster / reverse-engineered training data

除了框架本身，作者还训练了一个 7B 开源模型 **SlideMaster**。它基于 Qwen2.5-VL-7B-Instruct，使用 LoRA 微调，训练样本来自 SLIDESBENCH training set，并构造成 `(RI, instruction, program)` 三元组。

这里最值得注意的是训练标签的质量。对于这个任务，监督信号不是普通 caption，而是能复刻 slide 的 Python code。如果 reverse-engineering tool 只能从原始 PPTX 中抽取有限对象和样式，那么训练代码就会丢失大量细节，模型也学不到复杂 slide 的真实生成方式。

作者因此开发了新的 PPTX reverse-engineering tool。相比 AutoPresent 的工具，它支持：

- 10 类常用对象类型，而 AutoPresent 只支持 5 类；
- 44 种对象样式，而 AutoPresent 只支持 16 种；
- 新增 placeholder、freeform、connector、table、triangle 等对象；
- 更细粒度的文本框、矩形、表格、连接线样式。

[[FIG_10|作者工具与 AutoPresent 工具在对象类型和样式数量上的对比|medium]]

作者用两个指标评估 reverse-engineering tool：

- **Reconstruction Ratio**：从反向工程代码重建出的 shape 数量 / 原 slide shape 数量。作者工具达到 90.38%，AutoPresent 为 65.67%；
- **CLIP Score**：重建 slide 与原 slide 的视觉语义相似度。作者工具为 88.66%，AutoPresent 为 69.87%。

这说明 SlideMaster 的提升并不只是模型训练技巧，而是数据管线也更强。对于“从视觉设计生成可编辑 slide”这种任务，训练数据中的代码覆盖范围会直接决定模型能学会哪些 slide 构造能力。

---

## Experiments

### Experimental Setup

实验比较了两类框架：

- **AutoPresent**：已有 NL-to-slide code generation 框架；
- **SlideCoder**：本文提出的 RI-to-slide 框架。

使用的 backbone 包括：

- GPT-4o；
- Gemini-2.0-flash；
- SlideMaster；
- AutoPresent 原模型。

评估指标分四组：

1. **Execution%**：生成代码是否能成功运行；
2. **Local Structural Metrics**：比较 $F_0$ 和 $F_g$ 的内容相似度与位置相似度；
3. **Global Visual Metrics**：比较 $I_0$ 和 $I_g$ 的 CLIP 与 SSIM；
4. **Overall Score**：所有指标的平均，执行失败样本记 0。

这种指标设计比较全面：Execution 衡量代码生成基本可靠性；Local Structural 衡量 pptx 内部可编辑结构；Global Visual 衡量用户肉眼看到的效果。

### Quantitative Results：Slide2Code 与 SLIDESBENCH

[[FIG_9|SlideCoder 与 AutoPresent 在 Slide2Code 和 SLIDESBENCH 上的主实验结果，包括 Execution、Content、Position、CLIP、SSIM 和 Overall|large]]

在 Slide2Code 上，SlideCoder 在 simple、medium、complex 三个难度层级都显著优于 baseline。论文正文强调，相比最佳 baseline，SlideCoder 的 Overall 分数分别提升 40.5、34.0、29.9 分；Execution success rate 分别提升 38%、32%、27%。

从表中可以看到，使用 GPT-4o 作为 backbone 时，SlideCoder 在 Slide2Code 上达到：

- simple：Execution 99.0，Overall 89.1；
- medium：Execution 100.0，Overall 85.5；
- complex：Execution 96.0，Overall 78.4。

这个结果说明，复杂度上升时性能确实下降，但下降相对平滑。相比之下，AutoPresent 在复杂度层级上的表现不稳定：它依赖自然语言描述和高层封装，难以真正响应视觉复杂度变化。

在 SLIDESBENCH 上，SlideCoder + GPT-4o 的 Overall 为 78.8，比最佳 baseline 高 11.9。SlideMaster 作为开源 7B 模型，也在两个数据集上展现了竞争力，甚至超过部分 GPT-4o-based baseline。这说明框架分解和知识增强能显著提高小模型的可用性。

### Slide Complexity Metric Analysis

作者用人工标注验证 SCM 是否符合人的复杂度判断。他们从 Slide2Code 中随机抽取 100 个样本，请 4 名博士生标注，每张 slide 由两名标注者评分。评分维度包括 shape 数量、shape 类型多样性、元素覆盖程度，范围为 0–100。

[[FIG_13|消融实验的详细指标表，按 simple、medium、complex 层级展示 Execution、Content、Position、CLIP、SSIM 和 Overall|large]]

SCM 与人工平均分的 Pearson correlation coefficient 为：

$$
r = 0.873
$$

p-value 为：

$$
2.776 \times 10^{-32}
$$

此外，SCM 与单个标注者评分之间的 ICC 为 0.726，p-value 为：

$$
1.186 \times 10^{-31}
$$

这些结果表明 SCM 与人工复杂度判断高度相关。它不是随意的工程指标，而是能较好对齐人对 slide 复杂度的主观感知。

### Ablation Study：三个组件各自贡献什么

作者设计了四种设置：

- **SlideCoder**：完整系统；
- **w/o Layout**：去掉 layout-aware prompt，不给 Assembler block 坐标；
- **w/o CGSeg**：去掉 CGSeg 和 layout-aware prompt，Coder 直接生成整页代码；
- **w/o H-RAG**：去掉所有 agent prompt 中的 `<Grammar>` 检索内容；
- **Native Setting**：同时去掉 CGSeg 和 H-RAG，让 MLLM 直接从参考图生成完整代码。

[[FIG_12|消融实验总体结果：去掉 Layout、CGSeg 或 H-RAG 都会降低 Execution 和 Overall，去掉 CGSeg 下降最明显|medium]]

主表显示完整 SlideCoder 在三个难度层级上的 Overall 分别为 89.9、85.8、82.2，Execution 都是 100.0。去掉 Layout 后，复杂层级 Overall 降到 71.8，Position 也明显下降。去掉 CGSeg 后，medium level Execution 只有 51.5，Overall 只有 39.6。去掉 H-RAG 后，Execution 和 Overall 也下降，说明语法知识对可执行性和细节生成都有贡献。

消融结果可以这样理解：

- **CGSeg 是降复杂度的核心**：没有分块，单个 agent 要一次性理解整页，复杂样本容易失败；
- **Layout-aware Prompt 是保位置的核心**：有分块但没有坐标，局部元素可能各自正确，但全局排列会错；
- **H-RAG 是保语法和对象类型的核心**：没有 API 知识，模型容易产生不可执行或版本不兼容代码；
- **Native Setting 最差**：直接看图写完整 `python-pptx` 代码，对当前 MLLM 来说负担太重。

### Case Study

[[FIG_11|不同方法在 simple、medium、complex 三个难度层级上的生成案例对比|large]]

案例图展示了自然语言式 baseline 的典型问题：元素重叠、内容越界、复杂页面代码无法编译、布局与参考图差异大。SlideCoder 的优势则体现在两方面：CGSeg 让模型聚焦细粒度区域，减少漏画细节；Layout-aware Prompt 让这些局部区域按正确空间关系重新组合。

---

## Discussion / Limitations / Practical takeaways

### 论文承认的限制

论文在 Limitations 中列出三个主要限制：

1. **只处理单页 slide**：当前框架从一张参考图生成一页 slide，没有处理多页 deck 的风格一致性、母版复用、跨页布局逻辑和叙事结构；
2. **假设 design 与 embedded pictures 分离**：作者假设用户输入包含设计图和独立图片素材。如果用户只给一张完整截图，其中图片已经嵌入到画面里，系统不负责把这些图片元素独立抠出并作为可编辑/可替换素材；
3. **CGSeg 是固定规则算法**：颜色梯度分割简单可控，但对不同设计风格的适应性有限。未来可以探索模型驱动的检测或 segmentation 方法，实现更自适应的 block partition。

### 工程落地启示

如果把 SlideCoder 用在实际产品中，需要关注几个工程问题：

- **输出代码可执行性必须优先于视觉细节**：pptx 生成任务中，代码失败就没有结果，Execution 是底线指标；
- **最好保留中间产物**：包括分块图、block description、code snippets、Assembler prompt、error message，这些都方便用户或系统 debug；
- **分块粒度需要可调**：分得太粗，MLLM 仍然负担重；分得太细，Assembler 负担变大，元素间关系可能丢失；
- **知识库需要版本绑定**：`python-pptx` API 版本变化会导致生成代码不兼容，因此 OF-KB 应该和运行环境版本一致；
- **图片素材处理是独立难点**：如果要从截图中提取图片、图标、logo 并保持可编辑，需要额外的 object detection / matting / vectorization pipeline。

---

## 我的批判与延展思考

### 1. SlideCoder 的本质贡献是“任务结构化”，不是单纯 RAG

这篇论文标题中有 RAG，但我认为真正的核心是 hierarchical decomposition。RAG 负责补知识，CGSeg 和三 agent 流程负责降复杂度，Layout-aware Prompt 负责保几何关系。三者结合后，任务从“端到端看图写整页代码”变成了“局部分解 + 局部代码 + 全局装配”。这更接近传统编译器/图形系统的思想：先解析结构，再生成目标代码。

因此，如果只复现 H-RAG，而不做可靠分块和坐标映射，收益可能有限；反过来，如果有很好的视觉结构解析器，即使 RAG 简单一些，也可能带来大幅提升。

### 2. SCM 有用，但仍是 benchmark-oriented metric

SCM 把元素数量、类型多样性和视觉覆盖比例结合起来，和人工评分相关性高，这是它的优点。但它仍然是一个相对复杂度指标，而不是通用设计复杂度理论。比如：

- 一个页面有很多重复小元素，SCM 可能很高，但生成代码可以用循环或模板复用，实际难度未必极高；
- 一个极简页面只有少量元素，但包含复杂字体、透明渐变、品牌约束和微妙对齐，SCM 可能低估难度；
- 对 editable slide 来说，元素语义可编辑性也很重要，但 SCM 主要衡量视觉和对象数量。

后续可以引入“可编辑语义复杂度”，例如图表、表格、流程图、SmartArt、嵌套组合形状、动画和母版依赖等。

### 3. CGSeg 的规则性既是优势也是瓶颈

CGSeg 不需要训练数据，可解释、稳定、成本低，很适合作为第一版系统。但 slide 设计中的视觉区域不总是由颜色梯度决定。例如白底上的黑色细线流程图、浅色渐变背景上的透明卡片、图标密集区域、纹理图片区域，都可能让梯度分割偏离“语义分块”。

一个自然延展是把 CGSeg 替换或增强为 hybrid parser：

- 用规则方法快速找到明显边界；
- 用 MLLM 或视觉检测模型识别文本框、图片、表格、图标、连接线；
- 用 layout graph 表达区域间关系；
- 让 Assembler 不只接收矩形坐标，还接收对齐、层级、连接、包含关系。

这样可以从“块级拼装”进一步走向“结构图级生成”。

### 4. 评估仍需要更关注可编辑性

论文已经比较了 $F_0$ 和 $F_g$ 的 content / position，这是比只看截图相似度更好的方向。但实际用户还会关心：

- 文本是否是真文本，而不是被当图片贴进去；
- 表格是否是真表格，而不是一组矩形和文本框；
- 图标是否可替换，颜色是否可修改；
- 元素是否合理分组；
- 生成 slide 是否便于后续手工编辑。

也就是说，视觉相似度和结构相似度之外，还需要一个 **editability metric**。一个生成结果可能视觉上接近，但如果所有内容都被 rasterized 成背景图，它对用户几乎没有编辑价值。

### 5. Multi-slide deck 才是下一阶段难点

单页 RI-to-slide 是必要第一步，但真实 PPT 往往是多页 deck。多页生成会引入新的问题：

- 统一主题色、字体、页边距、标题位置；
- slide master 和 layout template 的自动推断；
- 跨页元素复用，例如页眉页脚、logo、章节编号；
- 多页叙事结构和内容一致性；
- 生成代码如何组织成可维护的工程，而不是每页一段孤立脚本。

这也是 SlideMaster / reverse-engineering tool 可以继续发展的方向：不仅反向工程单页元素，还要反向工程母版、layout、theme、style token 和 deck-level design system。

---

## 总结

SlideCoder 的重要性在于，它把 slide generation 从“语言描述到简单页面”推进到“视觉参考图到可编辑代码”。论文贡献可以归纳为：

- 定义 Reference Image to Slide Generation；
- 构建难度分层的 Slide2Code benchmark；
- 提出 SCM 衡量 slide 复杂度；
- 用 CGSeg 分解复杂视觉布局；
- 用 H-RAG 补足 `python-pptx` 对象类型和函数语法知识；
- 用 Layout-aware Prompt 维持空间一致性；
- 用更强的 reverse-engineering tool 构造训练数据，微调 SlideMaster。

从实验看，SlideCoder 的提升不是来自单个技巧，而是来自对任务瓶颈的系统性拆解：**复杂视觉理解靠分块，空间还原靠坐标，代码可靠性靠 API 知识，开源模型能力靠高质量反向工程数据。**
