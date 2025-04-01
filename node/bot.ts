import TelegramBot, { type InlineKeyboardButton, type Message } from "node-telegram-bot-api";
import { checkDbValid, connectToDatabase, createCollection, queryDocuments } from "./repositories/mongodb";
import { findUserThatAssignedInSheet } from "./services/ProjectManager";
import type { Db, WithId } from "mongodb";
import { checkDoc, findCurrentDocLinking, getAllTasks, isDocFoundWithGroup, renameDoc, tickTaskDone, linkDoc, remindDeadLine, getAdminOrCreator, getUndoneTasksByUser } from "./services/ProjectManager";




const token = process.env.TELEGRAM_BOT_TOKEN || "";


const queueDoneTaskMap: {
  [key: string]: {
    id: string,
    userId: string,
    taskName: string,
  }
} = {}

const queueDeleteTaskMap: {
  [key: string]: NodeJS.Timer
} = {}


if (token === "") {
  console.error("Please provide a valid Telegram Bot Token");
  process.exit(1);
}



const runTimeObject: {
  chatId: string,
  docId: string,
}[] = []

const initTelegramBot = async () => {



  checkDbValid()
  const dbClient = await connectToDatabase();

  await createCollection(dbClient, 'project-mamagement')

  const data: WithId<{
    groupId: string;
    docId: string
  }>[] = await queryDocuments(dbClient, 'project-mamagement', {}) as WithId<{
    groupId: string;
    docId: string
  }>[]



  if (data.length) {
    data.map((d) => {
      runTimeObject.push({
        chatId: d.groupId,
        docId: d.docId
      })
    })
  }


  const commands = [
    { command: 'ping', description: 'Kiểm tra trạng thái sức khỏe của bot để đảm bảo nó đang hoạt động bình thường' },
    { command: 'done', description: 'Đánh dấu nhiệm vụ đã hoàn thành bằng cách sử dụng /done theo sau là tên nhiệm vụ' },
    { command: 'tasks', description: 'Liệt kê tất cả các nhiệm vụ có sẵn trong bảng dữ liệu liên kết' },
    { command: 'currentdoc', description: 'Hiển thị ID tài liệu hiện tại và cung cấp liên kết đến nhóm này' },
    { command: 'linkdoc', description: 'Liên kết ID tài liệu được chỉ định với nhóm để dễ dàng truy cập' },
  ];





  const bot = new TelegramBot(token, {
    polling: true,
  });





  bot.setMyCommands(commands)
    .then(() => {
      console.log('Bot commands have been set successfully!');
    })
    .catch((error) => {
      console.error('Error setting bot commands:', error);
    });


  bot.onText(/\/init/, (msg: Message) => {
    const chatId = msg.chat.id;
    runTimeObject.push({
      chatId: chatId.toString().trim(),
      docId: ''
    })
  });



  bot.onText(/\/linkdoc ./, async (msg: Message) => {
    const chatId = msg.chat.id;
    if (!msg.text) return

    if (msg.chat.type === 'private') return bot.sendMessage(msg.chat.id, 'Không thể sử dụng lệnh này trong chat riêng tư ❌')
    //allow only admin or creator to link doc
    const isAdmin = await getAdminOrCreator(chatId.toString(), bot, msg.from?.id!)
    if (!isAdmin) return bot.sendMessage(chatId, 'Chỉ admin hoặc người tạo nhóm mới có thể liên kết tài liệu ❌')
    const text = msg.text.split(' ')
    const docId = text.map((t, index) => index === 0 ? '' : t).join(' ')
    //check if doc is valid
    if (!docId) return bot.sendMessage(chatId, 'ID tài liệu không hợp lệ ❌')
    //check doc is valid
    const { isErr, errMsg } = await checkDoc(docId, msg.from?.username!)
    if (isErr) return bot.sendMessage(chatId, errMsg, {
      parse_mode: 'HTML'
    })
    //link doc and return message
    return await linkDoc(dbClient, chatId.toString(), docId, bot, msg.from?.username!, runTimeObject)
  })


  bot.on("message", async (msg: Message) => {
    if (!msg.text) return
    if (!msg.text.startsWith('/currentdoc')) return
    const chatId = msg.chat.id;
    //find doc in runtime if not found in db
    const docId = await findCurrentDocLinking(chatId.toString(), dbClient, runTimeObject)
    if (!docId) return bot.sendMessage(chatId, 'Không tìm thấy tài liệu liên kết ❌')
    bot.sendMessage(chatId, `@${msg.from?.username} Tài liệu kết của group là: \n📃 ${docId}`);
  })



  bot.onText(/\/renamedoc ./, async (msg: Message) => {

    //check if user is and admin or not

    if (msg.chat.type === 'private') return bot.sendMessage(msg.chat.id, 'Không thể sử dụng lệnh này trong chat riêng tư ❌')


    //fin doc id in runtime if not found in db
    const isFound = isDocFoundWithGroup(msg.chat.id.toString(), bot, runTimeObject)
    if (!isFound) return
    const chatId = msg.chat.id;
    if (!msg.text) return

    const isAdmin = await getAdminOrCreator(chatId.toString(), bot, msg.from?.id!)
    if (!isAdmin) return bot.sendMessage(chatId, 'Chỉ admin hoặc người tạo nhóm mới có thể đổi tên tài liệu ❌')

    const text = msg.text.split(' ')
    const docName = text.map((t, index) => index === 0 ? '' : t).join(' ')
    // check if doc is valid 
    const docId = await findCurrentDocLinking(msg.chat.id.toString(), dbClient, runTimeObject)
    // rename doc
    await renameDoc(docName, docId)
    bot.sendMessage(chatId, `@${msg.from?.username} Doc name updated to ${docName}`);
  })

  bot.on('message', async (msg: Message) => {
    if (!msg.text) return
    if (!msg.text.startsWith('/tasks')) return
    const chatId = msg.chat.id;
    if (msg.chat.type === 'private') return bot.sendMessage(chatId, 'Không thể sử dụng lệnh này trong chat riêng tư ❌')
    const isAdmin = await getAdminOrCreator(chatId.toString(), bot, msg.from?.id!)
    console.log(isAdmin)
    if (!isAdmin) return bot.sendMessage(chatId, 'Chỉ admin hoặc người tạo nhóm mới có thể xem danh sách công việc ❌')
    const isFound = isDocFoundWithGroup(msg.chat.id.toString(), bot, runTimeObject)
    if (!isFound) return
    const docId = await findCurrentDocLinking(chatId.toString(), dbClient, runTimeObject)
    const allTask = await getAllTasks(docId, 10, true)
    bot.sendMessage(chatId, `💠 There are ${allTask.reply.length} tasks active: \n ${allTask.reply.join('\n\n ')}`);
  })


  bot.onText(/\/remind ./, async (msg: Message) => {
    if (msg.chat.type === 'private') return bot.sendMessage(msg.chat.id, 'Không thể sử dụng lệnh này trong chat riêng tư ❌')
    const isFound = isDocFoundWithGroup(msg.chat.id.toString(), bot, runTimeObject)
    if (!isFound) return
    const chatId = msg.chat.id;
    if (!msg.text) return
    const isAdmin = await getAdminOrCreator(chatId.toString(), bot, msg.from?.id!)
    if (!isAdmin) return bot.sendMessage(chatId, 'Chỉ admin hoặc người tạo nhóm mới có thể nhắc nhở deadline ❌')
    const text = msg.text.split(' ')
    const taksName = text.map((t, index) => index === 0 ? '' : t).join(' ')
    const docId = await findCurrentDocLinking(chatId.toString(), dbClient, runTimeObject)
    const result = remindDeadLine(taksName, docId)
    bot.sendMessage(chatId, `@${msg.from?.username} ${result}`);
  })


  bot.on('message', async (msg: Message) => {
    if (!msg.text) return
    if (!msg.text.startsWith('/done')) return
    if (msg.chat.type === 'private') return bot.sendMessage(msg.chat.id, 'Không thể sử dụng lệnh này trong chat riêng tư ❌')
    const isFound = isDocFoundWithGroup(msg.chat.id.toString(), bot, runTimeObject)
    if (!isFound) return
    const chatId = msg.chat.id;
    if (!msg.text) return
    const userId = msg.from?.id
    if (!userId) {
      bot.sendMessage(chatId, 'User is not found ❌')
      return
    }
    const docId = await findCurrentDocLinking(msg.chat.id.toString(), dbClient, runTimeObject)
    const isUserFoundInSheet = await findUserThatAssignedInSheet(userId.toString(), docId)

    if (isUserFoundInSheet) {

      bot.deleteMessage(chatId!, msg.message_id!)
        .catch((error) => {
          console.error('Error deleting message:', error);
        });
      return bot.sendMessage(chatId, `@${msg.from?.username} Tài khoản của bạn chưa có trong sheet quản lý Task ❌`)
    }


    const undoneTasks = await getUndoneTasksByUser(msg.from?.id!.toString().trim() as string, docId)

    if (undoneTasks.length === 0) {

      bot.deleteMessage(chatId!, msg.message_id!)
        .catch((error) => {
          console.error('Error deleting message:', error);
        });



      return bot.sendMessage(chatId, `@${msg.from?.username} 🏅 Không có task nào còn lại 🏅`)
    }
    const taskSuggestions: any = []
    undoneTasks.map((t) => taskSuggestions.push([{ text: t, callback_data: `done_task-${t}` }]))

    const msgSendResult = await bot.sendMessage(chatId, `@${msg.from?.username} Choose a task to mark as done:`, {
      reply_markup: {
        inline_keyboard: taskSuggestions,
      },
    });


    bot.deleteMessage(chatId!, msg.message_id!)
      .catch((error) => {
        console.error('Error deleting message:', error);
      });


    queueDeleteTaskMap[`${chatId}-${userId}-${msgSendResult.message_id}`] = setTimeout(() => {
      bot.deleteMessage(chatId!, msgSendResult.message_id!)
        .then(() => {
        })
        .catch((error) => {
          console.error('Error deleting message:', error);
        });

    }, 15000);

  })

  bot.on("callback_query", async (callbackQuery) => {

    const data: any = callbackQuery.data;
    const chatId = callbackQuery.message?.chat.id;
    const userId = callbackQuery.from.id;
    const userName = callbackQuery.from.username
    const messageId = callbackQuery.message?.message_id;

    clearTimeout(queueDeleteTaskMap[`${chatId}-${userId}-${messageId}`])

    if (callbackQuery.message?.chat.type === 'private') return bot.sendMessage(chatId!, 'Không thể sử dụng lệnh này trong chat riêng tư ❌')
    const tag = data.split('-')[0]

    bot.deleteMessage(chatId!, messageId!)
      .then(() => {
      })
      .catch((error) => {
        console.error('Error deleting message:', error);
      });
    if (tag !== 'done_task') return

    const taskName = data.split('-')[1]

    if (!data || !chatId || !userId || !userName || !messageId) return

    const processId = `${chatId}-${userId}-${taskName}`
    //find is the task id in queue

    const isBeingProcessed = Object.keys(queueDoneTaskMap).includes(processId)


    if (isBeingProcessed) return


    queueDoneTaskMap[processId] = {
      id: processId,
      userId: userId.toString(),
      taskName: taskName as string,
    }




    const docId = await findCurrentDocLinking(chatId?.toString()!, dbClient, runTimeObject)
    const result = await tickTaskDone(taskName.trim(), userId.toString(), docId)
    if (result) {
      bot.sendMessage(chatId!, `@${userName!}\n${result}`, {
        parse_mode: 'HTML'
      });
    }


    //remove task from queue
    delete queueDoneTaskMap[processId]
  });




  bot.onText(/\/ping/, async (msg: Message) => {
    const chatId = msg.chat.id;
    if (msg.chat.type === 'private') return bot.sendMessage(chatId, 'Không thể sử dụng lệnh này trong chat riêng tư ❌')
    bot.sendMessage(chatId, "🏓 Pong! Bot Đang Hoạt động");
  });


  bot.on("polling_error", (error: any) => {
    console.error(error);
  });



}




initTelegramBot()



