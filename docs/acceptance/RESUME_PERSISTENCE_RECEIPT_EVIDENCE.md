# I06：简历持久化回执

2026-10-23，基线PR59合并a03ff8afe7f8431ac6d53c9493f8c22077d23aa0。当前单主题RESUME-PERSISTENCE-RECEIPT是成功黄金链的第一项前置。第五轮本地真实隔离链已限定通过，尚待最新精确CI；整体PRODUCT-REACCEPTANCE-1仍NOT_ACCEPTED。

下文保留各轮当时的运行中/待验/额度中断交接记录，不删除失败历史；当前结论以末段“第五轮最终本地结果”为准。

## 源码合同与最小修复

原ResumeController在ingest抛错后仍继续个性题Gateway调用，并对已登录用户返回ragIngested=true；原ResumeRAGService不检查insert回执，也不读回持久化结果。公共owner读取使用默认一致性且缺少status/data合同。

当前实现仅在insert明确Success、count为1、合法int64主键及按主键和owner的Strong读回逐字段相等后兑现ingest；insert/query各设置SDK 5000ms timeout。读回检查id/userId/name/position/summary/skills/createdAt。Controller遇未知存储结果返回503及“简历保存结果尚未确认，请刷新简历列表核验后再重试。”，不继续个性题调用。API保持原ragIngested布尔字段，不新增resumeId。

公共searchByUser使用Strong、5000ms SDK timeout，拒绝缺失/失败status及非数组data，保留owner过滤、清洗和排序。Home上传需HTTP成功及ragIngested===true；Interview上传同时要求HTTP成功、可解析JSON及严格true，避免错误回执报成功。它们不证明简历选择、会话关联和确认的所有生命周期正确。

ResumeParserService的TXT/MD解析当前是启发式，不调用模型；不能把provider缺“简历解析JSON”列为本轮事实。上传后个性题才经过Gateway。ResumeRAG embedding仍为既有OpenAI直接调用，不写Gateway用量账本；本轮不宣称该成本边界已经统一。

## 已实际核对的红绿证据

- 独立后端新spec初次19失败；追加公共读取合同后25项为24失败/1通过，真实exit1。object data由旧map异常拒绝，属于原已有通过，不冒充新增修复。无import/setup失败、网络或真实模型调用。
- 修复后同25项通过，真实exit0。覆盖Controller停止后续模型、insert非法状态/count/主键、Strong失败/缺status/空或错主键/错owner/错payload/重复行，以及正常Strong和公共读取清洗排序。
- 两个实际上传组件6项：旧Home 3失败/2通过，旧Interview 1失败；修复后6通过。全Web27文件284项通过、exit0。组件替身不是实际Milvus持久化证明。
- API Nest build、Web build与新API/Web镜像构建工具成功；API/Web相关lint/typecheck由父代理执行通过。本报告独立读回了25项绿、6项组件绿、全Web284及构建/镜像收据，不将本地构建替代镜像内验收。

临时收据为resume-persistence-red/read-red/green、resume-upload-web-red/green、resume-interview-upload-red、resume-web-full/build、resume-api-build及API/Web image对应日志/退出码；不提交本机日志。

- 本轮全API Jest首轮受沙盒127.0.0.1 listen EPERM阻断，3套失败/11项失败，不计通过；允许本地回环环境保持原断言重跑exit0：99套通过/4套跳过，834项通过/21项跳过。跳过项不计覆盖，不能继承CI环境的不同数量。

## 本轮真实隔离验收合同：运行中

新增resume-upload-evidence.mjs，接入现有候选policy浏览器两次拒绝检查之后、stream回归之前；fixture-policy-browser.cjs仅建立新的合成user/org/activejob作为前置，不seed目标简历，不声称注册/岗位创建已由产品UI完成。

