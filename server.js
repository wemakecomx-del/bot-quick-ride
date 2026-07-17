// server.js
// Bot de WhatsApp con MENÚ DE RESPUESTAS AUTOMÁTICAS (sin IA)
// -------------------------------------------------------------
// Ideal para negocios que no quieren gastar en IA: responde con
// botones/lista y texto fijo predefinido. Costo mínimo (solo el
// cobro de Meta por mensaje entregado, ver GUIA-INSTALACION.md).

const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const {
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  VERIFY_TOKEN,
  PORT = 3000,
} = process.env;

// Recuerda qué números ya recibieron el saludo/menú (en memoria)
const yaSaludados = new Set();

// ------------------- MENÚ DE RESPUESTAS AUTOMÁTICAS -------------------
// EDITA ESTO con la información real del negocio de tours/transporte.
// Cada opción: id (único), title (lo que ve el cliente), respuesta (texto fijo).
const MENU_OPCIONES = [
  {
    id: "opt_horarios",
    title: "🕐 Horarios de salida",
    respuesta: "Nuestros horarios de salida León → GDL son: [PON AQUÍ LOS HORARIOS]. Los regresos GDL → León son: [PON AQUÍ LOS HORARIOS].",
  },
  {
    id: "opt_precio",
    title: "💰 Costo del viaje",
    respuesta: "El costo del viaje León → Guadalajara es de $[PON PRECIO] por persona. [Agrega si hay tarifa de ida y vuelta, grupos, etc.]",
  },
  {
    id: "opt_puntos",
    title: "📍 Puntos de salida y llegada",
    respuesta: "Salimos de [PON PUNTO DE SALIDA EN LEÓN] y llegamos a [PON PUNTO DE LLEGADA EN GDL].",
  },
  {
    id: "opt_reservar",
    title: "✅ Reservar mi lugar",
    respuesta: "¡Perfecto! Para apartar tu lugar mándame: tu nombre completo, fecha del viaje y número de pasajeros. En cuanto lo recibamos te confirmamos disponibilidad 🙌",
  },
  {
    id: "opt_pago",
    title: "💳 Formas de pago",
    respuesta: "Aceptamos: [PON AQUÍ TUS FORMAS DE PAGO, ej. efectivo, transferencia]. [Agrega datos bancarios si aplica].",
  },
  {
    id: "opt_asesor",
    title: "🧑‍💼 Hablar con alguien",
    respuesta: "Claro, en breve te contactamos directamente. Mientras tanto puedes llamarnos al [PON TU NÚMERO] si es urgente.",
  },
];

// ------------------- 1) VERIFICACIÓN DEL WEBHOOK -------------------
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("--- Intento de verificación de webhook ---");
  console.log("mode recibido:", mode);
  console.log("token recibido de Meta:", JSON.stringify(token));
  console.log("token guardado en el servidor:", JSON.stringify(VERIFY_TOKEN));
  console.log("¿coinciden?:", token === VERIFY_TOKEN);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado correctamente ✅");
    res.status(200).send(challenge);
  } else {
    console.log("Verificación fallida ❌");
    res.sendStatus(403);
  }
});

// ------------------- 2) RECEPCIÓN DE MENSAJES -------------------
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;

    // --- Cliente tocó una opción del menú ---
    if (message.type === "interactive") {
      const selectedId = message.interactive?.list_reply?.id || message.interactive?.button_reply?.id;
      const opcion = MENU_OPCIONES.find((o) => o.id === selectedId);

      console.log(`🔘 ${from} tocó: ${selectedId}`);

      if (opcion) {
        await sendWhatsAppMessage(from, opcion.respuesta);
      } else {
        await sendWhatsAppMessage(from, "No reconocí esa opción, escribe 'menu' para ver las opciones otra vez.");
      }
      return res.sendStatus(200);
    }

    // --- Mensaje de texto libre ---
    if (message.type !== "text") return res.sendStatus(200);

    const userText = message.text.body.trim().toLowerCase();
    console.log(`📩 Mensaje de ${from}: ${userText}`);

    // Primera vez que escribe -> saludo + menú
    if (!yaSaludados.has(from)) {
      yaSaludados.add(from);
      await sendWhatsAppMessage(from, "¡Hola! 👋 Bienvenido a [NOMBRE DE TU NEGOCIO], transporte y tours León ⇄ Guadalajara. Elige una opción:");
      await sendMenu(from);
      return res.sendStatus(200);
    }

    // Si pide el menú explícitamente
    if (["menu", "menú", "inicio", "hola"].includes(userText)) {
      await sendMenu(from);
      return res.sendStatus(200);
    }

    // Cualquier otro texto libre -> mensaje fijo pidiendo usar el menú
    await sendWhatsAppMessage(
      from,
      "Gracias por tu mensaje 🙌 Para atenderte más rápido, elige una opción del menú:"
    );
    await sendMenu(from);

    res.sendStatus(200);
  } catch (err) {
    console.error("Error procesando el mensaje:", err.response?.data || err.message);
    res.sendStatus(200);
  }
});

// ------------------- FUNCIÓN: enviar el menú interactivo -------------------
async function sendMenu(to) {
  await axios.post(
    `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "Menú de opciones" },
        body: { text: "Toca la opción que necesites 👇" },
        footer: { text: "Escribe 'menu' en cualquier momento para ver esto de nuevo" },
        action: {
          button: "Ver opciones",
          sections: [
            {
              title: "¿Cómo te ayudo?",
              rows: MENU_OPCIONES.map((o) => ({ id: o.id, title: o.title })),
            },
          ],
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "content-type": "application/json",
      },
    }
  );
}

// ------------------- FUNCIÓN: enviar texto simple -------------------
async function sendWhatsAppMessage(to, text) {
  await axios.post(
    `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "content-type": "application/json",
      },
    }
  );
}

app.get("/", (req, res) => {
  res.send("✅ Bot de menú de WhatsApp (sin IA) funcionando correctamente.");
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
