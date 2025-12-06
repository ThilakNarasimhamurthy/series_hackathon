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

  const consumerGroupId = process.env.KAFKA_CONSUMER_GROUP || '';
  
  // 🔒 SECURITY: Validate consumer group is set and unique
  if (!consumerGroupId) {
    throw new Error('KAFKA_CONSUMER_GROUP must be set in environment variables for message isolation');
  }
  
  // Warn if consumer group looks generic (security best practice)
  if (consumerGroupId.length < 10 || consumerGroupId === 'default' || consumerGroupId === 'test') {
    console.warn(`⚠️  SECURITY WARNING: Consumer group "${consumerGroupId}" may not be unique. Use a unique identifier!`);
  }

  consumer = kafka.consumer({
    groupId: consumerGroupId,
    // Increased timeouts to handle long-running message processing
    // (AI API calls, database queries, Series API calls can take >30s)
    sessionTimeout: 60000, // Increased from 30000 to 60 seconds
    heartbeatInterval: 10000, // Increased from 3000 to 10 seconds
    rebalanceTimeout: 60000, // Allow 60 seconds for rebalancing
    maxInFlightRequests: 1, // Process one message at a time to avoid overwhelming
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

    // Add event handlers for rebalancing
    consumer.on(consumer.events.REBALANCING, () => {
      console.log('⚠️  Consumer group rebalancing...');
    });

    // Note: REBALANCED is not a valid event in KafkaJS
    // The REBALANCING event fires when rebalancing occurs

    consumer.on(consumer.events.DISCONNECT, () => {
      console.log('⚠️  Consumer disconnected');
    });

    await consumer.subscribe({
      topic: topic,
      fromBeginning: false, // Only listen to new messages sent after the server starts
    });
    
    console.log(`✅ Subscribed to topic: ${topic}`);
    console.log(`   Consumer Group: ${process.env.KAFKA_CONSUMER_GROUP}`);
    console.log(`   Session Timeout: 60s, Heartbeat: 10s`);
    console.log(`   🔒 Security: Topic validation enabled`);
    console.log(`   🔒 Security: Phone number validation enabled`);
    if (process.env.ALLOWED_PHONE_NUMBERS) {
      console.log(`   🔒 Security: Phone whitelist enabled (${process.env.ALLOWED_PHONE_NUMBERS.split(',').length} numbers)`);
    }
    console.log(`   Listening for NEW messages only (fromBeginning: false)`);
    console.log(`   Only messages sent after the backend server started will be processed`);
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

          // 🔒 SECURITY LAYER 1: Validate topic matches expected topic
          const expectedTopic = process.env.KAFKA_TOPIC || '';
          if (topic !== expectedTopic) {
            console.warn(`🚫 SECURITY: Rejecting message from unexpected topic "${topic}" (expected "${expectedTopic}")`);
            console.warn(`   Partition: ${partition}, Offset: ${message.offset}`);
            return; // Skip processing messages from wrong topics
          }

          const eventString = message.value.toString();
          console.log(`\n📨 ===== NEW MESSAGE RECEIVED =====`);
          console.log(`   Topic: ${topic} ✅ (validated)`);
          console.log(`   Partition: ${partition}`);
          console.log(`   Offset: ${message.offset}`);
          console.log(`   Timestamp: ${message.timestamp}`);
          console.log(`   Raw message length: ${eventString.length} bytes`);
          console.log(`   Raw message: ${eventString.substring(0, 200)}${eventString.length > 200 ? '...' : ''}`);

          const event: KafkaEvent | SeriesKafkaEvent = JSON.parse(eventString);
          console.log(`\n   Event Type: ${event.event_type}`);
          
          // 🔒 SECURITY LAYER 2: Early validation for Series API events
          if ('api_version' in event) {
            const seriesEvent = event as SeriesKafkaEvent;
            console.log(`   API Version: ${seriesEvent.api_version}`);
            console.log(`   Event ID: ${seriesEvent.event_id}`);
            
            // Validate this is a message.received event and check phone number
            if (seriesEvent.event_type === 'message.received' && seriesEvent.data?.from_phone) {
              const fromPhone = seriesEvent.data.from_phone;
              const ourSenderNumber = process.env.SERIES_SENDER_NUMBER;
              
              // 🔒 SECURITY LAYER 3: Reject messages from our own sender number (already handled in processor, but early rejection is better)
              if (fromPhone === ourSenderNumber) {
                console.log(`🚫 SECURITY: Rejecting message from our own sender number: ${fromPhone}`);
                return;
              }
              
              // 🔒 SECURITY LAYER 4: Optional phone number whitelist (if configured)
              const allowedPhones = process.env.ALLOWED_PHONE_NUMBERS?.split(',').map(p => p.trim()) || [];
              if (allowedPhones.length > 0 && !allowedPhones.includes(fromPhone)) {
                console.warn(`🚫 SECURITY: Rejecting message from unauthorized phone number: ${fromPhone}`);
                console.warn(`   Allowed phones: ${allowedPhones.join(', ')}`);
                return;
              }
              
              console.log(`   ✅ Phone number validated: ${fromPhone}`);
            }
            
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

