#!/bin/bash
set -e

REPO="fmaclen/canutin"
BRANCH="next"
INSTALL_DIR="${CANUTIN_DIR:-$HOME/.canutin}"
COMPOSE_URL="https://raw.githubusercontent.com/$REPO/$BRANCH/docker-compose.prod.yml"
BIN_DIR="$HOME/.local/bin"

check_docker() {
    if ! command -v docker &> /dev/null; then
        echo "Error: Docker is not installed. Install it first:"
        echo "  curl -fsSL https://get.docker.com | sudo sh"
        echo "  sudo usermod -aG docker \$USER"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        echo "Error: Docker is not running or you don't have permission."
        echo "Try: sudo usermod -aG docker \$USER && newgrp docker"
        exit 1
    fi
}

install_cli() {
    mkdir -p "$BIN_DIR"
    cat > "$BIN_DIR/canutin" << 'CLIFILE'
#!/bin/bash
set -e

INSTALL_DIR="${CANUTIN_DIR:-$HOME/.canutin}"

case "${1:-status}" in
    upgrade|update)
        echo "==> Upgrading Canutin..."
        cd "$INSTALL_DIR"
        docker compose pull
        docker compose up -d --remove-orphans
        docker image prune -f > /dev/null 2>&1 || true
        echo "==> Done!"
        ;;
    start)
        echo "==> Starting Canutin..."
        cd "$INSTALL_DIR"
        docker compose up -d
        ;;
    stop)
        echo "==> Stopping Canutin..."
        cd "$INSTALL_DIR"
        docker compose down
        ;;
    restart)
        echo "==> Restarting Canutin..."
        cd "$INSTALL_DIR"
        docker compose restart
        ;;
    logs)
        cd "$INSTALL_DIR"
        docker compose logs -f "${@:2}"
        ;;
    status)
        cd "$INSTALL_DIR"
        docker compose ps
        ;;
    uninstall)
        echo "==> Uninstalling Canutin..."
        cd "$INSTALL_DIR"
        docker compose down -v
        rm -rf "$INSTALL_DIR"
        rm -f "$HOME/.local/bin/canutin"
        echo "==> Canutin uninstalled"
        ;;
    *)
        echo "Usage: canutin <command>"
        echo ""
        echo "Commands:"
        echo "  status     Show running services (default)"
        echo "  upgrade    Pull latest images and restart"
        echo "  start      Start services"
        echo "  stop       Stop services"
        echo "  restart    Restart services"
        echo "  logs       Show logs (optionally: logs pocketbase|sveltekit)"
        echo "  uninstall  Remove Canutin and all data"
        ;;
esac
CLIFILE
    chmod +x "$BIN_DIR/canutin"

    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        echo ""
        echo "Note: Add $BIN_DIR to your PATH:"
        echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc"
        echo ""
    fi
}

main() {
    echo "==> Canutin v2 installer"
    
    check_docker

    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"

    echo "==> Downloading docker-compose.prod.yml..."
    curl -fsSL "$COMPOSE_URL" -o docker-compose.yml

    echo "==> Pulling latest images..."
    docker compose pull

    echo "==> Starting services..."
    docker compose up -d --remove-orphans

    echo "==> Installing CLI..."
    install_cli

    docker image prune -f > /dev/null 2>&1 || true

    echo ""
    echo "==> Canutin is running!"
    echo ""
    echo "    Frontend:   http://localhost:42069"
    echo "    PocketBase: http://localhost:42070"
    echo "    Admin:      http://localhost:42070/_/"
    echo ""
    echo "Commands:"
    echo "    canutin status   - Show services"
    echo "    canutin upgrade  - Update to latest version"
    echo "    canutin logs     - View logs"
    echo ""
}

main
