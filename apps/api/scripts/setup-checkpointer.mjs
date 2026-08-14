import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for checkpoint setup');
}

const checkpointer = PostgresSaver.fromConnString(connectionString, { schema: 'public' });
try {
  await checkpointer.setup();
  console.log('LangGraph checkpoint schema is ready.');
} finally {
  await checkpointer.close?.();
}
