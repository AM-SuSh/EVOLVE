# 成员 A · 第 2–3 天交付说明

对照《三人小组后续实验发展实施计划》「教学 IDE MVP」中成员 A 三项。

## 完成项

1. **改造 Lab2 正文（保留原叙述，只增补）**  
   - 文首增加「课本→项目→实践→证据→迁移」知识路径。  
   - 在 2.1 / 2.2 / 2.4 / 2.5 后增加五层次对照表。  
   - 新增【任务四】fill/debug 变体说明。  
   - 【四、验证】改为四条输出断言，并写明禁止只认退出码 0。

2. **fill/debug 显式目标、误区、断言、提示阶梯**  
   - 更新 `variants/fill|debug/manifest.yaml`（`hint_ladder` L0–L3，version 0.2）。

3. **UI 文案审核**  
   - 产出 `ui-copy-review.md`；  
   - 已改 `tutor-model.ts` Lab2 目标向文案、`labs.json` Lab2 checklist、`tutor/prompts/lab2/context.md`。

## 未改动的边界

- 未重写 Lab2 原有章节叙事与任务一～三主体。  
- 未实现 Monaco / xterm（成员 B）。  
- 未改评分运行时（成员 C）；断言 id 与 Day1 `lab.yaml` 对齐。
