import * as logSender from './logSender.js';
import * as metricSender from './metricSender.js';
import * as traceSender from './traceSender.js';
import * as fileSender from './fileSender.js';

const senders = {
  logs: logSender,
  metrics: metricSender,
  traces: traceSender
};

export function getSender(dataType) {
  return senders[dataType] || null;
}

export function getFileSender() {
  return fileSender;
}
