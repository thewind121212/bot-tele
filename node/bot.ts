import TelegramBot, { type Message} from "node-telegram-bot-api";
import {MongoClient, Db, Collection} from 'mongodb';




const IS_DEV = false
const token = process.env.TELEGRAM_BOT_TOKEN || "";

if (token === "") {
  console.error("Please provide a valid Telegram Bot Token");
  process.exit(1);
}


//create the mongodb pool connection

// MongoDB connection URI
const uri = 'mongodb://root:linhporo1@mongodb:27017';
const dbName = 'tele_bot_db';
const runTimeChatIds: any = []
let client:  MongoClient;


async function connectToDatabase(): Promise<Db> {
  if (!client) {
    client = new MongoClient(uri, {
      maxPoolSize: 10, // Set the connection pool size
    });
    await client.connect();
    console.log('MongoDB connected with connection pooling enabled');
  }

  return client.db(dbName);
}


async function createCollection(db: Db, collectionName: string) {
  const collections = await db.listCollections().toArray();
  if (collections.some((c: any) => c.name === collectionName)) {
    console.log(`Collection ${collectionName} already exists`);
    runTimeChatIds.push(collectionName)
    return;
  }
  await db.createCollection(collectionName);
  runTimeChatIds.push(collectionName)
  console.log(`Collection ${collectionName} created`);
}


async function insertDocument(db: Db, collectionName: string, document: any) {
  if (!document) {
    console.error('No document provided');
    return;
  }

  try {
    const collection : Collection = db.collection(collectionName);

    // Insert the document into the collection
    const result = await collection.insertOne(document);

    if (result.acknowledged) {
      console.log(`Document inserted with _id: ${result.insertedId}`);
    } else {
      console.error('Document insertion failed');
    }
  } catch (error) {
    console.error('Error inserting document:', error);
  }
}

async function findOne(db :  Db, collectionName: string, id: any) {

  const collection: Collection = db.collection(collectionName);

  // Find the document
  const document = await collection.findOne({
    id,
  });
  return document;
}


async function queryDocuments(db: Db, collectionName: string, query: any) {
  const collection: Collection = db.collection(collectionName);

  // Find the documents
  const documents = await collection.find(query).toArray();
  return documents;
}



// MongoDB client with connection pooling
const initTelegramBot = async () => {



  const db = await connectToDatabase();




  // Create a bot instance
  const bot = new TelegramBot(token, { polling: true });
  let chatIds = [];




  //get all member in group
  bot.onText(/\/sendid/, async (msg : Message   ) => {
    const chatId = msg.chat.id;


    if (!runTimeChatIds.includes(chatId)) {
      await createCollection(db, `group${chatId}`);
    }

    const member = msg.from;
    if (!member) return
    if (!member.id) return


    const findResult = await findOne(db, `group${chatId}`, member.id);
    if (findResult) {
      bot.sendMessage(chatId, `Duplicate ID ❌`);
      return;
    }
    //send message to user that id had been added
    bot.sendMessage(chatId, `ID added to the list ✅`);
    await insertDocument(db, `group${chatId}`, { id: member.id, username: member.username });
  });




  bot.onText(/\/start/, (msg: Message) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Welcome to the bot!");
  });

  // bot.onText(/\/all (.+)/, async (msg, match) => {

  bot.onText(/\/all/, async (msg : any, match : any) => {
    const chatId = msg.chat.id;

    const queryAllMemberFromGroupId  = await  queryDocuments(db, `group${chatId}`, {});
    const ids = queryAllMemberFromGroupId.map((member : any) => member.id);


    if (queryAllMemberFromGroupId.length === 0) {
      bot.sendMessage(chatId, "There is no user to tag");
      return;
    }

    const userNames: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      await bot.getChatMember(chatId, ids[i]).then((res : any) => {
        userNames.push(res.user.username);
      });
    }

    const tagMessage = userNames.map((username) => `@${username}`).join(" ");

    bot.sendMessage(chatId, `${tagMessage}`);
  });

  // Handle errors
  bot.on("polling_error", (error : any) => {
    console.error(error);
  });


}


initTelegramBot()