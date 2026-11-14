import { useId, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";

import Dialog from "../ui/Dialog";
import Notice from "../ui/Notice";
import { buttonPrimary, buttonSecondary, inputClass } from "../ui/styles";
import Field from "../stock/Field";
import { formatCurrency, getErrorMessage } from "../stock/format";
import { createAdminService, updateAdminService } from "../../lib/adminApi";
import type { ManagedService } from "../../types/admin";

// Same limits as the server (services_routes.ServiceCreate).
const NAME_MAX = 80;
const DESCRIPTION_MAX = 300;

/** Price: 0 or more, up to 7 whole digits and 2 decimals. A free service is allowed. */
function parseServicePrice(value: string): string | null {
  const trimmed = value.trim();
  return /^\d{1,7}(\.\d{1,2})?$/.test(trimmed) ? trimmed : null;
}

function parseServiceCost(value: string): string | null {
  const trimmed = value.trim();
  return /^\d{1,7}(\.\d{1,4})?$/.test(trimmed) ? trimmed : null;
}

type Props = {
  /** null creates a service; otherwise the service being edited. */
  service: ManagedService | null;
  onClose: () => void;
  onSaved: (message: string) => void;
};

export default function ServiceFormDialog({ service, onClose, onSaved }: Props) {
  const ids = useId();
  const editing = service !== null;

  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [price, setPrice] = useState(service ? service.price.toFixed(2) : "");
  const [cost, setCost] = useState(service?.estimated_cost != null ? String(service.estimated_cost) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const parsedPrice = parseServicePrice(price);
  const parsedCost = cost.trim() === "" ? null : parseServiceCost(cost);
  const costInvalid = cost.trim() !== "" && parsedCost === null;

  const margin =
    parsedPrice !== null && parsedCost !== null && Number(parsedPrice) > 0
      ? ((Number(parsedPrice) - Number(parsedCost)) / Number(parsedPrice)) * 100
      : null;

  const priceChanged = editing && parsedPrice !== null && Number(parsedPrice) !== service.price;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    if (!name.trim()) return setError("Enter a service name.");
    if (parsedPrice === null) return setError("Enter a price of 0 or more with at most 2 decimals (for example 150.00).");
    if (costInvalid) return setError("Enter the estimated cost as a number with at most 4 decimals, or leave it blank.");

    setBusy(true);
    setError("");

    const body = {
      name: name.trim(),
      description: description.trim(),
      price: parsedPrice,
      estimated_cost: parsedCost,
    };

    try {
      if (editing) {
        await updateAdminService(service.id, body);
        onSaved(`${body.name} was updated.${priceChanged ? " Past sales keep the price they were sold at." : ""}`);
      } else {
        await createAdminService(body);
        onSaved(`${body.name} was added.`);
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
      setBusy(false);
    }
  };

  return (
    <Dialog
      onClose={onClose}
      dismissible={!busy}
      labelledBy={`${ids}-title`}
      title={editing ? `Edit ${service.name}` : "Add a service"}
      description={
        editing
          ? "Changes apply to new sales only. Every change is recorded in activity history."
          : "Services are priced per job and can be added to any sale."
      }
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={buttonSecondary}>
            Cancel
          </button>
          <button type="submit" form={`${ids}-form`} disabled={busy} className={buttonPrimary}>
            {busy && <RefreshCw size={14} aria-hidden="true" className="animate-spin" />}
            {editing ? "Save changes" : "Add service"}
          </button>
        </>
      }
    >
      <form id={`${ids}-form`} onSubmit={submit} className="space-y-4" noValidate>
        {error && <Notice tone="danger" role="alert" title={error} />}

        <Field id={`${ids}-name`} label="Name" hint={`${name.length}/${NAME_MAX}`}>
          <input
            id={`${ids}-name`}
            className={inputClass}
            value={name}
            maxLength={NAME_MAX}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Engine Oil Change (Labor)"
          />
        </Field>

        <Field id={`${ids}-description`} label="Description" hint={`Optional. ${description.length}/${DESCRIPTION_MAX}`}>
          <textarea
            id={`${ids}-description`}
            className={`${inputClass} resize-none`}
            rows={3}
            value={description}
            maxLength={DESCRIPTION_MAX}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field id={`${ids}-price`} label="Price (₱)" hint={priceChanged ? "Price change is logged." : undefined}>
            <input
              id={`${ids}-price`}
              className={inputClass}
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="0.00"
            />
          </Field>

          <Field
            id={`${ids}-cost`}
            label="Estimated cost (₱)"
            hint={
              costInvalid
                ? "Not a valid amount."
                : margin !== null
                  ? `Margin ${margin.toFixed(0)}% (${formatCurrency(Number(parsedPrice) - Number(parsedCost))} per job)`
                  : "Optional. Labor and materials, for margin reports."
            }
          >
            <input
              id={`${ids}-cost`}
              className={inputClass}
              inputMode="decimal"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
