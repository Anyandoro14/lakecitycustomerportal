import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const COPY: Record<string, { title: string; body: string; retry: boolean }> = {
  approved: { title: "Payment received", body: "Thank you. Your card payment is pending confirmation and will be allocated to your account after bank confirmation.", retry: false },
  declined: { title: "Payment declined", body: "Your bank declined this payment. No money was taken. You can try again with another card.", retry: true },
  trylater: { title: "We couldn't finish your payment", body: "The bank didn't respond in time. If money left your account we'll match it automatically. Otherwise please try again later.", retry: true },
  error: { title: "Something went wrong", body: "We couldn't process this payment. No money was taken. Please try again, or contact Accounts on +263 78 900 6266.", retry: true },
  cancelled: { title: "Payment cancelled", body: "You cancelled the payment. No money was taken.", retry: true },
};

/** /pay/card/:result — approved | declined | trylater | error | cancelled. Display only: the server already verified with AuthoriseInfo. */
export default function PayCardResult() {
  const { result = "error" } = useParams();
  const [q] = useSearchParams();
  const nav = useNavigate();
  const c = COPY[result] ?? COPY.error;
  const ref = q.get("ref");
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 space-y-3" data-testid={`card-result-${result}`}>
        <h1 className="text-xl font-semibold">{c.title}</h1>
        {ref && <p className="text-sm">Reference <strong>{ref}</strong></p>}
        <p className="text-sm text-muted-foreground">{c.body}</p>
        {/* Try again always creates a NEW reference (new idempotency key on the Pay page). */}
        {c.retry && <Button className="w-full" onClick={() => nav("/pay")}>Try again</Button>}
        <Button variant="outline" className="w-full" onClick={() => nav("/index")}>Back to my account</Button>
      </Card>
    </div>
  );
}
