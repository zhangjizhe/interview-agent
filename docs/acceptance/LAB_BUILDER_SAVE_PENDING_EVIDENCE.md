# Agent 保存期间目标与配置保护

原界面保存时只禁用提交按钮，仍可切换目标/版本或新建、修改配置；迟到回执可能覆盖新的编辑状态。最小修复冻结新增、Agent/版本选择和整个保存配置fieldset，重复submit有pending guard；失败后保留草稿并恢复编辑。保存仍不发布或调用模型，API/数据库/权限/计费路径不变。

独立组件旧1红/9绿，修复10/10；lint/typecheck/build通过。fieldset继承disabled到节点控件，CSS重置fieldset并保持grid/gap。新镜像浏览器先代理不转发503保留配置，再持有真实configured-agents201回执核冻结；实际GET保存ID、首版本ID、名称/key/prompt一致且Provider/fixture-admin账本不变，释放回执后选择正确ID并等刷新结束恢复控件。1440宽桌面截图已视觉核验，fieldset间距/边界正常；未扩展为所有响应式布局通过。

第一次完整链API82/82通过，但浏览器失败：已填充选项的包装label精确“选择 Agent”定位超时；actual201已取得，finally释放导致诊断时显示已保存，不将此状态视为整个测试通过。已改用明确workspace select定位，第二轮完整隔离链exit0：API82/82、全部浏览器、严格PG schema/行多集/sequence与实际Milvus/Qdrant恢复通过。未冒充后端保存失败，未删除失败诊断。新helper成功后控件enabled等待已补，避免刷新未结束的瞬时误判。

当前未提交/阶段未验收；实际链和桌面布局已通过；Lab镜像sha256:640a2db58abe1f8c7afa5823af46157da784b53aa2adb739d0aad3d2eb8ad446。源码清单已显式协调：保留原100 Builder节点ID及审查/证据/verdict，更新四个pending属性、行及表达式，新增UI-0982保存fieldset。总982模板，新增项仅三字段限定PARTIAL、最终NOT_ACCEPTED，条件/响应式及其余模板仍待验收。外部费用0，无业务账号/题目复制，整体NOT_ACCEPTED。
