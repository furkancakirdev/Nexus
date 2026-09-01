const CREDENTIAL_LITERAL = /(?:password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*["'][^"'${}]{4,}["']/i;
const COOKIE_ENTRY = /^\s*[^#\s]+(?:\s+\S+){6,}\s*$/;

function finding(path, line, kind) {
  return Object.freeze({ path, line, kind });
}

export function detectSecurityFindings(files) {
  const findings = [];
  for (const file of files || []) {
    const lines = String(file.contents || "").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (CREDENTIAL_LITERAL.test(line)) findings.push(finding(file.path, index + 1, "credential-literal"));
      if (/curl\s+-[^\r\n]*k/i.test(line)) findings.push(finding(file.path, index + 1, "tls-bypass"));
      if (/(?:trustServerCertificate|rejectUnauthorized)\s*[:=]\s*true|verify\s*=\s*false/i.test(line)) {
        findings.push(finding(file.path, index + 1, "certificate-verification-disabled"));
      }
      if (COOKIE_ENTRY.test(line)) findings.push(finding(file.path, index + 1, "cookie-file-entry"));
    });
  }
  return findings;
}
