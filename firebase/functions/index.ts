import * as functions from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import Stripe from "stripe";

// ─── Initialise ───────────────────────────────────────────────────────────────

admin.initializeApp();
const db = admin.firestore();

// ─── Secrets (set via `firebase functions:secrets:set KEY`) ───────────────────

// v1 callable functions access secrets via process.env (set in .runWith({ secrets: [...] }))
// v2 onRequest/onSchedule functions use defineSecret().value()
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_LIMITS: Record<string, number> = {
  free: 15,
  pro: 100,
  solopreneur: 999999,
  team: 999999,
  business: 999999,
  business_pro: 999999,
};

const SUBSCRIPTION_PRICES: Record<string, { amount: number; name: string }> = {
  pro: { amount: 599, name: "NovaMind Pro" },
  business: { amount: 1499, name: "NovaMind Business" },
};

const TOPUP_PACKS: Record<string, { credits: number; amount: number }> = {
  "10": { credits: 10, amount: 99 },
  "25": { credits: 25, amount: 199 },
  "50": { credits: 50, amount: 349 },
};

type ContentType = "text" | "image" | "code" | "email" | "social" | "blog" | "research";

interface FileAttachment {
  name: string;
  type: string;   // MIME type
  size: number;
  data: string;   // base64 encoded
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStripe(key: string): Stripe {
  return new Stripe(key, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });
}

function buildSystemPrompt(type: ContentType): string {
  const prompts: Record<ContentType, string> = {
    text: "You are a helpful AI assistant. Provide clear, well-structured responses.",
    code: "You are an expert software engineer. Write clean, well-commented, production-ready code. Include explanations when helpful.",
    email: "You are a professional email writer. Write polished, appropriately toned emails. Include subject line suggestions when relevant.",
    social: "You are a social media content expert. Create engaging, platform-optimized posts. Include relevant hashtag suggestions.",
    blog: "You are an experienced blog writer. Create compelling, well-structured blog posts with clear headings, engaging introductions, and actionable conclusions.",
    research: "You are a thorough research analyst. Provide comprehensive, well-sourced analysis with key findings, data points, and actionable insights.",
    image: "You generate images based on user descriptions.",
  };
  return prompts[type];
}

function generateTitle(type: ContentType, prompt: string): string {
  const maxLen = 60;
  const prefix = type.charAt(0).toUpperCase() + type.slice(1);
  const snippet = prompt.length > maxLen ? prompt.substring(0, maxLen) + "…" : prompt;
  return `${prefix}: ${snippet}`;
}

function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function isDocumentFile(mimeType: string): boolean {
  return (
    mimeType === "application/pdf" ||
    mimeType === "text/plain" ||
    mimeType === "text/csv" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  );
}

// Extract text from base64-encoded text files
function extractTextFromBase64(data: string, mimeType: string): string {
  if (mimeType === "text/plain" || mimeType === "text/csv") {
    return Buffer.from(data, "base64").toString("utf-8");
  }
  // For PDFs and DOCX, we include a note that the file was attached
  // Full extraction would require additional libraries
  return `[Document attached: ${mimeType}]`;
}

async function callDeepSeek(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string
): Promise<{ result: string; model: string }> {
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new functions.https.HttpsError("internal", `DeepSeek API error: ${err}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
    model: string;
  };
  return {
    result: data.choices[0].message.content,
    model: data.model,
  };
}

async function callOpenAIChat(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string
): Promise<{ result: string; model: string }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new functions.https.HttpsError("internal", `OpenAI API error: ${err}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
    model: string;
  };
  return {
    result: data.choices[0].message.content,
    model: data.model,
  };
}

// NEW: OpenAI Vision API for image analysis
async function callOpenAIVision(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  imageFiles: FileAttachment[]
): Promise<{ result: string; model: string }> {
  // Build content array with text + images
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: string } }
  > = [{ type: "text", text: userPrompt }];

  for (const file of imageFiles) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${file.type};base64,${file.data}`,
        detail: "auto",
      },
    });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new functions.https.HttpsError("internal", `OpenAI Vision API error: ${err}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
    model: string;
  };
  return {
    result: data.choices[0].message.content,
    model: data.model,
  };
}

async function callOpenAIImage(
  apiKey: string,
  prompt: string
): Promise<{ result: string; model: string }> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new functions.https.HttpsError("internal", `OpenAI Image API error: ${err}`);
  }

  const data = (await response.json()) as {
    data: { url: string }[];
  };
  return {
    result: data.data[0].url,
    model: "dall-e-3",
  };
}

