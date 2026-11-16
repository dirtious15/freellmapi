// RFC 2606 / 6761 reserved names (.example, .test, .invalid, .localhost) can
// never resolve, but a real lookup still goes to the machine's resolver, and
// on networks with a slow or filtering resolver an NXDOMAIN takes ~10s. The
// request-time URL guard resolves custom-provider hosts on every fetch, so
// tests that use fake hosts like https://embeddings.example would then hit the
// 5s test timeout depending on the machine. Fail these names immediately, the
// same way a fast resolver would, and leave every other lookup untouched.
import dns from 'node:dns';

const RESERVED = /(^|\.)(example|test|invalid|localhost)$/i;

function notFound(hostname: string): NodeJS.ErrnoException {
  const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`) as NodeJS.ErrnoException;
  err.code = 'ENOTFOUND';
  err.syscall = 'getaddrinfo';
  (err as NodeJS.ErrnoException & { hostname?: string }).hostname = hostname;
  return err;
}

const realPromisesLookup = dns.promises.lookup.bind(dns.promises);
(dns.promises as { lookup: unknown }).lookup = ((hostname: string, ...rest: unknown[]) => {
  if (RESERVED.test(hostname) && !/^localhost$/i.test(hostname)) return Promise.reject(notFound(hostname));
  return (realPromisesLookup as (...a: unknown[]) => Promise<unknown>)(hostname, ...rest);
}) as typeof dns.promises.lookup;
