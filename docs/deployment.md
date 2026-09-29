# 静态部署与验收

执行 `npm ci`、`npm run build`，把 `dist/` 作为不可变版本上传到 HTTPS 静态托管或 CDN。正式运行不需要 Node 进程、API、代理或报告存储。若配置 CSP，`connect-src` 允许 `https://cloudflare-dns.com` 和 `https://dns.google`；`img-src` 还需允许 `https://d2p265uuh9lhx2.cloudfront.net`。页面自身的资源和字体随静态产物提供。

发布前检查：

1. 核对 `config/network-diagnostics.yaml` 登记三个生产域名、一张用户指定的公开图片，以及两个有来源证据的只读 DoH GET 解析器。图片 GET 不带报告或业务请求体。
2. 执行 `npm test`、`npm run test:e2e`、`npm run build`；核对自动检测、停止、重测、JSON 下载与请求来源。浏览器检测时只应访问两个 DoH 域名和已登记图片，不应请求三个目标网站或任何本项目后端。
3. 在公网 HTTPS 页面和真实问题设备上验收 Cloudflare、Google DoH 的跨域可读性；分别检查 iOS Safari、Android Chrome。桌面 Chrome 的手机视口模拟不等于实机验收。
4. 保留前一个已验证的 `dist/` 作为回滚版本。报告留在访问者设备，回滚无需迁移用户报告。

DoH 成功只说明公共解析器返回了答案，不证明设备的系统 DNS、目标 HTTP 连接或业务请求正常。不同解析器的 CDN 地址不同也不能直接判定异常。当前图片约 62.5 KB 且浏览器通常读不到跨域传输字节，因此其加载耗时不得宣称为 Mbps 或用户网络带宽。
