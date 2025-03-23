
import { MongoClient, Db, Collection } from 'mongodb';
// MongoDB connection URI
const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME  


export const checkDbValid = () => {
    if (!dbName || !dbName ) {
        console.log('Please provide a valid MongoDB URI and database name');
        process.exit(1);
    }
}


const runTimeChatIds: any = []
let client: MongoClient;


export async function connectToDatabase(): Promise<Db> {
    if (!client) {
        client = new MongoClient(uri!, {
            maxPoolSize: 10, // Set the connection pool size
        });
        await client.connect();
        console.log('MongoDB connected with connection pooling enabled');
    }

    return client.db(dbName);
}


export async function createCollection(db: Db, collectionName: string) {
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


export async function insertDocument(db: Db, collectionName: string, document: any) {
    if (!document) {
        console.error('No document provided');
        return;
    }

    try {
        const collection: Collection = db.collection(collectionName);

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

export async function findOne(db: Db, collectionName: string, id: any) {

    const collection: Collection = db.collection(collectionName);

    // Find the document
    const document = await collection.findOne({
        id,
    });
    return document;
}



export async function findOneGroupId(db: Db, collectionName: string, groupId: any) {

    const collection: Collection = db.collection(collectionName);

    // Find the document
    const document = await collection.findOne({
        groupId,
    });
    return document;
}


export async function updateDocument(db: Db, collectionName: string, query: any, update: any) {

    const collection: Collection = db.collection(collectionName);

    // Update the document
    const result = await collection.updateOne(query, update);
    return result

}

export async function queryDocuments(db: Db, collectionName: string, query: any) {
    const collection: Collection = db.collection(collectionName);

    // Find the documents
    const documents = await collection.find(query).toArray();
    return documents;
}


