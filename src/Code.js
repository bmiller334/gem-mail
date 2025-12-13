// CONFIGURATION
const PROJECT_ID = 'gem-mail-480201'; 
const LOCATION = 'us-west1'; 
const MODEL_ID = 'gemini-2.5-flash'; 

function onOpen(e) {
  // This is for the legacy "Test as Add-on" menu in the script editor
  GmailApp.createMenu('AI Organizer')
    .addItem('Clean Inbox Now', 'processNewEmails')
    .addToUi();
}

/**
 *  The homepage for the Google Workspace Add-on.
 *  This is what renders in the side panel.
 */
function onHomepage(e) {
  const card = CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader()
          .setTitle("AI Email Organizer")
          .setSubtitle("Keep your inbox clean"))
      .addSection(CardService.newCardSection()
          .addWidget(CardService.newTextParagraph()
              .setText("Click the button below to categorize unread emails in your inbox."))
          .addWidget(CardService.newTextButton()
              .setText("Clean Inbox Now")
              .setOnClickAction(CardService.newAction()
                  .setFunctionName("processNewEmailsAction"))))
      .build();
  return [card];
}

/**
 * Wrapper function to be called from the Add-on card button.
 */
function processNewEmailsAction(e) {
  // We can't use Logger directly in the UI response effectively, 
  // but the function will log to Cloud Logging / Executions.
  
  try {
     const result = processNewEmails();
     
     return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification()
            .setText(result || "Processing complete! Check your inbox."))
        .build();
        
  } catch (err) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification()
            .setText("Error: " + err.toString()))
        .build();
  }
}


function processNewEmails() {
  const query = 'label:inbox is:unread -label:"Manual Sort"'; 
  const threads = GmailApp.search(query, 0, 10); 

  if (threads.length === 0) {
    Logger.log("No new emails to process.");
    return "No new emails to process.";
  }

  Logger.log(`Found ${threads.length} threads. Initializing AI...`);
  
  // Note: We cannot use GmailApp.getUi() in a CardService add-on action context usually, 
  // so we rely on the ActionResponse notification or logging.

  const labelNames = getAvailableLabels();
  if (labelNames.length === 0) {
    Logger.log("No user labels found.");
    return "No user labels found.";
  }
  
  const labelExamples = getLabelExamples(labelNames);

  let processedCount = 0;

  for (const thread of threads) {
    const messages = thread.getMessages();
    const firstMessage = messages[0]; 
    const subject = firstMessage.getSubject();
    const sender = firstMessage.getFrom(); 
    const body = firstMessage.getPlainBody().substring(0, 5000); 

    try {
      const result = callGeminiAPI(sender, subject, body, labelNames, labelExamples);
      const category = result.label;
      const reasoning = result.reasoning;
      
      Logger.log(`Categorized "${subject}" as: "${category}"`);
      Logger.log(`Reasoning: ${reasoning}`);
      
      if (category !== "Manual Sort" && category !== "Other") {
        applyLabel(thread, category);
      } else {
        const manualLabel = GmailApp.getUserLabelByName('Manual Sort') || GmailApp.createLabel('Manual Sort');
        thread.addLabel(manualLabel);
      }
      
      // Always archive the thread after processing
      thread.moveToArchive(); 
      processedCount++;
      
    } catch (e) {
      Logger.log(`Error processing thread "${subject}": ${e.toString()}`);
    }
  }
  
  return `Processed ${processedCount} emails.`;
}

function getAvailableLabels() {
  const labels = GmailApp.getUserLabels();
  const names = [];
  for (const label of labels) {
    const name = label.getName();
    // Exclude 'Manual Sort' and 'AI-Old-*' 
    // If the user has a label explicitly named "Other", we allow it in the list so Gemini sees it.
    // However, the main logic currently treats "Other" as "Manual Sort".
    if (name !== 'Manual Sort' && !name.startsWith('AI-Old-')) { 
      names.push(name);
    }
  }
  return names;
}

