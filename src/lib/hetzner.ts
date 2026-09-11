import { env } from './env';

/**
 * کلاینت Hetzner Cloud API v1
 * مستندات: https://docs.hetzner.cloud/
 *
 * نکات مهم:
 *  - محدودیت نرخ: ۳۶۰۰ درخواست در ساعت برای هر پروژه. هدر RateLimit-Remaining را می‌خوانیم.
 *  - تمام خطاها به HetznerError تبدیل می‌شوند تا در لایه بالاتر قابل ترجمه باشند.
 */

export class HetznerError extends Error {
  code: string;
  statusCode: number;
  details: unknown;

  constructor(message: string, code = 'unknown', statusCode = 500, details?: unknown) {
    super(message);
    this.name = 'HetznerError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** پیام‌های فارسی برای کدهای خطای رایج هتزنر */
const ERROR_FA: Record<string, string> = {
  forbidden: 'دسترسی به این عملیات در حساب هتزنر مجاز نیست.',
  invalid_input: 'اطلاعات ارسالی به هتزنر نامعتبر است.',
  json_error: 'خطا در قالب داده ارسالی به هتزنر.',
  locked: 'سرور در حال انجام عملیات دیگری است. چند لحظه بعد تلاش کنید.',
  not_found: 'منبع مورد نظر در هتزنر یافت نشد.',
  rate_limit_exceeded: 'محدودیت تعداد درخواست هتزنر پر شده است. کمی بعد تلاش کنید.',
  resource_unavailable: 'این منبع در حال حاضر در دسترس نیست.',
  service_error: 'سرویس هتزنر با خطا مواجه شد.',
  uniqueness_error: 'موردی با این نام از قبل وجود دارد.',
  protected: 'این منبع محافظت‌شده است و قابل تغییر نیست.',
  maintenance: 'سرویس هتزنر در حال تعمیر است.',
  resource_limit_exceeded: 'سقف منابع حساب هتزنر پر شده است.',
  no_space_left_in_location: 'در این لوکیشن ظرفیت خالی وجود ندارد. لوکیشن دیگری انتخاب کنید.',
  unsupported_error: 'این عملیات برای این نوع سرور پشتیبانی نمی‌شود.',
  token_readonly: 'توکن API هتزنر فقط خواندنی است.',
  unauthorized: 'توکن API هتزنر نامعتبر است.',
  server_not_stopped: 'برای این عملیات ابتدا سرور باید خاموش شود.',
  placement_error: 'امکان قرارگیری سرور در این دیتاسنتر نیست.',
  primary_ip_assigned: 'این IP در حال حاضر به سرور دیگری اختصاص دارد.',
  server_has_ipv4: 'این سرور از قبل آدرس IPv4 دارد.',
  server_is_load_balancer_target: 'این سرور هدف یک متعادل‌کننده بار است.',
  primary_ip_datacenter_mismatch: 'آدرس انتخابی در دیتاسنتر این سرور نیست.',
  no_subnet_available: 'در حال حاضر آدرس IPv4 آزادی در این دیتاسنتر موجود نیست. کمی بعد تلاش کنید.',
};

export function hetznerErrorFa(err: unknown): string {
  if (err instanceof HetznerError) {
    return ERROR_FA[err.code] ?? err.message ?? 'خطای نامشخص از سمت هتزنر.';
  }
  return 'ارتباط با هتزنر برقرار نشد.';
}

// ───────────────  تایپ‌ها  ───────────────

export interface HPrice {
  location: string;
  price_hourly: { net: string; gross: string };
  price_monthly: { net: string; gross: string };
  included_traffic?: number;
  price_per_tb_traffic?: { net: string; gross: string };
}

export interface HServerType {
  id: number;
  name: string;
  description: string;
  cores: number;
  memory: number;
  disk: number;
  deprecated: boolean | null;
  prices: HPrice[];
  storage_type: string;
  cpu_type: string;
  architecture: string;
  included_traffic?: number | null;
  deprecation?: { unavailable_after: string; announced: string } | null;
}

export interface HLocation {
  id: number;
  name: string;
  description: string;
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  network_zone: string;
}

export interface HDatacenter {
  id: number;
  name: string;
  description: string;
  location: HLocation;
  server_types: { supported: number[]; available: number[]; available_for_migration: number[] };
}

export interface HImage {
  id: number;
  type: string;
  status: string;
  name: string | null;
  description: string;
  image_size: number | null;
  disk_size: number;
  os_flavor: string;
  os_version: string | null;
  architecture: string;
  created: string;
  created_from?: { id: number; name: string } | null;
  protection: { delete: boolean };
  labels: Record<string, string>;
  deprecated?: string | null;
}

export interface HAction {
  id: number;
  command: string;
  status: 'running' | 'success' | 'error';
  progress: number;
  started: string;
  finished: string | null;
  error: { code: string; message: string } | null;
  resources: { id: number; type: string }[];
}

export interface HServer {
  id: number;
  name: string;
  status: string;
  created: string;
  public_net: {
    ipv4: { id: number; ip: string; blocked: boolean; dns_ptr: string } | null;
    ipv6: { id: number; ip: string; blocked: boolean; dns_ptr: { ip: string; dns_ptr: string }[] } | null;
    floating_ips: number[];
    firewalls?: { id: number; status: string }[];
  };
  private_net: { network: number; ip: string; alias_ips: string[] }[];
  server_type: HServerType;
  datacenter: HDatacenter;
  image: HImage | null;
  iso: { id: number; name: string; description: string } | null;
  rescue_enabled: boolean;
  locked: boolean;
  backup_window: string | null;
  outgoing_traffic: number | null;
  ingoing_traffic: number | null;
  included_traffic: number | null;
  protection: { delete: boolean; rebuild: boolean };
  labels: Record<string, string>;
  primary_disk_size: number;
}

export interface HSshKey {
  id: number;
  name: string;
  fingerprint: string;
  public_key: string;
  labels: Record<string, string>;
  created: string;
}

export interface HIso {
  id: number;
  name: string | null;
  description: string;
  type: string;
  architecture: string | null;
  deprecated: string | null;
}

export interface HMetrics {
  start: string;
  end: string;
  step: number;
  time_series: Record<string, { values: [number, string][] }>;
}

export interface HFloatingIp {
  id: number;
  name: string;
  description: string | null;
  ip: string;
  type: string;
  server: number | null;
  home_location: HLocation;
  blocked: boolean;
  dns_ptr: { ip: string; dns_ptr: string }[];
  protection: { delete: boolean };
  created: string;
}

export interface HPrimaryIp {
  id: number;
  ip: string;
  type: 'ipv4' | 'ipv6';
  name: string;
  assignee_id: number | null;
  assignee_type: string;
  auto_delete: boolean;
  blocked: boolean;
  datacenter: HDatacenter;
  dns_ptr: { ip: string; dns_ptr: string }[];
  protection: { delete: boolean };
  created: string;
}

export interface HFirewall {
  id: number;
  name: string;
  rules: HFirewallRule[];
  applied_to: { type: string; server?: { id: number } }[];
  created: string;
}

export interface HFirewallRule {
  direction: 'in' | 'out';
  protocol: 'tcp' | 'udp' | 'icmp' | 'esp' | 'gre';
  port?: string | null;
  source_ips?: string[];
  destination_ips?: string[];
  description?: string | null;
}

export interface HPricingResponse {
  currency: string;
  vat_rate: string;
  image: { price_per_gb_month: { net: string; gross: string } };
  server_backup: { percentage: string };
  volume: { price_per_gb_month: { net: string; gross: string } };
  floating_ips?: { type: string; prices: { location: string; price_monthly: { net: string; gross: string } }[] }[];
  primary_ips?: { type: string; prices: { location: string; price_hourly: { net: string; gross: string }; price_monthly: { net: string; gross: string } }[] }[];
}

// ───────────────  کلاینت  ───────────────

type RequestOpts = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
  retries?: number;
};

export class HetznerClient {
  private token: string;
  private baseUrl: string;
  /** آخرین مقدار سهمیه باقی‌مانده که از هدر خوانده شده */
  public rateLimitRemaining: number | null = null;

