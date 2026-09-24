# Tailwind + shadcn 测试项目

## 位置

独立测试仓库位于：

```text
F:\lint-shadcn-tailwind-test
```

它与 Flint 主仓库分开，自己的 Git 根目录是测试项目目录。这样扫描器从测试项目目录运行时，不会受到主仓库未来 `package.json`、工作区或多包结构的影响。

## 当前内容

- React + TypeScript + Vite；
- Tailwind CSS v4；
- ESLint；
- `@shadcn/lint`；
- shadcn CLI；
- shadcn `components.json`；
- Button、Card、Input 组件；
- 已实际使用这些组件的页面。

## 验证命令

在测试项目目录运行：

```bash
npm install
npm run build
npm run lint
npx shadcn@4.21.0 info --json --cwd .
```

预期结果：

- 构建成功；
- ESLint 检查通过；
- Tailwind 版本识别为 v4；
- shadcn 官方查询返回 Button、Card、Input。

## 说明

主仓库的项目扫描阶段应把 `F:\lint-shadcn-tailwind-test` 当作真实用户项目来检测。测试项目暂不设置远程仓库，后续如需团队共享，再单独创建远程仓库。
