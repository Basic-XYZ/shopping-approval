# 架构与数据契约

## 分层

微信原生页面通过 `wx.cloud.callFunction` 调用 `shoppingApi`；`index.js` 校验真实微信上下文，`service.js` 执行业务，`store.js` 对接微信 SDK。没有自建服务器、Web SDK 登录或客户端直写数据库。

请求统一为 `{ action, ...fields }`，响应为 `{ ok: true, data }` 或 `{ ok: false, code, message }`。客户端传来的身份、审批人、状态和关系 ID 不作为授权依据。

## 集合

| 集合 | 关键字段 | 约束 |
| --- | --- | --- |
| sa_users | `_id`、`name`、`groupId`、`inviteHash`、`inviteAt`、`lastCreatedAt` | `_id` 为 APPID 和 OPENID 的 SHA-256；同一用户不会重复注册 |
| sa_invites | `_id`、`ownerId`、`expiresAt`、`used` | `_id` 为随机邀请码的哈希；24小时有效，单次使用 |
| sa_groups | `_id`、`members`、`active`、`createdAt`、`endedAt` | 每次绑定生成新的随机关系 ID；双方事务绑定/解绑 |
| sa_requests | `_id`、`groupId`、`creatorId`、`approverId`、`title`、`amountCents`、`category`、`reason`、`link`、`status`、`revision`、`history` | ID 由申请人和提交编号确定；金额为整数分，最多100万元 |

时间戳统一为服务端产生的 Unix 毫秒。昵称在申请和操作记录内保存当时快照，修改昵称不改写历史。所有列表限定当前有效关系，不做无边界全量扫描。

## 状态机

| 操作 | 原状态 | 新状态 | 执行者 |
| --- | --- | --- | --- |
| create | 无 | pending | 当前关系成员 |
| approve | pending | approved | 指定审批人 |
| reject | pending | rejected | 指定审批人，必填理由 |
| resubmit | rejected | pending | 申请人，重新校验字段 |
| cancel | pending | cancelled | 申请人 |
| purchase | approved | purchased | 申请人 |

每次流转需提交当前 `revision`，成功后递增。审批与解绑共享关系文档写入，以便事务检测冲突。提交短时间限流，网络重试使用同一 `clientId` 返回原申请。

每份申请最多50条操作记录。第一版不提供删除申请；解绑只关闭关系，不物理删除历史数据。重新绑定同一人也不会重开旧关系。未来如需数据导出、恢复历史或账号注销，应单独设计访问和保留策略。

## 二开边界

- 页面改版主要修改 `miniprogram/pages`，后端协议独立。
- 增加状态先修改状态机和权限测试，再修改按钮显示条件。
- 多人房间、不同审批策略应先调整关系模型，不把多个成员强塞入双人字段。
- 图片和订阅通知需单独补资源授权、安全校验及发送失败处理。