1. 独立browserContext实际登录，通过真实owner GET预热API lazy collection，确认初始无简历。
2. 对本次唯一私有Milvus容器暂时pause，实际UI上传第一份TXT，要求约5秒后安全503、错误可见且无成功反馈，只有一次上传。精确核embedding+1、chat/rerank/external及Gateway账本无增。
3. finally执行unpause；先Strong直接读取并实际owner GET核验，允许未知请求已经落库，不能把超时解释为没有写入。随后用户显式上传不同TXT。
4. 要求真实201/strict ragIngested=true、浏览器成功状态，直接Strong读回owner及全部持久化payload，并与实际API列表对应；刷新、退出/重登录仍可读，其他用户读取拒绝且不泄露摘要。
5. 两次上传总预期embedding+2、chat+1、rerank/external不增，成功个性题唯一LLM_CALL单位1。失败请求不自动重试；不重置provider计数，不将直接embedding漏记Gateway账本说成零调用。
6. 删除新owner下所有合成简历并Strong核空，清理该owner的用量、job、user/org；全局PG Run和账本回原baseline。仅先核准的精确stats增量保存在fixture allowance，原policy零消息/Run/账本及无额外调用门继续保留。清理错误与原始错误聚合；失败不计通过。

首轮resume-receipt-chain已失败，后续纠正镜像尚待实际重验，不能提前登记实际5秒超时、成功上传、Strong读取或恢复通过。所用新API/Web镜像包含本轮源码及已合并ip-address10.7.4；最终必须核API/browser与严格PG schema/行多集/sequence、实际Milvus/Qdrant恢复，取得真实exit0，再绑定最新精确CI。

## 首轮真实失败与纠正：待新镜像验收

首轮resume-receipt-chain实际exit1：Milvus暂停后，浏览器20秒内没有收到预期503，新增helper line43超时；embedding增加1、chat未增加。未执行成功上传断言，verified未完成，清理验证/原policy统计核验也如实失败，不能记为完整恢复通过。不延长20秒浏览器门制造通过。

实际安装SDK 2.6.17的Data._insert先创建不含本次timeout的describeReq并等待describeCollection，之后才把5000ms交给Insert RPC。query预热不保证schema缓存已热；Collection.describeCollection使用本次timeout或client默认值。首轮实际Milvus诊断还记录float length256不能满足dim1024，独立暴露OpenAI SDK默认base64解码与数组fixture响应的编码不匹配。

最小纠正：Milvus client默认timeout5000；完整insert/query调用再以5000ms Promise.race有界等待，涵盖隐藏schema预查询。过期只结束调用方等待，不取消底层RPC；迟到insert可能写入，但不会继续Strong回读或个性题调用，不自动重试。embedding显式encoding_format=float并检查1024个finite number，拒绝稀疏数组、错误维数和非有限数。

新增6项在a03ff8a原服务上实际全部失败、exit1；同文件另25项有意按测试名跳过，不将其计作新红。首次尝试在Jest隔离SDK mock中requireActual触发Class extends undefined setup错误（1失败/30通过），该setup失败不计产品红；改为独立无网络子进程实际读取SDK preflight行为后31项全通过。另补迟到成功insert不得继续query/重试的正向合同后，最新32项全通过、真实exit0，相关eslint通过。子进程实际SDK证明describe请求丢timeout，业务等待/晚到测试用fake timers与deferred Promise，不冒充实际原生5秒存储证明。

父代理已读回API build/lint成功，新bounded镜像构建/真实重验另行记录。此次纠正由测试Agent获明确授权后修改产品服务，并经父代理源码复核，不宣称同一作者是完全独立产品审查。真实链仍未通过。

第二轮bounded链同样实际exit1：5秒有界请求已收到503，但候选Web的NGINX把API原始JSON替换成“API 服务暂不可用，请稍后重试”，helper line46安全未知message断言失败。未放宽该断言，成功上传和完整恢复仍未通过。根因是proxy_intercept_errors on配合error_page 502 503 504；父代理仅移除其中503，保留502/504兜底，不改API服务。

新增nginx-api-error.test.mjs在无发布端口的独立internal Docker网络运行真实NGINX及合成HTTP upstream，不访问业务容器、数据库或模型。以HEAD原NGINX配置重放实际失败1项/exit1（业务503原始upstream header未保留）；工作区配置通过1项/exit0，核503原JSON/HTTP/header透传、502/504仍兜底JSON、200响应和SSE字节/Content-Type保留。首次新配置试跑误断言兜底HTTP504应变502而失败；实际named location保留原HTTP504、body原statusCode502，这是既有行为，修正测试预期后通过，未修改产品该行为。该脚本为独立显式运行门，不冒充已接入所有CI。

