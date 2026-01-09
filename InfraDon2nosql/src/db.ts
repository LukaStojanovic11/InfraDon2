import PouchDB from 'pouchdb-browser'
import PouchDBFind from 'pouchdb-find'

PouchDB.plugin(PouchDBFind)

export const localDB = new PouchDB('infra_local')
export const remoteDB = new PouchDB('http://admin:111911@127.0.0.1:5984/database')

export const localCatDB = new PouchDB('categories_local_Stojanovic-Luka')
export const remoteCatDB = new PouchDB('http://admin:111911@127.0.0.1:5984/categories_db_Stojanovic-Luka')
