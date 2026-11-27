import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { PaymentPanel } from "@/components/stand-sales/PaymentPanel";
import { WizardFrame } from "@/components/stand-sales/WizardFrame";
import { StandSalesApiError, standSalesApi, type ApplicationView, type PaymentView } from "@/lib/stand-sales/api";
import { readStandSession } from "@/lib/stand-sales/session";

const DUE = 225000;

function postToGateway(action: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export default function StandPayPage() {
  const { standNumber = "" } = useParams();
  const navigate = useNavigate();
  const session = readStandSession();
  const [application, setApplication] = useState<ApplicationView | null>(null);
  const [result, setResult] = useState<PaymentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [simulationAllowed, setSimulationAllowed] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const current = readStandSession();
    if (!current || current.standNumber !== standNumber) {
      setLoading(false);
      return;
    }
    standSalesApi.get(current.applicationId, current.accessToken).then((res) => setApplication(res.application)).catch((err) => setError(err instanceof Error ? err.message : "Could not load the application.")).finally(() => setLoading(false));
  }, [standNumber]);

  function show(view: PaymentView) {
    setResult(view);
    if (view.result === "approved") navigate(`/stands/${standNumber}/welcome`, { replace: true });
  }

  async function pay() {
    if (!session) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const started = await standSalesApi.startPayment(session.applicationId, session.accessToken);
      if (started.alreadyApproved && started.outcome) {
        show(started.outcome);
        return;
      }
      setSimulationAllowed(Boolean(started.simulationAllowed));
      setReference(started.reference ?? null);
      if (started.simulationAllowed) return;
      if (started.action && started.fields) postToGateway(started.action, started.fields);
    } catch (err) {
      const apiError = err as StandSalesApiError;
      if (apiError.outcome) setResult(apiError.outcome);
      setError(err instanceof Error ? err.message : "We couldn't start the payment.");
    } finally {
      setBusy(false);
    }
  }

  async function simulate(cardStatus: number | null) {
    if (!session || !reference) {
      setError("Start the payment first, then choose a test bank result.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      show(await standSalesApi.simulatePayment(session.applicationId, session.accessToken, reference, cardStatus));
    } catch (err) {
      const apiError = err as StandSalesApiError;
      if (apiError.outcome) setResult(apiError.outcome);
      setError(err instanceof Error ? err.message : "The test bank result could not be applied.");
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      show(await standSalesApi.checkPayment(session.applicationId, session.accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't check your payment.");
    } finally {
      setBusy(false);
    }
  }

  if (!session || session.standNumber !== standNumber) {
    return (
      <WizardFrame step={2}>
        <p>Start from the stand page so we can match this payment to your reservation.</p>
        <ButtonLink standNumber={standNumber} />
      </WizardFrame>
    );
  }

  return (
    <WizardFrame step={2}>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading payment" /> : (
        <PaymentPanel
          standNumber={standNumber}
          amountCents={DUE}
          paid={application?.stage === "paid"}
          paymentReference={application?.paymentReference}
          result={result}
          error={error}
          busy={busy}
          simulationAllowed={simulationAllowed}
          onPay={() => void pay()}
          onCheck={() => void check()}
          onClear={() => { setResult(null); setError(null); }}
          onSimulate={(status) => void simulate(status)}
        />
      )}
    </WizardFrame>
  );
}

function ButtonLink({ standNumber }: { standNumber: string }) {
  return <Link className="mt-4 inline-block underline" to={`/stands/${standNumber}`}>Back to stand {standNumber}</Link>;
}