真实NGINX测试收据resume-nginx-red、resume-nginx-green（上述错误预期）、resume-nginx-green2；所有本次唯一容器/网络已由finally清理。新Web镜像及完整链仍须重新验收；两轮失败不得被这个短回归替代。

第三轮resume-receipt-proxy-chain实际exit1：业务503安全提示、显式成功201与上传成功状态已越过，helper line60因页面存在两个“开始模拟面试”按钮触发Playwright strict mode。未完成Strong payload/relogin和verified门，因此不是完整上传验收通过，清理校验失败如实保留。三处等待已限定实际NextStep的complementary区域，不改按钮文案、产品实现或成功断言。

为先验证新子主题，第四轮将上传helper移至policy拒绝检查后；独立context不改原owner页面。后续training每次prepare读取当前provider stats作自身零增量基线，并不重置计数；最外层policy仍比较原始baseline加经核验的精确upload allowance。第四轮resume-receipt-final-chain运行中，未记真实整链通过。

NGINX短回归的镜像输入改为NGINX_FIXTURE_API_IMAGE/NGINX_FIXTURE_WEB_IMAGE，默认verification标签；先本地image inspect，再使用明确镜像，不拉取外部资产。实际配置仍从仓库只读挂载，父代理已显式执行该可移植版本exit0；这不代表尚未完成的全链成功。

独立源码复核另保留未知写入边界：inspect及delete后的Strong空读只说明读取时点；SDK底层若尚未终结，无法仅凭空读排除将来迟到写。当前固定SDK默认deadline降低隐藏等待风险，但Promise.race不是drain/fencing证明。实际inspect与随后GET数量不等会严格失败，不放宽断言；本轮不宣称一般未知写入或生产安全清理已完成。

## 保留限制

- SDK timeout仅限定本轮insert/query请求等待，不覆盖lazy init重试或embedding超时，也不撤销服务端写入或费用。
- 客户端未知结果必须先核验；本轮不是resume版本化/去重/所有并发场景，也不证明重启持久性。
- 本轮独立用户、岗位是fixture前置；不包含成功SSE、正式评价/技能映射、训练复测新报告，FULL_SIMULATION空skill映射断点保留后续。
- 即使后续合成provider工程链通过，也不证明真实模型质量、学习提升、真实账单或生产部署。历史未知费用及预算前置不变。旧16题未复制，业务容器和真实个人数据未操作。

## 首轮真实链失败（保留）

新镜像resume-receipt-chain实际exit1。API93/93及既有训练原生60秒/GET恢复回归走过，但新增pause Milvus后的上传在20秒内未返回503。未达到verified，清理核准断言及全局embedding151≠150恢复门失败；不记浏览器或严格恢复通过。外层私有容器退出清理后实查该次容器无残留。

实际安装SDK的Data._insert先describeCollection，describeReq未传入insert的timeout；因此单个insert参数5000ms不能约束完整SDK调用。另实读Milvus诊断出现float长度256/维度1024，现有embedding SDK默认编码路径需显式float及维度验证。这两项正在修复、加定向回归，不能延长20秒门或放宽调用计数制造通过。

## 首轮失败后的定向纠正（未重新通过真实链）

业务层storageDeadline覆盖完整insert/query Promise，包括SDK结构预查询；5秒到期仅判未知，不撤销底层写入、不继续Strong确认或个性化，不自动重试。Milvus客户端默认timeout也设5000ms。embedding显式encoding_format=float，并要求1024个有限数值，拒绝稀疏或非数值向量。lazy init和embedding整体等待仍不在本次5秒范围。

新增6项定向用例先实跑exit1，6失败/25未选；修复后31项全部通过exit0、API重构建exit0。实际安装SDK在隔离子进程中重现insert不传describe timeout；服务测试还验证晚到拒绝/读回不能改变已超时结论。真实链尚需新镜像重跑，旧首轮exit1不能删除。独立Agent随后额度中断，纠正代码仍需恢复独立复核，不能凭父代理自测合并。

