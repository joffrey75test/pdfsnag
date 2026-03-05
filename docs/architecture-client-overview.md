# PDFSNAG - Vue d'architecture (Version client)

## Ce que le logiciel fait aujourd'hui
PDFSNAG permet de:
- ouvrir et annoter des PDF,
- ajouter des nuages et commentaires,
- gérer des documents dans un espace projet (GED v0),
- sécuriser l'accès par token,
- tracer les actions pour audit.

## Comment c'est organisé (simple)
Le logiciel est composé de 3 blocs:

1. **Interface web (Front)**
- C'est ce que l'utilisateur voit.
- Sert à visualiser les PDF, dessiner des annotations et consulter les commentaires.

2. **API métier (Backend)**
- Reçoit les actions du front.
- Vérifie les droits d'accès.
- Gère dossiers, documents, versions et commentaires.

3. **Stockage**
- **D1 (base de données):** stocke les informations (projets, documents, droits, historique).
- **R2 (stockage fichiers):** stocke les vrais fichiers (PDF, images, rapports).

## Sécurité actuelle
- Accès GED protégé par token projet:
  - token **read**: lecture
  - token **write**: lecture + écriture
- Les tokens ne sont pas stockés en clair (hash sécurisé en base).
- Un journal d'audit enregistre qui a fait quoi.

## Pourquoi c'est une bonne base
- Architecture cloud moderne (Cloudflare Workers).
- Séparation claire entre métadonnées et fichiers.
- Prête à évoluer vers un mode multi-utilisateurs sans refonte complète.
- Performance adaptée pour une montée en charge progressive.

## Ce qui est prêt pour la suite
- Ajouter des comptes utilisateurs complets.
- Partage collaboratif avancé (commentaires/réponses multi-utilisateurs).
- Gestion fine des permissions par rôle.
- Reporting et exports enrichis.

## Résumé exécutif
Aujourd'hui, PDFSNAG dispose d'une base technique solide: annotations PDF + GED v0 sécurisée + audit.
Cette base est déjà exploitable et a été pensée pour évoluer rapidement vers une version collaborative complète.
