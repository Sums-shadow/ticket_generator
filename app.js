const express = require('express');
const QRCode = require('qrcode');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Firebase Admin
var serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Set up Pug as view engine
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

/**
 * Generate a ticket code in format GAL-[random number 10000]
 */
function generateTicketCode() {
  const randomNumber = Math.floor(Math.random() * 90000) + 10000; // 10000-99999
  return `GAL-${randomNumber}`;
}

/**
 * Verify if a ticket code exists in Firebase
 */
async function verifyTicketCode(ticketCode) {
  try {
    const galaRef = db.collection('Gala');
    const snapshot = await galaRef.where('code', '==', ticketCode).get();
    
    if (snapshot.empty) {
      return {
        valid: false,
        code: ticketCode,
        message: 'Ticket non trouvé'
      };
    }
    
    // Get the first matching document
    const doc = snapshot.docs[0];
    const data = doc.data();
    
    let date;
    if (data.date && data.date.toDate) {
      date = data.date.toDate();
    } else if (data.date && data.date._seconds) {
      date = new Date(data.date._seconds * 1000);
    } else if (data.createdAt) {
      date = new Date(data.createdAt);
    } else {
      date = new Date();
    }
    
    return {
      valid: true,
      code: ticketCode,
      id: doc.id,
      date: date,
      createdAt: data.createdAt || date.toISOString(),
      message: 'Ticket valide'
    };
  } catch (error) {
    console.error('Error verifying ticket code:', error);
    return {
      valid: false,
      code: ticketCode,
      message: 'Erreur lors de la vérification: ' + error.message
    };
  }
}

/**
 * Get all tickets from Firebase
 */
async function getAllTickets() {
  try {
    const galaRef = db.collection('Gala');
    const snapshot = await galaRef.get();
    
    if (snapshot.empty) {
      return [];
    }
    
    const tickets = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      let date;
      if (data.date && data.date.toDate) {
        date = data.date.toDate();
      } else if (data.date && data.date._seconds) {
        date = new Date(data.date._seconds * 1000);
      } else if (data.createdAt) {
        date = new Date(data.createdAt);
      } else {
        date = new Date();
      }
      
      tickets.push({
        id: doc.id,
        code: data.code,
        date: date,
        createdAt: data.createdAt || date.toISOString()
      });
    });
    
    // Sort by date descending
    tickets.sort((a, b) => b.date - a.date);
    
    return tickets;
  } catch (error) {
    console.error('Error getting tickets from Firebase:', error);
    return [];
  }
}

/**
 * Regenerate a ticket with QR code for a specific code - returns buffer
 */
async function regenerateTicketForCode(ticketCode) {
  const ticketPath = path.join(__dirname, 'ticket.png');
  
  // Check if ticket.png exists
  try {
    await fs.access(ticketPath);
  } catch (error) {
    throw new Error('ticket.png not found in the project directory');
  }
  
  // Generate QR code
  const qrCodeBuffer = await generateQRCodeBuffer(ticketCode);
  
  // Overlay QR code on ticket and return buffer
  const ticketBuffer = await overlayQRCodeOnTicket(ticketPath, qrCodeBuffer);
  
  return ticketBuffer;
}

/**
 * Delete all documents from Gala collection
 */
async function deleteAllGalaData() {
  try {
    const galaRef = db.collection('Gala');
    const snapshot = await galaRef.get();
    
    if (snapshot.empty) {
      console.log('Gala collection is already empty');
      return;
    }
    
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`Deleted ${snapshot.size} document(s) from Gala collection`);
  } catch (error) {
    console.error('Error deleting Gala data:', error);
    throw error;
  }
}

/**
 * Save ticket codes to Firebase Firestore collection "Gala" in batch
 */
async function saveTicketsToFirebase(ticketCodes) {
  try {
    const batch = db.batch();
    const galaRef = db.collection('Gala');
    
    ticketCodes.forEach((ticketCode) => {
      const ticketData = {
        code: ticketCode,
        date: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: new Date().toISOString()
      };
      
      const docRef = galaRef.doc();
      batch.set(docRef, ticketData);
    });
    
    await batch.commit();
    console.log(`Saved ${ticketCodes.length} ticket(s) to Firebase`);
  } catch (error) {
    console.error('Error saving tickets to Firebase:', error);
    throw error;
  }
}

/**
 * Generate QR code as buffer
 */
async function generateQRCodeBuffer(text) {
  return await QRCode.toBuffer(text, {
    errorCorrectionLevel: 'M',
    type: 'png',
    width: 500,
    margin: 1
  });
}

/**
 * Overlay QR code on ticket image in right center - returns buffer
 */
