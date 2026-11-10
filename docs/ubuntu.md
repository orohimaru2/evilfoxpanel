# Развёртывание на Ubuntu с Let's Encrypt

Панель открывается по адресу `https://домен:10000`. Сертификат выпускает Let's Encrypt, браузер принимает его без ручной установки корня.

Порт **10000** — сама панель. Порт **80** панель не показывает: Caddy занимает его, чтобы Let's Encrypt мог проверить, что домен указывает на этот сервер. Порт 443 не нужен.

Подходит для Ubuntu 22.04 и 24.04.

## Что нужно заранее

- Сервер Ubuntu и пользователь с `sudo`.
- Домен, которым ты управляешь. На IP-адрес Let's Encrypt сертификат не даст.
- Почта, на которую Let's Encrypt пришлёт напоминание, если сертификат не продлится.
- Свободные TCP-порты 80 и 10000. Если на сервере уже работает Dokploy, Traefik или другой сайт на порту 80, обычная проверка Let's Encrypt здесь не пройдёт. Для этой схемы порт 80 должен принадлежать Caddy.
- Исходящий интернет: Docker скачает образы, Caddy обратится к Let's Encrypt.

Панели хватает 1 ГБ памяти.

## 1. Направить домен на сервер

У регистратора или в DNS хостинга создай запись:

| Тип | Имя | Значение |
| --- | --- | --- |
| A | `panel` | IPv4 сервера |

Если панель должна открываться как `panel.example.com`, имя записи — `panel`. Если как корень `example.com`, имя записи — `@`.

Запись AAAA добавляй только когда сервер реально отвечает по IPv6. Иначе Let's Encrypt может пойти на недоступный адрес и отказать в сертификате.

Подожди, пока DNS обновится, и проверь с сервера или со своего компьютера:

```bash
dig +short panel.example.com
```

Команда должна напечатать IPv4 этого сервера и больше ничего лишнего. Пока здесь чужой или пустой адрес, стек не запускай: Let's Encrypt засчитает неудачную попытку, а число попыток в час ограничено.

Если у домена есть CAA-запись, в ней должен быть разрешён `letsencrypt.org`. Нет CAA-записи — ничего добавлять не нужно.

## 2. Обновить систему

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl dnsutils
```

`dnsutils` даёт команду `dig`.

## 3. Поставить Docker

Ставь пакеты из репозитория Docker. Пакет `docker.io` из Ubuntu и snap-версию не ставь: вместе с Docker Engine они конфликтуют.

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Проверка:

```bash
docker --version
docker compose version
```

`docker compose` пишется с пробелом. Это плагин, не старая программа `docker-compose`.

## 4. Разрешить запуск без sudo

Подставь своё имя вместо `deploy`:

```bash
sudo adduser deploy
sudo usermod -aG docker deploy
sudo -iu deploy
docker ps
```

Пустой список без `permission denied` — нормальный результат. Группа применяется только в новом входе, поэтому дальнейшие команды выполняй уже под `deploy`.

## 5. Открыть порты

Сначала разреши SSH, и только потом включай файрвол. Иначе текущая сессия оборвётся.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 10000/tcp
sudo ufw enable
sudo ufw status
```

В статусе должны быть `OpenSSH`, `80/tcp` и `10000/tcp`.

Те же три порта открой в панели хостера, если она есть: security group, firewall облака или раздел «Сеть». Правило в `ufw` облачный фильтр само не открывает.

Порт 443 для этой схемы не открывай и ничем его не занимай специально. Панель живёт на 10000.

## 6. Скопировать проект

На сервере:

```bash
sudo mkdir -p /opt/evilfox
sudo chown "$USER:$USER" /opt/evilfox
```

На Windows, в PowerShell, подставь пользователя и IP:

```powershell
scp -r "D:\Новая папка 13\evilfoxpanel" deploy@203.0.113.10:/opt/evilfox
```

На сервере:

```bash
cd /opt/evilfox/evilfoxpanel
ls
```

Рядом должны лежать `docker-compose.yml`, `Dockerfile` и каталог `caddy`. Для этого сервера используй `docker-compose.yml`. Файл `docker-compose.dokploy.yml` запускает сам Dokploy, на чистой Ubuntu он не нужен.

## 7. Записать домен и почту

В каталоге проекта создай файл `.env`:

```bash
cd /opt/evilfox/evilfoxpanel
nano .env
```

Содержимое, уже со своими значениями:

```env
TLS_MODE=letsencrypt
PANEL_DOMAIN=panel.example.com
ACME_EMAIL=admin@example.com
```

