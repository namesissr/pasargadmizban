/**
 * قالب‌های نصب یک‌کلیکه.
 *
 * هر قالب یک اسکریپت cloud-init است که هنگام اولین بوت سرور اجرا می‌شود.
 * مشتری به جای اینکه ساعت‌ها با نصب دستی درگیر شود، سرور را آماده تحویل می‌گیرد.
 */

export type AppTemplate = {
  slug: string;
  name: string;
  description: string;
  category: 'web' | 'container' | 'database' | 'network' | 'panel' | 'base';
  icon: string;
  /** حداقل حافظه لازم به گیگابایت */
  minMemory: number;
  /** فقط روی این معماری‌ها قابل نصب است (خالی یعنی همه) */
  architectures?: ('x86' | 'arm')[];
  /** فقط روی این خانواده‌های سیستم‌عامل */
  osFlavors: string[];
  /** پورت‌هایی که پس از نصب باز می‌شوند — برای پیشنهاد فایروال و پایش */
  ports: number[];
  /** نکاتی که پس از ساخت به کاربر نشان داده می‌شود */
  notes: string[];
  cloudInit: (ctx: { hostname: string }) => string;
};

const HEADER = `#cloud-config
package_update: true
package_upgrade: false
`;

export const APP_TEMPLATES: AppTemplate[] = [
  {
    slug: 'none',
    name: 'بدون نصب اضافه',
    description: 'فقط سیستم‌عامل خام. همه چیز را خودتان نصب می‌کنید.',
    category: 'base',
    icon: '📦',
    minMemory: 0,
    osFlavors: [],
    ports: [22],
    notes: [],
    cloudInit: () => '',
  },
  {
    slug: 'hardened',
    name: 'سرور امن‌شده',
    description: 'به‌روزرسانی خودکار امنیتی، فایروال UFW، fail2ban و غیرفعال کردن ورود با رمز.',
    category: 'base',
    icon: '🛡',
    minMemory: 1,
    osFlavors: ['ubuntu', 'debian'],
    ports: [22],
    notes: [
      'ورود با رمز عبور غیرفعال می‌شود؛ حتماً پیش از ساخت، کلید SSH انتخاب کنید.',
      'fail2ban پس از ۵ تلاش ناموفق، آی‌پی مهاجم را ۱ ساعت مسدود می‌کند.',
    ],
    cloudInit: () => `${HEADER}packages:
  - ufw
  - fail2ban
  - unattended-upgrades
runcmd:
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp
  - ufw --force enable
  - systemctl enable --now fail2ban
  - sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  - systemctl restart ssh || systemctl restart sshd
  - echo 'Unattended-Upgrade::Automatic-Reboot "false";' > /etc/apt/apt.conf.d/51unattended-upgrades-local
`,
  },
  {
    slug: 'docker',
    name: 'داکر و داکر کامپوز',
    description: 'آخرین نسخه Docker Engine و Docker Compose، آماده اجرای هر کانتینری.',
    category: 'container',
    icon: '🐳',
    minMemory: 1,
    osFlavors: ['ubuntu', 'debian'],
    ports: [22],
    notes: ['پس از ورود، با دستور `docker run hello-world` نصب را بررسی کنید.'],
    cloudInit: () => `${HEADER}packages:
  - ca-certificates
  - curl
  - gnupg
runcmd:
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc || curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  - chmod a+r /etc/apt/keyrings/docker.asc
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$(. /etc/os-release && echo $ID) $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update
  - DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  - systemctl enable --now docker
`,
  },
  {
    slug: 'lemp',
    name: 'وب‌سرور LEMP',
    description: 'Nginx و PHP 8 و MariaDB با تنظیمات بهینه، آماده میزبانی سایت.',
    category: 'web',
    icon: '🌐',
    minMemory: 2,
    osFlavors: ['ubuntu', 'debian'],
    ports: [22, 80, 443],
    notes: [
      'رمز کاربر ریشه دیتابیس در فایل `/root/db-credentials.txt` ذخیره می‌شود.',
      'برای گرفتن گواهی SSL رایگان: `certbot --nginx -d yourdomain.com`',
    ],
    cloudInit: () => `${HEADER}packages:
  - nginx
  - mariadb-server
  - php-fpm
  - php-mysql
  - php-curl
  - php-gd
  - php-mbstring
  - php-xml
  - php-zip
  - certbot
  - python3-certbot-nginx
  - ufw
runcmd:
  - systemctl enable --now nginx mariadb
  - DBPASS=$(openssl rand -base64 24)
  - echo "MariaDB root password: $DBPASS" > /root/db-credentials.txt
  - chmod 600 /root/db-credentials.txt
  - mysqladmin -u root password "$DBPASS" || true
  - ufw allow 22/tcp && ufw allow 'Nginx Full' && ufw --force enable
`,
  },
  {
    slug: 'wordpress',
    name: 'وردپرس',
    description: 'نصب کامل وردپرس روی Nginx و MariaDB با پیکربندی آماده.',
    category: 'web',
    icon: '📝',
    minMemory: 2,
    osFlavors: ['ubuntu', 'debian'],
    ports: [22, 80, 443],
    notes: [
      'پس از آماده شدن، آی‌پی سرور را در مرورگر باز کنید تا نصب وردپرس را تکمیل کنید.',
      'اطلاعات دیتابیس در `/root/wordpress-credentials.txt` است.',
    ],
    cloudInit: ({ hostname }) => `${HEADER}packages:
  - nginx
  - mariadb-server
  - php-fpm
  - php-mysql
  - php-curl
  - php-gd
  - php-mbstring
  - php-xml
  - php-zip
  - php-intl
  - curl
  - ufw
runcmd:
  - systemctl enable --now nginx mariadb
  - DBPASS=$(openssl rand -base64 24)
  - mysql -e "CREATE DATABASE wordpress DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  - mysql -e "CREATE USER 'wp'@'localhost' IDENTIFIED BY '$DBPASS';"
  - mysql -e "GRANT ALL ON wordpress.* TO 'wp'@'localhost'; FLUSH PRIVILEGES;"
  - printf 'database: wordpress\\nuser: wp\\npassword: %s\\n' "$DBPASS" > /root/wordpress-credentials.txt
  - chmod 600 /root/wordpress-credentials.txt
  - curl -sL https://wordpress.org/latest.tar.gz -o /tmp/wp.tar.gz
  - tar -xzf /tmp/wp.tar.gz -C /var/www/
  - rm -rf /var/www/html && mv /var/www/wordpress /var/www/html
  - chown -R www-data:www-data /var/www/html
  - PHPVER=$(ls /run/php/ | grep -o '[0-9.]*' | head -1)
  - printf 'server {\\n listen 80 default_server;\\n server_name ${hostname};\\n root /var/www/html;\\n index index.php index.html;\\n client_max_body_size 64M;\\n location / { try_files $uri $uri/ /index.php?$args; }\\n location ~ \\\\.php$ { include snippets/fastcgi-php.conf; fastcgi_pass unix:/run/php/php%s-fpm.sock; }\\n}\\n' "$PHPVER" > /etc/nginx/sites-available/default
  - nginx -t && systemctl reload nginx
  - ufw allow 22/tcp && ufw allow 'Nginx Full' && ufw --force enable
`,
  },
  {
    slug: 'nodejs',
    name: 'محیط Node.js',
    description: 'Node.js 22 LTS همراه PM2 و Nginx به عنوان پروکسی معکوس.',
    category: 'web',
    icon: '🟩',
    minMemory: 1,
    osFlavors: ['ubuntu', 'debian'],
    ports: [22, 80, 443],
    notes: [
      'اپلیکیشن خود را روی پورت ۳۰۰۰ اجرا کنید؛ Nginx ترافیک پورت ۸۰ را به آن می‌فرستد.',
      'برای اجرای دائمی: `pm2 start app.js && pm2 save && pm2 startup`',
    ],
    cloudInit: () => `${HEADER}packages:
  - nginx
  - curl
  - git
  - build-essential
  - ufw
runcmd:
  - curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  - DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  - npm install -g pm2
  - printf 'server {\\n listen 80 default_server;\\n location / {\\n  proxy_pass http://127.0.0.1:3000;\\n  proxy_http_version 1.1;\\n  proxy_set_header Upgrade $http_upgrade;\\n  proxy_set_header Connection upgrade;\\n  proxy_set_header Host $host;\\n  proxy_set_header X-Real-IP $remote_addr;\\n }\\n}\\n' > /etc/nginx/sites-available/default
  - nginx -t && systemctl reload nginx
  - ufw allow 22/tcp && ufw allow 'Nginx Full' && ufw --force enable
`,
  },
  {
    slug: 'postgres',
    name: 'PostgreSQL',
    description: 'دیتابیس PostgreSQL با تنظیمات امن و دسترسی فقط از شبکه داخلی.',
    category: 'database',
    icon: '🐘',
    minMemory: 2,
    osFlavors: ['ubuntu', 'debian'],
    ports: [22, 5432],
    notes: [
      'رمز کاربر postgres در `/root/db-credentials.txt` است.',
      'برای دسترسی از بیرون، ابتدا فایروال ابری را تنظیم و سپس pg_hba.conf را ویرایش کنید.',
    ],
    cloudInit: () => `${HEADER}packages:
  - postgresql
  - postgresql-contrib
  - ufw
runcmd:
  - systemctl enable --now postgresql
  - DBPASS=$(openssl rand -base64 24)
  - sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '$DBPASS';"
  - echo "PostgreSQL postgres password: $DBPASS" > /root/db-credentials.txt
  - chmod 600 /root/db-credentials.txt
  - ufw allow 22/tcp && ufw --force enable
`,
  },
  {
    slug: 'wireguard',
    name: 'وی‌پی‌ان WireGuard',
    description: 'سرور WireGuard با یک کانفیگ آماده برای اتصال دستگاه اول.',
    category: 'network',
    icon: '🔐',
    minMemory: 1,
    osFlavors: ['ubuntu', 'debian'],
    ports: [22, 51820],
    notes: [
      'کانفیگ کلاینت در `/root/client.conf` ساخته می‌شود؛ آن را روی دستگاه خود وارد کنید.',
      'برای افزودن کاربر جدید، کلید تازه بسازید و به `/etc/wireguard/wg0.conf` اضافه کنید.',
    ],
    cloudInit: () => `${HEADER}packages:
  - wireguard
  - iptables
  - qrencode
  - ufw
runcmd:
  - sysctl -w net.ipv4.ip_forward=1
  - echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
  - umask 077 && mkdir -p /etc/wireguard
  - wg genkey | tee /etc/wireguard/server.key | wg pubkey > /etc/wireguard/server.pub
  - wg genkey | tee /etc/wireguard/client.key | wg pubkey > /etc/wireguard/client.pub
  - IFACE=$(ip route get 1.1.1.1 | awk '{print $5; exit}')
  - PUBIP=$(curl -s4 ifconfig.me)
  - printf '[Interface]\\nAddress = 10.8.0.1/24\\nListenPort = 51820\\nPrivateKey = %s\\nPostUp = iptables -t nat -A POSTROUTING -o %s -j MASQUERADE\\nPostDown = iptables -t nat -D POSTROUTING -o %s -j MASQUERADE\\n\\n[Peer]\\nPublicKey = %s\\nAllowedIPs = 10.8.0.2/32\\n' "$(cat /etc/wireguard/server.key)" "$IFACE" "$IFACE" "$(cat /etc/wireguard/client.pub)" > /etc/wireguard/wg0.conf
  - printf '[Interface]\\nPrivateKey = %s\\nAddress = 10.8.0.2/24\\nDNS = 1.1.1.1\\n\\n[Peer]\\nPublicKey = %s\\nEndpoint = %s:51820\\nAllowedIPs = 0.0.0.0/0, ::/0\\nPersistentKeepalive = 25\\n' "$(cat /etc/wireguard/client.key)" "$(cat /etc/wireguard/server.pub)" "$PUBIP" > /root/client.conf
  - chmod 600 /root/client.conf
  - qrencode -t ansiutf8 < /root/client.conf > /root/client-qr.txt
  - systemctl enable --now wg-quick@wg0
  - ufw allow 22/tcp && ufw allow 51820/udp && ufw --force enable
`,
  },
  {
    slug: 'monitoring',
    name: 'مانیتورینگ سرور',
    description: 'Netdata برای مشاهده لحظه‌ای مصرف پردازنده، حافظه، دیسک و شبکه.',
    category: 'panel',
    icon: '📊',
    minMemory: 1,
    osFlavors: ['ubuntu', 'debian'],
    ports: [22, 19999],
    notes: [
      'داشبورد روی پورت ۱۹۹۹۹ در دسترس است.',
      'برای امنیت، دسترسی به این پورت را در فایروال ابری فقط به آی‌پی خودتان محدود کنید.',
    ],
    cloudInit: () => `${HEADER}packages:
  - curl
  - ufw
runcmd:
  - curl -Ss https://my-netdata.io/kickstart.sh -o /tmp/netdata.sh
  - sh /tmp/netdata.sh --dont-wait --disable-telemetry
  - ufw allow 22/tcp && ufw allow 19999/tcp && ufw --force enable
`,
  },
];

