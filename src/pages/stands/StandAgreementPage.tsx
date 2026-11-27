import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WizardFrame } from "@/components/stand-sales/WizardFrame";
import { standSalesApi, type ApplicationView } from "@/lib/stand-sales/api";
import { AGREEMENT_STATUS_LABEL } from "@/lib/stand-sales/agreement-labels";
import { AGREEMENT_REVIEW_DOCUMENT_LABEL, AGREEMENT_REVIEW_DOCUMENT_URL, inPersonSigningLine } from "@/lib/stand-sales/office";
import { readStandSession } from "@/lib/stand-sales/session";

const docusignUi = import.meta.env.VITE_ENABLE_DOCUSIGN_EXECUTION === "true";

type Method = "courier" | "in_person";

export default function StandAgreementPage() {
  const { standNumber = "" } = useParams();
  const [application, setApplication] = useState<ApplicationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [method, setMethod] = useState<Method>("courier");
  const [domicilium, setDomicilium] = useState("");
  const [witnesses, setWitnesses] = useState([
    { name: "", idNumber: "" },
    { name: "", idNumber: "" },
  ]);
  const [courier, setCourier] = useState({ recipientName: "", phone: "", address: "", city: "", country: "Zimbabwe", region: "domestic" });
  const [returnTracking, setReturnTracking] = useState("");
  const [returnCourier, setReturnCourier] = useState("");
  const [witnessesConfirmed, setWitnessesConfirmed] = useState(false);

  async function load() {
    const session = readStandSession();
    if (session && session.standNumber === standNumber) {
      const res = await standSalesApi.get(session.applicationId, session.accessToken);
      return res.application;
    }
    const res = await standSalesApi.getForPortal(standNumber);
    return res.application;
  }

  useEffect(() => {
    let cancelled = false;
    load()
      .then((app) => {
        if (!cancelled) setApplication(app);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not open this agreement.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [standNumber]);

  async function refresh() {
    const app = await load();
    setApplication(app);
  }

  function authBody() {
    const session = readStandSession();
    if (session && session.standNumber === standNumber) {
      return { applicationId: session.applicationId, accessToken: session.accessToken, standNumber };
    }
    return { standNumber };
  }

  async function requestAgreement(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await standSalesApi.acknowledgeAgreement({
        ...authBody(),
        accepted,
        executionMethod: method,
        domiciliumAddress: domicilium,
        witnesses,
        courier: method === "courier" ? courier : undefined,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your request.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReturn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await standSalesApi.submitBuyerReturn({
        ...authBody(),
        tracking: returnTracking,
        courierName: returnCourier,
        witnessesConfirmed,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the return tracking.");
    } finally {
      setBusy(false);
    }
  }

  const status = application?.agreementStatus ?? "pending_review";
  const requestOpen = application?.stage === "paid" && (status === "pending_review" || (status === "action_required" && !application.dispatchedAt));
  const returnOpen = application?.executionMethod === "courier"
    && Boolean(application.dispatchedAt)
    && !application.returnSubmittedAt
    && !application.originalReceivedAt
    && (status === "dispatched" || status === "action_required");
  const officeLine = application?.inPersonLine || inPersonSigningLine();

  return (
    <WizardFrame step={5}>
      <div className="mx-auto max-w-lg space-y-4" data-testid="agreement-page">
        <Link to={`/stands/${standNumber}/portal`} className="text-sm text-muted-foreground">Back to portal</Link>
        <h1 className="font-display text-3xl">Agreement of Sale</h1>
        {loading && <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading agreement" />}
        {!loading && error && !application && <p>{error}</p>}
        {!loading && !application && !error && <p>Open this page from your welcome step on this browser, or sign in on the portal step.</p>}
        {application && application.stage !== "paid" && (
          <p>Your payment is not confirmed yet. <Link className="underline" to={`/stands/${standNumber}/pay`}>Check payment status</Link>.</p>
        )}
        {application && application.stage === "paid" && (
          <Card>
            <CardContent className="space-y-4 p-6">
              <Badge data-testid="agreement-status">{AGREEMENT_STATUS_LABEL[status]}</Badge>
              <p>Stand {application.standNumber}. {application.fullName}</p>
              {status === "action_required" && application.actionMessage && <p>{application.actionMessage}</p>}
              <div data-testid="agreement-review">
                <a className="underline" href={application.documentUrl || AGREEMENT_REVIEW_DOCUMENT_URL} target="_blank" rel="noreferrer">
                  {application.documentLabel || AGREEMENT_REVIEW_DOCUMENT_LABEL}
                </a>
                <p className="mt-2 text-sm text-muted-foreground">This is a placeholder for review. It is not your signed Agreement of Sale.</p>
              </div>
              {application.executionMethod === "in_person" && status !== "pending_review" && (
                <p data-testid="in-person-line">{officeLine}</p>
              )}
              {application.dispatchTracking && <p>Pack tracking: {application.dispatchTracking}</p>}
              {application.returnTracking && <p>Return tracking: {application.returnTracking}</p>}
              {status === "countersigned" && <p>LakeCity has countersigned. This step is complete.</p>}
              {docusignUi && (
                <p data-testid="docusign-unavailable">DocuSign is listed but not connected. No envelope will be sent.</p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              {requestOpen && (
                <form onSubmit={requestAgreement} className="space-y-4" data-testid="agreement-choice">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                    I have reviewed the placeholder and I want LakeCity to prepare my Agreement of Sale.
                  </label>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">How will you sign?</legend>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="method" checked={method === "courier"} onChange={() => setMethod("courier")} />
                      Courier the pack to me
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="method" checked={method === "in_person"} onChange={() => setMethod("in_person")} />
                      Sign in person
                    </label>
                  </fieldset>
                  {method === "in_person" && <p data-testid="in-person-choice">{officeLine}</p>}
                  {method === "courier" && (
                    <div className="space-y-3" data-testid="courier-fields">
                      <Field id="recipient" label="Name on the delivery" value={courier.recipientName} onChange={(value) => setCourier({ ...courier, recipientName: value })} />
                      <Field id="courier-phone" label="Phone" value={courier.phone} onChange={(value) => setCourier({ ...courier, phone: value })} />
                      <Field id="courier-address" label="Street address" value={courier.address} onChange={(value) => setCourier({ ...courier, address: value })} />
                      <Field id="courier-city" label="City" value={courier.city} onChange={(value) => setCourier({ ...courier, city: value })} />
                      <Field id="courier-country" label="Country" value={courier.country} onChange={(value) => setCourier({ ...courier, country: value })} />
                      <label className="block space-y-2 text-sm">
                        <span>Where is this address?</span>
                        <select className="flex h-10 w-full rounded-md border bg-background px-3" value={courier.region} onChange={(event) => setCourier({ ...courier, region: event.target.value })}>
                          <option value="domestic">In Zimbabwe</option>
                          <option value="diaspora">Outside Zimbabwe</option>
                        </select>
                      </label>
                    </div>
                  )}
                  <Field id="domicilium" label="Address for notices" value={domicilium} onChange={setDomicilium} />
                  <div className="space-y-3" data-testid="witness-checklist">
                    <p className="text-sm font-medium">Two witnesses</p>
                    {witnesses.map((witness, index) => (
                      <div key={index} className="space-y-2">
                        <Field id={`witness-name-${index}`} label={`Witness ${index + 1} name`} value={witness.name} onChange={(value) => setWitnesses(witnesses.map((item, itemIndex) => itemIndex === index ? { ...item, name: value } : item))} />
                        <Field id={`witness-id-${index}`} label={`Witness ${index + 1} ID or passport`} value={witness.idNumber} onChange={(value) => setWitnesses(witnesses.map((item, itemIndex) => itemIndex === index ? { ...item, idNumber: value } : item))} />
                      </div>
                    ))}
                  </div>
                  <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Request my Agreement of Sale"}</Button>
                </form>
              )}
              {returnOpen && (
                <form onSubmit={submitReturn} className="space-y-4" data-testid="return-tracking">
                  <p className="text-sm">Sign the original with both witnesses, then send it back using the return details in the pack.</p>
                  <Field id="return-courier" label="Courier you used" value={returnCourier} onChange={setReturnCourier} />
                  <Field id="return-tracking" label="Return tracking number" value={returnTracking} onChange={setReturnTracking} />
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={witnessesConfirmed} onChange={(event) => setWitnessesConfirmed(event.target.checked)} />
                    Both witnesses signed the original.
                  </label>
                  <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Submit return tracking"}</Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </WizardFrame>
  );
}

function Field(props: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input id={props.id} value={props.value} onChange={(event) => props.onChange(event.target.value)} required />
    </div>
  );
}
