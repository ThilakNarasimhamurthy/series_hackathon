/**
 * Migration script to add anonymous_name column and generate names for existing users
 */
import { query } from './index.js';
import { generateAnonymousName } from '../utils/anonymousNames.js';

async function migrateAnonymousNames() {
  try {
    console.log('🔄 Adding anonymous_name column to users table...');
    
    // Add column if it doesn't exist
    await query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS anonymous_name VARCHAR(100)
    `);
    
    console.log('✅ Column added successfully');
    
    // Generate anonymous names for users that don't have one
    console.log('🔄 Generating anonymous names for existing users...');
    const usersResult = await query('SELECT id FROM users WHERE anonymous_name IS NULL');
    
    for (const user of usersResult.rows) {
      const anonymousName = generateAnonymousName(user.id);
      await query(
        'UPDATE users SET anonymous_name = $1 WHERE id = $2',
        [anonymousName, user.id]
      );
      console.log(`  ✅ Generated "${anonymousName}" for user ${user.id}`);
    }
    
    console.log(`✅ Migration complete! Generated ${usersResult.rows.length} anonymous names`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  }
}

migrateAnonymousNames();

