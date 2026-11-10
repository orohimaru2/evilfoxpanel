#!/bin/sh
set -eu

write_headers() {
	cat <<'EOF'
	header {
		X-Content-Type-Options nosniff
		Referrer-Policy no-referrer
		X-Frame-Options SAMEORIGIN
		-Server
	}
EOF
}

write_internal() {
	cat > /config/Caddyfile <<EOF
{
	admin off
	auto_https off
	log {
		output stdout
		format console
		level INFO
	}
}

https://:10000 {
	tls internal
$(write_headers)
	reverse_proxy panel:80
}
EOF
}

write_letsencrypt() {
	domain="${PANEL_DOMAIN:-}"
	email="${ACME_EMAIL:-}"

	case "$domain" in
		""|*[!A-Za-z0-9.-]*|.*|*.|-*|*-.*)
			echo "PANEL_DOMAIN должен быть доменом вроде panel.example.com" >&2
			exit 1
			;;
	esac
	case "$domain" in
		*.*) ;;
		*)
			echo "PANEL_DOMAIN должен быть доменом вроде panel.example.com" >&2
			exit 1
			;;
	esac
	case "$email" in
		*@*.*) ;;
		*)
			echo "ACME_EMAIL должен быть почтой для уведомлений Let's Encrypt" >&2
			exit 1
			;;
	esac

	cat > /config/Caddyfile <<EOF
{
	admin off
	email ${email}
	https_port 10000
	log {
		output stdout
		format console
		level INFO
	}
}

${domain} {
	tls {
		issuer acme {
			disable_tlsalpn_challenge
		}
	}
$(write_headers)
	reverse_proxy panel:80
}
EOF
}

case "${TLS_MODE:-internal}" in
	internal) write_internal ;;
	letsencrypt) write_letsencrypt ;;
	*)
		echo "TLS_MODE должен быть internal или letsencrypt" >&2
		exit 1
		;;
esac

exec "$@"
