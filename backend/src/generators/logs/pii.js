import { faker } from '@faker-js/faker';

const SCENARIOS = [
  'customer_signup',
  'payment_processed',
  'account_update',
  'support_ticket',
  'order_confirmation',
  'kyc_verification',
  'refund_request',
  'login_event',
  'data_export',
  'profile_sync'
];

const LOG_TEMPLATES = {
  customer_signup(person) {
    return `New customer registration: name=${person.fullName}, email=${person.email}, phone=${person.phone}, dob=${person.dob}, ssn=${person.ssn}, address="${person.address}"`;
  },
  payment_processed(person) {
    return JSON.stringify({
      event: 'payment.processed',
      timestamp: new Date().toISOString(),
      customer: {
        name: person.fullName,
        email: person.email,
        billing_address: person.address
      },
      payment: {
        card_number: person.creditCard,
        card_expiry: person.cardExpiry,
        card_cvv: person.cvv,
        amount: faker.commerce.price({ min: 10, max: 5000 }),
        currency: 'USD'
      },
      bank_account: {
        routing_number: person.routingNumber,
        account_number: person.bankAccount
      }
    });
  },
  account_update(person) {
    return JSON.stringify({
      event: 'account.updated',
      timestamp: new Date().toISOString(),
      user_id: faker.string.uuid(),
      changes: {
        full_name: person.fullName,
        email: person.email,
        phone: person.phone,
        date_of_birth: person.dob,
        ssn: person.ssn,
        drivers_license: person.driversLicense,
        passport_number: person.passport
      }
    });
  },
  support_ticket(person) {
    return `[SUPPORT] Ticket #${faker.number.int({ min: 10000, max: 99999 })} - Customer: ${person.fullName} (${person.email}) reported billing issue. Card ending ${person.creditCard.slice(-4)}, SSN on file: ${person.ssn}. Phone callback requested: ${person.phone}. Address: ${person.address}`;
  },
  order_confirmation(person) {
    return JSON.stringify({
      event: 'order.confirmed',
      timestamp: new Date().toISOString(),
      order_id: `ORD-${faker.string.alphanumeric(8).toUpperCase()}`,
      customer: {
        name: person.fullName,
        email: person.email,
        phone: person.phone
      },
      shipping: {
        address: person.address,
        recipient: person.fullName
      },
      payment_method: {
        type: 'credit_card',
        number: person.creditCard,
        expiry: person.cardExpiry,
        cardholder: person.fullName
      },
      items: [
        { name: faker.commerce.productName(), price: faker.commerce.price(), qty: faker.number.int({ min: 1, max: 5 }) }
      ]
    });
  },
  kyc_verification(person) {
    return JSON.stringify({
      event: 'kyc.verification',
      timestamp: new Date().toISOString(),
      applicant: {
        full_name: person.fullName,
        date_of_birth: person.dob,
        ssn: person.ssn,
        drivers_license: person.driversLicense,
        passport: person.passport,
        nationality: faker.location.country(),
        address: person.address,
        email: person.email,
        phone: person.phone
      },
      financial: {
        bank_name: `${faker.company.name()} Bank`,
        account_number: person.bankAccount,
        routing_number: person.routingNumber,
        annual_income: faker.number.int({ min: 30000, max: 500000 })
      },
      status: faker.helpers.arrayElement(['pending', 'approved', 'rejected', 'review'])
    });
  },
  refund_request(person) {
    return `Refund initiated for ${person.fullName} (${person.email}). Original card: ${person.creditCard}, exp ${person.cardExpiry}. Refund to bank account: ${person.bankAccount}, routing: ${person.routingNumber}. Amount: $${faker.commerce.price({ min: 5, max: 2000 })}`;
  },
  login_event(person) {
    return JSON.stringify({
      event: 'auth.login',
      timestamp: new Date().toISOString(),
      user: {
        email: person.email,
        ip_address: person.ip,
        user_agent: faker.internet.userAgent()
      },
      session: {
        token: faker.string.alphanumeric(64),
        api_key: `sk_live_${faker.string.alphanumeric(32)}`
      }
    });
  },
  data_export(person) {
    return JSON.stringify({
      event: 'data.export',
      timestamp: new Date().toISOString(),
      exported_records: {
        name: person.fullName,
        email: person.email,
        phone: person.phone,
        dob: person.dob,
        ssn: person.ssn,
        address: person.address,
        credit_card: person.creditCard,
        bank_account: person.bankAccount,
        medical_record_id: `MRN-${faker.string.numeric(8)}`,
        insurance_id: `INS-${faker.string.alphanumeric(10).toUpperCase()}`
      }
    });
  },
  profile_sync(person) {
    return `Syncing profile for user ${person.email}: name="${person.fullName}" phone=${person.phone} dob=${person.dob} ssn=${person.ssn} card=${person.creditCard} address="${person.address}" passport=${person.passport} license=${person.driversLicense} bank_acct=${person.bankAccount}`;
  }
};

function generatePerson() {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  return {
    fullName: `${firstName} ${lastName}`,
    email: faker.internet.email({ firstName, lastName }),
    phone: faker.phone.number({ style: 'national' }),
    dob: faker.date.birthdate({ min: 18, max: 80, mode: 'age' }).toISOString().split('T')[0],
    ssn: `${faker.string.numeric(3)}-${faker.string.numeric(2)}-${faker.string.numeric(4)}`,
    creditCard: faker.finance.creditCardNumber(),
    cardExpiry: `${String(faker.number.int({ min: 1, max: 12 })).padStart(2, '0')}/${faker.number.int({ min: 26, max: 32 })}`,
    cvv: faker.string.numeric(3),
    bankAccount: faker.finance.accountNumber(10),
    routingNumber: faker.string.numeric(9),
    driversLicense: `${faker.string.alpha(1).toUpperCase()}${faker.string.numeric(7)}`,
    passport: `${faker.string.alpha(2).toUpperCase()}${faker.string.numeric(7)}`,
    address: `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.state({ abbreviated: true })} ${faker.location.zipCode()}`,
    ip: faker.internet.ipv4()
  };
}

export function generate(count, opts = {}) {
  const records = [];

  for (let i = 0; i < count; i++) {
    const person = generatePerson();
    const scenario = faker.helpers.arrayElement(SCENARIOS);
    const template = LOG_TEMPLATES[scenario];
    records.push(template(person));
  }

  return records;
}
