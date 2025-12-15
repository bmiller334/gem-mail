// --- CONFIGURATION ---
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE"; 
const PROJECT_ID = "gem-mail-480201";
const LOCATION = "us-west1"; 
const MODEL_ID = "gemini-2.5-flash";
const PROCESSED_LABEL = "GeminiProcessed";

// --- TRIGGERS & UI ---

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Gemini Command')
      .addItem('▶ Run Processor', 'main')
      .addItem('↻ Reset Dashboard', 'generateDashboard')
      .addToUi();
}

function onEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== "Dashboard") return;
  if (e.range.getRow() === 4 && e.range.getColumn() === 3 && e.value === "TRUE") {
    e.range.setValue(false);
    SpreadsheetApp.getActiveSpreadsheet().toast("🚀 Launching Processor...", "Gemini HQ");
    main(); 
    SpreadsheetApp.getActiveSpreadsheet().toast("✅ Processing Complete", "Gemini HQ");
    generateDashboard(); 
  }
}

// --- DASHBOARD BUILDER ---

function generateDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let dash = ss.getSheetByName("Dashboard");
  if (!dash) dash = ss.insertSheet("Dashboard", 0);
  
  dash.clear();
  dash.setHiddenGridlines(true);
  dash.setTabColor("#202124"); 
  
  const logs = ss.getSheetByName("Logs");
  if (!logs || logs.getLastRow() < 2) {
    dash.getRange("B6").setValue("No data yet. Run the processor!");
    return;
  }

  // --- DATA ---
  const data = logs.getDataRange().getValues();
  data.shift(); 
  const total = data.length;
  
  const errors = data.filter(r => r[6] !== "").length; 
  const successRate = total === 0 ? 0 : Math.round(((total - errors) / total) * 100);

  const now = new Date();
  const todayStart = new Date(now.setHours(0,0,0,0)).getTime();
  const todayData = data.filter(r => new Date(r[0]).getTime() >= todayStart);
  const todayCount = todayData.length;

  const hours = new Array(24).fill(0);
  todayData.forEach(r => { hours[new Date(r[0]).getHours()]++; });
  const hourlyString = "{" + hours.join(",") + "}";

  const dateMap = {};
  data.forEach(r => { dateMap[new Date(r[0]).toISOString().split('T')[0]] = (dateMap[new Date(r[0]).toISOString().split('T')[0]] || 0) + 1; });
  const trendValues = Object.values(dateMap).slice(-7); 
  if (trendValues.length < 2) trendValues.unshift(0);
  const trendString = "{" + trendValues.join(",") + "}";

  const senderMap = {};
  data.forEach(r => { senderMap[r[1]] = (senderMap[r[1]] || 0) + 1; });
  const topSenders = Object.entries(senderMap).sort((a,b) => b[1] - a[1]).slice(0, 5); 

  // --- UI DRAWING ---
  
  dash.getRange("B2").setValue("GEMINI COMMAND CENTER")
      .setFontFamily("Roboto Mono").setFontSize(26).setFontWeight("bold").setFontColor("#202124");
  
  dash.getRange("B4").setValue("STATUS:").setFontWeight("bold").setHorizontalAlignment("right");
  const runBtn = dash.getRange("C4");
  runBtn.insertCheckboxes();
  runBtn.setFontColor("white"); 
  dash.getRange("D4").setValue("SYSTEM ONLINE (Click box to run)").setFontColor("#188038").setFontWeight("bold");

  // KPI Cards
  const cardBg = "#F8F9FA"; const border = "#E8EAED";
  
  dash.getRange("B6").setValue("7-DAY TREND").setFontSize(9).setFontWeight("bold").setFontColor("#5f6368");
  dash.getRange("B7").setValue(total).setFontSize(36).setFontFamily("Roboto").setFontWeight("bold").setFontColor("#4285F4");
  dash.getRange("B8").setFormula(`=SPARKLINE(${trendString}, {"charttype","line";"color","#4285F4";"linewidth",2})`);
  dash.getRange("B6:C8").setBackground(cardBg).setBorder(true, true, true, true, false, false, border, SpreadsheetApp.BorderStyle.SOLID);

  dash.getRange("E6").setValue("SUCCESS RATE").setFontSize(9).setFontWeight("bold").setFontColor("#5f6368");
  const sColor = successRate > 90 ? "#0F9D58" : "#F4B400";
  dash.getRange("E7").setValue(successRate + "%").setFontSize(36).setFontFamily("Roboto").setFontWeight("bold").setFontColor(sColor);
  dash.getRange("E8").setFormula(`=SPARKLINE(${successRate}, {"charttype","bar";"max",100;"color1","${sColor}"})`);
  dash.getRange("E6:F8").setBackground(cardBg).setBorder(true, true, true, true, false, false, border, SpreadsheetApp.BorderStyle.SOLID);

  dash.getRange("H6").setValue("TODAY'S VOLUME").setFontSize(9).setFontWeight("bold").setFontColor("#5f6368");
  dash.getRange("H7").setValue(todayCount).setFontSize(36).setFontFamily("Roboto").setFontWeight("bold").setFontColor("#AA00FF");
  dash.getRange("H8").setFormula(`=SPARKLINE(${hourlyString}, {"charttype","column";"color1","#AA00FF"})`);
  dash.getRange("H6:I8").setBackground(cardBg).setBorder(true, true, true, true, false, false, border, SpreadsheetApp.BorderStyle.SOLID);

  // --- LIVE FEED ---
  
  dash.getRange("B11").setValue("LIVE FEED").setFontWeight("bold");
  const feedFormula = `=IFERROR(QUERY(Logs!A2:G, "SELECT B, C, F ORDER BY A DESC LIMIT 10 LABEL B 'Sender', C 'Subject', F 'Applied Label'", 0), "No Data")`;
  dash.getRange("B12").setFormula(feedFormula);

  const feedRange = dash.getRange("B12:D22");
  feedRange.setFontFamily("Roboto").setFontSize(10).setVerticalAlignment("middle");
  feedRange.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  feedRange.setBorder(false, false, true, false, false, false, border, SpreadsheetApp.BorderStyle.SOLID);
  dash.getRange("B12:D12").setBackground("#3C4043").setFontColor("white").setFontWeight("bold"); 

  // --- TOP SENDERS (Moved Below Live Feed) ---
  
  const tsStartRow = 24;
  dash.getRange(tsStartRow, 2).setValue("TOP SENDERS (LEADERBOARD)").setFontWeight("bold");
  
  if (topSenders.length > 0) {
    const maxVal = topSenders[0][1];
    topSenders.forEach(([sender, count], i) => {
      const r = tsStartRow + 1 + i;
      
      // Name: Merge Cols B & C for maximum width (480px total)
      dash.getRange(r, 2, 1, 2).merge().setValue(sender).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP).setVerticalAlignment("middle");
      
      // Count: Col D
      dash.getRange(r, 4).setValue(count).setHorizontalAlignment("center").setFontColor("#5f6368").setFontWeight("bold").setVerticalAlignment("middle");
      
      // Bar: Col E
      dash.getRange(r, 5).setFormula(`=SPARKLINE(${count}, {"charttype","bar";"max",${maxVal};"color1","#4285F4"})`).setVerticalAlignment("middle");
    });
    
    // Borders for Top Senders
    dash.getRange(tsStartRow + 1, 2, topSenders.length, 4).setBorder(true, true, true, true, true, true, border, SpreadsheetApp.BorderStyle.SOLID);
    
  } else {
     dash.getRange(tsStartRow + 1, 2).setValue("No data yet...");
  }

  // --- COLUMN WIDTHS ---
  dash.setColumnWidth(1, 20);  // A: Spacer
  dash.setColumnWidth(2, 180); // B: Sender / TS Name Part 1
  dash.setColumnWidth(3, 300); // C: Subject / TS Name Part 2
  dash.setColumnWidth(4, 150); // D: Label / TS Count
  dash.setColumnWidth(5, 150); // E: TS Power Bar

  SpreadsheetApp.setActiveSheet(dash);
}

