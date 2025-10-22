import { dataFeedsHandlers } from './data-feeds.js';
import { hyperbolicHandlers } from './hyperbolic.js';
import { openaiHandlers } from './openai.js';
import { openrouterHandlers } from './openrouter.js';
import { viemHandlers } from './viem.js';
import { xaiHandlers } from './xai.js';

// Export all handlers for MSW
// Add your mock handlers to this array
export const handlers = [
  ...openrouterHandlers,
  ...openaiHandlers,
  ...xaiHandlers,
  ...hyperbolicHandlers,
  ...viemHandlers,
  ...dataFeedsHandlers,
];
