> **ThinkRec: Thinking-based Recommendation via LLM** (基于思考的 LLM 推荐)
> WWW '26 · 2026 · Zhejiang University、Ant Group、Shanghai AI Laboratory
> 代码: https://github.com/Yu-Qi-hang/ThinkRec

## 一句话概括

通过"思考激活"+"实例级专家融合"两机制，把 LLM4Rec 从 System 1 式直觉匹配推进到 System 2 式显式推理，同时拿下推荐准确率与解释质量提升。

## 研究动机

现有 LLM4Rec（item scoring / generation / hybrid）本质仍是 System 1：依据点击历史做表面匹配，忽视行为逻辑。论文以反例说明：用户讨厌《Dune》、喜欢《三体》《基地》，System 1 方法会因"同为科幻"推荐《Hyperion》，却忽略用户其实排斥其哲学/形而上学主题。由此提出两个挑战：(1) 如何不被 next-token prediction 带偏地调动 LLM 推理；(2) 多样偏好下如何让"思考"个性化而非被均匀化淹没。

## 核心方法

1. **数据增强**：用 PolyLM-Qwen-7B 抽取 ≤10 keywords，并把低分交互一并加入历史，构造 `title + feature embedding + label + keywords` 的 item 表示。
2. **推理数据合成**：用强推理模型 QwQ 对采样样本反复生成直至预测正确，保留最后一次解释作 reasoning trace。
3. **思考激活联合训练**：每 batch 混合推荐与推理样本；推理用 token CE `L_think`，推荐在答案位取 "Yes" 概率算 BCE `L_rec`，按类型加权 (α,β,η,γ)=(0.1,0.9,0.9,0.1)。
4. **多专家训练 + 融合**：先训 `LoRA_global`，再用 collaborative user embedding 聚类后仅微调最后 8 层得 `{LoRA_1..N}`；以各组用户特征均值为专家表示，cosine+softmax 算权重 w，并以熵/max 阈值 gating 切换 global / argmax 单专家 / 多专家加权三种模式。

## 实验与收益

ML1M、Yelp、Amazon-Book（按时间切分）上，ThinkRec 相对最强 baseline 平均 AUC +7.96%，解释 METEOR +56.54%、BLEURT +23.35%；ML1M 训练的 expert 跨域到 Yelp/Book 保留 >90% 性能；推理只需一次 LoRA 融合 forward，延迟相对标准 LoRA-LLM <10%。

## 贡献总结

- 系统性把 LLM4Rec 从 System 1 推进到 System 2 reasoning 范式。
- keyword 增强 + reasoning trace 蒸馏的"思考激活"，桥接推荐与语言建模。
- instance-wise expert fusion：latent user feature 聚类 + gating 动态融合。
- 揭示 thinking 与多专家的互补：去掉 think 后多专家反而比 w/o both 更差，显式推理是个性化专家有效泛化的前提。

## 我的阅读线索

1. 看清 thinking 与多专家为何必须共存 → §4.3.1 与 Table 4，配合 detail.md 对 w/o think 反而比 w/o both 更差的解读。
2. 关心工程落地 → §3.3.2 gating 公式 (Eq.9–10) 与 §4.3.4 推理效率，结合 Appendix D 的 LoRA / loss 权重。
3. 对解释质量存疑 → 对照 Appendix C Case Study 与 Table 3，回看 §3.2.1 reasoning 合成流程，判断"蒸馏式"解释的可信度边界。