// --- CORE LOGIC ---

function getTargetSpreadsheet() {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}
  if (SPREADSHEET_ID && SPREADSHEET_ID !== "YOUR_SPREADSHEET_ID_HERE") {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  throw new Error("Could not find a Google Sheet.");
}

function getThreadsToProcess() {
  const query = `is:unread -label:${PROCESSED_LABEL}`;
  return GmailApp.search(query);
}

function ensureLabelExists() {
  let label = GmailApp.getUserLabelByName(PROCESSED_LABEL);
  if (!label) label = GmailApp.createLabel(PROCESSED_LABEL);
  return label;
}

function getAvailableLabels() {
  const labels = GmailApp.getUserLabels();
  const names = [];
  for (const label of labels) {
    const name = label.getName();
    if (name !== PROCESSED_LABEL && !name.startsWith('AI-Old-')) { 
      names.push(name);
    }
  }
  if (names.length === 0) return ["Personal", "Work", "Promotions", "Updates"];
  return names;
}

function getEmailBody(thread) {
  if (thread) return thread.getMessages()[0].getPlainBody();
  return null;
}

function cleanJsonResponse(text) {
  let cleanText = text.trim();
  if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
  else if (cleanText.startsWith('```')) cleanText = cleanText.substring(3);
  if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
  return cleanText.trim();
}

