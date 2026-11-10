# Развёртывание на Ubuntu

Панель поднимается двумя контейнерами. Caddy принимает HTTPS на порту **10000** и передаёт запрос внутреннему nginx. Порт 80 наружу не открывается. Подходит для Ubuntu 22.04 и 24.04.

В браузере адрес будет таким: `https://IP-СЕРВЕРА:10000`.

Сертификат выпускает внутренний центр Caddy. Браузер один раз предупредит, что подпись неизвестна. Ниже есть шаг, как сохранить этот сертификат и доверять ему.

## Что нужно заранее

- Сервер Ubuntu 22.04 или 24.04 с доступом по SSH.
- Пользователь с `sudo`.
- Свободный TCP-порт 10000.
- Исходящий доступ в интернет: Docker скачает образы nginx и Caddy.
- На своём компьютере Windows — клиент OpenSSH. В Windows 10 и 11 он уже есть в PowerShell.

Панели хватает 1 ГБ памяти. Если на этом же сервере стоит Dokploy, оставь запас и смотри отдельный раздел в конце.

## 1. Обновить систему

Подключись к серверу и выполни:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl
```

## 2. Поставить Docker

Ставь пакеты из репозитория Docker. Пакет `docker.io` из Ubuntu и snap-версию не используй: вместе с Docker Engine они конфликтуют.

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

Обе команды должны напечатать версии. `docker compose` здесь с пробелом: это плагин, не отдельная программа `docker-compose`.

## 3. Разрешить запуск без sudo

Подставь своё имя пользователя вместо `deploy`:

```bash
sudo adduser deploy
sudo usermod -aG docker deploy
```

Дальше работай уже под `deploy`. Группа `docker` применяется после нового входа:

```bash
sudo -iu deploy
```

Проверка без `sudo`:

```bash
docker ps
```

Пустой список и отсутствие ошибки `permission denied` — нормальный результат.

## 4. Открыть порт 10000

Если файрвол ещё не включён, сначала разреши SSH, и только потом включай `ufw`. Иначе текущая сессия оборвётся.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 10000/tcp
sudo ufw enable
sudo ufw status
```

В статусе должны быть разрешены `OpenSSH` и `10000/tcp`.

Порты 80 и 443 для этой панели не нужны. Их занимает Dokploy, если он уже установлен на сервере, и открывать их ради EvilFox не требуется.

Если сервер арендован, открой TCP 10000 ещё и в панели хостера: security group, firewall облака или «сети» в личном кабинете. Правило в `ufw` само по себе облачный фильтр не открывает.

## 5. Скопировать проект с Windows

На сервере создай каталог:

```bash
sudo mkdir -p /opt/evilfox
sudo chown "$USER:$USER" /opt/evilfox
```

На своём компьютере открой PowerShell. В команде замени `deploy` и `203.0.113.10` на пользователя и IP сервера:

```powershell
scp -r "D:\Новая папка 13\evilfoxpanel" deploy@203.0.113.10:/opt/evilfox
```

На сервере проект окажется в `/opt/evilfox/evilfoxpanel`. Перейди туда:

```bash
cd /opt/evilfox/evilfoxpanel
ls
```

В каталоге должны быть `docker-compose.yml`, `Dockerfile` и папка `caddy`.

Для обычного сервера используй `docker-compose.yml`. Файл `docker-compose.dokploy.yml` нужен только тогда, когда стек запускает сам Dokploy. На чистой Ubuntu внешняя сеть `dokploy-network` не создана, и этот файл завершится с ошибкой.

## 6. Запустить

Из каталога проекта:

```bash
docker compose up --build -d
```

Первый запуск скачивает базовые образы и собирает панель. Дождись окончания без строк `error`.

Контейнеры сами поднимаются после перезагрузки сервера: у Docker включён автозапуск, а у сервисов в compose стоит `restart: unless-stopped`.

## 7. Проверить, что панель отвечает

```bash
docker compose ps
curl -kI https://127.0.0.1:10000/healthz
```

У `panel` и `caddy` статус должен быть `running` или `healthy`. Ответ `healthz` — `HTTP/2 200`.

Флаг `-k` нужен только для этой проверки: `curl` на сервере не доверяет внутреннему сертификату Caddy.

С своего компьютера открой:

```text
https://IP-СЕРВЕРА:10000
```

Именно `https`. На порту 10000 нет обычного HTTP, поэтому адрес с `http://` не откроется.

