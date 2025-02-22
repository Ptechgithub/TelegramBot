const WebSocket = require('ws');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// ########################### Environment Settings ###########################
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const OKX_WS_URL = process.env.OKX_WS_URL || 'wss://ws.okx.com:8443/ws/v5/public';

// ########################### Telegram Bot Instance ###########################
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// ########################### Global Variables ###########################
let latestPrice = null;
let previousPrice = null;
let isActive = true;

// ########################### Inline Keyboard (Persian UI) ###########################
function getInlineKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📊 وضعیت", callback_data: "status" },
          { text: "✅ روشن", callback_data: "on" },
          { text: "❌ خاموش", callback_data: "off" }
        ],
        [
          { text: "💰 دریافت قیمت", callback_data: "get_price" }
        ]
      ]
    }
  };
}

// ########################### Admin Check ###########################
function isAdmin(userId) {
  return userId.toString() === ADMIN_USER_ID;
}

// ########################### Telegram Event Handlers ###########################
function initializeTelegramBot() {
  // /start command handler
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdmin(userId)) {
      await bot.sendMessage(chatId, "⛔️ دسترسی غیرمجاز! فقط ادمین‌ها مجاز به استفاده از این ربات هستند.");
      return;
    }

    await bot.sendMessage(chatId, "به ربات قیمت‌گذاری Pi Network خوش آمدید! 🚀", getInlineKeyboard());
  });

  // Callback query handler
  bot.on("callback_query", async (callbackQuery) => {
    const user = callbackQuery.from;
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;

    if (!isAdmin(user.id)) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: "⛔️ فقط ادمین مجاز است!",
        show_alert: true
      });
      return;
    }

    let responseText;
    switch(data) {
      case "status":
        responseText = `وضعیت ربات: ${isActive ? "✅ فعال" : "❌ غیرفعال"}`;
        break;
      case "on":
        isActive = true;
        responseText = "✅ ربات فعال شد.";
        break;
      case "off":
        isActive = false;
        responseText = "❌ ربات غیرفعال شد.";
        break;
      case "get_price":
        responseText = latestPrice 
          ? `قیمت فعلی PI Network: ${latestPrice} USD` 
          : "❌ قیمت در حال حاضر موجود نیست!";
        break;
    }

    try {
      await bot.editMessageText(responseText, {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id,
        reply_markup: getInlineKeyboard().reply_markup
      });
      await bot.answerCallbackQuery(callbackQuery.id);
    } catch (err) {
      console.error("Error processing request:", err);
    }
  });
}

// ########################### WebSocket Connection ###########################
function connectWebSocket() {
  const ws = new WebSocket(OKX_WS_URL);

  ws.on('open', () => {
    console.log('Connected to OKX WebSocket.');
    const subscribeMsg = {
      op: "subscribe",
      args: [{ channel: "tickers", instId: "PI-USD" }]
    };
    ws.send(JSON.stringify(subscribeMsg));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.data) {
        msg.data.forEach(item => {
          if (item.last) {
            latestPrice = item.last;
            console.log("Latest price received:", latestPrice);
          }
        });
      }
    } catch (error) {
      console.error("Error processing WebSocket message:", error);
    }
  });

  ws.on('error', (error) => {
    console.error("WebSocket error:", error);
  });

  ws.on('close', () => {
    console.log("Connection closed. Reconnecting in 5 seconds...");
    setTimeout(connectWebSocket, 5000);
  });
}

// ########################### Price Updates ###########################
function startPriceUpdates() {
  setInterval(async () => {
    if (isActive && latestPrice !== null && latestPrice !== previousPrice) {
      try {
        const emoji = previousPrice 
          ? (latestPrice > previousPrice ? " 🟢" : " 🔴")
          : "";
        await bot.sendMessage(TELEGRAM_CHANNEL_ID, `PI Network: ${latestPrice} USD${emoji}`);
        previousPrice = latestPrice;
      } catch (error) {
        console.error("Error sending message:", error);
      }
    }
  }, 60000);
}

// ########################### Initialize Bot ###########################
initializeTelegramBot();
connectWebSocket();
startPriceUpdates();