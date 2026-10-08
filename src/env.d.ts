/**
 * 运行时补充的绑定声明（声明合并到 wrangler types 生成的全局 Env）。
 * 这里只补充未写入 wrangler.jsonc 的密钥，通过 `wrangler secret put <名字>` 设置后生效。
 */
interface Env {
  /** 注册邀请码：设置后注册必须携带正确邀请码；未设置（默认）时开放注册。 */
  SIGNUP_CODE?: string;
}
