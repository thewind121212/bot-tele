import { GoogleSpreadsheet, GoogleSpreadsheetRow } from "google-spreadsheet";
import { serviceAccountAuth } from "../repositories/googleAuth";
import type TelegramBot from "node-telegram-bot-api";
import type { Db } from "mongodb";
import { findOneGroupId, insertDocument, updateDocument } from "../repositories/mongodb";

const SKIP_COL = 3;


export const getAdminOrCreator = async (chatId: string, bot: TelegramBot, userId: number) => {
    const admins = await bot.getChatAdministrators(chatId)
    admins.find((admin) => admin.user.id === userId)
    if (!admins) return false
    const role = admins[0].status
    if (role === 'creator' || role === 'administrator') return true
    return false
}

export const checkDoc = async (docId: string, from: string): Promise<{
    doc: GoogleSpreadsheet,
    isErr: boolean,
    errMsg: string
}> => {
    try {
        const doc = new GoogleSpreadsheet(docId.trim(), serviceAccountAuth);
        await doc.loadInfo();
        return { doc, isErr: false, errMsg: '' };
    } catch (error: any) {
        return {
            doc: new GoogleSpreadsheet(docId, serviceAccountAuth),
            isErr: true,
            errMsg: `@${from}\n<b>API</b>: ${error.message}\n<b>User</b>: Không tìm thấy hoặc bạn cấp quyền truy cập tài liệu ❌\n<b>Doc ID</b> ${docId}`
        };
    }
};

export const renameDoc = async (docName: string, docId: string) => {
    const doc = new GoogleSpreadsheet(docId, serviceAccountAuth);
    await doc.updateProperties({ title: docName });
};

export const getDeadLineWithTasks = async (rows: GoogleSpreadsheetRow<Record<string, any>>[], taskName: string): Promise<{
    date: string,
    hr: string,
    timeStamps: number
}> => {
    const [day, month, year] = rows[2].get(taskName).split('/');
    const timeStamps = new Date(`${year}-${month}-${day}T${rows[3].get(taskName)}`);
    return {
        date: rows[2].get(taskName),
        hr: rows[3].get(taskName),
        timeStamps: timeStamps.getTime()
    };
};


