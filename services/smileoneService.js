// Playwright disabled for Render compatibility
// const { chromium } = require('playwright');
const path = require('path');
const Redis = require('ioredis');
const { Queue, Worker } = require('bullmq');
const retryHandler = require('./retryHandler');
const balanceChecker = require('./smileone/balanceChecker');
const proxyManager = require('./proxyManager');

// Path to store browser session (cookies, login state)
const USER_DATA_DIR = path.join(__dirname, '../../browser_data/smileone');
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

class SmileOneService {
  constructor() {
    this.isInitialized = false;
    this.queueDisabled = false;
    this.connection = null;
    this.purchaseQueue = null;
    this.purchaseWorker = null;
  }

  async initialize() {
    if (this.isInitialized) return;

    this.connection = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
      lazyConnect: true,
      connectTimeout: 10000,
      retryStrategy: () => null
    });

    this.connection.on('error', (err) => {
      // Silently catch connection errors as we have fallback logic
    });

    try {
      await this.connection.ping();
      this.purchaseQueue = new Queue('smileone-purchases', { connection: this.connection });
      
      this.purchaseWorker = new Worker('smileone-purchases', async (job) => {
        return await this.processPurchaseJob(job);
      }, { connection: this.connection, concurrency: 1 });

      this.purchaseWorker.on('completed', (job, result) => {
        console.log(`SmileOne purchase job ${job.id} completed:`, result);
      });

      this.purchaseWorker.on('failed', async (job, err) => {
        console.error(`SmileOne purchase job ${job?.id} failed:`, err.message);
        if (job?.data?.order?._id) {
          await retryHandler.handleFailedJob(job.data.order._id.toString(), err.message, 'smileone');
        }
      });

      this.isInitialized = true;
      console.log('SmileOneService fully initialized with background queue');
    } catch (error) {
      console.warn('SmileOneService queue initialization failed. Automation will run synchronously:', error.message);
      this.queueDisabled = true;
      this.isInitialized = true;
    }
  }

  async addPurchaseJob(order) {
    if (!this.isInitialized) await this.initialize();

    if (this.queueDisabled) {
      // Fallback to synchronous execution if Redis is down
      return await this.runAutomation(order);
    }

    const job = await this.purchaseQueue.add('purchase', { order }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    });

    return { success: true, jobId: job.id, message: 'SmileOne purchase queued' };
  }

  async processPurchaseJob(job) {
    const { order } = job.data;
    return await this.runAutomation(order);
  }

  async runAutomation(order, isDemo = false) {
    console.warn('[SmileOneService] Browser automation is disabled on Render.');
    throw new Error('BROWSER_AUTOMATION_DISABLED');
  }
}

module.exports = new SmileOneService();