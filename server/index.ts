import { createApp } from './app';
import { assertProductionConfig, config, geminiConfigured, paypalConfigured, paypalWebhookConfigured, webhookUrl } from './config';
import { getDb } from './db/connection';
import { seedDatabase } from './db/seed';

assertProductionConfig();

const db = getDb();
seedDatabase(db);

const app = createApp();
app.listen(config.port, () => {
  console.log('');
  console.log('  MERGIN API');
  console.log(`  → http://localhost:${config.port}`);
  console.log(`  → Web app: ${config.appBaseUrl}`);
  console.log(`  → PayPal: ${paypalConfigured() ? `configured (${config.paypal.environment})` : 'demo mode (credentials not set)'}`);
  console.log(`  → PayPal webhook: ${paypalWebhookConfigured() ? webhookUrl() : 'not configured'}`);
  console.log(`  → Gemini: ${geminiConfigured() ? config.gemini.model || 'gemini-2.5-flash' : 'deterministic fallback'}`);
  console.log('');
});