function getLabelExamples(labelNames) {
  const cache = CacheService.getScriptCache();
  // Bumped to v5 to force refresh 
  const cachedData = cache.get('label_examples_v5'); 
  
  if (cachedData) {
    return JSON.parse(cachedData);
  }

  const examples = {};
  for (const name of labelNames) {
    try {
      const threads = GmailApp.search(`label:${name}`, 0, 1);
      if (threads.length > 0) {
        const msg = threads[0].getMessages()[0];
        let cleanBody = msg.getPlainBody().substring(0, 500).replace(/\s+/g, ' ').trim();
        examples[name] = `From: "${msg.getFrom()}" | Subject: "${msg.getSubject()}" | Body: "${cleanBody}..."`;
      }
      Utilities.sleep(100); 
    } catch (e) {
      Logger.log(`Skipping example for ${name}: ${e.toString()}`);
    }
  }
  
  cache.put('label_examples_v5', JSON.stringify(examples), 21600); 
  return examples;
}

function callGeminiAPI(sender, subject, body, labelNames, labelExamples) {
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:generateContent`;

  let examplesText = "";
  for (const [label, example] of Object.entries(labelExamples)) {
    examplesText += `- Example for "${label}": ${example}\n`;
  }

  // --- REFINED PROMPT FOR "Purchases" ---
  const prompt = `
    You are an intelligent email assistant. Your goal is to organize the inbox by assigning the most appropriate label to the email below.
    
    INSTRUCTIONS:
    1. Read the "Available Labels" list. Infer the meaning of each label based on its name.
    2. Analyze the "New Email" (Sender, Subject, Body).
    3. Select the label that best fits. 
    
    CRITICAL DEFINITIONS:
    - **"Purchases" (or Shopping/Orders):** Use this for ANYTHING related to buying things. This includes: Receipts, Order Confirmations, Shipping Notifications, Tracking Updates, Returns, and "Your item has arrived". 
    - **"Promotions":** Use this for Marketing, Sales, Newsletters, and "50% Off" emails. Do NOT put receipts here.
    - **"Finance":** Use this for Banks, Credit Card Statements, Bills, Taxes. (Do not put shopping receipts here unless the user has no "Purchases" label).

    PRIORITY RULES:
    1. If the email is a Receipt or Order Update -> Label as "Purchases" (or "Shopping").
    2. If the email is Marketing/Sale -> Label as "Promotions".
    3. If unsure -> "Manual Sort".

    REFERENCE EXAMPLES:
    ${examplesText}

    AVAILABLE LABELS:
    ${labelNames.map(n => `- "${n}"`).join('\n')}
    - "Manual Sort"

    NEW EMAIL TO CATEGORIZE:
    From: ${sender}
    Subject: ${subject}
    Body: ${body}

    OUTPUT:
    Return a valid JSON object with two fields:
    {
      "reasoning": "A short explanation of why you chose this label (max 1 sentence).",
      "label": "The exact label name from the available list."
    }
    IMPORTANT: Output ONLY the JSON object. Do not add any conversational text like "Here is the JSON".
  `;

  const payload = {
    "contents": [{
      "role": "user",
      "parts": [{ "text": prompt }]
    }],
    "safetySettings": [
        { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH" },
        { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH" },
        { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH" },
        { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH" }
    ],
    "generationConfig": {
      "temperature": 0.2,
      "maxOutputTokens": 800, 
      "responseMimeType": "application/json"
    }
  };

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'headers': {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode !== 200) {
    throw new Error(`Vertex AI API failed (${responseCode}): ${responseText}`);
  }

  const json = JSON.parse(responseText);
  
  if (!json.candidates || json.candidates.length === 0) {
     return { label: "Manual Sort", reasoning: "No response candidates from Gemini." }; 
  }

  if (json.candidates[0].content && json.candidates[0].content.parts) {
     let text = json.candidates[0].content.parts[0].text.trim();
     
     // Remove markdown code blocks if present
     text = text.replace(/```json/gi, '').replace(/```/g, '');

     // Isolate the JSON object by finding the first '{' and last '}'
     const firstOpen = text.indexOf('{');
     const lastClose = text.lastIndexOf('}');
     
     if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
       text = text.substring(firstOpen, lastClose + 1);
     }
     
     try {
       const parsed = JSON.parse(text);
       return {
         label: parsed.label || "Manual Sort",
         reasoning: parsed.reasoning || "No reasoning provided."
       };
     } catch (e) {
       Logger.log("Failed to parse JSON response: " + text);
       return { label: "Manual Sort", reasoning: "Failed to parse JSON response." };
     }
  }
  
  return { label: "Manual Sort", reasoning: "Invalid response format." };
}

function applyLabel(thread, labelName) {
  if (labelName === "Manual Sort" || labelName === "Other") return; 

  const label = GmailApp.getUserLabelByName(labelName);
  if (label) {
    thread.addLabel(label);
  }
}
