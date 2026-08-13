exports.handler = async (event) => {
  try {
    const key = process.env.GEMINI_API_KEY;
    const { message } = JSON.parse(event.body || "{}");

    if (!key) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Gemini key not found" })
      };
    }

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: "You are Salone Class Room AI for students in Sierra Leone. Give clear, accurate educational answers. Question: " + message
          }]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: data?.error?.message || "Gemini error"
        })
      };
    }

    const answer =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No answer returned";

    return {
      statusCode: 200,
      body: JSON.stringify({ answer })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "AI connection failed" })
    };
  }
};
