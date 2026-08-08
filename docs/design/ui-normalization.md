# 界面规范化记录

## 范围

本轮只规范现有桌面应用的视觉层级与响应式密度，不改变原料、营养、成本、配方版本、Agent 权限或数据结构。设计继续沿用 Ninka FoodLab 的白色底、浅灰边框、深绿色主操作和四色品牌令牌。

## 统一规则

- 页面：统一页面边距、标题字重和标题与说明之间的节奏。
- 表面：普通内容使用白色卡片；需要强调层级的检查器和 Agent 使用轻微抬升表面，不使用大面积装饰阴影。
- 控件：主按钮、次按钮、搜索框、筛选器和表单字段统一圆角、边框和紧凑高度；危险操作仍使用独立颜色语义。
- 表格：统一表头高度、行高、选中态和容器圆角；表格数据不为了视觉效果改变精度或计算逻辑。
- 密度：宽屏保留高信息密度；Agent 打开时主动简化配方库低优先级列，避免内容被面板遮挡。
- Agent：消息气泡、导入草稿、配方提案和输入区使用同一套卡片层级，并将紧凑操作按钮提高到更容易点击的尺寸。

## 审计结果

1. **原料库：通过。** 左侧通用原料与右侧具体原料保持清晰主从关系；列表选中态、搜索框、表头和数据区边界一致。对照：[`21-ingredients-before-after.jpg`](../testing/screenshots/ui-normalization/21-ingredients-before-after.jpg)。
2. **配方库：通过。** 筛选栏由不稳定换行改为固定网格；金额显示从原始长小数改为两位小数；Agent 打开时保留六个研发判断所需字段，不再发生整表裁切。对照：[`22-recipe-library-before-after.jpg`](../testing/screenshots/ui-normalization/22-recipe-library-before-after.jpg)，受限宽度：[`17-recipe-library-agent-open.jpg`](../testing/screenshots/ui-normalization/17-recipe-library-agent-open.jpg)。
3. **配方工作台：通过。** 页头、批量摘要、用量表格、附加成本、备注和实时结果形成稳定的三级层级，未改变字段顺序和计算含义。对照：[`23-workbench-before-after.jpg`](../testing/screenshots/ui-normalization/23-workbench-before-after.jpg)。
4. **通用设置与模型设置：通过。** 通用设置不再漂浮在大面积空白中；模型服务商列表的卡片高度、边界和启用按钮更统一。对照：[`24-settings-before-after.jpg`](../testing/screenshots/ui-normalization/24-settings-before-after.jpg)、[`25-models-before-after.jpg`](../testing/screenshots/ui-normalization/25-models-before-after.jpg)。
5. **食品研发 Agent：通过。** 导入草稿和输入区的边界更明确，卡片操作按钮点击面积增大；面板宽度保持适合聊天阅读的区间。对照：[`26-agent-before-after.jpg`](../testing/screenshots/ui-normalization/26-agent-before-after.jpg)。

## 验证

- 浏览器演示模式实际操作：原料库、配方库、配方工作台、通用设置、模型设置、Agent 面板。
- 同视口改前/改后合图复查：未发现裁切、错位、错误圆角或不可见主操作。
- Agent 打开状态复查：配方库筛选转为两列，表格保留产品、方案状态、类型、版本、计划投料总量和整批成本。
- 自动化：核心层 60/60；桌面前端分组运行 195/195；TypeScript 类型检查、Vite 生产构建和品牌资源校验通过。

## 证据边界

截图能证明可见布局和内容层级，不能单独证明键盘、读屏或真实 macOS/Windows 安装环境。主要交互仍由现有组件与回归测试覆盖；真实安装后的系统级外观留到“桌面发布包装”阶段验证。
