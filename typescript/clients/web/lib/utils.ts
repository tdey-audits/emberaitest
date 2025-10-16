import type {
  CoreAssistantMessage,
  CoreToolMessage,
  UIMessage,
} from 'ai';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { Document } from '@/lib/db/schema';
import { toast } from 'sonner';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ApplicationError extends Error {
  info: string;
  status: number;
}

export const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    const error = new Error(
      'An error occurred while fetching the data.',
    ) as ApplicationError;

    error.info = await res.json();
    error.status = res.status;

    throw error;
  }

  return res.json();
};

export function getLocalStorage(key: string) {
  if (typeof window !== 'undefined') {
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  return [];
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Note: _addToolMessageToChat was removed as it's unused in AI SDK v5

type ResponseMessageWithoutId = CoreToolMessage | CoreAssistantMessage;
type ResponseMessage = ResponseMessageWithoutId & { id: string };

export function sanitizeResponseMessages({
  messages,
  reasoning,
}: {
  messages: Array<ResponseMessage>;
  reasoning: string | undefined;
}) {
  const toolResultIds: Array<string> = [];

  for (const message of messages) {
    if (message.role === 'tool') {
      for (const content of message.content) {
        if (content.type === 'tool-result') {
          toolResultIds.push(content.toolCallId);
        }
      }
    }
  }

  const messagesBySanitizedContent = messages.map((message) => {
    if (message.role !== 'assistant') return message;

    if (typeof message.content === 'string') return message;

    const sanitizedContent = message.content.filter((content) =>
      content.type === 'tool-call'
        ? toolResultIds.includes(content.toolCallId)
        : content.type === 'text'
          ? content.text.length > 0
          : true,
    );

    if (reasoning) {
      // @ts-expect-error: reasoning message parts in sdk is wip
      sanitizedContent.push({ type: 'reasoning', reasoning });
    }

    return {
      ...message,
      content: sanitizedContent,
    };
  });

  return messagesBySanitizedContent.filter(
    (message) => message.content.length > 0,
  );
}

export function getMostRecentUserMessage(messages: Array<UIMessage>) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-1);
}

export function getDocumentTimestampByIndex(
  documents: Array<Document>,
  index: number,
) {
  if (!documents) return new Date();
  if (index > documents.length) return new Date();

  return documents[index].createdAt;
}

export function getTrailingMessageId({
  messages,
}: {
  messages: Array<ResponseMessage>;
}): string | null {
  const trailingMessage = messages.at(-1);

  if (!trailingMessage) return null;

  return trailingMessage.id;
}

export function strToDecimal(input: string): string {
  if (input === '∞') {
    return '∞';
  } else {
    //convert decimal string into 2 decimal string
    const decimal = Number.parseFloat(input);
    if (Number.isNaN(decimal)) {
      return '';
    }
    const decimalString = decimal.toFixed(2).toString();
    return decimalString;
  }
}

//function to convert an address into 0xABC...AB1234 format and have it copy the full address to clipboard on click
export function copyAddressToClipboard(address: string) {
  const fullAddress = address;
  navigator.clipboard.writeText(fullAddress).then(() => {
    toast.success(`Copied to clipboard! \b ${fullAddress}`);
  });
}
export function shortenAddress(address: string): string {
  if (address.length <= 6) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

//function to take a string that's a float, multiply by 100 and convert it to a string with 2 decimal places
export function formatPercentage(input: string): string {
  const decimal = Number.parseFloat(input);
  if (Number.isNaN(decimal)) {
    return '';
  }
  const percentage = decimal * 100;
  const percentageString = `${percentage.toFixed(2).toString()}%`;
  return percentageString;
}
