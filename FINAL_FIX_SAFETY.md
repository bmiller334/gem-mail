# FINAL FIX: Handling Empty Responses

The error `Cannot read properties of undefined (reading '0')` means that Gemini received the email but decided **not to return an answer**.

This usually happens for two reasons:
1.  **Safety Filters:** The model flagged the email content (e.g., spam, sexually explicit, hate speech) and blocked the response.
2.  **Empty Response:** The model just got confused.

To fix this, we need to update the `callGeminiAPI` function to check if `candidates` exists before trying to read it.

## Updated Function
Replace your **entire** `callGeminiAPI` function with this safer version:

```javascript
function callGeminiAPI(subject, body) {
  // Note: Using the configured LOCATION in the URL
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:generateContent`;

  const prompt = `
    You are an intelligent email assistant. Categorize the following email into exactly one of these categories:
    - "Finance" (bills, receipts, banks)
    - "Social" (friends, family, events)
    - "Promotions" (marketing, newsletters, deals)
    - "Updates" (software updates, notifications)
    - "Work" (business, professional)
    - "Other" (anything else)

    Return ONLY the category name. Do not explain.

    Subject: ${subject}
    Body: ${body}
  `;

  const payload = {
    "contents": [{
      "role": "user",
      "parts": [{ "text": prompt }]
    }],
    // Safety settings to reduce blocking
    "safetySettings": [
        { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH" },
        { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH" },
        { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH" },
        { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH" }
    ],
    "generationConfig": {
      "temperature": 0.2,
      "maxOutputTokens": 20
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
  
  // --- SAFETY CHECK START ---
  // If Gemini blocks the response, 'candidates' might be missing or empty.
  if (!json.candidates || json.candidates.length === 0) {
     Logger.log(`Warning: Gemini returned no candidates (likely safety block). Returning 'Other'.`);
     return "Other"; 
  }
  // --- SAFETY CHECK END ---

  if (json.candidates[0].content && json.candidates[0].content.parts) {
     const text = json.candidates[0].content.parts[0].text;
     return text.trim();
  }
  
  return "Other";
}
```
