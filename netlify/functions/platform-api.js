exports.handler = async (event) => {
  const H = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };

  const U = process.env.SUPABASE_URL;
  const K = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!U || !K) {
    console.error(
      '[platform-api] Missing Supabase environment variables'
    );

    return {
      statusCode: 500,
      headers: H,
      body: JSON.stringify({
        error: 'Platform backend is not configured.',
        diagnostic:
          'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
      })
    };
  }

  const sf = (path, options = {}) =>
    fetch(U + path, {
      ...options,
      headers: {
        apikey: K,
        Authorization: `Bearer ${K}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(options.headers || {})
      }
    });

  const reply = (statusCode, data) => ({
    statusCode,
    headers: H,
    body: JSON.stringify(data)
  });

  try {
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: H,
        body: ''
      };
    }

    if (event.httpMethod === 'GET') {
      const r = await sf(
        '/rest/v1/platform_settings?id=eq.1&select=*'
      );

      const text = await r.text();

      if (!r.ok) {
        console.error(
          '[platform-api] Settings GET failed:',
          r.status,
          text
        );

        return reply(r.status, {
          error: 'Unable to load platform settings.',
          diagnostic: text
        });
      }

      let data = [];

      try {
        data = text ? JSON.parse(text) : [];
      } catch {
        data = [];
      }

      return reply(200, {
        settings: data[0] || null
      });
    }

    if (event.httpMethod !== 'POST') {
      return reply(405, {
        error: 'Method not allowed'
      });
    }

    let body;

    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return reply(400, {
        error: 'Invalid request body.'
      });
    }

    const action = body.action;

    if (action === 'register') {
      const fullName = String(
        body.full_name || body.fullName || ''
      ).trim();

      const email = String(body.email || '').trim();

      const phone = String(body.phone || '').trim();

      const category = String(
        body.category || ''
      ).trim();

      const townCity = String(
        body.town_city ||
        body.townCity ||
        body.town ||
        ''
      ).trim();

      if (!fullName) {
        return reply(400, {
          error: 'Full name is required.'
        });
      }

      if (!email && !phone) {
        return reply(400, {
          error:
            'Provide at least one email address or phone number.'
        });
      }

      if (!category) {
        return reply(400, {
          error: 'Category is required.'
        });
      }

      const payload = {
        full_name: fullName,
        email: email || null,
        phone: phone || null,
        category,
        town_city: townCity || null
      };

      console.log(
        '[platform-api] Registration attempt',
        {
          hasEmail: Boolean(email),
          hasPhone: Boolean(phone),
          category,
          hasTownCity: Boolean(townCity)
        }
      );

      const r = await sf(
        '/rest/v1/user_profiles',
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      const text = await r.text();

      if (!r.ok) {
        console.error(
          '[platform-api] Registration Supabase error:',
          r.status,
          text
        );

        let diagnostic = text;

        try {
          const parsed = JSON.parse(text);

          diagnostic =
            parsed.message ||
            parsed.details ||
            parsed.hint ||
            text;
        } catch {
          // Keep raw response.
        }

        return reply(500, {
          error:
            'Unable to create your account right now.',
          diagnostic
        });
      }

      let data = [];

      try {
        data = text ? JSON.parse(text) : [];
      } catch {
        data = [];
      }

      return reply(200, {
        ok: true,
        profile: data[0] || null
      });
    }

    if (action === 'tool-usage') {
      const payload = {
        profile_id: body.profile_id || null,
        tool_key: body.tool_key || null,
        tool_name: body.tool_name || null,
        category: body.category || null
      };

      const r = await sf(
        '/rest/v1/tool_usage',
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      const text = await r.text();

      if (!r.ok) {
        console.error(
          '[platform-api] Tool usage error:',
          r.status,
          text
        );

        return reply(500, {
          error: 'Unable to record tool usage.',
          diagnostic: text
        });
      }

      return reply(200, {
        ok: true
      });
    }

    if (action === 'payment-request') {
      const payload = {
        profile_id: body.profile_id || null,
        category: body.category || null,
        sender_number: body.sender_number || null,
        transaction_reference:
          body.transaction_reference || null,
        amount: body.amount || 0,
        status: 'pending'
      };

      const r = await sf(
        '/rest/v1/payment_requests',
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      const text = await r.text();

      if (!r.ok) {
        console.error(
          '[platform-api] Payment request error:',
          r.status,
          text
        );

        return reply(500, {
          error:
            'Unable to submit payment request.',
          diagnostic: text
        });
      }

      return reply(200, {
        ok: true
      });
    }

    return reply(400, {
      error: 'Unknown action.'
    });

  } catch (err) {
    console.error(
      '[platform-api] Unexpected error:',
      err
    );

    return reply(500, {
      error:
        'An unexpected platform error occurred.',
      diagnostic:
        err && err.message
          ? err.message
          : String(err)
    });
  }
};
