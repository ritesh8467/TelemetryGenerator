import * as apacheLogs from './logs/apache.js';
import * as nginxLogs from './logs/nginx.js';
import * as appJsonLogs from './logs/appJson.js';
import * as syslogLogs from './logs/syslog.js';
import * as k8sPodLogs from './logs/k8sPod.js';
import * as cloudtrailLogs from './logs/cloudtrail.js';
import * as customLogs from './logs/custom.js';
import * as piiLogs from './logs/pii.js';
import * as microserviceLogs from './logs/microservice.js';
import * as csiemLogs from './logs/csiem.js';
import * as hostMetrics from './metrics/host.js';
import * as applicationMetrics from './metrics/application.js';
import * as kubernetesMetrics from './metrics/kubernetes.js';
import * as customMetrics from './metrics/custom.js';
import * as httpRequestTraces from './traces/httpRequest.js';
import * as databaseTraces from './traces/database.js';
import * as microserviceTraces from './traces/microservice.js';
import * as errorTraces from './traces/error.js';

const generators = {
  logs: {
    apache: apacheLogs,
    nginx: nginxLogs,
    appJson: appJsonLogs,
    syslog: syslogLogs,
    k8sPod: k8sPodLogs,
    cloudtrail: cloudtrailLogs,
    custom: customLogs,
    pii: piiLogs,
    microservice: microserviceLogs,
    csiem: csiemLogs
  },
  metrics: {
    host: hostMetrics,
    application: applicationMetrics,
    kubernetes: kubernetesMetrics,
    custom: customMetrics
  },
  traces: {
    httpRequest: httpRequestTraces,
    database: databaseTraces,
    microservice: microserviceTraces,
    error: errorTraces
  }
};

export function getGenerator(dataType, subType) {
  return generators[dataType]?.[subType] || null;
}

export function listGenerators() {
  const result = {};
  for (const [dataType, subs] of Object.entries(generators)) {
    result[dataType] = Object.keys(subs);
  }
  return result;
}
