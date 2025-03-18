
db = db.getSiblingDB('admin');

db.auth("root", "linhporo1");

db = db.getSiblingDB('tele_bot_db');

db.createUser({
  user: 'root',
  pwd: 'linhporo1',
  roles: [
    {
      role: 'readWrite',
      db: 'tele_bot_db'
    }
  ]
});