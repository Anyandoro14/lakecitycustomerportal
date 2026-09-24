-- Lake City stand inventory (authoritative land parcel / sales-status register)

CREATE TABLE public.stand_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stand_number TEXT NOT NULL,
  land_use TEXT,
  area_sqm NUMERIC(14, 2),
  phase TEXT,
  rights TEXT,
  status TEXT,
  purchase_price NUMERIC(18, 2),
  agreement_requested TEXT,
  agreement_signed_warwickshire TEXT,
  agreement_signed_by_client TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stand_inventory_stand_number_trimmed CHECK (stand_number = trim(stand_number) AND stand_number <> ''),
  CONSTRAINT stand_inventory_tenant_stand_unique UNIQUE (tenant_id, stand_number)
);

CREATE INDEX idx_stand_inventory_tenant ON public.stand_inventory(tenant_id);
CREATE INDEX idx_stand_inventory_tenant_stand ON public.stand_inventory(tenant_id, stand_number);

CREATE TRIGGER trg_stand_inventory_updated
  BEFORE UPDATE ON public.stand_inventory
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.stand_inventory_buyer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stand_inventory_id UUID NOT NULL REFERENCES public.stand_inventory(id) ON DELETE CASCADE,
  first_name TEXT,
  surname TEXT,
  id_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  allocation TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stand_inventory_buyer_stand ON public.stand_inventory_buyer(stand_inventory_id);

CREATE TRIGGER trg_stand_inventory_buyer_updated
  BEFORE UPDATE ON public.stand_inventory_buyer
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.stand_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stand_inventory_buyer ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal_tenant_select_stand_inventory"
  ON public.stand_inventory FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()) AND tenant_id = public.jwt_tenant_id());

CREATE POLICY "internal_tenant_insert_stand_inventory"
  ON public.stand_inventory FOR INSERT TO authenticated
  WITH CHECK (public.is_internal_user(auth.uid()) AND tenant_id = public.jwt_tenant_id());

CREATE POLICY "internal_tenant_update_stand_inventory"
  ON public.stand_inventory FOR UPDATE TO authenticated
  USING (public.is_internal_user(auth.uid()) AND tenant_id = public.jwt_tenant_id())
  WITH CHECK (public.is_internal_user(auth.uid()) AND tenant_id = public.jwt_tenant_id());

CREATE POLICY "internal_tenant_delete_stand_inventory"
  ON public.stand_inventory FOR DELETE TO authenticated
  USING (public.is_internal_user(auth.uid()) AND tenant_id = public.jwt_tenant_id());

CREATE POLICY "internal_tenant_select_stand_inventory_buyer"
  ON public.stand_inventory_buyer FOR SELECT TO authenticated
  USING (
    public.is_internal_user(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.stand_inventory si
      WHERE si.id = stand_inventory_id AND si.tenant_id = public.jwt_tenant_id()
    )
  );

CREATE POLICY "internal_tenant_insert_stand_inventory_buyer"
  ON public.stand_inventory_buyer FOR INSERT TO authenticated
  WITH CHECK (
    public.is_internal_user(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.stand_inventory si
      WHERE si.id = stand_inventory_id AND si.tenant_id = public.jwt_tenant_id()
    )
  );

CREATE POLICY "internal_tenant_update_stand_inventory_buyer"
  ON public.stand_inventory_buyer FOR UPDATE TO authenticated
  USING (
    public.is_internal_user(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.stand_inventory si
      WHERE si.id = stand_inventory_id AND si.tenant_id = public.jwt_tenant_id()
    )
  )
  WITH CHECK (
    public.is_internal_user(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.stand_inventory si
      WHERE si.id = stand_inventory_id AND si.tenant_id = public.jwt_tenant_id()
    )
  );

CREATE POLICY "internal_tenant_delete_stand_inventory_buyer"
  ON public.stand_inventory_buyer FOR DELETE TO authenticated
  USING (
    public.is_internal_user(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.stand_inventory si
      WHERE si.id = stand_inventory_id AND si.tenant_id = public.jwt_tenant_id()
    )
  );
