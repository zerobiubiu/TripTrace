/// <reference types="vite/client" />

/** 由 vite.config.ts 的 define 注入：根 package.json 的版本号。 */
declare const __APP_VERSION__: string;
/** 正式站点地址（构建期注入）：旧 workers.dev 地址会跳到它，保证只有一个登录源。 */
declare const __CANONICAL_URL__: string;
