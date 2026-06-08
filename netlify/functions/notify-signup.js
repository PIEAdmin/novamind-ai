// Netlify Function: notify-signup
// Sends email notification to admin when a new user signs up
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: 'novamind-ai-5417c',
      clientEmail: 'firebase-adminsdk-fbsvc@novamind-ai-5417c.iam.gserviceaccount.com',
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    })
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { email, name, uid } = JSON.parse(event.body || '{}');
    if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing email' }) };

    // Write to Firestore adminNotifications (backup in case frontend write failed)
    const db = admin.firestore();
    await db.collection('adminNotifications').doc(uid || email).set({
      type: 'new_signup',
      email,
      displayName: name || '',
      signupAt: admin.firestore.Timestamp.now(),
      read: false,
      notifiedViaFunction: true
    }, { merge: true });

    // If webhook URL is configured, forward to it for email alert
    const webhookUrl = process.env.NOVAMIND_SIGNUP_WEBHOOK;
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, timestamp: new Date().toISOString(), source: 'novamind-app' })
      }).catch(() => {});
    }

    console.log(`New signup notification: ${email} (${name || 'no name'})`);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('Notify signup error:', err);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }; // Don't fail signup
  }
};
