import { Body, Column, Container, Head, Hr, Html, Preview, Row, Section, Text } from "@react-email/components";
import { EMAIL_CONTACT, EMAIL_SIGN_OFF, EMAIL_STAGES, type EmailStageKey } from "@shared/domain/emails.ts";

export const brand = {
  green: "#0b3d2e",
  greenSoft: "#e9f1ed",
  gold: "#d4a52a",
  goldSoft: "#fbf3dc",
  text: "#1b2a24",
  muted: "#5d6b65",
  white: "#ffffff",
};

const font = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif";

export function EmailLayout({ stage, preview, children }: { stage: EmailStageKey; preview: string; children: React.ReactNode }) {
  const idx = EMAIL_STAGES.findIndex((s) => s.key === stage);
  const current = EMAIL_STAGES[idx];
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f3f5f4", fontFamily: font, margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: brand.white, maxWidth: 600, borderRadius: 10, overflow: "hidden", border: `1px solid #dfe6e2` }}>
          <Section style={{ backgroundColor: brand.green, padding: "22px 32px" }}>
            <Row>
              <Column>
                {/* Logo placeholder: replace with hosted LakeCity logo <Img> once supplied. */}
                <table role="presentation" cellPadding={0} cellSpacing={0}>
                  <tbody>
                    <tr>
                      <td style={{ width: 34, height: 34, border: `2px solid ${brand.gold}`, borderRadius: 6, color: brand.white, fontWeight: 700, fontSize: 13, textAlign: "center", fontFamily: "Georgia, serif" }}>
                        LC
                      </td>
                      <td style={{ paddingLeft: 10, color: brand.white, fontSize: 20, fontWeight: 600, fontFamily: "Georgia, serif" }}>LakeCity</td>
                    </tr>
                  </tbody>
                </table>
              </Column>
              <Column align="right">
                <span style={{ display: "inline-block", backgroundColor: brand.gold, color: brand.green, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Stage {idx + 1} of {EMAIL_STAGES.length} · {current.label}
                </span>
              </Column>
            </Row>
          </Section>

          <Section style={{ padding: "18px 24px 6px" }}>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  {EMAIL_STAGES.map((s, i) => {
                    const done = i < idx;
                    const active = i === idx;
                    return (
                      <td key={s.key} align="center" style={{ width: `${100 / EMAIL_STAGES.length}%`, verticalAlign: "top" }}>
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            lineHeight: "22px",
                            borderRadius: 11,
                            margin: "0 auto",
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor: done ? brand.green : active ? brand.gold : "#e5e9e7",
                            color: done ? brand.white : active ? brand.green : brand.muted,
                          }}
                        >
                          {done ? "✓" : i + 1}
                        </div>
                        <div style={{ fontSize: 9, color: active ? brand.text : brand.muted, fontWeight: active ? 700 : 400, marginTop: 4, lineHeight: "11px" }}>
                          {s.label}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </Section>

          <Section style={{ padding: "8px 32px 4px" }}>
            <Text style={{ margin: "8px 0", display: "inline-block", fontSize: 10, fontWeight: 700, color: "#7a5a07", backgroundColor: brand.goldSoft, border: `1px dashed ${brand.gold}`, padding: "2px 6px", borderRadius: 4 }}>
              PLACEHOLDER COPY · needs QC + approval
            </Text>
            {children}
          </Section>

          <Section style={{ padding: "0 32px 28px" }}>
            <Hr style={{ borderColor: "#e3e9e6", margin: "20px 0" }} />
            <Text style={{ fontSize: 14, color: brand.text, margin: 0 }}>
              Kind regards,
              <br />
              <strong>{EMAIL_SIGN_OFF}</strong>
            </Text>
            <Text style={{ fontSize: 12, color: brand.muted, margin: "12px 0 0" }}>
              Questions? Contact us at <a href={`mailto:${EMAIL_CONTACT}`} style={{ color: brand.green }}>{EMAIL_CONTACT}</a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const h1 = { fontFamily: "Georgia, serif", color: brand.green, fontSize: 24, lineHeight: "30px", margin: "6px 0 12px" };
export const p = { fontSize: 15, lineHeight: "23px", color: brand.text, margin: "0 0 14px" };
export const small = { fontSize: 12, lineHeight: "18px", color: brand.muted, margin: "0 0 12px" };

export function Summary({ rows }: { rows: [string, string][] }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: brand.greenSoft, borderRadius: 8, margin: "6px 0 16px" }}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td style={{ padding: "8px 14px", fontSize: 13, color: brand.muted }}>{k}</td>
            <td style={{ padding: "8px 14px", fontSize: 14, color: brand.text, fontWeight: 600, textAlign: "right" }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CtaButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={{ display: "inline-block", backgroundColor: brand.green, color: brand.white, padding: "12px 22px", borderRadius: 8, fontWeight: 600, fontSize: 14, textDecoration: "none", margin: "4px 0 14px" }}>
      {children}
    </a>
  );
}