export const getUndoneTasksByUser = async (userId: string, docId: string) => {
    const doc = new GoogleSpreadsheet(docId, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows({ offset: 0, limit: 100 });
    const userIdRow = rows.findIndex((row) => row.get('ID') === userId);
    if (userIdRow === -1) return []

    const undoneTask = [];

    const tasks = sheet.headerValues;
    for (let i = SKIP_COL; i < tasks.length; i++) {
        const task = tasks[i];
        if (rows[userIdRow].get(task) === 'FALSE') {
            undoneTask.push(task);
        }
    }

    return undoneTask


}

export const getAllTasks = async (docId: string, limit: number = 10, getDeadline: boolean = false) => {
    const doc = new GoogleSpreadsheet(docId, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows({ offset: 0, limit });
    const tasks = sheet.headerValues;
    const taskObject = [];

    // Optimize by collecting tasks and deadlines in a single loop
    for (let i = SKIP_COL; i < tasks.length; i++) {
        const task = tasks[i];
        let replyTask = task;
        if (getDeadline) {
            const deadLine = await getDeadLineWithTasks(rows, task);
            const hr = deadLine.hr ? deadLine.hr : '';
            replyTask = `${task} \n ⏰ ${deadLine.date ? hr + ' - ' + deadLine.date : 'No dead line'}`;
            taskObject.push({
                replyTask,
                task: task.trim().toLocaleUpperCase(),
                originTaskName: task.trim(),
                deadLine: deadLine.timeStamps,
                hr,
                date: deadLine.date ? deadLine.date : ''
            });
        }
        else {
            taskObject.push({
                replyTask,
                task: task.trim().toLocaleUpperCase(),
                originTaskName: task.trim(),
                deadLine: 0,
                hr: '',
                date: ''
            });
        }

    }

    taskObject.sort((a, b) => a.deadLine - b.deadLine);

    const beautifulTasks = taskObject.map((task, i) => `${i + 1}. ${task.replyTask}`);
    return {
        reply: beautifulTasks,
        tasks: tasks.slice(SKIP_COL),
        taskObject,
        rows,
    };
};

export const getTheRightTasks = (taskName: string, taskObject: { replyTask: string, task: string, originTaskName: string, deadLine: number, hr: string, date: string }[]) => {
    return taskObject.find((task) => task.task === taskName.trim().toLocaleUpperCase()) || null;
};

export const tickTaskDone = async (taskName: string, userId: string, docId: string): Promise<string | null> => {
    const { rows, taskObject } = await getAllTasks(docId, 100, false);
    const userIdRow = rows.findIndex((row) => row.get('ID') === userId);

    if (userIdRow === -1) return 'Tài khoản của bạn chưa có trong bản quản lý Task ❌';

    const task = getTheRightTasks(taskName, taskObject);
    if (!task) return 'Không tìm thấy Task ❌🔎';

    const originTaskName = task.originTaskName.trim();

    if (rows[userIdRow].get(originTaskName) === 'FALSE') {
        rows[userIdRow].set(originTaskName, 'TRUE');
        await rows[userIdRow].save();
        return ` 📌 <b>${originTaskName}</b>\nHệ thống đã cập nhật task thành công ✅`;
    } else {
        return null
        // return ` 📌 <b>${originTaskName}</b>\nTask đã được hoàn thành trước đó ❌`;
    }
};

export const isDocFoundWithGroup = (chatId: string, bot: TelegramBot, runtimeTasksStore: { chatId: string, docId: string }[]): boolean => {
    const chat = runtimeTasksStore.find((chat) => chat.chatId === chatId);
    if (!chat) {
        bot.sendMessage(chatId, 'Không tìm thấy tài liệu sử dụng /linkDoc [ID tài liệu] ❌');
        return false;
    }
    return true;
};

export const linkDoc = async (db: Db, groupId: string, docId: string, bot: TelegramBot, from: string, runtimeTasksStore: { chatId: string, docId: string }[]) => {
    try {
        const index = runtimeTasksStore.findIndex((chat) => chat.chatId === groupId);
        if (index !== -1) {
            runtimeTasksStore[index].docId = docId;
        } else {
            runtimeTasksStore.push({ chatId: groupId, docId });
        }

        const isDocExist = await findOneGroupId(db, 'project-mamagement', groupId);
        if (isDocExist) {
            await updateDocument(db, 'project-mamagement', { groupId }, { $set: { docId } });
            return bot.sendMessage(groupId, `@${from} Tài liệu đã được cập nhật với nhóm ✅`);
        }

        await insertDocument(db, 'project-mamagement', { groupId, docId });
        return bot.sendMessage(groupId, `@${from} Tài liệu đã được liên kết với nhóm ✅`);
    } catch (error) {
        return bot.sendMessage(groupId, `@${from} Không thể liên kết tài liệu ❌`);
    }
};

export const findCurrentDocLinking = async (chatId: string, db: Db, runtimeTasksStore: { chatId: string, docId: string }[]): Promise<string> => {
    const chat = runtimeTasksStore.find((chat) => chat.chatId === chatId);
    if (chat) return Promise.resolve(chat.docId.trim());

    const data = await findOneGroupId(db, 'project-mamagement', chatId);
    return data?.docId.trim() || '';
};


export const remindDeadLine = async (taskName: string, docId: string): Promise<string> => {
    const { taskObject } = await getAllTasks(docId, 10, true)
    const task = getTheRightTasks(taskName, taskObject)

    if (!task) return 'Không tìm thấy Task ❌🔎'

    return `🆘 Team nhớ hoàn thành Deadline ${task.originTaskName} trước ${task.hr} ngày ${task.date}`

}