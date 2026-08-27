#!/bin/bash
# 在构建机上执行：安装依赖并用 Vite 打包 pbs-portal 静态资产
# 产物：dist/  (base path /fpqe/pbs/)
#
# 用法：
#   ./build.sh                    # 标准构建
#   NODE_ENV=production ./build.sh

set -e

cd "$(dirname "$0")"

echo "==> 检查 Node.js..."
if ! command -v node &>/dev/null; then
    echo "错误：未找到 node，请安装 Node.js 20+"
    exit 1
fi
NODE_VER=$(node -e 'process.stdout.write(process.version)')
echo "    Node.js $NODE_VER"

echo "==> 检查包管理器..."
if command -v pnpm &>/dev/null; then
    PKG=pnpm
elif command -v npm &>/dev/null; then
    PKG=npm
else
    echo "错误：未找到 npm 或 pnpm"
    exit 1
fi
echo "    使用 $PKG"

echo "==> 安装依赖..."
$PKG install --frozen-lockfile 2>/dev/null || $PKG install

echo "==> 清理旧产物..."
rm -rf dist

echo "==> TypeScript 类型检查 + Vite 打包..."
$PKG run build

if [ ! -f "dist/index.html" ]; then
    echo "错误：构建失败，dist/index.html 不存在"
    exit 1
fi

DIST_SIZE=$(du -sh dist | cut -f1)
echo ""
echo "==> 构建完成！"
echo "    产物目录: $(pwd)/dist ($DIST_SIZE)"
echo "    Base path: /fpqe/pbs/"
echo ""
echo "部署：将 dist/ 目录内容复制到 Nginx /fpqe/pbs/ 路径下"
