#!/bin/bash
# ROIS Optimizer Server 构建/打包脚本（开发机使用）
#
# 用法：
#   ./build.sh           用 PyInstaller 编译出单文件可执行 dist/optimize_server
#   ./build.sh pack      编译 + 把二进制 / 配置示例 / 运行时 deploy.sh 打成
#                        dist/rois-optimizer-server.tar.gz
#
# 重要：必须在与目标客户机相同 CPU 架构、glibc 版本 ≤ 目标机的 Linux 上构建。
#       建议直接在客户机或同 OS 版本的 Docker 容器内 build。

set -e

cd "$(dirname "$0")"

APP_NAME="rois-optimizer-server"
APP_DIR="$(pwd)"

# ============ 编译 ============
build() {
    echo "==> 检查 Python..."
    if ! command -v python3 &>/dev/null; then
        echo "错误：未找到 python3"
        exit 1
    fi
    PYTHON_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    echo "    Python $PYTHON_VER"

    echo "==> 准备构建虚拟环境 build-venv ..."
    if [ ! -f "build-venv/bin/activate" ]; then
        rm -rf build-venv
        if ! python3 -m venv build-venv; then
            echo "错误：venv 创建失败。Debian/Ubuntu 请安装：sudo apt-get install python${PYTHON_VER}-venv"
            exit 1
        fi
    fi
    source build-venv/bin/activate

    echo "==> 安装依赖 + PyInstaller..."
    pip install --upgrade pip -q
    pip install -r requirements.txt -q
    pip install pyinstaller -q

    echo "==> 生成 git.properties ..."
    python3 generate_git_properties.py || echo "警告：git.properties 生成失败，使用默认值"

    echo "==> 清理旧产物..."
    rm -rf build dist

    echo "==> PyInstaller 打包 (onefile)..."
    pyinstaller --clean optimize_server.spec

    if [ ! -f "dist/optimize_server" ]; then
        echo "错误：构建失败，dist/optimize_server 不存在"
        exit 1
    fi

    SIZE=$(du -h dist/optimize_server | cut -f1)
    echo ""
    echo "==> 构建完成！"
    echo "    可执行文件: $APP_DIR/dist/optimize_server ($SIZE)"
}

# ============ 打包 ============
# 编译可执行文件后，把二进制 + 配置示例 + 运行时 deploy.sh 打成 tar.gz。
# 发布包不包含任何 Python 源码。
pack() {
    echo "==> 步骤 1/2：编译可执行文件..."
    build

    echo ""
    echo "==> 步骤 2/2：打包发布产物..."
    PACK_DIR=$(mktemp -d)
    TARGET="$PACK_DIR/$APP_NAME"
    mkdir -p "$TARGET"

    # 二进制
    cp dist/optimize_server "$TARGET/optimize_server"
    chmod +x "$TARGET/optimize_server"

    # 配置示例（不含真实密钥/路径，由客户端复制为 config.yaml 后自行修改）
    if [ -f "src/config/config.yaml.example" ]; then
        cp src/config/config.yaml.example "$TARGET/config.yaml.example"
    elif [ -f "config.yaml" ]; then
        cp config.yaml "$TARGET/config.yaml.example"
    fi

    # 运行时 deploy.sh（scripts/ 下，二进制运行模式，不含 venv/pip 逻辑）
    if [ ! -f "scripts/deploy.sh" ]; then
        echo "错误：未找到 scripts/deploy.sh"
        exit 1
    fi
    cp scripts/deploy.sh "$TARGET/deploy.sh"
    chmod +x "$TARGET/deploy.sh"

    # 打包
    TARBALL="$APP_DIR/dist/$APP_NAME.tar.gz"
    tar czf "$TARBALL" -C "$PACK_DIR" "$APP_NAME"
    rm -rf "$PACK_DIR"

    SIZE=$(du -h "$TARBALL" | cut -f1)
    echo "==> 打包完成：$TARBALL ($SIZE)"
    echo ""
    echo "发布包内容（无源码）："
    echo "  optimize_server         单文件可执行（PyInstaller onefile）"
    echo "  config.yaml.example     配置示例"
    echo "  deploy.sh               运行时管理脚本（install/start/stop/restart/status）"
    echo ""
    echo "下一步（DEPLOY_DIR 替换为客户机部署目录）："
    echo "  scp $TARBALL user@客户机:<DEPLOY_DIR>/"
    echo "  ssh user@客户机"
    echo "  cd <DEPLOY_DIR> && tar xzf $APP_NAME.tar.gz && cd $APP_NAME"
    echo "  cp config.yaml.example config.yaml && vi config.yaml"
    echo "  ./deploy.sh install && ./deploy.sh start"
}

# ============ 入口 ============
case "${1:-build}" in
    build) build ;;
    pack)  pack ;;
    *)
        echo "用法: $0 {build|pack}"
        echo ""
        echo "  build  仅编译可执行文件 (默认)"
        echo "  pack   编译 + 打成发布 tar.gz"
        exit 1
        ;;
esac
