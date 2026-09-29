# Afizzy Network Diagnostics

- This is the standalone network diagnostics project. Work from this repository root.
- Output progress, findings, tests and risks in Chinese.
- Do not write files in `ai-chat-roleplay` or another product repository while developing this tool.
- Treat `config/network-diagnostics.yaml` as the target catalog. Every enabled endpoint must have source evidence and a reviewed side-effect-free method.
- Reports remain on the user's device. Never add report upload, credential capture, chat requests, payments or arbitrary host/port scanning to the default flow.
- All checks run in the visitor's browser. DoH results are not the visitor's system DNS results. An opaque response or CORS failure is not proof of a service outage.
- Keep reproducible tests and sanitized fixtures in this repository. Keep raw network logs and user data out of Git.