export const CATEGORY_LABEL: Record<AppTemplate['category'], string> = {
  base: 'پایه و امنیت',
  web: 'وب و سایت',
  container: 'کانتینر',
  database: 'دیتابیس',
  network: 'شبکه',
  panel: 'ابزار مدیریتی',
};

export function findTemplate(slug: string | null | undefined): AppTemplate | null {
  if (!slug || slug === 'none') return null;
  return APP_TEMPLATES.find((t) => t.slug === slug) ?? null;
}

/** آیا این قالب با پلن و سیستم‌عامل انتخابی سازگار است؟ */
export function templateCompatible(
  template: AppTemplate,
  opts: { memory: number; architecture: string; osFlavor: string },
): { ok: boolean; reason?: string } {
  if (template.slug === 'none') return { ok: true };

  if (template.minMemory > opts.memory) {
    return { ok: false, reason: `این قالب حداقل ${template.minMemory} گیگابایت حافظه لازم دارد.` };
  }
  if (template.architectures?.length && !template.architectures.includes(opts.architecture as 'x86' | 'arm')) {
    return { ok: false, reason: 'این قالب با معماری پردازنده این پلن سازگار نیست.' };
  }
  if (template.osFlavors.length && !template.osFlavors.includes(opts.osFlavor)) {
    return {
      ok: false,
      reason: `این قالب فقط روی ${template.osFlavors.join('، ')} نصب می‌شود.`,
    };
  }
  return { ok: true };
}

/** فهرست سبک برای ارسال به مرورگر (بدون اسکریپت‌ها) */
export function templateList() {
  return APP_TEMPLATES.map((t) => ({
    slug: t.slug,
    name: t.name,
    description: t.description,
    category: t.category,
    categoryLabel: CATEGORY_LABEL[t.category],
    icon: t.icon,
    minMemory: t.minMemory,
    architectures: t.architectures ?? [],
    osFlavors: t.osFlavors,
    ports: t.ports,
    notes: t.notes,
  }));
}