  constructor(token?: string, baseUrl?: string) {
    // توکن‌ها از جدول حساب‌های هتزنر می‌آیند؛ مقدار .env فقط برای سازگاری با نسخه‌های قدیمی است
    const resolved = token || env.hetzner.tokenOptional;
    if (!resolved) {
      throw new Error(
        'توکن هتزنر در دسترس نیست. از پنل مدیریت، بخش «حساب‌های هتزنر»، دست‌کم یک حساب اضافه کنید.',
      );
    }
    this.token = resolved;
    this.baseUrl = (baseUrl || env.hetzner.baseUrl).replace(/\/$/, '');
  }

  async request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
    const { method = 'GET', body, query, timeoutMs = 30_000, retries = 2 } = opts;

    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
      }
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url.toString(), {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'PasargadMizban-Panel/1.0',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
          cache: 'no-store',
        });
        clearTimeout(timer);

        const remaining = res.headers.get('RateLimit-Remaining');
        if (remaining) this.rateLimitRemaining = Number(remaining);

        if (res.status === 204) return {} as T;

        const text = await res.text();
        const json = text ? safeJson(text) : {};

        if (!res.ok) {
          const errObj = (json as { error?: { code?: string; message?: string; details?: unknown } }).error;
          const code = errObj?.code ?? `http_${res.status}`;
          // پیام اصلی هتزنر کنار ترجمه می‌ماند؛ بدون آن عیب‌یابی کور می‌شود
          const fa = ERROR_FA[code];
          const raw = errObj?.message;
          const message = fa
            ? raw && raw !== fa
              ? `${fa} (${raw})`
              : fa
            : raw ?? `خطای HTTP ${res.status} از هتزنر`;

          // خطاهای موقتی → تلاش مجدد
          const retriable =
            res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504 || code === 'locked';
          if (retriable && attempt < retries) {
            await sleep(backoffMs(attempt, res.headers.get('Retry-After')));
            continue;
          }
          throw new HetznerError(message, code, res.status, errObj?.details);
        }

        return json as T;
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof HetznerError) throw err;
        lastError = err;
        if (attempt < retries) {
          await sleep(backoffMs(attempt, null));
          continue;
        }
      }
    }
    throw new HetznerError(
      'ارتباط با API هتزنر برقرار نشد: ' + (lastError instanceof Error ? lastError.message : 'نامشخص'),
      'network_error',
      503,
    );
  }

  /** صفحه‌بندی خودکار — همه صفحات را می‌خواند */
  private async all<T>(path: string, key: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<T[]> {
    const out: T[] = [];
    let page = 1;
    for (;;) {
      const res = await this.request<Record<string, unknown>>(path, {
        query: { ...query, page, per_page: 50 },
      });
      const items = (res[key] as T[]) ?? [];
      out.push(...items);
      const meta = res.meta as { pagination?: { next_page: number | null } } | undefined;
      const next = meta?.pagination?.next_page;
      if (!next) break;
      page = next;
      if (page > 100) break; // محافظ
    }
    return out;
  }

  // ── کاتالوگ ──
  listLocations() {
    return this.all<HLocation>('/locations', 'locations');
  }
  listDatacenters() {
    return this.all<HDatacenter>('/datacenters', 'datacenters');
  }
  listServerTypes() {
    return this.all<HServerType>('/server_types', 'server_types');
  }
  listImages(type: 'system' | 'snapshot' | 'backup' | 'app' = 'system') {
    return this.all<HImage>('/images', 'images', { type, status: 'available' });
  }
  listIsos() {
    return this.all<HIso>('/isos', 'isos');
  }
  async getPricing(): Promise<HPricingResponse> {
    const res = await this.request<{ pricing: HPricingResponse }>('/pricing');
    return res.pricing;
  }

  // ── سرورها ──
  listServers(labelSelector?: string) {
    return this.all<HServer>('/servers', 'servers', { label_selector: labelSelector });
  }

  async getServer(id: number | bigint): Promise<HServer> {
    const res = await this.request<{ server: HServer }>(`/servers/${id}`);
    return res.server;
  }

  async createServer(input: {
    name: string;
    server_type: string;
    image: string;
    location?: string;
    datacenter?: string;
    ssh_keys?: (number | string)[];
    start_after_create?: boolean;
    user_data?: string;
    labels?: Record<string, string>;
    automount?: boolean;
    public_net?: { enable_ipv4?: boolean; enable_ipv6?: boolean };
    firewalls?: { firewall: number }[];
  }): Promise<{ server: HServer; action: HAction; root_password: string | null; next_actions: HAction[] }> {
    return this.request('/servers', { method: 'POST', body: input, retries: 0, timeoutMs: 60_000 });
  }

  async deleteServer(id: number | bigint): Promise<{ action: HAction }> {
    return this.request(`/servers/${id}`, { method: 'DELETE', retries: 0 });
  }

  async updateServer(id: number | bigint, body: { name?: string; labels?: Record<string, string> }) {
    return this.request<{ server: HServer }>(`/servers/${id}`, { method: 'PUT', body });
  }

  private serverAction<T = { action: HAction }>(id: number | bigint, action: string, body?: unknown) {
    return this.request<T>(`/servers/${id}/actions/${action}`, { method: 'POST', body, retries: 0 });
  }

  powerOn(id: number | bigint) {
    return this.serverAction(id, 'poweron');
  }
  powerOff(id: number | bigint) {
    return this.serverAction(id, 'poweroff');
  }
  shutdown(id: number | bigint) {
    return this.serverAction(id, 'shutdown');
  }
  reboot(id: number | bigint) {
    return this.serverAction(id, 'reboot');
  }
  reset(id: number | bigint) {
    return this.serverAction(id, 'reset');
  }
  resetPassword(id: number | bigint) {
    return this.serverAction<{ action: HAction; root_password: string }>(id, 'reset_password');
  }
  rebuild(id: number | bigint, image: string) {
    return this.serverAction<{ action: HAction; root_password: string | null }>(id, 'rebuild', { image });
  }
  changeType(id: number | bigint, server_type: string, upgrade_disk: boolean) {
    return this.serverAction(id, 'change_type', { server_type, upgrade_disk });
  }
  enableRescue(id: number | bigint, ssh_keys: number[] = [], type = 'linux64') {
    return this.serverAction<{ action: HAction; root_password: string }>(id, 'enable_rescue', { type, ssh_keys });
  }
  disableRescue(id: number | bigint) {
    return this.serverAction(id, 'disable_rescue');
  }
  enableBackup(id: number | bigint) {
    return this.serverAction(id, 'enable_backup');
  }
  disableBackup(id: number | bigint) {
    return this.serverAction(id, 'disable_backup');
  }
  createImage(id: number | bigint, description: string, type: 'snapshot' | 'backup' = 'snapshot') {
    return this.serverAction<{ action: HAction; image: HImage }>(id, 'create_image', { description, type });
  }
  attachIso(id: number | bigint, iso: string) {
    return this.serverAction(id, 'attach_iso', { iso });
  }
  detachIso(id: number | bigint) {
    return this.serverAction(id, 'detach_iso');
  }
  changeProtection(id: number | bigint, deleteProt: boolean, rebuildProt: boolean) {
    return this.serverAction(id, 'change_protection', { delete: deleteProt, rebuild: rebuildProt });
  }
  changeDnsPtr(id: number | bigint, ip: string, dns_ptr: string | null) {
    return this.serverAction(id, 'change_dns_ptr', { ip, dns_ptr });
  }
  requestConsole(id: number | bigint) {
    return this.serverAction<{ action: HAction; wss_url: string; password: string }>(id, 'request_console');
  }
  attachToNetwork(id: number | bigint, network: number, ip?: string) {
    return this.serverAction(id, 'attach_to_network', { network, ip });
  }
  detachFromNetwork(id: number | bigint, network: number) {
    return this.serverAction(id, 'detach_from_network', { network });
  }

  async getMetrics(
    id: number | bigint,
    type: 'cpu' | 'disk' | 'network',
    start: Date,
    end: Date,
    step?: number,
  ): Promise<HMetrics> {
    const res = await this.request<{ metrics: HMetrics }>(`/servers/${id}/metrics`, {
      query: {
        type,
        start: start.toISOString(),
        end: end.toISOString(),
        step,
      },
    });
    return res.metrics;
  }

  // ── اکشن‌ها ──
  async getAction(id: number | bigint): Promise<HAction> {
    const res = await this.request<{ action: HAction }>(`/actions/${id}`);
    return res.action;
  }
  async getServerAction(serverId: number | bigint, actionId: number | bigint): Promise<HAction> {
    const res = await this.request<{ action: HAction }>(`/servers/${serverId}/actions/${actionId}`);
    return res.action;
  }

  /** منتظر می‌ماند تا اکشن تمام شود (با سقف زمانی) */
  async waitForAction(actionId: number | bigint, timeoutMs = 300_000): Promise<HAction> {
    const deadline = Date.now() + timeoutMs;
    let delay = 1500;
    for (;;) {
      const action = await this.getAction(actionId);
      if (action.status !== 'running') return action;
      if (Date.now() > deadline) {
        throw new HetznerError('زمان انتظار برای تکمیل عملیات هتزنر تمام شد.', 'timeout', 504);
      }
      await sleep(delay);
      delay = Math.min(delay * 1.3, 8000);
    }
  }

  // ── کلید SSH ──
  listSshKeys() {
    return this.all<HSshKey>('/ssh_keys', 'ssh_keys');
  }
  async createSshKey(name: string, public_key: string, labels?: Record<string, string>): Promise<HSshKey> {
    const res = await this.request<{ ssh_key: HSshKey }>('/ssh_keys', {
      method: 'POST',
      body: { name, public_key, labels },
      retries: 0,
    });
    return res.ssh_key;
  }
  deleteSshKey(id: number | bigint) {
    return this.request(`/ssh_keys/${id}`, { method: 'DELETE', retries: 0 });
  }

  // ── ایمیج / اسنپ‌شات ──
  async getImage(id: number | bigint): Promise<HImage> {
    const res = await this.request<{ image: HImage }>(`/images/${id}`);
    return res.image;
  }
  listSnapshots() {
    return this.all<HImage>('/images', 'images', { type: 'snapshot' });
  }
  listBackups(serverId?: number | bigint) {
    return this.all<HImage>('/images', 'images', {
      type: 'backup',
      bound_to: serverId ? String(serverId) : undefined,
    });
  }
  deleteImage(id: number | bigint) {
    return this.request(`/images/${id}`, { method: 'DELETE', retries: 0 });
  }
  updateImage(id: number | bigint, description: string) {
    return this.request<{ image: HImage }>(`/images/${id}`, { method: 'PUT', body: { description } });
  }

  // ── Floating IP ──
  listFloatingIps() {
    return this.all<HFloatingIp>('/floating_ips', 'floating_ips');
  }
  async createFloatingIp(body: { type: 'ipv4' | 'ipv6'; home_location: string; description?: string; name?: string }) {
    return this.request<{ floating_ip: HFloatingIp; action: HAction | null }>('/floating_ips', {
      method: 'POST',
      body,
      retries: 0,
    });
  }
  assignFloatingIp(id: number | bigint, server: number | bigint) {
    return this.request<{ action: HAction }>(`/floating_ips/${id}/actions/assign`, {
      method: 'POST',
      body: { server: Number(server) },
      retries: 0,
    });
  }
  unassignFloatingIp(id: number | bigint) {
    return this.request<{ action: HAction }>(`/floating_ips/${id}/actions/unassign`, { method: 'POST', retries: 0 });
  }
  deleteFloatingIp(id: number | bigint) {
    return this.request(`/floating_ips/${id}`, { method: 'DELETE', retries: 0 });
  }

  // ── Primary IP (برای تعویض آدرس سرور) ──
  listPrimaryIps(query: { ip?: string; assignee_id?: number } = {}) {
    return this.all<HPrimaryIp>('/primary_ips', 'primary_ips', query);
  }

  async getPrimaryIp(id: number | bigint): Promise<HPrimaryIp> {
    const res = await this.request<{ primary_ip: HPrimaryIp }>(`/primary_ips/${id}`);
    return res.primary_ip;
  }

  async createPrimaryIp(body: {
    type: 'ipv4' | 'ipv6';
    name: string;
    datacenter: string;
    assignee_type?: string;
    assignee_id?: number;
    auto_delete?: boolean;
    labels?: Record<string, string>;
  }): Promise<{ primary_ip: HPrimaryIp; action: HAction | null }> {
    return this.request('/primary_ips', {
      method: 'POST',
      body: { assignee_type: 'server', auto_delete: false, ...body },
      retries: 0,
      timeoutMs: 45_000,
    });
  }

  assignPrimaryIp(id: number | bigint, serverId: number | bigint) {
    return this.request<{ action: HAction }>(`/primary_ips/${id}/actions/assign`, {
      method: 'POST',
      body: { assignee_id: Number(serverId), assignee_type: 'server' },
      retries: 0,
    });
  }

  unassignPrimaryIp(id: number | bigint) {
    return this.request<{ action: HAction }>(`/primary_ips/${id}/actions/unassign`, {
      method: 'POST',
      retries: 0,
    });
  }

  deletePrimaryIp(id: number | bigint) {
    return this.request(`/primary_ips/${id}`, { method: 'DELETE', retries: 0 });
  }

  updatePrimaryIp(id: number | bigint, body: { name?: string; auto_delete?: boolean; labels?: Record<string, string> }) {
    return this.request<{ primary_ip: HPrimaryIp }>(`/primary_ips/${id}`, { method: 'PUT', body });
  }

  changePrimaryIpDnsPtr(id: number | bigint, ip: string, dns_ptr: string | null) {
    return this.request<{ action: HAction }>(`/primary_ips/${id}/actions/change_dns_ptr`, {
      method: 'POST',
      body: { ip, dns_ptr },
      retries: 0,
    });
  }

  // ── فایروال ──
  listFirewalls() {
    return this.all<HFirewall>('/firewalls', 'firewalls');
  }
  async createFirewall(body: { name: string; rules?: HFirewallRule[]; apply_to?: { type: string; server?: { id: number } }[] }) {
    return this.request<{ firewall: HFirewall; actions: HAction[] }>('/firewalls', { method: 'POST', body, retries: 0 });
  }
  setFirewallRules(id: number | bigint, rules: HFirewallRule[]) {
    return this.request<{ actions: HAction[] }>(`/firewalls/${id}/actions/set_rules`, {
      method: 'POST',
      body: { rules },
      retries: 0,
    });
  }
  applyFirewall(id: number | bigint, serverIds: number[]) {
    return this.request<{ actions: HAction[] }>(`/firewalls/${id}/actions/apply_to_resources`, {
      method: 'POST',
      body: { apply_to: serverIds.map((sid) => ({ type: 'server', server: { id: sid } })) },
      retries: 0,
    });
  }
  removeFirewall(id: number | bigint, serverIds: number[]) {
    return this.request<{ actions: HAction[] }>(`/firewalls/${id}/actions/remove_from_resources`, {
      method: 'POST',
      body: { remove_from: serverIds.map((sid) => ({ type: 'server', server: { id: sid } })) },
      retries: 0,
    });
  }
  deleteFirewall(id: number | bigint) {
    return this.request(`/firewalls/${id}`, { method: 'DELETE', retries: 0 });
  }
}

