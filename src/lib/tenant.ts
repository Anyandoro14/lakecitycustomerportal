export const getTenantSlug = (): string => {
  const hostname = window.location.hostname;

  // Local development: default to 'richcraft'
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'richcraft';
  }

  // Subdomain-based routing: richcraft.portal.com → 'richcraft'
  const subdomain = hostname.split('.')[0];
  return subdomain;
};