async function overlayQRCodeOnTicket(ticketPath, qrCodeBuffer) {
  // Read the ticket image file as buffer first to ensure proper format handling
  const ticketBuffer = await fs.readFile(ticketPath);
  const ticketImage = sharp(ticketBuffer);
  const qrCodeImage = sharp(qrCodeBuffer);
  
  // Get ticket image dimensions
  const ticketMetadata = await ticketImage.metadata();
  const qrMetadata = await qrCodeImage.metadata();
  
  const ticketWidth = ticketMetadata.width;
  const ticketHeight = ticketMetadata.height;
  const qrWidth = qrMetadata.width;
  const qrHeight = qrMetadata.height;
  
  // Calculate position for right center
  // Right center means: right side, vertically centered
  // Sharp requires integer positions for composite operations
  const x = Math.round(ticketWidth - qrWidth - 150); // 200px margin from right edge (moved left)
  const y = Math.round((ticketHeight - qrHeight) / 2); // Vertically centered
  
  // Composite QR code onto ticket and return as buffer
  const finalImageBuffer = await ticketImage
    .composite([
      {
        input: await qrCodeImage.toBuffer(),
        left: Math.max(0, x),
        top: Math.max(0, y)
      }
    ])
    .png()
    .toBuffer();
  
  return finalImageBuffer;
}

/**
 * Generate n tickets with QR codes
 */
app.post('/generate-tickets', async (req, res) => {
  try {
    const { n = 1 } = req.body;
    
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return res.status(400).json({ 
        error: 'n must be an integer between 1 and 100' 
      });
    }
    
    const ticketPath = path.join(__dirname, 'ticket.png');
    
    // Check if ticket.png exists
    try {
      await fs.access(ticketPath);
    } catch (error) {
      return res.status(404).json({ 
        error: 'ticket.png not found in the project directory' 
      });
    }
    
    // Delete all existing data from Gala collection
    try {
      await deleteAllGalaData();
    } catch (error) {
      console.error('Error deleting Gala data:', error);
      return res.status(500).json({ 
        error: 'Failed to delete existing Gala data', 
        details: error.message 
      });
    }
    
    const ticketCodes = [];
    const ticketBuffers = [];
    
    // Generate all tickets in memory
    for (let i = 0; i < n; i++) {
      // Generate ticket code
      const ticketCode = generateTicketCode();
      ticketCodes.push(ticketCode);
      
      // Generate QR code
      const qrCodeBuffer = await generateQRCodeBuffer(ticketCode);
      
      // Overlay QR code on ticket (returns buffer)
      const ticketBuffer = await overlayQRCodeOnTicket(ticketPath, qrCodeBuffer);
      ticketBuffers.push({
        buffer: ticketBuffer,
        filename: `ticket_${ticketCode}.png`,
        code: ticketCode
      });
    }
    
    // Save all tickets to Firebase in batch
    try {
      await saveTicketsToFirebase(ticketCodes);
    } catch (error) {
      console.error('Error saving tickets to Firebase:', error);
      // Continue even if Firebase save fails - tickets are already generated
    }
    
    // If single ticket, send it directly
    if (n === 1) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${ticketBuffers[0].filename}"`);
      return res.send(ticketBuffers[0].buffer);
    }
    
    // If multiple tickets, create ZIP in memory
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.attachment('tous_les_tickets.zip');
    archive.pipe(res);
    
    // Add all tickets to ZIP
    ticketBuffers.forEach((ticket) => {
      archive.append(ticket.buffer, { name: ticket.filename });
    });
    
    archive.finalize();
    
  } catch (error) {
    console.error('Error generating tickets:', error);
    res.status(500).json({ 
      error: 'Failed to generate tickets', 
      details: error.message 
    });
  }
});

/**
 * Get a single ticket with QR code (for testing)
 */
