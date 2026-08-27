# PBS 输入输出安全加固手工 QA

日期：2026-07-07
范围：PBS crew bid import、算法导出 CSV、crew autocomplete / crew search 权限
关联设计：`docs/superpowers/specs/2026-07-07-security-audit-phase-3-input-output-hardening-design.md`

## 前置条件

- PBS Portal 使用真实登录态访问。
- 至少准备一个普通 crew 用户账号，且该用户在 `pbs_user` 中有 `crew_id`、`base`、`division`。
- 至少准备一个 admin 用户账号。
- 准备一份合法 crew bid `.txt` 样例，文本中包含：
  - `Period:` 行。
  - `Seniority <num> Category <value> Employee # <value>` 行。
  - `Default Bid` 或 `Current Bid`。

## 用例 1：合法 crew bid `.txt` 仍可 dry-run

步骤：

1. 使用 admin 登录 PBS Portal。
2. 打开 crew bid import 管理入口。
3. 上传合法 `.txt` 文件并执行 dry-run。

预期：

- dry-run 成功返回报告。
- 页面可看到 selected / ready / problem 等统计。
- 后端没有把合法文本误判为非法上传。

## 用例 2：非法上传在进入业务解析前被拒绝

步骤：

1. 使用 admin 登录。
2. 分别上传以下文件执行 dry-run：
   - `.csv` 文件。
   - `.txt` 扩展名但内容是无效 UTF-8 字节。
   - `.txt` 扩展名但内容缺少 `Period:` 或 crew header。
   - `.txt` 扩展名但内容包含 NUL 字节。

预期：

- 请求返回 400。
- `.csv` 返回 `Crew bid import file must be a .txt file.`
- 非 UTF-8 返回 `Crew bid import file must be valid UTF-8 text.`
- 缺少业务结构或包含 NUL 返回 `Crew bid import file format is invalid.`
- import run 不应被创建。

## 用例 3：普通用户不能访问 import admin 上传入口

步骤：

1. 使用普通 crew 用户登录。
2. 直接请求 crew bid import dry-run / import API，或在浏览器中访问对应管理操作。

预期：

- 请求返回 403。
- 返回信息为 admin access required 类错误。
- 不执行文件解析和 import service。

## 用例 4：算法导出 CSV 公式注入防护

步骤：

1. 使用测试数据构造或选择含有可控文本字段的算法导出数据。
2. 字段值分别以 `=`、`+`、`-`、`@`、前导空白后 `=`、制表符后 `=` 开头。
3. 执行 PBS algorithm export，下载导出包。
4. 解压并检查 `DAYSOFF.csv`、`PAIRING_SCORE.csv`、`LINE_RULES.csv`。

预期：

- 字符串字段中的公式前缀已被单引号前置，例如 `'=1+1`。
- 数字字段如 `-12` 保持数字输出，不被额外加单引号。
- 原有逗号、双引号、换行仍按 CSV 规则正确转义。
- CSV 列名、列顺序、文件名保持不变。

## 用例 5：普通用户 crew search 只返回本人和同 base + division 范围

步骤：

1. 使用普通 crew 用户登录。
2. 在 Pairing 页面触发 crew id autocomplete。
3. 在可添加 employee / crew 条件的属性配置中触发 crew options 搜索。
4. 搜索：
   - 本人 crew id。
   - 同 base + division 的其他 crew。
   - 不同 base 或不同 division 的 crew。

预期：

- 本人可搜索到。
- 同 base + division 的 crew 可搜索到。
- 不同 base 或不同 division 的 crew 不出现在候选结果中。
- 空 query 不触发全员扫描，仍返回空 options。

## 用例 6：admin crew search 可全量搜索

步骤：

1. 使用 admin 登录。
2. 触发 Pairing crew id autocomplete。
3. 触发 PBS crew options 搜索。
4. 搜索不同 base / division 的 crew。

预期：

- admin 可以搜索到符合 query 的全量非 admin crew 候选。
- 排序和 limit 行为与修复前保持一致。

## 回归关注

- 普通用户缺少 `base` 或 `division` 时，应至少可以搜索本人，不应横向枚举其他 crew。
- `pbs_user` 与 live `crew` 两个搜索入口权限口径必须一致。
- 上传失败不应留下 import run、import item 或 problem 记录。
- CSV 打开方式不同可能影响显示，验收以原始 CSV 文本内容为准。
