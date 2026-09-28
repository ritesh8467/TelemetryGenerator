import { faker } from '@faker-js/faker';

function toOtlpAttributes(obj) {
  return Object.entries(obj || {}).map(([key, val]) => {
    let value;
    if (typeof val === 'string') value = { stringValue: val };
    else if (typeof val === 'boolean') value = { boolValue: val };
    else if (Number.isInteger(val)) value = { intValue: val };
    else if (typeof val === 'number') value = { doubleValue: val };
    else value = { stringValue: String(val) };
    return { key, value };
  });
}

function generateSpan(spanId, parentSpanId, traceId, startTime, duration, name, status = 'OK', attributes = {}) {
  return {
    traceId,
    spanId,
    parentSpanId: parentSpanId || '',
    name,
    kind: 1,
    startTimeUnixNano: (startTime * 1e9).toString(),
    endTimeUnixNano: ((startTime + duration) * 1e9).toString(),
    attributes: toOtlpAttributes(attributes),
    status: { code: status === 'OK' ? 0 : 2 },
    events: []
  };
}

export function generate(count, metadata = {}) {
  const traces = [];

  for (let i = 0; i < count; i++) {
    const traceId = faker.string.hexadecimal({ length: 32 }).toLowerCase();
    const baseTime = Math.floor(Date.now() / 1000);

    const llmRequestSpanId = faker.string.hexadecimal({ length: 16 }).toLowerCase();
    const llmRequestStartTime = baseTime - Math.random() * 5;
    const llmRequestDuration = 0.5 + Math.random() * 2;

    const model = faker.helpers.arrayElement([
      'gpt-4',
      'gpt-3.5-turbo',
      'claude-3-opus',
      'claude-3-sonnet',
      'gemini-pro',
      'llama-2-70b'
    ]);

    const systemPrompt = faker.helpers.arrayElement([
      'You are a helpful assistant',
      'You are an expert software engineer',
      'You are a data analyst',
      'You are a creative writer'
    ]);

    const userMessage = faker.helpers.arrayElement([
      'Explain quantum computing',
      'Write a Python function to sort an array',
      'What are the benefits of microservices?',
      'How does machine learning work?',
      'Design a REST API for a social network'
    ]);

    const llmRequestAttributes = {
      'gen_ai.system': 'openai',
      'gen_ai.request.model': model,
      'gen_ai.request.max_tokens': faker.number.int({ min: 100, max: 2000 }),
      'gen_ai.request.temperature': faker.number.float({ min: 0, max: 2, precision: 0.01 }),
      'gen_ai.request.top_p': faker.number.float({ min: 0, max: 1, precision: 0.01 }),
      'gen_ai.prompt.0.role': 'system',
      'gen_ai.prompt.0.content': systemPrompt,
      'gen_ai.prompt.1.role': 'user',
      'gen_ai.prompt.1.content': userMessage,
      'gen_ai.usage.prompt_tokens': faker.number.int({ min: 50, max: 500 }),
      'gen_ai.usage.completion_tokens': faker.number.int({ min: 100, max: 1000 }),
      'gen_ai.response.0.finish_reason': 'stop',
      'gen_ai.response.0.role': 'assistant',
      'gen_ai.response.0.content': faker.lorem.paragraphs(2),
      'server.address': 'api.openai.com',
      'http.request.method': 'POST',
      'http.response.status_code': 200
    };

    const llmRequestSpan = generateSpan(
      llmRequestSpanId,
      '',
      traceId,
      llmRequestStartTime,
      llmRequestDuration,
      'llm.request',
      'OK',
      llmRequestAttributes
    );

    // Embedding span (optional, for some traces)
    let embeddingSpan = null;
    if (Math.random() > 0.6) {
      const embeddingSpanId = faker.string.hexadecimal({ length: 16 }).toLowerCase();
      const embeddingStartTime = llmRequestStartTime + 0.1;
      const embeddingDuration = 0.2;

      embeddingSpan = generateSpan(
        embeddingSpanId,
        llmRequestSpanId,
        traceId,
        embeddingStartTime,
        embeddingDuration,
        'gen_ai.embedding',
        'OK',
        {
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'text-embedding-3-small',
          'gen_ai.request.embedding_dimension': 1536,
          'gen_ai.usage.prompt_tokens': 25
        }
      );
    }

    // Retrieval span (optional)
    let retrievalSpan = null;
    if (Math.random() > 0.7) {
      const retrievalSpanId = faker.string.hexadecimal({ length: 16 }).toLowerCase();
      const retrievalStartTime = llmRequestStartTime + 0.05;
      const retrievalDuration = 0.3;

      retrievalSpan = generateSpan(
        retrievalSpanId,
        llmRequestSpanId,
        traceId,
        retrievalStartTime,
        retrievalDuration,
        'gen_ai.retrieval',
        'OK',
        {
          'gen_ai.system': 'vectordb',
          'gen_ai.retrieval.documents_returned': faker.number.int({ min: 3, max: 10 }),
          'db.system': 'pinecone',
          'db.query_time_ms': faker.number.int({ min: 100, max: 500 })
        }
      );
    }

    const spans = [llmRequestSpan];
    if (embeddingSpan) spans.push(embeddingSpan);
    if (retrievalSpan) spans.push(retrievalSpan);

    traces.push({
      resourceSpans: [
        {
          resource: {
            attributes: toOtlpAttributes({
              'service.name': metadata.serviceName || 'genai-app',
              'service.version': '1.0.0',
              'telemetry.sdk.name': 'opentelemetry',
              'telemetry.sdk.language': 'nodejs'
            })
          },
          scopeSpans: [
            {
              scope: {
                name: 'genai-tracer'
              },
              spans
            }
          ]
        }
      ]
    });
  }

  // Return array of traces
  return traces;
}
