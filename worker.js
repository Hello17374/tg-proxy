const BOT_TOKEN = "8878742913:AAEHi6BIxpjH0prG294_yItult8ApNQB29U";
const ACCESS_CODE = "091011";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function api(method, body = {}) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function send(chat_id, text, keyboard = null) {
  const body = { chat_id, text, parse_mode: "HTML" };
  if (keyboard) body.reply_markup = keyboard;
  return api("sendMessage", body);
}

function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: "📊 Статистика", callback_data: "menu_stats" },
       { text: "📜 Последние", callback_data: "menu_last" }],
      [{ text: "ℹ️ Помощь", callback_data: "menu_help" }]
    ]
  };
}

function welcomeMenu() {
  return {
    inline_keyboard: [
      [{ text: "🔑 Ввести пароль", callback_data: "enter_code" }],
      [{ text: "ℹ️ Помощь", callback_data: "menu_help" }]
    ]
  };
}

function contentLabel(ctype) {
  const L = {
    text: "💬 Текст", photo: "📷 Фото", video: "🎥 Видео",
    document: "📎 Документ", voice: "🎤 Голосовое", audio: "🎵 Аудио",
    sticker: "🎭 Стикер", video_note: "⭕ Кружок"
  };
  return L[ctype] || ctype;
}

function describe(message) {
  if (message.text) return ["text", message.text];
  if (message.photo) return ["photo", message.caption || "(без подписи)"];
  if (message.video) return ["video", message.caption || "(без подписи)"];
  if (message.document) return ["document", message.document.file_name || "файл"];
  if (message.voice) return ["voice", "(голосовое)"];
  if (message.audio) return ["audio", message.caption || "(аудио)"];
  if (message.sticker) return ["sticker", message.sticker.emoji || "стикер"];
  if (message.video_note) return ["video_note", "(кружок)"];
  return ["unknown", "(неизвестно)"];
}

function getFileId(message) {
  if (message.voice) return message.voice.file_id;
  if (message.photo) return message.photo[message.photo.length - 1].file_id;
  if (message.video) return message.video.file_id;
  if (message.audio) return message.audio.file_id;
  if (message.video_note) return message.video_note.file_id;
  if (message.document) return message.document.file_id;
  if (message.sticker) return message.sticker.file_id;
  return null;
}

async function isActivated(env, uid) {
  return (await env.BOT_DATA.get(`act:${uid}`)) !== null;
}

