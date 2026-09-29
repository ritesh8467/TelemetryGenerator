import { faker } from '@faker-js/faker';

const TOPICS = ['orders', 'payments', 'inventory', 'user-events', 'notifications', 'audit-log', 'metrics', 'dead-letter', 'product-catalog', 'shipments'];
const CONSUMER_GROUPS = ['analytics-consumers', 'order-processor', 'notification-service', 'audit-writer', 'reporting-consumer', 'inventory-sync'];

function kafkaTs() {
  const now = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `[${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())},${pad(now.getMilliseconds(), 3)}]`;
}

function infoLog() {
  const t = kafkaTs();
  const topic = faker.helpers.arrayElement(TOPICS);
  const partition = faker.number.int({ min: 0, max: 11 });
  const brokerId = faker.number.int({ min: 0, max: 3 });
  const group = faker.helpers.arrayElement(CONSUMER_GROUPS);
  const generation = faker.number.int({ min: 1, max: 500 });

  const scenarios = [
    () => `${t} INFO [KafkaServer id=${brokerId}] Starting (kafka.server.KafkaServer)`,
    () => `${t} INFO [Log partition=${topic}-${partition}, dir=/kafka/data-1] Loading producer state from snapshot with epoch ${faker.number.int({ min: 0, max: 100 })} and first offset ${faker.number.int({ min: 0, max: 9999999 })} (kafka.log.Log)`,
    () => `${t} INFO [GroupCoordinator ${brokerId}]: Group ${group} with generation ${generation} is now transitioning from PreparingRebalance to CompletingRebalance (kafka.coordinator.group.GroupCoordinator)`,
    () => `${t} INFO [Partition ${topic}-${partition}, broker=${brokerId}] Log loaded for partition ${topic}-${partition} with ${faker.number.int({ min: 1, max: 100 })} log segments, log start offset ${faker.number.int({ min: 0, max: 999999 })} and log end offset ${faker.number.int({ min: 1000000, max: 9999999 })} (kafka.cluster.Partition)`,
    () => `${t} INFO [Controller id=${brokerId}] ${faker.number.int({ min: 0, max: 3 })} preferred replicas are unbalanced (kafka.controller.KafkaController)`,
    () => `${t} INFO [ReplicaFetcherManager on broker ${brokerId}] Removed fetcher for partitions Set(${topic}-${partition}) (kafka.server.ReplicaFetcherManager)`,
    () => `${t} INFO [GroupCoordinator ${brokerId}]: Stabilized group ${group} generation ${generation} with ${faker.number.int({ min: 1, max: 20 })} members (kafka.coordinator.group.GroupCoordinator)`,
    () => `${t} INFO [LogDirFailureHandler] Failed log directory ${faker.helpers.arrayElement(['/kafka/data-1', '/kafka/data-2'])} is recovered (kafka.server.LogDirFailureHandler)`,
    () => `${t} INFO [AdminManager on Broker ${brokerId}] createTopics: successfully auto-created topic ${topic} with replication factor ${faker.number.int({ min: 1, max: 3 })} (kafka.server.AdminManager)`,
    () => `${t} INFO [TransactionCoordinator id=${brokerId}] Completed loading transaction metadata from ${faker.number.int({ min: 0, max: 49 })} partitions in ${faker.number.int({ min: 10, max: 3000 })}ms (kafka.coordinator.transaction.TransactionCoordinator)`,
  ];
  return faker.helpers.arrayElement(scenarios)();
}