// ───────────────  کمکی‌ها  ───────────────

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const s = Number(retryAfter);
    if (Number.isFinite(s)) return Math.min(s * 1000, 15_000);
  }
  return Math.min(1000 * 2 ** attempt + Math.random() * 500, 10_000);
}

/**
 * سازنده کلاینت با توکن مشخص.
 * برای انتخاب حساب مناسب از ماژول hetzner-accounts استفاده کنید.
 */
export function hetznerWithToken(token: string): HetznerClient {
  return new HetznerClient(token);
}

/**
 * حذف یک Primary IP با چند تلاش.
 * هتزنر گاهی بلافاصله پس از unassign هنوز آدرس را «در حال استفاده» می‌داند؛
 * کمی صبر و تلاش دوباره تقریباً همیشه مشکل را حل می‌کند. پاسخ not_found یعنی
 * قبلاً حذف شده (مثلاً با auto_delete) و همان موفقیت است.
 */
export async function deletePrimaryIpWithRetry(
  client: HetznerClient,
  ipId: number | bigint,
  attempts = 4,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      await client.deletePrimaryIp(ipId);
      return true;
    } catch (err) {
      if (err instanceof HetznerError && err.code === 'not_found') return true;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      console.warn(`[ip-change] حذف Primary IP ${ipId} پس از ${attempts} تلاش ناموفق بود:`, err);
    }
  }
  return false;
}
