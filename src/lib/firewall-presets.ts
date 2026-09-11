export type FirewallPreset = {
  id: string;
  title: string;
  description: string;
  rules: {
    direction: 'in' | 'out';
    protocol: 'tcp' | 'udp' | 'icmp';
    port?: string;
    ips: string[];
    description: string;
  }[];
};

const ANY_IP = ['0.0.0.0/0', '::/0'];

/** قوانین آماده فایروال برای کاربرانی که نمی‌خواهند دستی قانون بنویسند */
export const FIREWALL_PRESETS: FirewallPreset[] = [
  {
    id: 'web',
    title: 'وب‌سرور',
    description: 'پورت‌های ۸۰ و ۴۴۳ برای همه باز، همراه با SSH و پینگ.',
    rules: [
      { direction: 'in', protocol: 'tcp', port: '22', ips: ANY_IP, description: 'SSH' },
      { direction: 'in', protocol: 'tcp', port: '80', ips: ANY_IP, description: 'HTTP' },
      { direction: 'in', protocol: 'tcp', port: '443', ips: ANY_IP, description: 'HTTPS' },
      { direction: 'in', protocol: 'icmp', ips: ANY_IP, description: 'پینگ' },
    ],
  },
  {
    id: 'ssh-only',
    title: 'فقط SSH',
    description: 'همه پورت‌های ورودی بسته، به‌جز پورت ۲۲.',
    rules: [{ direction: 'in', protocol: 'tcp', port: '22', ips: ANY_IP, description: 'SSH' }],
  },
  {
    id: 'mail',
    title: 'سرور ایمیل',
    description: 'پورت‌های استاندارد ارسال و دریافت ایمیل.',
    rules: [
      { direction: 'in', protocol: 'tcp', port: '22', ips: ANY_IP, description: 'SSH' },
      { direction: 'in', protocol: 'tcp', port: '25', ips: ANY_IP, description: 'SMTP' },
      { direction: 'in', protocol: 'tcp', port: '587', ips: ANY_IP, description: 'Submission' },
      { direction: 'in', protocol: 'tcp', port: '993', ips: ANY_IP, description: 'IMAPS' },
      { direction: 'in', protocol: 'tcp', port: '465', ips: ANY_IP, description: 'SMTPS' },
    ],
  },
  {
    id: 'game',
    title: 'سرور بازی / وی‌پی‌ان',
    description: 'بازه پورت‌های رایج UDP و TCP.',
    rules: [
      { direction: 'in', protocol: 'tcp', port: '22', ips: ANY_IP, description: 'SSH' },
      { direction: 'in', protocol: 'udp', port: '1194', ips: ANY_IP, description: 'OpenVPN' },
      { direction: 'in', protocol: 'udp', port: '51820', ips: ANY_IP, description: 'WireGuard' },
      { direction: 'in', protocol: 'tcp', port: '27015-27030', ips: ANY_IP, description: 'بازه بازی' },
    ],
  },
];
