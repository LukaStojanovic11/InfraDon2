import PouchDB from 'pouchdb-browser'
import PouchDBFind from 'pouchdb-find'

PouchDB.plugin(PouchDBFind)

// Base locale
export const localDB = new PouchDB('infra_local')

// Base distante CouchDB – adapte login / mot de passe / nom de DB
export const remoteDB = new PouchDB(
  'http://admin:111911@127.0.0.1:5984/database'
)
