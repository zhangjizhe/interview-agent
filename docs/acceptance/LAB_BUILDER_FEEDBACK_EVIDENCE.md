# 已完成保存提示的归属

旧“草稿已保存”会遗留在新编辑器、取消Agent选择、切换版本及下一次失败保存。修复在这些上下文变化和save.onMutate清feedback，不改变保存请求、确认或幂等键。组件四项旧红测修复后27/27，lint/type/build/diff通过。

浏览器接入已保存的合成Agent，四次真实新版本201分别实际GET核ID/agentId/版本号/DRAFT/currentVersionnull，再核切换版本、取消选择、新建以及下一次代理不转发503时旧保存提示消失。失败场景仅逐项核保存版本号1.0.6保留及真实版本总数不增，不宣称全部字段保留。Provider及fixture-admin账本无增量，四次元数据保存不调用模型，外部费用0。

Agent场景取消选择，不等价两个实际Agent对比。失败是代理拒绝，不是自然API故障；真实USER/权限/模型质量不由此场景证明。已完成旧提示清理不解决在途start/cancel迟到回执或全部运行归属风险，另见TASKS中的BUILDER-RUN-CONTEXT。

源码清单982旧ID/审查/证据/verdict保留，101Builder AST映射中UI0982单独协调，更新UI0886/0890回调及行/hash，独立复核通过，hash50a3e1b31c1433699753b5af365421a2ab1113483d79341748af428fbc28656c。首次完整隔离链exit0，API82/82、全部浏览器及严格PG schema/行多集/sequence与实际Milvus/Qdrant恢复通过。当前限定阶段通过，未提交，新精确CI成功后才合并。整体NOT_ACCEPTED。
