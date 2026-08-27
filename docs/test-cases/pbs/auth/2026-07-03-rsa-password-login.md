# PBS Portal 登录密码 RSA 加密传输人工测试

日期：2026-07-03
范围：PBS Portal 登录页、PBS Server `/api/auth/session` 与 `/api/auth/login`

## 前置条件

- PBS Server 已配置 `PBS_AUTH_RSA_PRIVATE_KEY` 与 `PBS_AUTH_RSA_KEY_ID`，或本地 dev/test 使用进程内临时 key。
- PBS Portal 与 PBS Server 为同一批次代码。
- 测试账号可正常登录。

## 测试步骤

1. 打开 PBS Portal 登录页。
2. 打开浏览器 DevTools Network。
3. 输入 user code 与 password，点击 `Sign In`。
4. 查看 `GET /api/auth/password-public-key`：
   - 返回 `algorithm = RSA-OAEP-256`。
   - 返回非空 `keyId`。
   - 返回 `publicKeyPem`，且只包含 public key。
5. 查看 `POST /api/auth/session` request payload：
   - 不存在 `password` 字段。
   - 不包含输入的原始密码字符串。
   - 存在 `encryptedPassword`。
   - 存在 `encryption.algorithm = RSA-OAEP-256`。
   - 存在 `encryption.keyId`。
6. 确认正确密码能登录并进入 Dashboard。
7. 使用错误密码登录：
   - 页面停留在 Login。
   - 仍然发送 encrypted payload。
   - 不出现明文密码。
8. 用 API 工具直接 POST 明文 payload：

```json
{
  "userCode": "测试账号",
  "password": "测试密码"
}
```

期望：

- `/api/auth/session` 返回 400。
- `/api/auth/login` 返回 400。
- auth service 不应执行密码校验。

## 日志检查

- PBS Server 日志不应出现原始密码。
- PBS Server 日志不应输出完整 `encryptedPassword`。
- 解密失败只应返回通用错误，不暴露 key 或 crypto 内部细节。

## 通过标准

- Network 中没有任何登录 POST body 明文密码。
- 明文 payload 被后端拒绝。
- 加密 payload 正常登录。
- legacy `/api/auth/login` 不能绕过加密要求。
