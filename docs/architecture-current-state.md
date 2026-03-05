# PDFSNAG - Architecture (Etat actuel)

## 1. Objectif produit
PDFSNAG permet de visualiser des PDF, créer des annotations (dont nuages/commentaires), et poser les fondations d'une GED multi-projet.

A ce stade:
- le front d'annotation PDF est opérationnel,
- le backend Workers/Hono expose des APIs,
- D1 stocke les métadonnées,
- R2 stocke les fichiers,
- l'accès GED se fait par token projet (`read` / `write`),
- les actions sont auditées avec un acteur de type token.

## 2. Vue d'ensemble technique

### Frontend
- Application web servie depuis `public/` (SPA).
- Outils d'annotation PDF et UX associés (menu, sidebar commentaires, styles).

### Backend
- Cloudflare Worker + Hono.
- Entrée applicative: `src/index.ts`.
- Routing métier:
  - `src/routes/documents.ts` (annotations cloud JSON)
  - `src/routes/ged.ts` (GED v0 par projet)
  - `src/routes/admin.ts` (administration tokens projet)
  - routes de base `projects/tasks/sync` conservées.

### Stockage
- **D1**: métadonnées métier (projects, tokens, folders, documents, versions, audit).
- **R2**: contenu binaire (PDF, fichiers documentaires, versions).

## 3. Modules backend

### 3.1 Auth JWT (admin/API legacy)
- Middleware JWT (`src/services/auth.ts`) pour routes `/api/*` ciblées.
- Vérifie signature + claims (`user_id`, `company_id`, `roles`, `exp`).
- Utilisé pour les routes admin et certaines routes historiques.

### 3.2 Auth token projet (GED)
- Implémentée dans `src/routes/ged.ts` sur `/projects/:projectId/*`.
- Entrées requises:
  - header `X-Tenant-Id`
  - header `Authorization: Bearer <projectToken>`
- Vérification D1:
  - lookup sur hash SHA-256 du token,
  - contrôle `revoked_at`, `expires_at`, scope `read/write`.
- Variables de contexte injectées:
  - `tenantId`, `projectId`, `scope`, `actorId`.

### 3.3 Audit
- Chaque action GED majeure écrit un `audit_events`.
- Colonnes clés: `tenant_id`, `project_id`, `actor_id`, `action`, `entity_type`, `entity_id`, `metadata_json`.
- But: préparer la transition vers de vrais utilisateurs sans refonte majeure.

## 4. Modèle de données (D1)
Schéma défini dans `src/schema/db.sql`.

Tables principales:
- `projects`
- `actors` (`system` / `token` / `user`)
- `project_tokens` (hash token, scope, expiration, révocation)
- `folders` (arborescence)
- `documents` (entité stable)
- `document_versions` (versions immuables)
- `audit_events`

Contraintes notables:
- unicité token: `UNIQUE(tenant_id, project_id, token_hash)`
- unicité dossier dans parent: `UNIQUE(tenant_id, project_id, parent_id, name)`
- trigger `documents.updated_at`.

## 5. Flux GED actuels

### 5.1 Création document (2 temps)
1. `POST /projects/:projectId/documents`
   - crée `documents` + `document_versions` (v1 metadata).
   - retourne l'URL d'upload de contenu.
2. `PUT /projects/:projectId/documents/:docId/versions/:verId/content`
   - stream binaire vers R2.
   - met à jour `mime_type`, `byte_size`.

### 5.2 Nouvelle version
1. `POST /projects/:projectId/documents/:docId/versions`
   - crée version N+1 metadata,
   - bascule `current_version_id`.
2. `PUT .../content`
   - upload contenu version.

### 5.3 Lecture
- `GET /projects/:projectId/documents`
- `GET /projects/:projectId/documents/:docId/content` (proxy R2)

### 5.4 Dossiers
- `GET /projects/:projectId/folders`
- `POST /projects/:projectId/folders`

## 6. API Admin tokens projet
Route: `/api/admin/*` (JWT requis + rôle `admin|owner`).

Fonctions:
- `POST /api/admin/projects/:projectId/tokens`
  - crée actor+token,
  - renvoie `rawToken` une seule fois,
  - stocke uniquement le hash.
- `GET /api/admin/projects/:projectId/tokens`
  - liste tokens sans secret brut.
- `POST /api/admin/projects/:projectId/tokens/:tokenId/revoke`
  - révoque un token.

## 7. Infrastructure Cloudflare
- Worker: `wrangler.toml` (`main = src/index.ts`)
- Bindings:
  - `DB` (D1)
  - `FILES` (R2 principal)
  - `ASSETS` (assets frontend)
- Environnement staging disponible (`--env staging`, port local 8788).

## 8. Sécurité (état actuel)
- JWT pour administration.
- Tokens projet hashés en base (pas de stockage token brut).
- Scope minimal `read` / `write`.
- Audit de traçabilité.
- CORS à cadrer selon les origines front utilisées.

## 9. Points déjà prêts pour la suite
- Passage futur vers vrais users sans casser la GED:
  - garder `actor_id`,
  - mapper vers utilisateur réel plus tard.
- Versioning documentaire déjà posé.
- Structure backend modulaire (`routes`, `services`, `schema`).

## 10. Prochaines étapes recommandées
1. Ajouter endpoint d'upload direct signé R2 (URL signée) pour gros fichiers.
2. Ajouter pagination/cursor sur listes dossiers/documents.
3. Ajouter politique CORS explicite (dev/staging/prod).
4. Ajouter tests d'intégration (auth, versions, audit).
5. Ajouter stratégie de suppression (soft delete + purge différée R2).
