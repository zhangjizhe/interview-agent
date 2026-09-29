# Agent 命令执行隔离路线图

## Phase 1 已实现

执行器与工具 Guard 共用命令白名单，默认 node、python3、git、ls、cat、grep、find；通过 `WORKSPACE_ALLOWED_BINARIES` 收缩。显式空值拒绝所有命令。路径形式、shell 和危险命令拒绝；调用方不能覆盖 PATH、NODE_OPTIONS 或动态库配置。超时、取消与输出上限继续生效。

这只是命令入口策略。解释器、git 和 find 的参数仍能执行其他程序；`network: DENY` 不是内核网络隔离，cwd 也不是文件系统隔离。当前本地执行器不能用于不可信多租户商用运行。

## 后续容器 Worker（规划，尚未实现）

保持 CommandExecutor 合同，以独立低权限 Worker 执行；服务 API 不挂载 Docker socket。镜像由可信流水线构建、扫描并固定 digest，不接受用户镜像或容器参数。

以下为隔离参数示意，需在专门阶段实现调度与验收后才能启用：

```sh
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --pids-limit 64 --memory 256m --cpus 1 \
  --user 10001:10001 --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  --mount type=bind,src="$WORKSPACE_DIR",dst=/workspace \
  --workdir /workspace "$PINNED_WORKER_IMAGE" node task.js
```

使用 Docker 默认 seccomp，禁止 privileged/host PID/host network；只挂载每次运行专属工作区，不挂载宿主凭据、源码根目录或 socket。任务完成销毁容器与临时空间；产物按大小、类型和保留期限回收。调度器强制时间与资源预算，取消时销毁整个执行单元。

验收覆盖：断网、越界文件读取、提权、进程炸弹、内存/CPU/输出限制、取消后无残留、并发租户隔离与产物清理。需要真实容器攻击用例及资源成本记录，单元测试不能替代隔离验收。
