export type WhatsAppClientLike = {
  sendMessage: (
    chatId: string,
    text: string,
    options?: { sendSeen?: boolean; mentions?: string[] }
  ) => Promise<unknown>;
  getChatById: (chatId: string) => Promise<unknown>;
  getContactById: (contactId: string) => Promise<unknown>;
  info: { wid: { _serialized: string; user: string } };
};

export type WhatsAppSenderLike = {
  sendMessage: (
    chatId: string,
    text: string,
    options?: { sendSeen?: boolean; mentions?: string[] }
  ) => Promise<unknown>;
};
