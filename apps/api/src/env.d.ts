/** 运行时补充的绑定声明（声明合并到 wrangler types 生成的全局 CloudflareBindings）。 */

interface CloudflareBindings {
  /** 注册邀请码：设置后注册必须携带正确邀请码；未设置（默认）时开放注册。 */
  SIGNUP_CODE?: string;
  /** 额外允许的写操作来源（逗号分隔）：本地开发或前后端分域部署时使用。 */
  ALLOWED_ORIGINS?: string;
  /** 前端站点地址：非 /api/* 请求（如 workers.dev 旧地址）会 302 跳到这里。 */
  WEB_APP_URL?: string;
}
