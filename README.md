# Afizzy 网络检测

纯前端静态站点，打开页面后自动检测三个生产域名的 DoH 解析，并加载一张用户指定的 Afizzy 公开图片。三个域名各向 Cloudflare、Google 查询 A 与 AAAA，共 12 项 DoH；图片另有 1 项加载结果。页面可停止、重测并把完整日志下载到本机；没有诊断后端、HTTP 业务探测、代理或报告上传。

## 本地开发

Node.js 22.12+ 仅用于构建与 Vite 开发服务。

```sh
npm ci
npm run dev
```

打开 `http://127.0.0.1:4173/`。正式产物由 `npm run build` 生成在 `dist/`，可部署到支持 HTTPS 的静态托管/CDN，部署时不需要 Node 运行时。`npm run preview` 可预览构建产物。

## 检测边界

- 三个域名来自[已审核目标目录](config/network-diagnostics.yaml)。浏览器只向 Cloudflare 与 Google 的 DoH 端点发送无凭据 GET 查询，不向目标站点发 HTTP 请求。
- 单项 DoH 最长等待 10 秒，默认最多并发 3 项；展示 DNS 状态码、浏览器可读取的 A/AAAA/CNAME、TTL、总耗时与事件日志。
- 资源加载：浏览器对[已登记图片](config/network-diagnostics.yaml)发起一次 GET，使用诊断参数避免本地缓存，最长等待 15 秒。记录加载成功与否、耗时和尺寸。该图片当前约 62.5 KB，CDN 未稳定向浏览器提供可读取的传输字节数，因此**不计算 Mbps**；加载耗时可能包含 CDN 缓存未命中与图片处理，不等于带宽。
- DoH 答案属于指定公共解析器，不等于访问者设备的系统 DNS，也不证明目标网站或 API 的 HTTP 业务流程可用。纯网页无法直接读取系统 DNS 的解析记录或所用 DNS 服务器。
- 报告只在页面内存和本地 JSON 下载中保留。浏览器跨域策略限制读取时，结果标记为无法判定，不解释为服务中断。

## 验证

```sh
npm test
npm run test:e2e
npm run build
```

单元测试使用模拟响应，Playwright 使用本机 Chrome 验证桌面和手机视口。真实 iOS Safari、Android Chrome、用户现场网络和公网部署仍需单独验收。仓库尚未配置 Git 远端，也未部署上线。

部署检查见 [docs/deployment.md](docs/deployment.md)。
