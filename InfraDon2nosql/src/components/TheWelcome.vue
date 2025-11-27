<script lang="ts">
/* eslint-disable */
import { defineComponent } from 'vue'
import PouchDB from 'pouchdb-browser'
import PouchDBFind from 'pouchdb-find'
;(PouchDB as any).plugin(PouchDBFind)

type InfraComment = { text: string; created_at: string }
type InfraDoc = {
  _id?: string
  _rev?: string
  name: string
  content: string
  created_at: string
  updated_at?: string
  likes?: number
  comments?: InfraComment[]
}

const COUCH_URL = 'http://admin:111911@127.0.0.1:5984/database'

export default defineComponent({
  name: 'InfraCrud',
  data() {
    return {
      localDb: null as any,
      remoteDb: null as any,
      syncHandler: null as any,
      loading: false,
      error: '',
      online: true,
      docs: [] as InfraDoc[],
      form: { _id: '', _rev: '', name: '', content: '' },
      isEdit: false,
      searchTerm: '',
      sortByLikes: false,
      commentDrafts: {} as Record<string, string>
    }
  },

  methods: {
    initLocalDb() {
      if (!this.localDb) this.localDb = new (PouchDB as any)('infra_local')
      return this.localDb
    },
    initRemoteDb() {
      if (!this.remoteDb) this.remoteDb = new (PouchDB as any)(COUCH_URL)
      return this.remoteDb
    },
    normalizeDoc(raw: any): InfraDoc {
      return {
        ...raw,
        likes: typeof raw.likes === 'number' ? raw.likes : 0,
        comments: Array.isArray(raw.comments) ? raw.comments : []
      }
    },

    async fetchData() {
      this.loading = true
      this.error = ''
      try {
        const db = this.initLocalDb()
        if (this.sortByLikes) {
          const r = await db.find({
            selector: { likes: { $gte: 0 } },
            sort: [{ likes: 'desc' }]
          })
          this.docs = (r.docs as any[]).map(this.normalizeDoc)
        } else {
          const r = await db.allDocs({ include_docs: true })
          this.docs = r.rows
            .map((row: any) => row.doc)
            .filter(Boolean)
            .map(this.normalizeDoc)
            .sort(
              (a: InfraDoc, b: InfraDoc) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            )
        }
      } catch (e: any) {
        this.error = 'Erreur fetchData: ' + e.message
      } finally {
        this.loading = false
      }
    },

    async ensureIndex() {
      const db = this.initLocalDb()
      try {
        await db.createIndex({ index: { fields: ['name'] } })
        await db.createIndex({ index: { fields: ['likes'] } })
      } catch {}
    },

    resetForm() {
      this.isEdit = false
      this.form = { _id: '', _rev: '', name: '', content: '' }
    },

    async submitForm() {
      if (!this.form.name || !this.form.content) return
      this.loading = true
      try {
        const db = this.initLocalDb()
        if (this.isEdit && this.form._id) {
          const current = await db.get(this.form._id)
          const base = this.normalizeDoc(current)
          const updated: InfraDoc = {
            ...base,
            _id: this.form._id,
            _rev: this.form._rev,
            name: this.form.name,
            content: this.form.content,
            updated_at: new Date().toISOString()
          }
          await db.put(updated)
        } else {
          const doc: InfraDoc = {
            name: this.form.name,
            content: this.form.content,
            created_at: new Date().toISOString(),
            likes: 0,
            comments: []
          }
          await db.post(doc)
        }
        this.resetForm()
        await this.fetchData()
        if (this.online) await this.manualSync()
      } catch (e: any) {
        this.error = 'Erreur submit: ' + e.message
      } finally {
        this.loading = false
      }
    },

    startEdit(doc: InfraDoc) {
      this.isEdit = true
      this.form._id = doc._id || ''
      this.form._rev = doc._rev || ''
      this.form.name = doc.name
      this.form.content = doc.content
    },

    async deleteData(id: string, rev: string) {
      if (!id || !rev) return
      this.loading = true
      try {
        const db = this.initLocalDb()
        await db.remove(id, rev)
        if (this.form._id === id) this.resetForm()
        await this.fetchData()
        if (this.online) await this.manualSync()
      } catch (e: any) {
        this.error = 'Erreur delete: ' + e.message
      } finally {
        this.loading = false
      }
    },

    async likeDoc(doc: InfraDoc) {
      if (!doc._id) return
      try {
        const db = this.initLocalDb()
        const fresh = await db.get(doc._id)
        const base = this.normalizeDoc(fresh)
        await db.put({ ...base, likes: (base.likes || 0) + 1 })
        await this.fetchData()
        if (this.online) await this.manualSync()
      } catch (e: any) {
        this.error = 'Erreur like: ' + e.message
      }
    },

    toggleSortLikes() {
      this.sortByLikes = !this.sortByLikes
      this.fetchData()
    },

    getCommentDraft(id?: string) {
      if (!id) return ''
      return this.commentDrafts[id] || ''
    },
    setCommentDraft(id: string, v: string) {
      this.commentDrafts = { ...this.commentDrafts, [id]: v }
    },

    async addComment(doc: InfraDoc) {
      if (!doc._id) return
      const text = this.getCommentDraft(doc._id).trim()
      if (!text) return
      try {
        const db = this.initLocalDb()
        const fresh = await db.get(doc._id)
        const base = this.normalizeDoc(fresh)
        const comment: InfraComment = {
          text,
          created_at: new Date().toISOString()
        }
        await db.put({
          ...base,
          comments: [...(base.comments || []), comment]
        })
        this.setCommentDraft(doc._id, '')
        await this.fetchData()
        if (this.online) await this.manualSync()
      } catch (e: any) {
        this.error = 'Erreur addComment: ' + e.message
      }
    },

    async generateFake(n = 20) {
      const db = this.initLocalDb()
      const t = Date.now()
      const docs: any[] = []
      for (let i = 0; i < n; i++) {
        docs.push({
          _id: 'fake_' + (t + i),
          name: 'Doc ' + i,
          content: 'Contenu ' + i,
          created_at: new Date().toISOString(),
          likes: Math.floor(Math.random() * 5),
          comments: []
        })
      }
      await db.bulkDocs(docs)
      await this.fetchData()
      if (this.online) await this.manualSync()
    },

    async onSearchInput() {
      if (!this.searchTerm) {
        await this.fetchData()
        return
      }
      try {
        const db = this.initLocalDb()
        const r = await db.find({
          selector: { name: { $eq: this.searchTerm } }
        })
        this.docs = (r.docs as any[]).map(this.normalizeDoc)
      } catch (e: any) {
        this.error = 'Erreur search: ' + e.message
      }
    },

    async replicateFromDistant() {
      const local = this.initLocalDb()
      const remote = this.initRemoteDb()
      await local.replicate.from(remote)
      await this.fetchData()
    },
    async replicateToDistant() {
      const local = this.initLocalDb()
      const remote = this.initRemoteDb()
      await local.replicate.to(remote)
    },
    async manualSync() {
      await this.replicateFromDistant()
      await this.replicateToDistant()
    },

    startLiveSync() {
      const local = this.initLocalDb()
      const remote = this.initRemoteDb()
      this.syncHandler = local
        .sync(remote, { live: true, retry: true })
        .on('change', () => this.fetchData())
        .on('error', console.error)
    },
    stopLiveSync() {
      if (this.syncHandler?.cancel) this.syncHandler.cancel()
    },

    async toggleOnline() {
      this.online = !this.online
      if (this.online) {
        await this.manualSync()
        this.startLiveSync()
      } else {
        this.stopLiveSync()
      }
    }
  },

  async mounted() {
    this.initLocalDb()
    this.initRemoteDb()
    await this.ensureIndex()
    await this.manualSync()
    await this.fetchData()
    this.startLiveSync()
  }
})
</script>