第二轮准备收据：纠正API镜像构建exit0，最终全API Jest99套通过/4套跳过、841通过/21跳过exit0；Web代码未再变仍284通过。resume-receipt-bounded-chain已启动，保持20秒故障回执门及所有既有严格恢复/精确计数断言，尚无最终结论。

二次源码复核补充：inspect Strong与owner GET是两个时点，底层迟到写若在其间落库将触发现有严格不等失败。delete后Strong空也只证明该读时点；没有旧SDK操作终结/fence证明，不宣称一般未知写入未来绝不重现。最终私有容器销毁与严格快照读回属于本次隔离工程证据，不推广为生产未知写入取消/持久去重。

## 第二轮真实失败（保留）

resume-receipt-bounded-chain exit1，新增上传已收到503，但实际message是Web nginx拦截后的“API 服务暂不可用，请稍后重试”，缺少明确保存未知及核验提示。state.verified与精确provider恢复门因此失败，不计完整恢复。源码定位apps/web/nginx.conf的error_page 502 503 504；当前最小改为仅拦截502/504，透传业务503。API及原浏览器预期不放宽。新Web镜像待验收，前两轮失败不能覆盖。

## 第四轮真实失败与第五轮待验

resume-receipt-final-chain实际exit1：原始Strong payload核对通过后，public owner列表summary比较失败。原存储模板在空经验/项目冒号后保留空格；searchByUser既有scrubPdfStructureNoise逐行trim，返回公共summary去掉该空格。未修改该产品行为，不能把原始存储和清洗后公共输出错误混为同一字节合同。

修正helper保留原始Strong summary严格比较，并明确断言本合成解析experience/projects均为空数组；公共summary逐字期待“经验:\n项目:”而非冒号后空格。name/position/skills/createdAt仍逐字段精确，重登录读取与跨用户不泄露检查同步使用明确publicSummary，而非任意trim实际值来制造一致。该纠正只修测试合同，不放宽持久化payload验证。第四轮已核准stats不代表下游重登录/清理/恢复通过；第五轮仍待实际完整结果。

## 第五轮最终本地结果：限定通过，等待精确CI

独立验收Agent已实际读取resume-receipt-clean-read-chain.exit为0及同名原始日志：API93/93（112行）；新增上传局部（142行）；原候选完整浏览器（159行）；PostgreSQL完整schema/行多集/sequence恢复一致（255行）；实际Milvus题目和Qdrant向量/payload恢复（258行）；隔离恢复收尾（259行）。四轮失败记录全部保留，未用中间PASS行代替完整退出码。

新增上传证明本次私有合成环境实际TXT经真实NGINX/API，在Milvus暂停时约5秒返回明确业务未知503，先存储核验再显式第二次上传，实际201及Strong owner/payload与清洗后公共读取对应，刷新/退出重登录保持、其他用户读取拒绝；结束时合成owner资产清理及原policy精确计数门未抛错。实际增量为2次直接embedding、1次Gateway chat及1个LLM_CALL单位，外部请求0；不得写成零模型调用或所有embedding已记账，不推广历史账单。

当前产品/测试和整体diff已复核，NGINX只移除503拦截、502/504仍保留；完整storageDeadline拒绝迟到结果且不继续后续步骤，仍不证明底层RPC撤销。库存990原ID和所有审查/证据/verdict字段保持，仅109项位置更新，两受影响源码hash相符，不计运行时覆盖率。父代理实施最初回执保护及NGINX，测试Agent获授权编写后续deadline/float服务纠正，父代理再读审；独立Agent也恢复核对32项、实际第五轮日志与退出码，不把作者自查冒充完全独立实现审计。

阶段仅为I06持久化回执前置的本地工程限定通过。必须继续以提交后最新精确push/PR CI冻结候选，尚未远端交付或部署；不覆盖I06全部状态、I07–I14成功黄金链、模型质量或生产未知写入恢复。
