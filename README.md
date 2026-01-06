# Système de Gestion de Tickets Gala avec QR Codes

Application web complète pour générer, gérer et scanner des tickets avec codes QR pour un événement Gala.

## 🚀 Fonctionnalités

### Génération de Tickets
- Génération de tickets avec codes uniques au format `GAL-XXXXX` (où XXXXX est un nombre aléatoire entre 10000 et 99999)
- Génération automatique de QR codes pour chaque ticket
- Superposition du QR code sur l'image du ticket (positionné à droite, centré verticalement)
- Génération en lot (jusqu'à 100 tickets à la fois)
- Sauvegarde automatique dans Firebase Firestore

### Gestion des Tickets
- Interface web moderne et responsive avec Pug et TailwindCSS
- Liste de tous les tickets générés avec leurs codes et dates
- Téléchargement individuel de chaque ticket
- Téléchargement en masse (ZIP) de tous les tickets
- Génération en mémoire (pas de stockage sur le serveur)

### Scanner de Tickets
- Scanner QR code avec caméra
- Saisie manuelle du code de ticket
- Vérification en temps réel de la validité des tickets
- Interface intuitive avec feedback visuel (valide/invalide)

## 📋 Prérequis

- Node.js (version 14 ou supérieure)
- npm ou yarn
- Compte Firebase avec Firestore activé
- Fichier `serviceAccountKey.json` pour l'authentification Firebase

## 🔧 Installation

1. **Cloner le dépôt**
```bash
git clone <repository-url>
cd qrticket
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer Firebase**
   - Allez dans Firebase Console → Project Settings → Service Accounts
   - Cliquez sur "Generate new private key"
   - Enregistrez le fichier JSON comme `serviceAccountKey.json` dans le dossier racine du projet

4. **Préparer l'image du ticket**
   - Placez votre image de ticket dans le dossier racine avec le nom `ticket.png`
   - Format supporté : PNG, JPEG, TIFF

## 🏃 Démarrage

```bash
npm start
```

L'application sera accessible sur `http://localhost:3000`

## 📁 Structure du Projet

```
qrticket/
├── app.js                 # Application Express principale
├── package.json           # Dépendances et scripts
├── serviceAccountKey.json # Clés d'authentification Firebase (à ajouter)
├── ticket.png             # Image de base du ticket (à ajouter)
├── views/                 # Templates Pug
│   ├── index.pug         # Page d'accueil - Gestion des tickets
│   └── scan.pug           # Page de scan - Vérification des tickets
└── README.md              # Documentation
```

## 🔌 API Endpoints

### Web Interface
- `GET /` - Page d'accueil avec liste des tickets
- `POST /generate` - Générer des tickets depuis l'interface web
- `GET /scan` - Page de scan pour vérifier les tickets
- `GET /download/:code` - Télécharger un ticket spécifique
- `GET /download-all` - Télécharger tous les tickets en ZIP

### API REST
- `POST /generate-tickets` - Générer n tickets (body: `{ "n": 5 }`)
  - Retourne un fichier PNG si n=1, ou un ZIP si n>1
- `GET /generate-ticket` - Générer un seul ticket (pour tests)
- `GET /verify/:code` - Vérifier un code de ticket
- `POST /verify` - Vérifier un code de ticket (body: `{ "code": "GAL-12345" }`)

## 🎨 Technologies Utilisées

- **Backend**: Node.js, Express.js
- **Templates**: Pug
- **Styling**: TailwindCSS (via CDN)
- **Base de données**: Firebase Firestore
- **Génération QR Code**: qrcode
- **Manipulation d'images**: sharp
- **Archivage**: archiver
- **Scanner QR Code**: html5-qrcode

## 📦 Dépendances Principales

- `express` - Framework web
- `pug` - Moteur de template
- `firebase-admin` - SDK Firebase pour Node.js
- `qrcode` - Génération de QR codes
- `sharp` - Traitement d'images
- `archiver` - Création d'archives ZIP

## 🔐 Configuration Firebase

Le projet utilise Firebase Firestore pour stocker les tickets. Chaque ticket contient :
- `code`: Le code unique du ticket (ex: GAL-12345)
- `date`: Timestamp Firebase de création
- `createdAt`: Date ISO de création

Collection utilisée : `Gala`

## 🎯 Utilisation

### Générer des Tickets

1. Accédez à la page d'accueil (`http://localhost:3000`)
2. Entrez le nombre de tickets à générer (1-100)
3. Cliquez sur "Générer"
4. Les tickets sont générés et sauvegardés dans Firebase
5. Téléchargez individuellement ou en masse via les boutons

### Scanner un Ticket

1. Accédez à la page de scan (`http://localhost:3000/scan`)
2. Option 1 : Utilisez le scanner QR code
   - Cliquez sur "Démarrer le Scanner"
   - Autorisez l'accès à la caméra
   - Pointez la caméra vers le QR code
3. Option 2 : Saisie manuelle
   - Entrez le code du ticket (format: GAL-12345)
   - Cliquez sur "Vérifier"
4. Le résultat s'affiche (valide ✓ ou invalide ✗)

## 🛠️ Personnalisation

### Taille du QR Code
Modifiez la largeur dans `app.js` :
```javascript
width: 500, // Changez cette valeur
```

### Position du QR Code
Modifiez les marges dans `app.js` :
```javascript
const x = Math.round(ticketWidth - qrWidth - 150); // Marge droite
const y = Math.round((ticketHeight - qrHeight) / 2); // Centrage vertical
```

### Format du Code
Modifiez la fonction `generateTicketCode()` dans `app.js` :
```javascript
function generateTicketCode() {
  const randomNumber = Math.floor(Math.random() * 90000) + 10000;
  return `GAL-${randomNumber}`; // Modifiez le format ici
}
```

## 🐛 Dépannage

### Erreur "ticket.png not found"
- Assurez-vous que le fichier `ticket.png` existe dans le dossier racine
- Vérifiez que le nom du fichier est exactement `ticket.png`

### Erreur Firebase
- Vérifiez que `serviceAccountKey.json` est présent et valide
- Vérifiez que Firestore est activé dans votre projet Firebase
- Vérifiez les permissions du compte de service

### Scanner ne fonctionne pas
- Vérifiez que vous avez autorisé l'accès à la caméra
- Utilisez HTTPS en production (requis pour l'accès caméra)
- Vérifiez que votre navigateur supporte l'API MediaDevices

## 📝 Notes

- Les tickets sont générés en mémoire et ne sont pas sauvegardés sur le serveur
- Lors de la génération, tous les anciens tickets sont supprimés de Firebase
- Le format de code par défaut est `GAL-XXXXX` où XXXXX est entre 10000 et 99999

## 📄 Licence

ISC

## 👤 Auteur

Créé pour la gestion des tickets du Gala

