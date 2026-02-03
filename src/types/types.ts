import pkg from 'whatsapp-web.js';

export type Message = pkg.Message;
export type Client = pkg.Client;

export interface MessageContext {
  msg: Message;
  text: string;
  textLower: string;
  sender: string;
  isGroup: boolean;
  isBotMentioned: boolean;
}

export interface CommandResult {
  handled: boolean;
  response?: string;
}
