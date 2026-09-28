import { faker } from '@faker-js/faker';

const EVENT_SOURCES = ['ec2.amazonaws.com', 's3.amazonaws.com', 'iam.amazonaws.com', 'lambda.amazonaws.com', 'rds.amazonaws.com', 'sts.amazonaws.com'];
const REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'];
const EVENTS_BY_SOURCE = {
  'ec2.amazonaws.com': ['RunInstances', 'TerminateInstances', 'DescribeInstances', 'StartInstances', 'StopInstances', 'CreateSecurityGroup'],
  's3.amazonaws.com': ['PutObject', 'GetObject', 'DeleteObject', 'CreateBucket', 'ListBuckets', 'PutBucketPolicy'],
  'iam.amazonaws.com': ['CreateUser', 'DeleteUser', 'AttachRolePolicy', 'CreateRole', 'PutRolePolicy', 'ListUsers'],
  'lambda.amazonaws.com': ['Invoke', 'CreateFunction', 'UpdateFunctionCode', 'DeleteFunction', 'ListFunctions'],
  'rds.amazonaws.com': ['CreateDBInstance', 'DeleteDBInstance', 'DescribeDBInstances', 'ModifyDBInstance', 'CreateDBSnapshot'],
  'sts.amazonaws.com': ['AssumeRole', 'GetCallerIdentity', 'AssumeRoleWithSAML', 'GetSessionToken']
};

export function generate(count, opts = {}) {
  const records = [];

  for (let i = 0; i < count; i++) {
    const eventSource = faker.helpers.arrayElement(EVENT_SOURCES);
    const eventName = faker.helpers.arrayElement(EVENTS_BY_SOURCE[eventSource]);
    const region = faker.helpers.arrayElement(REGIONS);
    const accountId = opts.accountId || faker.string.numeric(12);
    const isError = Math.random() < 0.05;

    const record = {
      eventVersion: '1.08',
      userIdentity: {
        type: faker.helpers.arrayElement(['IAMUser', 'AssumedRole', 'Root']),
        principalId: faker.string.alphanumeric(21).toUpperCase(),
        arn: `arn:aws:iam::${accountId}:user/${faker.internet.username()}`,
        accountId,
        accessKeyId: `AKIA${faker.string.alphanumeric(16).toUpperCase()}`
      },
      eventTime: new Date().toISOString(),
      eventSource,
      eventName,
      awsRegion: region,
      sourceIPAddress: faker.internet.ipv4(),
      userAgent: `aws-cli/2.${faker.number.int({ min: 0, max: 15 })}.${faker.number.int({ min: 0, max: 30 })} Python/3.11.${faker.number.int({ min: 0, max: 9 })}`,
      requestParameters: generateRequestParams(eventSource, eventName),
      responseElements: isError ? null : { requestId: faker.string.uuid() },
      requestID: faker.string.uuid(),
      eventID: faker.string.uuid(),
      eventType: 'AwsApiCall',
      recipientAccountId: accountId
    };

    if (isError) {
      record.errorCode = faker.helpers.arrayElement(['AccessDenied', 'UnauthorizedAccess', 'ResourceNotFoundException', 'ThrottlingException']);
      record.errorMessage = `User: ${record.userIdentity.arn} is not authorized to perform: ${eventName}`;
    }

    records.push(JSON.stringify(record));
  }
  return records;
}

function generateRequestParams(source, event) {
  if (source === 'ec2.amazonaws.com') {
    return { instanceType: faker.helpers.arrayElement(['t3.micro', 't3.medium', 'm5.large', 'c5.xlarge']) };
  }
  if (source === 's3.amazonaws.com') {
    return { bucketName: `${faker.word.noun()}-${faker.string.alphanumeric(6)}`, key: `data/${faker.system.fileName()}` };
  }
  return {};
}
