# M0 技术版本事实

> 核对日期：2026-06-21<br>
> 来源：npm 官方 Registry 的当前包版本查询

本文件记录 M0 工程初始化时实际核对和固定的前端版本，避免后续仅凭记忆升级依赖。

| 包 | 固定版本 | 官方包页面 |
| --- | --- | --- |
| React | 19.2.7 | <https://www.npmjs.com/package/react> |
| React DOM | 19.2.7 | <https://www.npmjs.com/package/react-dom> |
| Three.js | 0.184.0 | <https://www.npmjs.com/package/three> |
| Zustand | 5.0.14 | <https://www.npmjs.com/package/zustand> |
| Vite | 8.0.16 | <https://www.npmjs.com/package/vite> |
| TypeScript | 6.0.3 | <https://www.npmjs.com/package/typescript> |
| Vitest | 4.1.9 | <https://www.npmjs.com/package/vitest> |
| `@vitejs/plugin-react` | 6.0.2 | <https://www.npmjs.com/package/@vitejs/plugin-react> |

当前本地初始化环境为 Node.js 24.16.0、npm 11.13.0。项目 README 只承诺 Node.js 20.19+，具体兼容范围以后续 CI 结果为准。

升级任一核心包时，应重新执行：

```bash
npm run typecheck
npm test
npm run build
```

Three.js revision 变化可能影响材质、ColorSpace、examples 导入路径和 Mesh 数据接口，应额外执行浏览器视觉回归。
