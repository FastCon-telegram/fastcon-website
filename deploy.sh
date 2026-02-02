#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DOMAIN="fastcon.harknmav.fun"
APP_DIR="/opt/fastcon"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║       🌐 FastCon Website - Автоматический деплой         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Запустите с sudo: sudo ./deploy.sh${NC}"
    exit 1
fi

# Get server IP
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo -e "${GREEN}[1/7] Обновление системы...${NC}"
apt update && apt upgrade -y

echo -e "${GREEN}[2/7] Установка зависимостей...${NC}"
apt install -y curl git nginx certbot python3-certbot-nginx

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Установка Docker...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Install Docker Compose plugin if not present
if ! docker compose version &> /dev/null; then
    echo -e "${YELLOW}Установка Docker Compose...${NC}"
    apt install -y docker-compose-plugin
fi

echo -e "${GREEN}[3/7] Создание директории приложения...${NC}"
mkdir -p "$APP_DIR"

# Check if running from git clone or local copy
if [ -f "./package.json" ]; then
    cp -r ./* "$APP_DIR/"
elif [ -f "/tmp/fastcon-website/package.json" ]; then
    cp -r /tmp/fastcon-website/* "$APP_DIR/"
else
    echo -e "${RED}❌ Файлы проекта не найдены${NC}"
    echo "Запустите скрипт из директории проекта или скопируйте файлы в /tmp/fastcon-website/"
    exit 1
fi

cd "$APP_DIR"

# Create .env file
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${YELLOW}📝 Создан файл .env с настройками по умолчанию${NC}"
fi

echo -e "${GREEN}[4/7] Сборка Docker образа...${NC}"
docker compose build

echo -e "${GREEN}[5/7] Настройка DNS...${NC}"
echo ""
echo -e "${YELLOW}Проверьте DNS запись:${NC}"
echo "  Тип:      A"
echo "  Имя:      fastcon"
echo "  Значение: ${SERVER_IP}"
echo ""

# Check DNS
RESOLVED_IP=$(dig +short "$DOMAIN" 2>/dev/null | head -n1)
if [ "$RESOLVED_IP" = "$SERVER_IP" ]; then
    echo -e "${GREEN}✓ DNS настроен правильно${NC}"
else
    echo -e "${YELLOW}⚠ DNS ещё не настроен или не распространился${NC}"
    echo "  Ожидаемый IP: $SERVER_IP"
    echo "  Текущий IP:   ${RESOLVED_IP:-не найден}"
    echo ""
    read -p "Продолжить? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Настройте DNS и запустите скрипт снова"
        exit 0
    fi
fi

echo -e "${GREEN}[6/7] Получение SSL сертификата...${NC}"
# Stop nginx temporarily for standalone certificate
systemctl stop nginx 2>/dev/null || true

certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --email admin@harknmav.fun || {
    echo -e "${YELLOW}⚠ Не удалось получить сертификат автоматически${NC}"
    echo "Попробуйте вручную: certbot certonly --standalone -d $DOMAIN"
}

echo -e "${GREEN}[7/7] Настройка Nginx и запуск приложения...${NC}"

# Copy nginx config
cp "$APP_DIR/nginx/fastcon.conf" /etc/nginx/sites-available/fastcon
ln -sf /etc/nginx/sites-available/fastcon /etc/nginx/sites-enabled/

# Remove default site if exists
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t

# Start services
systemctl enable nginx
systemctl start nginx
docker compose up -d

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗"
echo -e "║              ✅ Деплой успешно завершён!                  ║"
echo -e "╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "🌐 Сайт:        ${GREEN}https://${DOMAIN}${NC}"
echo -e "📊 Админ-панель: ${GREEN}https://${DOMAIN}/stats${NC}"
echo -e "🔐 Пароль:       ${YELLOW}0402036${NC}"
echo ""
echo -e "${YELLOW}Полезные команды:${NC}"
echo "  Логи:          docker compose -f ${APP_DIR}/docker-compose.yml logs -f"
echo "  Перезапуск:    docker compose -f ${APP_DIR}/docker-compose.yml restart"
echo "  Статус:        docker compose -f ${APP_DIR}/docker-compose.yml ps"
echo ""
