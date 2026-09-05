# Shopping Approval

原生微信小程序，用于朋友或伴侣之间的双人购物申请与审批。前端在微信运行，后端使用 CloudBase 云函数与文档数据库，不需要自行购买 ECS。

## 第一版范围

- 微信云调用身份识别，设置昵称。
- 一次性邀请码绑定搭档、解除绑定。
- 创建购物申请：商品名称、金额、分类、购买理由、HTTPS 商品链接。
- 待我审批、我的申请、已处理列表与分页。
- 同意、驳回并填写理由、驳回后修改重提、撤回、标记已购买。
- 审批历史、服务端权限、金额按分保存、提交幂等和版本检查。

第一版不含支付、自动下单、多人审批、图片上传、订阅通知、公开社区。不会读取微信昵称或头像；昵称由用户主动填写。业务设计可在此基础上二开。

## 当前状态

截至 2026-09-05：代码已初始化；CloudBase CLI 登录已验证，开发环境 ID 为 `basic-d0g7ij3x16f8cdbb6`（上海、体验版）。

**尚未完成：自己的小程序 AppID、环境与小程序关联、数据库创建及规则应用、云函数部署、双人真机验收。** `project.config.json` 的 AppID 故意留空，不使用参考项目的账号。

微信后台浏览器操作被工具安全策略阻止，需要账号所有者提供 AppID。开发者工具已安装，但 Codex 连接授权尚未成功。不要将当前状态理解为小程序已上线。

## 本地开发

要求 Node.js 18+、微信开发者工具和你自己的微信小程序账号。

```sh
npm ci --ignore-scripts --prefix cloudfunctions/shoppingApi
npm run verify
npm run check:native
```

`check:native` 使用 macOS 已安装的微信开发者工具内置 WXML/WXSS 编译器。其他安装目录可设置 `WECHAT_COMPILER_DIR`。它只验证模板编译，不替代模拟器或真机。

在微信开发者工具中导入**仓库根目录**，填入自己的 AppID。小程序前端没有 npm 依赖，无需“构建 npm”。云函数依赖单独安装并有锁文件。

部署和联调步骤见 [docs/SETUP.md](docs/SETUP.md)；数据与安全约定见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 结构

```text
miniprogram/                 原生页面、样式和云调用
cloudfunctions/shoppingApi/  身份入口、业务规则、SDK 存储适配
cloudbase/database.json      集合、权限及索引配置清单（尚未应用）
tests/                      业务、身份入口与真实 SDK 接口契约测试
scripts/                    工程检查和原生模板编译检查
```

## 参考项目与授权

借鉴了以下公开项目的功能组织和工程经验；本仓库业务代码独立实现，未复制上游源文件或资源，也不是上游 fork。

- [CoderTongxin/miniprogram-2](https://github.com/CoderTongxin/miniprogram-2)，参考提交 `6164687856d57a589d9513b8a657c29473e2a842`：金额申请、审批列表、驳回重提。
- [qikuansun-art/wechat-program](https://github.com/qikuansun-art/wechat-program)，参考提交 `021e55b6990ee35808eccd0123c60d86743d256e`：云函数、双人绑定、事务与关系隔离。

没有自动继承上游许可证。本仓库暂为私有、未授予对外开源许可。使用的 SDK 许可证见安装后的依赖包。

## 验证边界

业务测试使用可回滚的内存存储，事务串行执行；SDK 契约测试保留真实 `wx-server-sdk` 包装层，只替换网络端存储。它们不能证明腾讯云线上并发、权限部署或微信双人行为已经通过。

当前 `wx-server-sdk@4.0.2` 的依赖审计仍有上游间接依赖告警，详见 [docs/SECURITY.md](docs/SECURITY.md)。正式上线前需处理或明确评估，不能将本版视为生产安全验收完成。
