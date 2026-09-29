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
import * as nginxOtelLogs from './logs/nginxOtel.js';
import * as mysqlOtelLogs from './logs/mysqlOtel.js';
import * as kafkaOtelLogs from './logs/kafkaOtel.js';
import * as dockerOtelLogs from './logs/dockerOtel.js';
import * as hostMetrics from './metrics/host.js';
import * as applicationMetrics from './metrics/application.js';
import * as kubernetesMetrics from './metrics/kubernetes.js';
import * as customMetrics from './metrics/custom.js';
import * as nginxOtelMetrics from './metrics/nginxOtel.js';
import * as mysqlOtelMetrics from './metrics/mysqlOtel.js';
import * as kafkaOtelMetrics from './metrics/kafkaOtel.js';
import * as dockerOtelMetrics from './metrics/dockerOtel.js';
import * as httpRequestTraces from './traces/httpRequest.js';
import * as databaseTraces from './traces/database.js';
import * as microserviceTraces from './traces/microservice.js';
import * as errorTraces from './traces/error.js';
import * as genaiTraces from './traces/genai.js';
import * as nginxOtelTraces from './traces/nginxOtel.js';
import * as mysqlOtelTraces from './traces/mysqlOtel.js';
import * as kafkaOtelTraces from './traces/kafkaOtel.js';
import * as dockerOtelTraces from './traces/dockerOtel.js';

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
    csiem: csiemLogs,
    nginxOtel: nginxOtelLogs,
    mysqlOtel: mysqlOtelLogs,
    kafkaOtel: kafkaOtelLogs,
    dockerOtel: dockerOtelLogs,
  },
  metrics: {
    host: hostMetrics,
    application: applicationMetrics,
    kubernetes: kubernetesMetrics,
    custom: customMetrics,
    nginxOtel: nginxOtelMetrics,
    mysqlOtel: mysqlOtelMetrics,
    kafkaOtel: kafkaOtelMetrics,
    dockerOtel: dockerOtelMetrics,
  },
  traces: {
    httpRequest: httpRequestTraces,
    database: databaseTraces,
    microservice: microserviceTraces,
    error: errorTraces,
    genai: genaiTraces,
    nginxOtel: nginxOtelTraces,
    mysqlOtel: mysqlOtelTraces,
    kafkaOtel: kafkaOtelTraces,
    dockerOtel: dockerOtelTraces,
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