// ─── 1. Generate Content (Callable) ──────────────────────────────────────────

export const generateContent = functions
  .runWith({ secrets: ["DEEPSEEK_API_KEY", "OPENAI_API_KEY"], timeoutSeconds: 120, memory: "256MB" })
  .https.onCall(async (data: any, context) => {
    // Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "You must be signed in to generate content.");
    }

    const uid = context.auth.uid;
    const { type, prompt, model: requestedModel, files } = data as {
      type: ContentType;
      prompt: string;
      model?: string;
      files?: FileAttachment[];
    };

    if (!type || !prompt) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields: type, prompt.");
    }

    // Validate file attachments
    if (files && files.length > 0) {
      if (files.length > 5) {
        throw new functions.https.HttpsError("invalid-argument", "Maximum 5 files per request.");
      }
      const maxSize = 10 * 1024 * 1024; // 10MB
      for (const file of files) {
        const fileSize = Buffer.from(file.data, "base64").length;
        if (fileSize > maxSize) {
          throw new functions.https.HttpsError("invalid-argument", `File "${file.name}" exceeds 10MB limit.`);
        }
      }
    }

    // Read user document and check limits — auto-create if missing
    const userRef = db.collection("users").doc(uid);
    let userSnap = await userRef.get();

    if (!userSnap.exists) {
      // Auto-create user document for new users (Firestore rules may block client writes)
      const now = new Date();
      const resetYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
      const resetMonth = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
      const resetDate = new Date(Date.UTC(resetYear, resetMonth, 1, 0, 0, 0));

      await userRef.set({
        email: context.auth.token.email || "",
        displayName: context.auth.token.name || "",
        photoURL: context.auth.token.picture || "",
        plan: "free",
        usageCount: 0,
        usageLimit: 15,
        resetDate: admin.firestore.Timestamp.fromDate(resetDate),
        stripeCustomerId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      userSnap = await userRef.get();
    }

    const userData = userSnap.data()!;
    if (userData.usageCount >= userData.usageLimit) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "You have reached your usage limit. Upgrade your plan or purchase a top-up."
      );
    }

    // Route to the correct AI provider
    const systemPrompt = buildSystemPrompt(type);
    let result: string;
    let model: string;
    let provider: string;

    // Check if we have file attachments
    const hasFiles = files && files.length > 0;
    const imageFiles = hasFiles ? files!.filter((f) => isImageFile(f.type)) : [];
    const docFiles = hasFiles ? files!.filter((f) => isDocumentFile(f.type)) : [];
    const hasImages = imageFiles.length > 0;

    // Build enhanced prompt with document content
    let enhancedPrompt = prompt;
    if (docFiles.length > 0) {
      const docTexts = docFiles.map((f) => {
        const text = extractTextFromBase64(f.data, f.type);
        return `\n\n--- Attached file: ${f.name} ---\n${text}`;
      });
      enhancedPrompt = prompt + docTexts.join("");
    }

    if (hasImages) {
      // Images attached → use OpenAI Vision API
      const res = await callOpenAIVision(
        process.env.OPENAI_API_KEY!,
        systemPrompt,
        enhancedPrompt,
        imageFiles
      );
      result = res.result;
      model = res.model;
      provider = "openai";
    } else if (type === "image") {
      // Image generation → OpenAI DALL-E 3
      const res = await callOpenAIImage(process.env.OPENAI_API_KEY!, enhancedPrompt);
      result = res.result;
      model = res.model;
      provider = "openai";
    } else if (requestedModel === "gpt-4o-mini") {
      // Premium text → OpenAI GPT-4o-mini
      const res = await callOpenAIChat(
        process.env.OPENAI_API_KEY!,
        systemPrompt,
        enhancedPrompt,
        "gpt-4o-mini"
      );
      result = res.result;
      model = res.model;
      provider = "openai";
    } else {
      // Default text/code/email/social/blog/research → DeepSeek
      const deepseekModel = requestedModel || "deepseek-chat";
      const res = await callDeepSeek(
        process.env.DEEPSEEK_API_KEY!,
        systemPrompt,
        enhancedPrompt,
        deepseekModel
      );
      result = res.result;
      model = res.model;
      provider = "deepseek";
    }

    // Save creation to Firestore
    const title = generateTitle(type, prompt);
    const creationRef = await db.collection("creations").add({
      userId: uid,
      type,
      title,
      prompt,
      result,
      model,
      provider,
      hasAttachments: hasFiles || false,
      attachmentCount: files?.length || 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Increment usage count
    await userRef.update({
      usageCount: admin.firestore.FieldValue.increment(1),
    });

    return {
      id: creationRef.id,
      result,
      model,
      provider,
      title,
    };
  }
);