`PANEL_DOMAIN` — только имя, без `https://` и без `:10000`. `ACME_EMAIL` — живая почта: Let's Encrypt пишет на неё, если продление сломается. Файл `.env` на сервере не выкладывай в git.

## 8. Запустить

```bash
docker compose up --build -d
docker compose logs -f caddy
```

Первый запуск занимает минуту: Caddy доказывает Let's Encrypt, что домен смотрит на этот сервер, и сохраняет сертификат. В логах должна появиться строка, что сертификат получен. Выход из логов: `Ctrl+C`. Контейнеры при этом продолжают работать.

Пока сертификат не получен, не перезапускай стек много раз подряд. У Let's Encrypt есть предел неудачных проверок одного домена, примерно пять в час.

Сертификат лежит в томе Docker и продлевается сам, примерно за месяц до конца. Для продления порт 80 должен оставаться открытым. Команда `docker compose down -v` удаляет том вместе с сертификатом, и следующий запуск запрашивает новый.

После перезагрузки сервера контейнеры поднимаются сами: Docker включён в автозапуск, у сервисов стоит `restart: unless-stopped`.

## 9. Проверить замок

На сервере:

```bash
docker compose ps
curl -fsSI --resolve panel.example.com:10000:127.0.0.1 https://panel.example.com:10000/healthz
echo | openssl s_client -connect panel.example.com:10000 -servername panel.example.com 2>/dev/null | openssl x509 -noout -issuer -dates
```

`curl` должен показать `HTTP/2 200`. В строке `issuer` должен быть `Let's Encrypt`. Флаг `-k` здесь не нужен: система уже доверяет этому центру.

В браузере открой именно:

```text
https://panel.example.com:10000
```

Адрес с портом обязателен. Замок у адреса означает, что сертификат выпущен на этот домен.

Адрес `http://panel.example.com` без порта Caddy перенаправляет на `https://panel.example.com:10000`.

На экране входа любые имя и пароль открывают макет. Учётные данные никуда не отправляются.

## 10. Обновить файлы панели

После новой копии проекта на сервер:

```bash
cd /opt/evilfox/evilfoxpanel
docker compose up --build -d
```

Том с сертификатом сохраняется, заново проходить проверку домена не нужно, пока домен и почта в `.env` те же.

## 11. Остановить

Остановить контейнеры и оставить сертификат:

```bash
docker compose down
```

Остановить и удалить ещё и сертификат:

```bash
docker compose down -v
```

Каталог проекта на диске остаётся.

## Если на сервере уже стоит Dokploy

Dokploy держит порты 80, 443 и 3000. Этой панели для Let's Encrypt нужен порт 80, поэтому на том же сервере обычный выпуск сертификата конфликтует с Traefik.

Рабочий вариант — отдельный сервер, где порт 80 свободен, и файл `docker-compose.yml` из этой инструкции.

Файл `docker-compose.dokploy.yml` тоже публикует 80 и 10000. Запускай его через Dokploy только на машине, где порт 80 не занят. В переменных окружения Dokploy задай те же `TLS_MODE`, `PANEL_DOMAIN` и `ACME_EMAIL`. Домен во вкладке Domains не добавляй.

## Если сертификат не выпускается

Посмотри причину:

```bash
cd /opt/evilfox/evilfoxpanel
docker compose logs --tail 80 caddy
```

Домен смотрит не на этот сервер. `dig +short panel.example.com` должен показать ровно IPv4 сервера. Исправь DNS и подожди, прежде чем запускать снова.

Порт 80 снаружи закрыт. С другого компьютера `curl -I http://panel.example.com` должен получить ответ, а не зависнуть. Проверь `sudo ufw status` и firewall хостера.

Порт 80 занят на самом сервере:

```bash
sudo ss -ltnp | grep ':80 '
```

Если это не `docker-proxy` этого стека, останови программу, которая держит 80, и снова выполни `docker compose up -d`.

В логах ошибка про TLS-ALPN или порт 443. Для этой панели проверка идёт только по HTTP на порту 80. Убедись, что в `.env` стоит `TLS_MODE=letsencrypt`, и пересобери Caddy: `docker compose up --build -d`.

`PANEL_DOMAIN` указан с протоколом или портом. В файле должно быть `panel.example.com`, не `https://panel.example.com:10000`.

Слишком много неудачных попыток. Подожди час. Пока DNS и порт 80 не проверены, стек не перезапускай.

Браузер пишет, что соединение не защищено, хотя `issuer` уже Let's Encrypt. Открыт IP или `localhost`, а не имя из `PANEL_DOMAIN`, либо пропущен порт `:10000`.
