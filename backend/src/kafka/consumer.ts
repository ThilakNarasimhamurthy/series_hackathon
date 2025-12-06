import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import dotenv from 'dotenv';
import { KafkaEvent, SeriesKafkaEvent } from './types.js';

dotenv.config();

let consumer: Consumer | null = null;

/**
 * Initialize Kafka consumer
 */
export async function initializeConsumer(): Promise<Consumer> {
  // Use SASL username (QRHNR6BCKVHD4M3U) - confirmed correct
  const username = process.env.KAFKA_USERNAME || 'QRHNR6BCKVHD4M3U';
  const password = process.env.KAFKA_PASSWORD || '';

  const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'team-client-1de668b8bd0e47fc898d387f158306a2',
    brokers: (process.env.KAFKA_BROKER || 'pkc-619z3.us-east1.gcp.confluent.cloud:9092').split(','),
    ssl: true,
    sasl: {
      mechanism: 'plain',
      username: username,
      password: password,
    },
  });

  consumer = kafka.consumer({
    groupId: process.env.KAFKA_CONSUMER_GROUP || '',
    // Reset offset to earliest to ensure we don't miss messages
    // This will read from the beginning if no offset is committed
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    // Force reset offsets to read from beginning
    allowAutoTopicCreation: false,
  });

  return consumer;
}

/**
 * Start consuming messages from Kafka topic
 * Handles both Series API events and our internal events
 */
export async function startConsumer(
  onMessage: (event: KafkaEvent | SeriesKafkaEvent) => Promise<void>
): Promise<void> {
  if (!consumer) {
    consumer = await initializeConsumer();
  }

  const topic = process.env.KAFKA_TOPIC || '';

  if (!topic) {
    throw new Error('KAFKA_TOPIC not set in environment variables');
  }

  try {
    await consumer.connect();
    console.log('✅ Kafka consumer connected');

    await consumer.subscribe({
      topic: topic,
      fromBeginning: true, // Read from beginning to catch ALL messages (including ones sent before subscription)
    });
    
    console.log(`✅ Subscribed to topic: ${topic}`);
    console.log(`   Consumer Group: ${process.env.KAFKA_CONSUMER_GROUP}`);
    console.log(`   Listening for ALL messages (fromBeginning: true)`);
    console.log(`   This ensures we catch messages even if they were sent before the consumer started`);
    console.log(`   Send an iMessage NOW to trigger a message.received event`);

    await consumer.run({
      eachMessage: async ({ topic, partition, message, heartbeat }: EachMessagePayload) => {
        try {
          // Send heartbeat to keep connection alive
          await heartbeat();
          
          if (!message.value) {
            console.warn('⚠️  Received message with no value');
            return;
          }

          const eventString = message.value.toString();
          console.log(`\n📨 ===== NEW MESSAGE RECEIVED =====`);
          console.log(`   Topic: ${topic}`);
          console.log(`   Partition: ${partition}`);
          console.log(`   Offset: ${message.offset}`);
          console.log(`   Timestamp: ${message.timestamp}`);
          console.log(`   Raw message length: ${eventString.length} bytes`);
          console.log(`   Raw message: ${eventString.substring(0, 200)}${eventString.length > 200 ? '...' : ''}`);

          const event: KafkaEvent | SeriesKafkaEvent = JSON.parse(eventString);
          console.log(`\n   Event Type: ${event.event_type}`);
          
          // Only log full event for Series API events (they're important)
          if ('api_version' in event) {
            console.log(`   API Version: ${event.api_version}`);
            console.log(`   Event ID: ${event.event_id}`);
            console.log(`   Full event:`, JSON.stringify(event, null, 2));
          } else {
            console.log(`   Full event:`, JSON.stringify(event, null, 2));
          }

          // Process the event
          console.log(`\n   → Processing event...`);
          await onMessage(event);
          console.log(`   ✅ Event processed successfully\n`);
        } catch (error) {
          console.error(`\n❌ Error processing Kafka message:`);
          console.error(`   Topic: ${topic}, Partition: ${partition}`);
          if (error instanceof Error) {
            console.error(`   Error: ${error.message}`);
            console.error(`   Stack: ${error.stack}`);
          } else {
            console.error(`   Error:`, error);
          }
        }
      },
    });

    console.log('✅ Kafka consumer started and listening for messages...');
  } catch (error) {
    console.error('❌ Failed to start Kafka consumer:', error);
    throw error;
  }
}

/**
 * Stop the consumer
 */
export async function stopConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    console.log('✅ Kafka consumer disconnected');
    consumer = null;
  }
}

/**
 * Get consumer instance (for testing)
 */
export function getConsumer(): Consumer | null {
  return consumer;
}