// ─── 2. Reset Usage (Scheduled — 1st of every month at midnight UTC) ─────────

export const resetUsage = onSchedule(
  {
    schedule: "0 0 1 * *",
    timeZone: "UTC",
  },
  async () => {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.get();

    const batch = db.batch();
    const nextReset = getNextMonthTimestamp();

    snapshot.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        usageCount: 0,
        resetDate: nextReset,
      });
    });

    await batch.commit();
    console.log(`Reset usage for ${snapshot.size} users.`);
  }
);

function getNextMonthTimestamp(): admin.firestore.Timestamp {
  const now = new Date();
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const month = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  return admin.firestore.Timestamp.fromDate(new Date(Date.UTC(year, month, 1, 0, 0, 0)));
}

// ─── 3. Create Checkout Session (Callable) ───────────────────────────────────

export const createCheckoutSession = functions
  .runWith({ secrets: ["STRIPE_SECRET_KEY"], timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data: any, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "You must be signed in.");
    }

    const uid = context.auth.uid;
    const { planId, topup } = data as {
      planId?: "pro" | "business";
      topup?: "10" | "25" | "50";
    };

    if (!planId && !topup) {
      throw new functions.https.HttpsError("invalid-argument", "Provide either planId or topup.");
    }

    const stripe = getStripe(process.env.STRIPE_SECRET_KEY!);

    // Get or create Stripe customer
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data()!;

    let customerId = userData.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.email,
        metadata: { firebaseUID: uid },
      });
      customerId = customer.id;
      await userRef.update({ stripeCustomerId: customerId });
    }

    // Determine the frontend URL from the request origin
    const origin = "https://novamind-ai-app.netlify.app";

    let sessionParams: Stripe.Checkout.SessionCreateParams;

    if (planId) {
      // Subscription checkout
      const priceInfo = SUBSCRIPTION_PRICES[planId];
      if (!priceInfo) {
        throw new functions.https.HttpsError("invalid-argument", `Invalid plan: ${planId}`);
      }

      sessionParams = {
        customer: customerId,
        mode: "subscription",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: { name: priceInfo.name },
              unit_amount: priceInfo.amount,
              recurring: { interval: "month" },
            },
            quantity: 1,
          },
        ],
        metadata: { firebaseUID: uid, planId },
        success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}&success=true`,
        cancel_url: `${origin}/pricing?canceled=true`,
      };
    } else {
      // Top-up one-time payment
      const packInfo = TOPUP_PACKS[topup!];
      if (!packInfo) {
        throw new functions.https.HttpsError("invalid-argument", `Invalid top-up pack: ${topup}`);
      }

      sessionParams = {
        customer: customerId,
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: { name: `NovaMind Top-Up: ${packInfo.credits} credits` },
              unit_amount: packInfo.amount,
            },
            quantity: 1,
          },
        ],
        metadata: { firebaseUID: uid, topup: topup! },
        success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}&success=true`,
        cancel_url: `${origin}/pricing?canceled=true`,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return { url: session.url };
  }
);

// ─── 4. Stripe Webhook (HTTP onRequest) ──────────────────────────────────────

