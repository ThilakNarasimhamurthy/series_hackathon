/**
 * Checkpoint Verification Utility
 * Run this to verify all checkpoints are working
 */

import { query } from '../db/index.js';
import axios from 'axios';

const CHECKPOINTS = {
  'checkpoint-0': {
    name: 'Project Setup',
    test: async () => {
      // Check if node_modules exists
      const fs = await import('fs');
      return fs.existsSync('node_modules');
    }
  },
  'checkpoint-1': {
    name: 'Database Connection',
    test: async () => {
      try {
        await query('SELECT NOW()');
        return true;
      } catch {
        return false;
      }
    }
  },
  'checkpoint-2': {
    name: 'Express Server',
    test: async () => {
      try {
        const response = await axios.get('http://localhost:3000/health');
        return response.data.status === 'ok' && response.data.database === 'connected';
      } catch {
        return false;
      }
    }
  }
};

export async function verifyCheckpoint(checkpointId: string): Promise<boolean> {
  const checkpoint = CHECKPOINTS[checkpointId as keyof typeof CHECKPOINTS];
  if (!checkpoint) {
    console.error(`❌ Unknown checkpoint: ${checkpointId}`);
    return false;
  }

  try {
    const result = await checkpoint.test();
    if (result) {
      console.log(`✅ ${checkpoint.name}: PASSED`);
      return true;
    } else {
      console.log(`❌ ${checkpoint.name}: FAILED`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${checkpoint.name}: ERROR -`, error);
    return false;
  }
}

export async function verifyAllCheckpoints() {
  console.log('🔄 Verifying all checkpoints...\n');
  
  const results: Record<string, boolean> = {};
  
  for (const [id, checkpoint] of Object.entries(CHECKPOINTS)) {
    results[id] = await verifyCheckpoint(id);
  }
  
  console.log('\n📊 Summary:');
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;
  console.log(`${passed}/${total} checkpoints passed`);
  
  return results;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyAllCheckpoints().then(() => process.exit(0));
}

