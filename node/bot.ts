import TelegramBot, { type Message } from "node-telegram-bot-api";
import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';

import { serviceAccountAuth } from "./repositories/googleAuth";




const IS_DEV = false
const token = process.env.TELEGRAM_BOT_TOKEN || "";

let runTimeChatIds: any = []

if (token === "") {
  console.error("Please provide a valid Telegram Bot Token");
  process.exit(1);
}


//init google auth

const doc = new GoogleSpreadsheet('1htRUzavIEYGGkjiISSltB1u9dv0eWU0q2HRM0OADB2A', serviceAccountAuth);


// MongoDB client with connection pooling
const initTelegramBot = async () => {



  await doc.updateProperties({ title: 'helo' });




  const renameDoc = async (doc: GoogleSpreadsheet, docName: string) => {
    await doc.updateProperties({ title: docName });
  }

  const skipCol = 2

  const getAllTasks = async () => {
    const doc = new GoogleSpreadsheet('1htRUzavIEYGGkjiISSltB1u9dv0eWU0q2HRM0OADB2A', serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    const tasks = sheet.headerValues
    const cloneTasks = [...tasks]
    const taskObject = []
    // make an map of task with dead line i using one loop for better performance
    for (let i = skipCol; i < tasks.length; i++) {
      //the loop start from 2 because the first two rows not using for task
      const task = tasks[i]
      const deadLine = await getDeadLineWithTasks(rows, task)
      cloneTasks[i] = task.trim().toLocaleUpperCase()
      const hr = deadLine.hr ? deadLine.hr : ''
      const replyTask = `${task} \n ⏰ ${deadLine.date ? hr + ' - ' + deadLine.date : 'No dead line'}`
      taskObject.push({
        replyTask,
        task: cloneTasks[i],
        originTaskName: task.trim(),
        deadLine: deadLine.timeStamps,
        hr,
        date: deadLine.date ? deadLine.date : ''
      })
    }
    taskObject.sort((a, b) => a.deadLine - b.deadLine)
    const beatifulTasks = taskObject.map((task, i) => {
      return `${i + 1}. ` + task.replyTask
    })

    return {
      reply: beatifulTasks,
      tasks: cloneTasks,
      taskObject,
      rows,
    };
  }

  const getDeadLineWithTasks = async (rows: GoogleSpreadsheetRow<Record<string, any>>[], taskName: string): Promise<{
    date: string,
    hr: string
    timeStamps: number
  }> => {
    const [day, month, year] = rows[2].get(taskName).split('/');
    const timeStamps = new Date(`${year}-${month}-${day}T${rows[3].get(taskName)}`);
    return {
      date: rows[2].get(taskName),
      hr: rows[3].get(taskName),
      timeStamps: timeStamps.getTime()
    }
  }


  const getTheRightTasks = (taskName: string, taskObject: {
    replyTask: string,
    task: string,
    originTaskName: string,
    deadLine: number,
    hr: string,
    date: string
  }[]) => {
     const filteredTask = taskObject.filter((task) => task.task === taskName.toLocaleUpperCase())
    const task = filteredTask[0]
    return task

  }

  const remindDeadLine = async (taskName: string): Promise<string> => {
    const {  taskObject } = await getAllTasks()
    const task = getTheRightTasks(taskName, taskObject)

    if (!task) return 'Không tìm thấy Task ❌🔎'

    return `🆘 Team nhớ hoàn thành Deadline ${taskName.toLocaleUpperCase()} trước ${task.hr} ngày ${task.date}`

  }

  const tickTaskDone = async (taskName: string, userId: string): Promise<string | null> => {

    const { rows, taskObject } = await getAllTasks()
    const userIdRow = rows.findIndex((row) => {
      return row.get('ID') === userId
    })

    if (userIdRow === -1) return 'Tài khoản của bạn chưa có trong bản quản lý Task ❌ '

    
    const task = getTheRightTasks(taskName, taskObject)

    if (!task) return 'Không tìm thấy Task ❌🔎'

    const orginTaskName = task.originTaskName.trim()

    if (rows[userIdRow].get(orginTaskName) === 'FALSE') {
      rows[userIdRow].set(orginTaskName, 'TRUE')
      rows[userIdRow].save()
      return `Hệ thống đã cập nhật task ${orginTaskName} cho bạn ✅`
    } else {
      return null
    }

  }



  // Create a bot instance
  const bot = new TelegramBot(token, { polling: true });



  bot.onText(/\/renameDoc ./, async (msg: Message) => {
    const chatId = msg.chat.id;
    if (!msg.text) return
    const text = msg.text.split(' ')
    const docName = text.map((t, index) => index === 0 ? '' : t).join(' ')
    await renameDoc(doc, docName)
    bot.sendMessage(chatId, `Doc name updated to ${docName}`);
  })

  bot.onText(/\/listtasks/, async (msg: Message) => {
    const chatId = msg.chat.id;
    const allTask = await getAllTasks()
    bot.sendMessage(chatId, `💠 There are ${allTask.reply.length} tasks active: \n ${allTask.reply.join('\n\n ')}`);
  })


  bot.onText(/\/remind ./, async (msg: Message) => {
    const chatId = msg.chat.id;
    if (!msg.text) return
    const text = msg.text.split(' ')
    const taksName = text.map((t, index) => index === 0 ? '' : t).join(' ')
    const result = await remindDeadLine(taksName)
    bot.sendMessage(chatId, result);
  })


  bot.onText(/\/done ./, async (msg: Message) => {
    const chatId = msg.chat.id;
    if (!msg.text) return
    const userId = msg.from?.id
    if (!userId) {
      bot.sendMessage(chatId, 'User is not found ❌')
      return
    }
    const text = msg.text.split(' ')
    const taksName = text.map((t, index) => index === 0 ? '' : t).join(' ')
    const result = await tickTaskDone(taksName.trim(), userId.toString())
    if (result) {
      bot.sendMessage(chatId, `@${msg.from?.username} ${result}`);
    }
  })







  bot.onText(/\/ping/, (msg: Message) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Pong!!");
  });


  bot.on("polling_error", (error: any) => {
    console.error(error);
  });


}


initTelegramBot()
