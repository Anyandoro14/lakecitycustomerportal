import { Input } from "@/components/ui/input";
import { CountrySelect, Field, NativeSelect } from "@/components/form";
import { IdPhotoInput } from "@/components/IdPhotoInput";
import { ID_TYPE_LABELS, nationalIdRuleFor, type IdType } from "@shared/domain/id-validation.ts";

export interface PersonDraft {
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  idType: IdType | "";
  idIssuingCountry: string;
  idNumber: string;
  idExpiry: string;
  idFront: File | null;
  idBack: File | null;
}

export const emptyPerson = (country = ""): PersonDraft => ({
  fullName: "",
  dateOfBirth: "",
  email: "",
  phone: "",
  idType: "",
  idIssuingCountry: country,
  idNumber: "",
  idExpiry: "",
  idFront: null,
  idBack: null,
});

export type PersonErrors = Partial<Record<keyof PersonDraft, string>>;

interface Props {
  prefix: string;
  value: PersonDraft;
  errors: PersonErrors;
  onChange: (patch: Partial<PersonDraft>) => void;
}

export function PersonFields({ prefix, value, errors, onChange }: Props) {
  const rule = value.idType === "national_id" ? nationalIdRuleFor(value.idIssuingCountry) : undefined;
  const isPassport = value.idType === "passport";
  const idHint = isPassport
    ? "6-9 letters/digits, as printed on the data page."
    : value.idType === "national_id"
      ? rule
        ? `Checked as: ${rule.label}. Example: ${rule.example}. Spaces and hyphens are fine.`
        : value.idIssuingCountry
          ? "4-20 letters/digits. Spaces and hyphens are fine."
          : "Choose the issuing country first."
      : undefined;

  const f = (k: keyof PersonDraft) => `${prefix}-${k}`;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={f("fullName")} label="Full name (as on ID)" error={errors.fullName} className="sm:col-span-2">
        <Input id={f("fullName")} autoComplete="name" value={value.fullName} onChange={(e) => onChange({ fullName: e.target.value })} aria-invalid={!!errors.fullName} />
      </Field>
      <Field id={f("dateOfBirth")} label="Date of birth" error={errors.dateOfBirth}>
        <Input id={f("dateOfBirth")} type="date" autoComplete="bday" value={value.dateOfBirth} onChange={(e) => onChange({ dateOfBirth: e.target.value })} aria-invalid={!!errors.dateOfBirth} />
      </Field>
      <Field id={f("phone")} label="Cell phone" error={errors.phone}>
        <Input id={f("phone")} type="tel" autoComplete="tel" placeholder="+263 77 000 0000" value={value.phone} onChange={(e) => onChange({ phone: e.target.value })} aria-invalid={!!errors.phone} />
      </Field>
      <Field id={f("email")} label="Email" error={errors.email} className="sm:col-span-2">
        <Input id={f("email")} type="email" autoComplete="email" value={value.email} onChange={(e) => onChange({ email: e.target.value })} aria-invalid={!!errors.email} />
      </Field>

      <div className="sm:col-span-2 mt-2 border-t pt-4">
        <p className="text-sm font-semibold">Identity document</p>
        <p className="text-xs text-muted-foreground">
          A government-issued national ID from your country, or a passport. LakeCity staff check every ID by hand.
        </p>
      </div>
      <Field id={f("idType")} label="ID type" error={errors.idType}>
        <NativeSelect id={f("idType")} value={value.idType} invalid={!!errors.idType} onChange={(e) => onChange({ idType: e.target.value as IdType, idBack: null })}>
          <option value="">Select…</option>
          {(Object.keys(ID_TYPE_LABELS) as IdType[]).map((t) => (
            <option key={t} value={t}>{ID_TYPE_LABELS[t]}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={f("idIssuingCountry")} label="Issuing country" error={errors.idIssuingCountry}>
        <CountrySelect id={f("idIssuingCountry")} value={value.idIssuingCountry} invalid={!!errors.idIssuingCountry} onChange={(e) => onChange({ idIssuingCountry: e.target.value })} />
      </Field>
      <Field id={f("idNumber")} label={isPassport ? "Passport number" : "ID number"} error={errors.idNumber} hint={idHint}>
        <Input id={f("idNumber")} autoComplete="off" spellCheck={false} value={value.idNumber} onChange={(e) => onChange({ idNumber: e.target.value })} aria-invalid={!!errors.idNumber} />
      </Field>
      <Field
        id={f("idExpiry")}
        label="Expiry date"
        optional={!isPassport}
        error={errors.idExpiry}
        hint={isPassport ? "Must be in the future." : "Leave blank if your ID has no expiry date."}
      >
        <Input id={f("idExpiry")} type="date" value={value.idExpiry} onChange={(e) => onChange({ idExpiry: e.target.value })} aria-invalid={!!errors.idExpiry} />
      </Field>
      <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
        <IdPhotoInput
          id={f("idFront")}
          label={isPassport ? "Passport photo page" : "Front of ID"}
          hint={isPassport ? "The page with your photo and the two lines of code at the bottom." : undefined}
          value={value.idFront}
          onChange={(file) => onChange({ idFront: file })}
          error={errors.idFront}
        />
        {!isPassport && (
          <IdPhotoInput
            id={f("idBack")}
            label="Back of ID"
            optional
            value={value.idBack}
            onChange={(file) => onChange({ idBack: file })}
            error={errors.idBack}
          />
        )}
      </div>
    </div>
  );
}
