/** 运行时补充的绑定声明（声明合并到 wrangler types 生成的全局 CloudflareBindings）。 */

interface CloudflareBindings {
  /** 注册邀请码：设置后注册必须携带正确邀请码；未设置（默认）时开放注册。 */
  SIGNUP_CODE?: string;
  /** 额外允许的写操作来源（逗号分隔）：本地开发未走 Vite 代理、或前端分域部署时使用。 */
  ALLOWED_ORIGINS?: string;
  /** 管理员用户名（逗号分隔、大小写不敏感）：名单内账号可访问 /api/admin/*，其余账号一律 403。 */
  ADMIN_USERNAMES?: string;
}
