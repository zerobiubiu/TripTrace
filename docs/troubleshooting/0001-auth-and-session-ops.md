# 排查手册：鉴权与会话运维

- 状态：参考（长期有效）
- 关联组件：`src/lib/auth.ts`、D1 `users`/`sessions`、KV `triptrace-sessions`

## 1. PBKDF2 迭代上限与 CPU 额度

**现象/背景**：把 `PBKDF2_ITERATIONS` 调得很高（例如 210000）时，注册/登录接口直接报错；官方说明是 workerd 对 PBKDF2 迭代次数有 **100000 次硬上限**，超出即抛错（原因：CPU 限额无法中断 BoringSSL 中的 PBKDF 计算，只能限制迭代次数），见 [cloudflare/workerd#1346](https://github.com/cloudflare/workerd/issues/1346)。

**本项目取值**：`wrangler.jsonc` → `vars.PBKDF2_ITERATIONS = "100000"`（即上限），并写入每个账号的 `users.pwd_iterations`，将来升级算法不影响存量账号。

**额度判断**：Workers 免费版为 10ms CPU/请求，付费（Standard/Unbound）默认 30s。10 万次 PBKDF2-SHA256 约几十毫秒 CPU：

- 付费账号：安全，无需处理（本项目当前账号即为此情况）。可用
  `GET /accounts/{account_id}/workers/account-settings` → `default_usage_model: "standard"` 判断；
- 免费账号：注册/登录可能触发 `1102 Worker exceeded resource limits`。处置二选一：
  1. 下调迭代次数：把 `wrangler.jsonc` 的 `PBKDF2_ITERATIONS` 改为 `20000` 左右（下限由 `src/lib/crypto.ts` 钳制在 10000），重新部署；仅影响新注册账号，存量账号仍按各自 `pwd_iterations` 校验；
  2. 把 KDF 移到客户端（浏览器算 PBKDF2，服务端只做 HMAC 校验），对本应用属于改造，需单独评估。

**排查线索**：接口 500 且响应体为 `Worker exceeded resource limits`，或 Workers Logs 里出现 `exceededCpu`。

## 2. 手动删除用户 / 重置密码后的会话缓存清理

**背景**：KV 里的会话缓存键为 `s:<userId>:<sha256(token)>`，命中即视为有效（为了省一次 D1 读）。正常路径（登出、改密）都会同步删除 KV；但**直接用 SQL 删用户或改密码**不会碰 KV，残留的缓存最长可存活 30 天（TTL），期间该 Cookie 仍能通过校验。

**标准处置（实测可用）**：

```bash
# 1) 确认要清理的用户
npx wrangler d1 execute triptrace-db --remote --json \
  --command "SELECT id, username FROM users WHERE username = '<用户名>'"

# 2) 列出该用户的会话缓存键
npx wrangler kv key list --namespace-id aa2cda7e62da49c7bb8449ec6150d888 \
  --prefix "s:<userId>:" --remote

# 3) 写一个键数组文件（如 .wrangler/kv-delete.json）后批量删除
npx wrangler kv bulk delete --namespace-id aa2cda7e62da49c7bb8449ec6150d888 \
  .wrangler/kv-delete.json --remote --force

# 4) 删除用户（trips/sessions 因 ON DELETE CASCADE 一并删除）
npx wrangler d1 execute triptrace-db --remote \
  --command "DELETE FROM users WHERE username = '<用户名>'"
```

2026-10-08 的线上冒烟即按上述流程清理：删除测试账号后 `SELECT COUNT(*) FROM users` 为 0，`kv key list --prefix "s:"` 返回 `[]`。

**忘记密码**（无邮箱找回流程）的处理方式：先按上面清理该用户 KV 缓存，再删除其账号，然后让本人重新注册同一用户名（行程数据不会自动恢复，必要时先导出备份：应用内「⋯ → 导出数据」）。

**注意**：`wrangler kv key delete <key>` 直接删单个键在 4.148.0 上参数校验较严，用 `kv bulk delete` 更稳；`DELETE FROM users` 会级联删除该用户全部行程，执行前先确认。