<template>
  <main class="page">
    <div class="wrap">
      <h1>InfraDon2 — CRUD + Réplication</h1>

      <div class="status">
        <span v-if="loading">Chargement...</span>
        <span v-else-if="error" class="error">{{ error }}</span>
      </div>

      <section class="card bar">
        <div>
          Mode :
          <span :class="online ? 'online' : 'offline'">
            {{ online ? 'ONLINE (sync on)' : 'OFFLINE (local)' }}
          </span>
        </div>
        <div class="btn-row">
          <button class="btn small" @click="toggleOnline">
            {{ online ? 'Passer OFFLINE' : 'Passer ONLINE' }}
          </button>
          <button class="btn small" @click="replicateFromDistant">
            distant → local
          </button>
          <button class="btn small" @click="replicateToDistant">
            local → distant
          </button>
          <button class="btn small" @click="manualSync">
            sync (2 sens)
          </button>
        </div>
      </section>

      <section class="card">
        <h2>{{ isEdit ? 'Modifier' : 'Nouveau document' }}</h2>
        <label>Nom</label>
        <input v-model="form.name" required />
        <label>Contenu</label>
        <textarea v-model="form.content" required></textarea>
        <div class="btn-row">
          <button class="btn primary" @click.prevent="submitForm">
            {{ isEdit ? 'Enregistrer' : 'Créer' }}
          </button>
          <button
            v-if="isEdit"
            class="btn"
            type="button"
            @click="resetForm"
          >
            Annuler
          </button>
          <button
            class="btn"
            type="button"
            @click="generateFake(20)"
          >
            Générer 20 docs
          </button>
        </div>
      </section>

      <section class="card">
        <h2>Recherche</h2>
        <input
          v-model="searchTerm"
          @input="onSearchInput"
          placeholder="Nom exact..."
        />
        <div class="btn-row small">
          <span>Tri: {{ sortByLikes ? 'likes' : 'date' }}</span>
          <button class="btn small" @click="toggleSortLikes">
            Changer tri
          </button>
        </div>
      </section>

      <section class="card">
        <h2>Documents locaux</h2>
        <p v-if="docs.length === 0" class="empty">Aucun document.</p>
        <ul v-else class="list">
          <li v-for="doc in docs" :key="doc._id" class="item">
            <div class="doc-main">
              <div class="top">
                <strong>{{ doc.name }}</strong>
                <span class="likes">❤️ {{ doc.likes || 0 }}</span>
              </div>
              <p class="content">{{ doc.content }}</p>
              <p class="meta">
                <span>ID: {{ doc._id }}</span>
                <span>rev: {{ doc._rev }}</span>
                <span>créé: {{ doc.created_at }}</span>
                <span v-if="doc.updated_at">maj: {{ doc.updated_at }}</span>
              </p>

              <div class="comments">
                <p class="comments-title">Commentaires</p>
                <p
                  v-if="!doc.comments || doc.comments.length === 0"
                  class="comments-empty"
                >
                  Aucun commentaire.
                </p>
                <ul v-else class="comments-list">
                  <li
                    v-for="(c, i) in doc.comments"
                    :key="i"
                    class="comments-item"
                  >
                    {{ c.text }}
                    <span class="comment-date">({{ c.created_at }})</span>
                  </li>
                </ul>
                <div v-if="doc._id" class="comment-form">
                  <input
                    :value="getCommentDraft(doc._id)"
                    @input="setCommentDraft(doc._id, ($event.target as HTMLInputElement).value)"
                    placeholder="Nouveau commentaire…"
                  />
                  <button
                    class="btn small"
                    type="button"
                    @click="addComment(doc)"
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            </div>

            <div class="doc-actions">
              <button class="btn small primary" @click="startEdit(doc)">
                Edit
              </button>
              <button
                class="btn small danger"
                @click="deleteData(doc._id || '', doc._rev || '')"
              >
                Supprimer
              </button>
              <button class="btn small" @click="likeDoc(doc)">
                Like
              </button>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #111;
  color: #f5f5f5;
  font-family: system-ui, sans-serif;
  padding: 2rem 1rem;
  box-sizing: border-box;
}
.wrap {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
h1 {
  text-align: center;
  margin: 0;
}
.status {
  text-align: center;
  min-height: 1.2rem;
  font-size: 0.9rem;
}
.status .error {
  color: #ff7c7c;
}
.card {
  background: #1c1c1c;
  border-radius: 10px;
  border: 1px solid #333;
  padding: 1rem 1.25rem;
}
.bar {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
}
.online {
  color: #5ff59b;
  font-weight: 600;
}
.offline {
  color: #ffb476;
  font-weight: 600;
}
.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.btn-row.small {
  align-items: center;
}
.btn {
  border: none;
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  font-size: 0.85rem;
  cursor: pointer;
  background: #3b3b3b;
  color: #f5f5f5;
}
.btn.primary {
  background: #3f8cff;
}
.btn.danger {
  background: #e05252;
}
.btn.small {
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
}
input,
textarea {
  width: 100%;
  border-radius: 7px;
  border: 1px solid #444;
  background: #111;
  color: #f5f5f5;
  padding: 0.45rem 0.6rem;
  margin-bottom: 0.5rem;
  box-sizing: border-box;
}
textarea {
  min-height: 70px;
  resize: vertical;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.item {
  display: flex;
  gap: 0.75rem;
  border-top: 1px solid #333;
  padding-top: 0.75rem;
}
.item:first-child {
  border-top: none;
}
.doc-main {
  flex: 1;
  min-width: 0;
}
.top {
  display: flex;
  justify-content: space-between;
  font-size: 0.95rem;
}
.content {
  margin: 0.3rem 0;
  font-size: 0.9rem;
}
.meta {
  margin: 0;
  font-size: 0.75rem;
  color: #a5a5a5;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.likes {
  font-size: 0.85rem;
}
.doc-actions {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.comments {
  margin-top: 0.6rem;
  border-top: 1px solid #333;
  padding-top: 0.45rem;
}
.comments-title {
  font-size: 0.9rem;
  margin: 0 0 0.25rem;
}
.comments-empty {
  font-size: 0.8rem;
  color: #b5b5b5;
  margin: 0;
}
.comments-list {
  list-style: none;
  margin: 0 0 0.35rem;
  padding: 0;
  font-size: 0.8rem;
}
.comments-item {
  margin-bottom: 0.1rem;
}
.comment-date {
  color: #9a9a9a;
  margin-left: 0.2rem;
}
.comment-form {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.comment-form input {
  margin: 0;
}
.empty {
  font-size: 0.9rem;
  color: #cfcfcf;
}
@media (max-width: 720px) {
  .bar {
    flex-direction: column;
    align-items: flex-start;
  }
  .item {
    flex-direction: column;
  }
  .doc-actions {
    flex-direction: row;
  }
}
</style>