На экране входа любые имя и пароль пускают внутрь. Это макет: учётные данные никуда не отправляются.

## 8. Убрать предупреждение браузера

Caddy хранит свой корневой сертификат в томе. Забери его на сервер в виде файла:

```bash
cd /opt/evilfox/evilfoxpanel
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

Скопируй файл обратно на Windows. В PowerShell:

```powershell
scp deploy@203.0.113.10:/opt/evilfox/evilfoxpanel/caddy-root.crt "$env:USERPROFILE\Downloads\caddy-root.crt"
```

Дальше на Windows:

1. Дважды открой `caddy-root.crt`.
2. «Установить сертификат».
3. Расположение: «Локальный компьютер». Если пункта нет, хватит «Текущий пользователь».
4. Помести сертификат в хранилище «Доверенные корневые центры сертификации».
5. Закрой браузер полностью и снова открой `https://IP-СЕРВЕРА:10000`.

Предупреждение может остаться, если в сертификате нет имени, которым ты открываешь сайт. Внутренний сертификат Caddy выпущен для этого порта, а не для конкретного домена. Для макета это ожидаемо: соединение уже зашифровано, браузер просто не знает центр, который его подписал.

Не удаляй тома Docker без нужды. Команда `docker compose down -v` стирает центр сертификации, и установленный на Windows корень перестанет подходить к новому.

## 9. Обновить панель

После того как на сервер легла новая копия файлов:

```bash
cd /opt/evilfox/evilfoxpanel
docker compose up --build -d
```

Compose пересоберёт изменившиеся образы и перезапустит контейнеры. Том с сертификатом сохранится.

Посмотреть, что происходит:

```bash
docker compose logs -f caddy
```

Выход из просмотра логов: `Ctrl+C`. Сами контейнеры при этом не останавливаются.

## 10. Остановить

Остановить и убрать контейнеры, оставив сертификат:

```bash
cd /opt/evilfox/evilfoxpanel
docker compose down
```

Остановить и стереть ещё и сертификат:

```bash
docker compose down -v
```

Каталог `/opt/evilfox/evilfoxpanel` после `down` остаётся на диске.

## Если на сервере уже стоит Dokploy

Dokploy занимает порты 80, 443 и 3000. EvilFox их не использует и слушает 10000, поэтому рядом они уживаются.

Есть два рабочих способа.

**Через интерфейс Dokploy.** В проекте создай сервис типа Compose, укажи файл `docker-compose.dokploy.yml` и запусти деплой. Домен во вкладке Domains не добавляй: Traefik Dokploy ходит в контейнер по HTTP и сломает TLS, который уже завершает Caddy. После деплоя открой `https://IP-СЕРВЕРА:10000` и проверь, что TCP 10000 открыт в `ufw` и у хостера.

**Вручную, тем же Docker.** Dokploy уже поставил Docker, второй раз его ставить не нужно. Скопируй проект в `/opt/evilfox/evilfoxpanel` и запусти обычный файл:

```bash
docker compose up --build -d
```

На ручном запуске не используй `docker-compose.dokploy.yml`: он требует сеть `dokploy-network`, которую создаёт сам Dokploy для своих сервисов.

## Если страница не открывается

Порт занят другой программой:

```bash
sudo ss -ltnp | grep 10000
```

Если строка есть и это не процесс `docker-proxy`, освободи порт или останови тот контейнер. Потом снова `docker compose up -d`.

Контейнер есть, а снаружи тишина. На сервере `curl -kI https://127.0.0.1:10000/healthz` отвечает, а браузер нет. Тогда пакет режет файрвол. Проверь `sudo ufw status` и правило TCP 10000 в панели хостера.

`permission denied` при `docker`. Пользователь не в группе `docker` или вход был до `usermod`. Выполни `sudo usermod -aG docker "$USER"` и зайди по SSH заново.

`network dokploy-network declared as external, but could not be found`. Запущен файл для Dokploy на сервере без Dokploy. Запускай `docker compose up --build -d` без `-f docker-compose.dokploy.yml`.

Сборка обрывается на скачивании образа. Серверу нужен выход в интернет до `download.docker.com`, Docker Hub и репозитория базовых образов. Повтори `docker compose up --build -d`, когда сеть доступна.

В браузере «сайт не может обеспечить безопасное соединение» сразу после установки своего корня. Закрой все окна браузера, не только вкладку, и открой адрес снова. Адрес должен начинаться с `https://` и заканчиваться `:10000`.