function warnLog() {
  const t = kafkaTs();
  const topic = faker.helpers.arrayElement(TOPICS);
  const partition = faker.number.int({ min: 0, max: 11 });
  const group = faker.helpers.arrayElement(CONSUMER_GROUPS);

  const scenarios = [
    () => `${t} WARN [ReplicaManager broker=0] No live replicas available for partition ${topic}-${partition} (kafka.server.ReplicaManager)`,
    () => `${t} WARN [GroupCoordinator 0]: Slow consumer detected: group ${group} is ${faker.number.int({ min: 1000, max: 100000 })} messages behind on partition ${topic}-${partition} (kafka.coordinator.group.GroupCoordinator)`,
    () => `${t} WARN [Producer clientId=producer-${faker.number.int({ min: 1, max: 100 })}] Got error produce response with correlation id ${faker.number.int({ min: 1000, max: 9999 })} on topic-partition ${topic}-${partition}, retrying (${faker.number.int({ min: 1, max: 3 })} attempts left). Error: REQUEST_TIMED_OUT (org.apache.kafka.clients.producer.internals.Sender)`,
    () => `${t} WARN [ReplicaFetcherThread-0-${faker.number.int({ min: 1, max: 3 })}] Error in fetch ${topic}-${partition}: Message at offset ${faker.number.int({ min: 0, max: 9999999 })} is timed out. (kafka.server.ReplicaFetcherThread)`,
    () => `${t} WARN [RequestChannel$] Incoming request queue overloaded (size: ${faker.number.int({ min: 500, max: 999 })}) (kafka.network.RequestChannel)`,
  ];
  return faker.helpers.arrayElement(scenarios)();
}

function errorLog() {
  const t = kafkaTs();
  const topic = faker.helpers.arrayElement(TOPICS);
  const partition = faker.number.int({ min: 0, max: 11 });

  const scenarios = [
    () => `${t} ERROR [KafkaApis on broker 0] Error when handling request {type:FetchRequest,correlationId:${faker.number.int({ min: 1000, max: 99999 })}} (kafka.server.KafkaApis)\njava.io.IOException: Connection reset by peer\n\tat sun.nio.ch.FileDispatcherImpl.read0(Native Method)`,
    () => `${t} ERROR [ReplicaManager broker=0] Error trying to become leader for partition ${topic}-${partition} after ${faker.number.int({ min: 1, max: 10 })} election round(s) (kafka.server.ReplicaManager)\nkafka.common.KafkaException: Failed to acquire leadership for ${topic}-${partition}`,
    () => `${t} ERROR [Log partition=${topic}-${partition}, dir=/kafka/data-1] Closing due to error: (kafka.log.Log)\njava.io.IOException: No space left on device`,
    () => `${t} ERROR [GroupCoordinator 0]: Offset commit failed on topic-partition ${topic}-${partition} for group ${faker.helpers.arrayElement(CONSUMER_GROUPS)}: NOT_COORDINATOR (kafka.coordinator.group.GroupCoordinator)`,
    () => `${t} ERROR [TransactionCoordinator id=0] Aborting transaction for producerId ${faker.number.int({ min: 1000000, max: 9999999 })} epoch ${faker.number.int({ min: 0, max: 100 })} due to timeout (kafka.coordinator.transaction.TransactionCoordinator)`,
  ];
  return faker.helpers.arrayElement(scenarios)();
}

// ── Controller-specific log scenarios ────────────────────────────────────────

function controllerInfoLog() {
  const t = kafkaTs();
  const topic = faker.helpers.arrayElement(TOPICS);
  const partition = faker.number.int({ min: 0, max: 11 });
  const brokerId = faker.number.int({ min: 0, max: 3 });
  const newLeader = faker.number.int({ min: 0, max: 3 });
  const epoch = faker.number.int({ min: 1, max: 200 });
  const isr = `[${Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => faker.number.int({ min: 0, max: 3 })).join(',')}]`;

  const scenarios = [
    () => `${t} INFO [Controller id=${brokerId}] ${faker.number.int({ min: 0, max: 3 })} preferred replicas are unbalanced (kafka.controller.KafkaController)`,
    () => `${t} INFO [Controller id=${brokerId}] Elected leader ${newLeader} for partition ${topic}-${partition} in epoch ${epoch} (kafka.controller.KafkaController)`,
    () => `${t} INFO [Controller id=${brokerId}] Broker ${brokerId} completed controlled shutdown (kafka.controller.KafkaController)`,
    () => `${t} INFO [ControllerEventManager] Controller epoch set to ${epoch} (kafka.controller.ControllerEventManager)`,
    () => `${t} INFO [PartitionStateMachine controllerId=${brokerId}] Changed state of partition ${topic}-${partition} from OfflinePartition to OnlinePartition (kafka.controller.PartitionStateMachine)`,
    () => `${t} INFO [PartitionStateMachine controllerId=${brokerId}] Partition ${topic}-${partition} ISR updated to ${isr} (kafka.controller.PartitionStateMachine)`,
    () => `${t} INFO [ReplicaStateMachine controllerId=${brokerId}] Changed state of replica ${partition} for partition ${topic}-0 from NewReplica to OnlineReplica (kafka.controller.ReplicaStateMachine)`,
    () => `${t} INFO [Controller id=${brokerId}] New leader is ${newLeader} with epoch ${epoch} (kafka.controller.KafkaController)`,
    () => `${t} INFO [Controller id=${brokerId}] Newly added replicas: Set(${topic}-${partition}) (kafka.controller.KafkaController)`,
    () => `${t} INFO [Controller id=${brokerId}] Starting controlled shutdown of broker ${brokerId} (kafka.controller.KafkaController)`,
    () => `${t} DEBUG [Controller id=${brokerId}] Checking need to trigger auto leader balancing (kafka.controller.KafkaController)`,
    () => `${t} INFO [ZooKeeperClient] Connected to zookeeper at localhost:2181 after ${faker.number.int({ min: 10, max: 200 })} ms (kafka.zookeeper.ZooKeeperClient)`,
  ];
  return faker.helpers.arrayElement(scenarios)();
}

