import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { scriptJson } = await req.json();
    let parsed: any;
    try {
      parsed = typeof scriptJson === 'string' ? JSON.parse(scriptJson) : scriptJson;
    } catch (e) {
      return NextResponse.json({
        valid: false,
        error: 'Invalid JSON format. Check syntax and matching braces.'
      }, { status: 400 });
    }

    // Validate required fields according to PRD custom connector spec
    if (!parsed.name || !parsed.loginUrl || !parsed.selectors) {
      return NextResponse.json({
        valid: false,
        error: 'Script missing required properties: "name", "loginUrl", or "selectors".'
      }, { status: 400 });
    }

    const { selectors } = parsed;
    if (!selectors.usernameField || !selectors.passwordField || !selectors.submitButton) {
      return NextResponse.json({
        valid: false,
        error: 'Selectors must include "usernameField", "passwordField", and "submitButton".'
      }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      message: `Connector script for "${parsed.name}" parsed & validated successfully. Embedded Playwright simulation ready.`,
      selectorsMapped: Object.keys(selectors).length,
      actionsSupported: parsed.actionsPermitted || ['publish', 'comment']
    });
  } catch (error: any) {
    return NextResponse.json({ valid: false, error: error.message }, { status: 500 });
  }
}
