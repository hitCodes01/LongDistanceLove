import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fileUpload from 'express-fileupload'; // For handling file uploads
import { promises as fs } from 'fs';
import PDFParser from 'pdf2json'; // Import pdf2json
import OpenAI from 'openai'; // OpenAI client

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "-", 
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload()); // Enable file uploads

const conversationMemory = {}; // Store conversation history for each user
const documentMemory = {}; // Store uploaded document text for each user
const maxMemory = 5; // Limit to the last five conversations

// Default route to display "Hello World"
app.get('/', (req, res) => {
  res.send('Hello World');
});

// Health check for /chat route
app.get('/chat-health', (req, res) => {
  res.send('Chat route is working');
});

// Health check for /upload route
app.get('/upload-health', (req, res) => {
  res.send('Upload route is working');
});

// Route to handle regular chatbot queries or queries based on uploaded documents
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message; // User's question
  const userId = req.body.userId || "default_user";
  
  let responseMessages;

  // If a document has been uploaded and stored for this user
  if (documentMemory[userId]) {
    const documentText = documentMemory[userId];
    responseMessages = await generateDocumentBasedResponse(userId, userMessage, documentText);
  } else {
    // Handle as a regular chatbot if no document is uploaded
    responseMessages = await generateRegularResponse(userId, userMessage);
  }

  res.json({ response: responseMessages });
});

// Handle document uploads
app.post("/upload", async (req, res) => {
  const userId = req.body.userId || "default_user";
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded.');
  }

  // Assume that the uploaded document is in PDF format
  const uploadedFile = req.files.document;
  const filePath = `/tmp/${uploadedFile.name}`;

  try {
    // Save the file to a temporary location
    await fs.writeFile(filePath, uploadedFile.data);

    // Extract text from the document (for example, a PDF)
    const extractedText = await extractTextFromPDF(filePath);
    
    // Store the extracted text in memory for this user
    documentMemory[userId] = extractedText;

    // Optionally, delete the file after processing to save space
    await fs.unlink(filePath);

    res.send({ message: 'Document uploaded and processed successfully.' });
  } catch (error) {
    console.error('Error processing document:', error);
    res.status(500).send('Error processing document.');
  }
});

// Function to extract text from a PDF using pdf2json
const extractTextFromPDF = async (filePath) => {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
    pdfParser.on("pdfParser_dataReady", pdfData => {
      const text = pdfParser.getRawTextContent(); // Get raw text content
      resolve(text);
    });

    pdfParser.loadPDF(filePath);
  });
};

// Store conversation history in memory
const storeConversation = (userId, role, content) => {
  if (!conversationMemory[userId]) {
    conversationMemory[userId] = [];
  }

  // Add new conversation to the memory
  conversationMemory[userId].push({ role, content });

  // Keep only the last `maxMemory` messages
  if (conversationMemory[userId].length > maxMemory) {
    conversationMemory[userId].shift(); // Remove the oldest message
  }
};

// Generate a response based on the uploaded document and user's query
const generateDocumentBasedResponse = async (userId, userMessage, documentText) => {
  try {
    // Retrieve conversation history for context
    const conversationHistory = conversationMemory[userId] || [];

    const messages = [
      {
        role: "system",
        content: "You are Long Distance Love®,a Smartbot developed by Phoenix Labs under Jmedia Corporation. You are a a chatbot designed to assist with maintaining long-distance relationships. You provide communication tips, activity suggestions, and emotional support to help couples stay connected.",
      },
      ...conversationHistory, // Include previous conversation history
      {
        role: "user",
        content: `Here is the document text: ${documentText}. The user asked: ${userMessage}`,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini-2024-07-18",
      messages: messages,
    });

    const response = completion.choices[0].message.content;

    // Store the user's message and the AI's response in the conversation history
    storeConversation(userId, "user", userMessage);
    storeConversation(userId, "assistant", response);

    return response;
  } catch (error) {
    console.error('Error generating document-based response:', error);
    throw error;
  }
};

// Generate a regular chatbot response without any document context
const generateRegularResponse = async (userId, userMessage) => {
  try {
    // Retrieve conversation history for context
    const conversationHistory = conversationMemory[userId] || [];

    const messages = [
      {
        role: "system",
        content: "You are Long Distance Love®,a Smartbot developed by Phoenix Labs under Jmedia Corporation. You are a a chatbot designed to assist with maintaining long-distance relationships. You provide communication tips, activity suggestions, and emotional support to help couples stay connected.",
      },
      ...conversationHistory, // Include previous conversation history
      {
        role: "user",
        content: userMessage,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini-2024-07-18",
      messages: messages,
    });

    const response = completion.choices[0].message.content;

    // Store the user's message and the AI's response in the conversation history
    storeConversation(userId, "user", userMessage);
    storeConversation(userId, "assistant", response);

    return response;
  } catch (error) {
    console.error('Error generating regular response:', error);
    throw error;
  }
};

// Start the server
const startServer = () => {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
};

// Export the app for Vercel's serverless environment
export default app; // Change to export default