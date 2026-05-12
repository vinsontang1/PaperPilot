> **Title**: SlideCoder: Layout-aware RAG-enhanced Hierarchical Slide Generation from Design
> **Authors/Orgs**: Wenxin Tang, Jingyu Xiao, Wenxuan Jiang, Xi Xiao, Yuhang Wang 等；Tsinghua University, CUHK, Northeastern University, Kuaishou Technology 等
> **Code**: https://github.com/vinsontang1/SlideCoder

## 一句话概括
SlideCoder把参考设计图自动转成可编辑 PPTX：用 CGSeg 拆解复杂版式，用 H-RAG 补足 python-pptx 知识，再由多 Agent 生成可执行代码。

## 研究动机
传统 NL-to-slide 难以精确表达颜色、布局和风格；直接让 MLLM 看图生成代码又容易漏元素、样式错误、排版错乱，且对 python-pptx API 掌握不足，导致代码不可执行。

## 核心方法
1. 定义 Reference Image to Slide Generation，并提出 Slide Complexity Metric，从元素数量、类型多样性、覆盖密度衡量难度，构建 300 样本分层 benchmark Slide2Code。
2. CGSeg 以颜色梯度、连通域和递归分割把设计图切成语义区域，缓解复杂页面的一次性理解压力。
3. H-RAG 分两级检索：Shape Type Knowledge Base 规范元素描述，Operation Function Knowledge Base 提供 python-pptx 调用语法。
4. Describer、Coder、Assembler 分工协作，Assembler 使用 layout-aware prompt 把坐标缩放到 PPT 单位并自修复语法错误。
5. 通过改进 PPTX 逆向工具生成训练数据，微调 Qwen2.5-VL-7B 得到 SlideMaster。

[[FIG_4|SlideCoder framework|medium]]

## 实验与收益
在 Slide2Code 上，SlideCoder 各难度 overall 分别比最佳 baseline 高 40.5、34.0、29.9 分，执行成功率高 38%、32%、27%；在 SLIDESBENCH 上 GPT-4o 版 overall 达 78.8，领先 11.9。逆向工具覆盖 10 类对象/44 种样式，重建率 90.38%，显著优于 AutoPresent。

[[FIG_9|Results on Slide2Code and SLIDESBENCH|medium]]

## 贡献总结
论文把“看设计图生成可编辑幻灯片”系统化为新任务，给出难度可控的 benchmark、可解释的分割与 H-RAG 生成框架，并发布接近闭源模型效果的 7B SlideMaster。

## 阅读线索
先看 Figure 3 理解流水线，再读 §3 的 SCM/Slide2Code；§4.1–4.3 对应 CGSeg、H-RAG、layout-aware prompt；Table 1 与消融表验证各模块价值。