app.get('/generate-ticket', async (req, res) => {
  try {
    // Delete all existing data from Gala collection
    try {
      await deleteAllGalaData();
    } catch (error) {
      console.error('Error deleting Gala data:', error);
      return res.status(500).json({ 
        error: 'Failed to delete existing Gala data', 
        details: error.message 
      });
    }
    
    const ticketCode = generateTicketCode();
    const ticketPath = path.join(__dirname, 'ticket.png');
    
    // Check if ticket.png exists
    try {
      await fs.access(ticketPath);
    } catch (error) {
      return res.status(404).json({ 
        error: 'ticket.png not found in the project directory' 
      });
    }
    
    // Generate QR code
    const qrCodeBuffer = await generateQRCodeBuffer(ticketCode);
    
    // Overlay QR code on ticket (returns buffer)
    const ticketBuffer = await overlayQRCodeOnTicket(ticketPath, qrCodeBuffer);
    
    // Save to Firebase
    try {
      await saveTicketsToFirebase([ticketCode]);
    } catch (error) {
      console.error('Error saving ticket to Firebase:', error);
      // Continue even if Firebase save fails - ticket is already generated
    }
    
    // Send the buffer directly
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="ticket_${ticketCode}.png"`);
    res.send(ticketBuffer);
    
  } catch (error) {
    console.error('Error generating ticket:', error);
    res.status(500).json({ 
      error: 'Failed to generate ticket', 
      details: error.message 
    });
  }
});

/**
 * Home page - Display tickets list
 */
app.get('/', async (req, res) => {
  try {
    const tickets = await getAllTickets();
    res.render('index', { 
      tickets, 
      count: tickets.length,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error('Error loading tickets:', error);
    res.render('index', { 
      tickets: [], 
      count: 0, 
      error: error.message,
      success: null
    });
  }
});

/**
 * Generate tickets from web interface
 */
app.post('/generate', async (req, res) => {
  try {
    const n = parseInt(req.body.count) || 1;
    
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return res.redirect('/?error=Le nombre doit être entre 1 et 100');
    }
    
    const ticketPath = path.join(__dirname, 'ticket.png');
    
    // Check if ticket.png exists
    try {
      await fs.access(ticketPath);
    } catch (error) {
      return res.redirect('/?error=ticket.png non trouvé');
    }
    
    // Delete all existing data from Gala collection
    try {
      await deleteAllGalaData();
    } catch (error) {
      console.error('Error deleting Gala data:', error);
      return res.redirect('/?error=Erreur lors de la suppression des données existantes');
    }
    
    const ticketCodes = [];
    const ticketBuffers = [];
    
    // Generate all tickets in memory
    for (let i = 0; i < n; i++) {
      const ticketCode = generateTicketCode();
      ticketCodes.push(ticketCode);
      
      // Generate QR code
      const qrCodeBuffer = await generateQRCodeBuffer(ticketCode);
      
      // Overlay QR code on ticket (returns buffer)
      const ticketBuffer = await overlayQRCodeOnTicket(ticketPath, qrCodeBuffer);
      ticketBuffers.push({
        buffer: ticketBuffer,
        filename: `ticket_${ticketCode}.png`,
        code: ticketCode
      });
    }
    
    // Save all tickets to Firebase in batch
    try {
      await saveTicketsToFirebase(ticketCodes);
    } catch (error) {
      console.error('Error saving tickets to Firebase:', error);
    }
    
    // Redirect to home page with success message
    // Users can download tickets individually or all at once using the download buttons
    res.redirect('/?success=' + encodeURIComponent(`${n} ticket(s) généré(s) avec succès. Vous pouvez maintenant les télécharger.`));
  } catch (error) {
    console.error('Error generating tickets:', error);
    res.redirect('/?error=' + encodeURIComponent(error.message));
  }
});

/**
 * Download a single ticket by code
 */
app.get('/download/:code', async (req, res) => {
  try {
    const ticketCode = req.params.code;
    
    // Regenerate the ticket with QR code (returns buffer)
    const ticketBuffer = await regenerateTicketForCode(ticketCode);
    
    // Send the buffer directly
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="ticket_${ticketCode}.png"`);
    res.send(ticketBuffer);
  } catch (error) {
    console.error('Error downloading ticket:', error);
    res.status(500).send('Erreur: ' + error.message);
  }
});

/**
 * Verify ticket code - API endpoint
 */
app.get('/verify/:code', async (req, res) => {
  try {
    const ticketCode = req.params.code;
    const result = await verifyTicketCode(ticketCode);
    res.json(result);
  } catch (error) {
    console.error('Error verifying ticket:', error);
    res.status(500).json({
      valid: false,
      code: req.params.code,
      message: 'Erreur lors de la vérification: ' + error.message
    });
  }
});

/**
 * Verify ticket code - POST endpoint
 */
app.post('/verify', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        valid: false,
        message: 'Code de ticket requis'
      });
    }
    
    const result = await verifyTicketCode(code);
    res.json(result);
  } catch (error) {
    console.error('Error verifying ticket:', error);
    res.status(500).json({
      valid: false,
      message: 'Erreur lors de la vérification: ' + error.message
    });
  }
});

/**
 * Scan page - Display scanner interface
 */
app.get('/scan', async (req, res) => {
  try {
    res.render('scan', {
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error('Error loading scan page:', error);
    res.render('scan', {
      error: error.message,
      success: null
    });
  }
});

/**
 * Download all tickets as ZIP
 */
app.get('/download-all', async (req, res) => {
  try {
    const tickets = await getAllTickets();
    
    if (tickets.length === 0) {
      return res.redirect('/?error=Aucun ticket à télécharger');
    }
    
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.attachment('tous_les_tickets.zip');
    archive.pipe(res);
    
    // Regenerate each ticket in memory and add to zip
    for (const ticket of tickets) {
      try {
        const ticketBuffer = await regenerateTicketForCode(ticket.code);
        archive.append(ticketBuffer, { name: `ticket_${ticket.code}.png` });
      } catch (error) {
        console.error(`Error adding ticket ${ticket.code} to zip:`, error);
      }
    }
    
    archive.finalize();
  } catch (error) {
    console.error('Error creating zip:', error);
    if (error.code === 'MODULE_NOT_FOUND') {
      res.redirect('/?error=Module archiver requis pour télécharger tous les tickets. Installez-le avec: npm install archiver');
    } else {
      res.status(500).send('Erreur: ' + error.message);
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`POST /generate-tickets - Generate n tickets (body: { "n": 5 })`);
  console.log(`GET /generate-ticket - Generate a single ticket`);
  console.log(`GET / - Web interface`);
});