function controllerWarnLog() {
  const t = kafkaTs();
  const topic = faker.helpers.arrayElement(TOPICS);
  const partition = faker.number.int({ min: 0, max: 11 });
  const brokerId = faker.number.int({ min: 0, max: 3 });

  const scenarios = [
    () => `${t} WARN [Controller id=${brokerId}] Partition ${topic}-${partition} is offline. Possibly not enough in-sync replicas (kafka.controller.KafkaController)`,
    () => `${t} WARN [Controller id=${brokerId}] Failed to elect leader for partition ${topic}-${partition} under strategy OfflinePartitionLeaderElectionStrategy (kafka.controller.KafkaController)`,
    () => `${t} WARN [PartitionStateMachine controllerId=${brokerId}] Broker ${brokerId} has been removed from ISR of partition ${topic}-${partition} (kafka.controller.PartitionStateMachine)`,
    () => `${t} WARN [Controller id=${brokerId}] Resigning as the active controller. There might be a ZooKeeper connectivity issue (kafka.controller.KafkaController)`,
  ];
  return faker.helpers.arrayElement(scenarios)();
}

function controllerErrorLog() {
  const t = kafkaTs();
  const topic = faker.helpers.arrayElement(TOPICS);
  const partition = faker.number.int({ min: 0, max: 11 });
  const brokerId = faker.number.int({ min: 0, max: 3 });

  const scenarios = [
    () => `${t} ERROR [Controller id=${brokerId}] Failed to elect leader for partitions Set(${topic}-${partition}) due to error (kafka.controller.KafkaController)\nkafka.common.StateChangeFailedException: Failed to elect leader for ${topic}-${partition}`,
    () => `${t} ERROR [ControllerEventManager] Error processing event LeaderAndIsr (kafka.controller.ControllerEventManager)\njava.util.concurrent.TimeoutException: Leader election timed out after ${faker.number.int({ min: 10000, max: 60000 })}ms`,
    () => `${t} ERROR [Controller id=${brokerId}] ZooKeeper client session expired. Stopping controller (kafka.controller.KafkaController)`,
  ];
  return faker.helpers.arrayElement(scenarios)();
}

export function generate(count, opts = {}) {
  const logType = opts.logType || 'server';
  const records = [];
  const dist = opts.levelDistribution;
  const total = dist ? ((dist.info ?? 0) + (dist.warn ?? 0) + (dist.error ?? 0) + (dist.debug ?? 0)) || 1 : 1;
  const errorProb = dist ? (dist.error ?? 0) / total : 0.05;
  const warnProb = dist ? (dist.warn ?? 0) / total : 0.15;

  const infoFn  = logType === 'controller' ? controllerInfoLog  : infoLog;
  const warnFn  = logType === 'controller' ? controllerWarnLog  : warnLog;
  const errorFn = logType === 'controller' ? controllerErrorLog : errorLog;

  for (let i = 0; i < count; i++) {
    const rand = Math.random();
    if (rand < errorProb) {
      records.push(errorFn());
    } else if (rand < errorProb + warnProb) {
      records.push(warnFn());
    } else {
      records.push(infoFn());
    }
  }
  return records;
}
