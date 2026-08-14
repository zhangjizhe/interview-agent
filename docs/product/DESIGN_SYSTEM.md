# 设计系统方向

最后更新：2026-08-13

## 设计意图

产品应是克制、专注、证据驱动的训练环境，而不是聊天玩具或营销型仪表盘。P0 复用现有 Tailwind、React 和 Lucide 技术栈，不新增组件框架。

## 基础规范

| Token | 方向 |
| --- | --- |
| 字体 | 界面使用系统无衬线；只有分数、时长、使用量使用等宽数字。禁止 viewport 字体缩放和负字距。 |
| 间距 | 4px 基础刻度；内容节奏使用 16/24px；进度、分数和控件尺寸稳定。 |
| 布局 | 全宽应用 Shell 配合受限内容宽度。仅对重复数据、弹窗和真实工具使用卡片。 |
| 色彩 | 中性画布、高对比文字、蓝色主操作、绿色表示已证明的进步、黄色表示不确定/需注意、红色只用于错误和破坏性操作。 |
| 圆角 | 控件和卡片使用 4-8px。除紧凑状态/标签外避免装饰性胶囊。 |
| 动效 | 模式切换与流式反馈使用短且有目的的动效；遵守减少动态效果偏好。 |

## 组件清单

在页面变体前建立以下共享基础组件：

- `AppShell`、`PrimaryNav`、`PageHeader`、`SectionHeader`
- `Button`、带 Tooltip 的 `IconButton`、`Input`、`Select`、`Textarea`、`SegmentedControl`
- `StatusBadge`、`SkillTag`、`ProgressBar`、`ScoreMeter`、`EvidenceCount`
- `DataCard`、`EmptyState`、`Skeleton`、`Toast`、`Dialog`
- `TrendChart`、`EvidenceCard`、`InterviewProgress`、`PracticeRecommendation`

工具操作使用 Lucide 图标。文本按钮只用于清晰命令。二元设置用开关或复选框，不用含义模糊的文字。

## 状态与无障碍

- 每个网络页面必须定义加载、空、成功、错误和未授权状态。
- 不能只用颜色表达分数状态，必须同时有文字和证据数量。
- 所有交互控件必须支持可见焦点和键盘操作。
- 回答编辑器、计时器和完成状态必须支持缩放和读屏。
- 长问题、技能名和岗位名换行时不得改变控件尺寸或遮挡相邻内容。

## 内容规则

- 候选人界面描述评估结果和行动，不描述 Agent 机制。
- 分数必须带范围和证据，例如“基于 3 个已评估回答”。
- 候选人视图不得展示内部 Prompt、检索文档、工具、模型路由、Token 数或 Reviewer 推理。
