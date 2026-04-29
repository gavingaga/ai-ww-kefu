# gateway-ws 压测脚本

```bash
cd services/gateway-ws
go run ./scripts/loadtest \
    -url ws://localhost:8080/v1/ws \
    -n 50000 -rate 1000 -dur 60s -interval 2s
```

输出示例:

```
[t+15:42:18] connected=12345 peak=12345 sent=23456 recvd=23456 errs=0 rtt_avg=2.1ms rtt_p99=18.3ms
=== summary ===
peak_connections=50000 still_connected=49998
sent=2400000 recvd=2400000 errors=2
rtt avg=2.4ms p50=1.8ms p90=4.5ms p99=22.1ms
```

## 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `-url` | ws://localhost:8080/v1/ws | gateway-ws 入口 |
| `-n` | 1000 | 目标并发连接数(峰值) |
| `-rate` | 200 | 每秒新建连接节流值 |
| `-dur` | 30s | 总运行时长 |
| `-interval` | 5s | 每条连接发送间隔 |
| `-subprotocol` | v1.aikefu | Sec-WebSocket-Protocol |

## 系统调参建议(50k+)

```bash
# macOS:打开 file descriptor 上限
ulimit -n 1048576

# Linux:网卡 + TCP backlog
sysctl -w net.core.somaxconn=65535
sysctl -w net.ipv4.tcp_max_syn_backlog=65535
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
```