function callGeminiAPI(emailBody, labelNames, sheet) {
  const token = ScriptApp.getOAuthToken();
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:generateContent`;

  const labelString = labelNames.map(n => `- "${n}"`).join('\n');

  const prompt = `
    You are an automated email assistant. 
    1. Analyze the email below.
    2. Select the BEST matching label from this list:
    ${labelString}
    - "Manual Sort" (if unsure)

    3. Provide a brief 1-sentence reasoning.
    
    Return ONLY a valid JSON object:
    {
      "label": "Selected Label Name",
      "reasoning": "Your summary here"
    }

    Email Body:
    ${emailBody}
  `;

  const requestBody = {
    "contents": [{
      "role": "user",
      "parts": [{ "text": prompt }]
    }],
    "generation_config": { "response_mime_type": "application/json" }
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": { "Authorization": "Bearer " + token },
    "payload": JSON.stringify(requestBody),
    "muteHttpExceptions": true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      const parsed = JSON.parse(response.getContentText());
      return parsed.candidates[0].content.parts[0].text;
    } else {
      logErrorToSheet(sheet, `API Error ${response.getResponseCode()}`, response.getContentText());
      return null;
    }
  } catch (error) {
    logErrorToSheet(sheet, "Gemini API failed", error.toString());
    return null;
  }
}

function setupSheet(spreadsheet) {
  const sheetName = 'Logs';
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.appendRow(['Timestamp', 'Sender', 'Subject', 'Date Received', 'Gemini Reasoning', 'Applied Label', 'Error', 'Raw Gemini Response']);
  } else {
    if (sheet.getLastColumn() < 8) {
       sheet.getRange("F1").setValue("Applied Label");
       sheet.getRange("G1").setValue("Error");
       sheet.getRange("H1").setValue("Raw Response");
    }
  }
  return sheet;
}

function logToSheet(sheet, sender, subject, dateReceived, reasoning, label) {
  if (sheet) sheet.appendRow([new Date(), sender, subject, dateReceived, reasoning, label, '', '']);
}

function logErrorToSheet(sheet, error, rawResponse) {
  if (sheet) sheet.appendRow([new Date(), '', '', '', '', '', error, rawResponse]);
}

function main() {
  let spreadsheet;
  try {
    spreadsheet = getTargetSpreadsheet();
  } catch (e) {
    console.error(e.message);
    return;
  }

  const sheet = setupSheet(spreadsheet);
  const processedLabel = ensureLabelExists();
  const labelNames = getAvailableLabels();
  const threads = getThreadsToProcess();

  if (threads.length === 0) {
    console.log("No new emails.");
    try { generateDashboard(); } catch(e) {} 
    return;
  }

  console.log(`Processing ${threads.length} threads...`);
  try { SpreadsheetApp.getActiveSpreadsheet().toast(`Processing ${threads.length} emails...`, "Gemini HQ"); } catch(e) {}

  for (const thread of threads) {
    const message = thread.getMessages()[0];
    const body = getEmailBody(thread);

    if (body) {
      const response = callGeminiAPI(body, labelNames, sheet);
      if (response) {
        try {
          const json = JSON.parse(cleanJsonResponse(response));
          const selectedLabel = json.label || "Manual Sort";
          
          logToSheet(sheet, message.getFrom(), message.getSubject(), message.getDate(), json.reasoning || "No reasoning", selectedLabel);
          
          if (selectedLabel !== "Manual Sort") {
             const gmailLabel = GmailApp.getUserLabelByName(selectedLabel);
             if (gmailLabel) thread.addLabel(gmailLabel);
          }

          thread.addLabel(processedLabel);
          thread.markRead();
        } catch (e) {
          logErrorToSheet(sheet, "JSON Parse Error", response);
        }
      }
    }
  }
  
  try { generateDashboard(); } catch(e) {}
}