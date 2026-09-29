# Afizzy 网络检测
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
React、TypeScript、Vite；正式交付为静态 `dist/`。

## Users
遇到解析或网络问题的 Afizzy 用户，以及阅读本地 JSON 日志的研发和 QA。

## Product Purpose
从问题设备的浏览器一次查看三个域名的 DoH 答案和一个公开图片的加载耗时。

## Capabilities and Constraints
仅使用已登记的三个生产域名、Cloudflare/Google 公共 DoH GET 与用户指定的一张公开图片 GET。全部检测请求来自访问者浏览器。不发起目标站点 HTTP 业务请求，不将 DoH 伪装为系统 DNS，也不把小图片加载耗时伪装为带宽。报告仅留在页面内存或本地下载，不上传。支持中英文、手机与桌面、键盘操作。

## Evidence on Hand
`config/network-diagnostics.yaml`、目标来源提交、两个 DoH 解析器官方文档，以及用户在 2026-09-29 提供的资源 URL。

## Product Principles
打开即检测；四组目标同时可见；先展示结果，再按需展开证据；无法读取的结果保留为未知。