async function handleUpdate(update, env) {
  if (update.business_connection) {
    const bc = update.business_connection;
    await env.BOT_DATA.put(`conn:${bc.id}`, String(bc.user_chat_id));
    console.log(`Connected: ${bc.id} -> ${bc.user_chat_id}`);
    return;
  }

  if (update.business_message) {
    const m = update.business_message;
    const ownerId = await env.BOT_DATA.get(`conn:${m.business_connection_id}`);
    if (!ownerId) return;
    const [ctype, preview] = describe(m);
    const fileId = getFileId(m);
    const senderName = m.from ? m.from.first_name || "" : "";
    const senderUsername = m.from ? m.from.username || "-" : "-";
    const data = {
      type: ctype, text: preview, name: senderName, username: senderUsername,
      saved_at: new Date().toISOString(), file_id: fileId
    };
    await env.BOT_DATA.put(`msg:${m.message_id}`, JSON.stringify(data), {
      expirationTtl: 2592000
    });
    return;
  }

  if (update.deleted_business_messages) {
    const d = update.deleted_business_messages;
    const ownerId = await env.BOT_DATA.get(`conn:${d.business_connection_id}`);
    if (!ownerId || !(await isActivated(env, ownerId))) return;

    for (const mid of d.message_ids) {
      const raw = await env.BOT_DATA.get(`msg:${mid}`);
      if (!raw) continue;
      const msg = JSON.parse(raw);
      const text = `🗑 Удалено сообщение\n📂 ${contentLabel(msg.type)}\n👤 От: ${msg.name} (@${msg.username})\n💬 ${msg.text}\n🕐 ${msg.saved_at}`;

      const logKey = `del:${ownerId}:${Date.now()}:${Math.random()}`;
      await env.BOT_DATA.put(logKey, JSON.stringify(msg), { expirationTtl: 2592000 });

      try {
        if (msg.file_id) {
          if (msg.type === "photo") {
            await api("sendPhoto", { chat_id: ownerId, photo: msg.file_id, caption: text });
          } else if (msg.type === "video") {
            await api("sendVideo", { chat_id: ownerId, video: msg.file_id, caption: text });
          } else if (msg.type === "voice") {
            await api("sendVoice", { chat_id: ownerId, voice: msg.file_id, caption: text });
          } else if (msg.type === "audio") {
            await api("sendAudio", { chat_id: ownerId, audio: msg.file_id, caption: text });
          } else if (msg.type === "video_note") {
            await api("sendVideoNote", { chat_id: ownerId, video_note: msg.file_id });
            await send(ownerId, text);
          } else if (msg.type === "document") {
            await api("sendDocument", { chat_id: ownerId, document: msg.file_id, caption: text });
          } else if (msg.type === "sticker") {
            await api("sendSticker", { chat_id: ownerId, sticker: msg.file_id });
            await send(ownerId, text);
          } else {
            await send(ownerId, text);
          }
        } else {
          await send(ownerId, text);
        }
      } catch (e) {
        console.log(`Media send error: ${e.message}`);
        await send(ownerId, text);
      }
    }
    return;
  }

  if (update.edited_business_message) {
    const m = update.edited_business_message;
    const ownerId = await env.BOT_DATA.get(`conn:${m.business_connection_id}`);
    if (!ownerId || !(await isActivated(env, ownerId))) return;

    const raw = await env.BOT_DATA.get(`msg:${m.message_id}`);
    const oldMsg = raw ? JSON.parse(raw) : { text: "(нет данных)" };
    const [ctype, preview] = describe(m);
    const fileId = getFileId(m);

    await env.BOT_DATA.put(`msg:${m.message_id}`, JSON.stringify({
      type: ctype, text: preview,
      name: m.from ? m.from.first_name : "",
      username: m.from ? m.from.username || "-" : "-",
      saved_at: new Date().toISOString(), file_id: fileId
    }), { expirationTtl: 2592000 });

    await send(ownerId, `✏️ Сообщение изменено\n👤 От: ${m.from ? m.from.first_name : ""} (@${m.from ? m.from.username || "-" : "-"})\n🔸 Было: ${oldMsg.text}\n🔹 Стало: ${preview}`);
    return;
  }

  if (update.message) {
    const m = update.message;
    const chatId = m.chat.id;
    const activated = await isActivated(env, chatId);

    if (m.text === "/start") {
      if (activated) {
        await send(chatId, "✅ Бот активирован. Выберите пункт меню:", mainMenu());
      } else {
        await send(chatId, "👋 Привет!\n\nДля работы бота введите пароль.\nНажмите кнопку ниже 👇", welcomeMenu());
      }
      return;
    }

    if (!activated && m.text && m.text.trim() === ACCESS_CODE) {
      await env.BOT_DATA.put(`act:${chatId}`, "1");
      await send(chatId, "✅ Пароль принят! Бот активирован.\n\nПодключите меня в Telegram Business → Чат-боты.", mainMenu());
      return;
    }

    if (!activated && m.text) {
      await send(chatId, "❌ Неверный пароль. Нажмите /start.");
      return;
    }
  }

  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message.chat.id;
    const data = cq.data;

    if (data === "enter_code") {
      await api("editMessageText", {
        chat_id: chatId, message_id: cq.message.message_id,
        text: "🔑 Введите пароль одним сообщением:"
      });
    } else if (data === "menu_stats") {
      const list = await env.BOT_DATA.list({ prefix: `conn:` });
      let connections = 0;
      for (const key of list.keys) {
        const ownerId = await env.BOT_DATA.get(key.name);
        if (ownerId === String(chatId)) connections++;
      }
      const delList = await env.BOT_DATA.list({ prefix: `del:${chatId}:` });
      await api("editMessageText", {
        chat_id: chatId, message_id: cq.message.message_id,
        text: `📊 Ваша статистика\n\n🔗 Подключений: ${connections}\n🗑 Удалено: ${delList.keys.length}`,
        reply_markup: mainMenu()
      });
    } else if (data === "menu_last") {
      const list = await env.BOT_DATA.list({ prefix: `del:${chatId}:` });
      const keys = list.keys.slice(-5).reverse();
      if (keys.length === 0) {
        await api("editMessageText", {
          chat_id: chatId, message_id: cq.message.message_id,
          text: "📜 У вас пока нет удалённых сообщений.",
          reply_markup: mainMenu()
        });
      } else {
        let text = "📜 Последние удалённые:\n\n";
        for (const k of keys) {
          const msg = JSON.parse(await env.BOT_DATA.get(k.name));
          text += `${contentLabel(msg.type)} — ${msg.name} (@${msg.username})\n${msg.text}\n\n`;
        }
        await api("editMessageText", {
          chat_id: chatId, message_id: cq.message.message_id,
          text, reply_markup: mainMenu()
        });
      }
    } else if (data === "menu_help") {
      const activated = await isActivated(env, chatId);
      await api("editMessageText", {
        chat_id: chatId, message_id: cq.message.message_id,
        text: "ℹ️ Помощь\n\n1. Введите пароль\n2. Подключите бота в Telegram Business\n3. Включите разрешения (5/5)",
        reply_markup: activated ? mainMenu() : welcomeMenu()
      });
    }

    await api("answerCallbackQuery", { callback_query_id: cq.id });
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Bot is running", { status: 200 });
    }
    try {
      const update = await request.json();
      ctx.waitUntil(handleUpdate(update, env));
      return new Response("OK", { status: 200 });
    } catch (e) {
      console.error(e);
      return new Response("Error", { status: 500 });
    }
  }
};
