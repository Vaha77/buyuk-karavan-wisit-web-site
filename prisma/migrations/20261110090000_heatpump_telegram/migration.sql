-- Additive: the private Telegram chat for teplonasos leads (bound by /start teplonasos + contact).

-- CreateTable
CREATE TABLE "TelegramChatBinding" (
    "key" VARCHAR(40) NOT NULL,
    "chatId" VARCHAR(32) NOT NULL,
    "phone" VARCHAR(20),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramChatBinding_pkey" PRIMARY KEY ("key")
);