export const stripeWebhook = onRequest(
  {
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
    maxInstances: 5,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const stripe = getStripe(STRIPE_SECRET_KEY.value());
    const sig = req.headers["stripe-signature"] as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_WEBHOOK_SECRET.value()
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Webhook signature verification failed:", message);
      res.status(400).send(`Webhook Error: ${message}`);
      return;
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        let uid = session.metadata?.firebaseUID;

        // Fallback: if no firebaseUID in metadata (e.g. payment link checkout),
        // look up user by customer email
        if (!uid && session.customer_details?.email) {
          const email = session.customer_details.email;
          const usersSnap = await db
            .collection("users")
            .where("email", "==", email)
            .limit(1)
            .get();
          if (!usersSnap.empty) {
            uid = usersSnap.docs[0].id;
            console.log(`Matched user ${uid} by email ${email} (no metadata)`);
          } else {
            console.warn(`No user found for email ${email} — cannot update plan`);
            break;
          }
        }

        if (!uid) {
          console.warn("No firebaseUID and no customer email — skipping");
          break;
        }

        const userRef = db.collection("users").doc(uid);

        // Determine plan from metadata OR from line items / subscription
        let planId = session.metadata?.planId;

        // If no planId in metadata, try to infer from the subscription or amount
        if (!planId && session.mode === "subscription") {
          const amountTotal = session.amount_total || 0;
          // Map amounts to plans (in cents)
          if (amountTotal <= 0) {
            // $0 checkout (promo code) — check line items description or default
            // Try to get subscription to check the price
            if (session.subscription) {
              try {
                const sub = await stripe.subscriptions.retrieve(
                  session.subscription as string,
                  { expand: ["items.data.price.product"] }
                );
                const productName = ((sub.items.data[0]?.price?.product as Stripe.Product)?.name || "").toLowerCase();
                if (productName.includes("solopreneur")) planId = "solopreneur";
                else if (productName.includes("team hub")) planId = "team";
                else if (productName.includes("business pro") || productName.includes("business suite")) planId = "business_pro";
                else if (productName.includes("business")) planId = "business";
                else if (productName.includes("pro")) planId = "pro";
                else planId = "pro"; // default fallback
              } catch (e) {
                console.error("Error retrieving subscription:", e);
                planId = "pro"; // safe fallback
              }
            } else {
              planId = "pro"; // fallback for $0 without subscription
            }
          } else if (amountTotal === 599) planId = "pro";
          else if (amountTotal === 1499) planId = "business";
          else if (amountTotal === 2999) planId = "business_pro";
          else if (amountTotal === 4900) planId = "solopreneur";
          else if (amountTotal === 14900) planId = "team";
          else if (amountTotal === 46800) planId = "solopreneur"; // annual
          else if (amountTotal === 142800) planId = "team"; // annual
        }

        if (planId) {
          // Subscription purchase
          const limit = PLAN_LIMITS[planId] || 15;
          await userRef.update({
            plan: planId,
            usageLimit: limit,
          });
          console.log(`User ${uid} upgraded to ${planId} (amount: ${session.amount_total})`);
        } else if (session.metadata?.topup) {
          // Top-up purchase
          const packKey = session.metadata.topup;
          const packInfo = TOPUP_PACKS[packKey];
          if (packInfo) {
            await userRef.update({
              usageLimit: admin.firestore.FieldValue.increment(packInfo.credits),
            });

            await db.collection("topup_purchases").add({
              userId: uid,
              pack: packInfo.credits,
              amount: packInfo.amount,
              stripePaymentId: session.id,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`User ${uid} purchased ${packInfo.credits} credit top-up`);
          }
        } else if (session.amount_total === 150000) {
          // Custom Solutions $1,500 setup fee — one-time
          await userRef.update({
            plan: "custom",
            usageLimit: 999999,
            customSetupPaid: true,
          });
          console.log(`User ${uid} purchased Custom Solutions setup`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by Stripe customer ID
        const usersSnap = await db
          .collection("users")
          .where("stripeCustomerId", "==", customerId)
          .limit(1)
          .get();

        if (!usersSnap.empty) {
          const userDoc = usersSnap.docs[0];
          await userDoc.ref.update({
            plan: "free",
            usageLimit: PLAN_LIMITS.free,
          });
          console.log(`User ${userDoc.id} downgraded to free (subscription cancelled)`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  }
);

// ─── 5. Manage Subscription / Billing Portal (Callable) ──────────────────────

export const manageSubscription = functions
  .runWith({ secrets: ["STRIPE_SECRET_KEY"], timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data: any, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "You must be signed in.");
    }

    const uid = context.auth.uid;
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new functions.https.HttpsError("not-found", "User profile not found.");
    }

    const userData = userSnap.data()!;
    if (!userData.stripeCustomerId) {
      throw new functions.https.HttpsError("failed-precondition", "No billing account found. Subscribe to a plan first.");
    }

    const stripe = getStripe(process.env.STRIPE_SECRET_KEY!);
    const origin = "https://novamind-ai-app.netlify.app";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: userData.stripeCustomerId,
      return_url: origin + "/dashboard",
    });

    return { url: portalSession.url };
  }
);
