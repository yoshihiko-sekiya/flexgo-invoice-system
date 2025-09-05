-- Phase 3: 請求・承認フロー基本スキーマ
-- 後方互換性あり、ロールバック可能

-- partners: 取引先
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  billing_code text unique,
  email text,
  phone text,
  address text,
  contact_person text,
  payment_terms integer default 30,              -- 支払条件(日)
  closing_day integer default 31,                -- 締め日(1-31, 31=月末)
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS有効化 - partners
alter table partners enable row level security;

-- partners更新日時自動更新
create or replace function update_updated_at_partners()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_partners_updated_at
  before update on partners
  for each row execute function update_updated_at_partners();

-- rate_cards: 単価表（距離/件数/固定費の複合）
create table if not exists rate_cards (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references partners(id) on delete cascade,
  name text not null,
  base_fee integer not null default 0,            -- 固定費(円)
  per_stop integer not null default 0,            -- 件数単価(円)
  per_km integer not null default 0,              -- 距離単価(円)
  overtime_rate numeric default 1.25,             -- 時間外割増(1.25=25%増)
  special_fee integer default 0,                  -- 特殊料金(円)
  tax_rate numeric not null default 0.10,         -- 10%=0.10
  is_default boolean not null default false,
  effective_from date not null default current_date,
  effective_to date,
  memo text,
  created_at timestamptz default now()
);

-- RLS有効化 - rate_cards
alter table rate_cards enable row level security;

-- 取引先毎に1つのデフォルトrate_card制約
create unique index idx_rate_cards_default 
  on rate_cards (partner_id) 
  where is_default = true;

-- invoices: 請求書
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references partners(id) on delete restrict,
  invoice_no text unique,                         -- 連番はアプリ側生成
  period_start date not null,
  period_end date not null,
  currency text not null default 'JPY',
  subtotal integer not null default 0,            -- 税抜合計(円)
  tax integer not null default 0,                 -- 消費税(円)
  total integer not null default 0,               -- 税込合計(円)
  status text not null default 'Draft',           -- Draft/Submitted/Approved/Invoiced/Paid/Rejected
  rate_card_id uuid references rate_cards(id),
  payment_due_date date,
  memo text,
  pdf_url text,                                   -- 生成済みPDF URL
  created_by text,
  approved_by text,
  approved_at timestamptz,
  invoiced_at timestamptz,                        -- 送付日時
  paid_at timestamptz,                            -- 入金確認日時
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS有効化 - invoices
alter table invoices enable row level security;

-- ステータス制約
alter table invoices add constraint chk_status 
  check (status in ('Draft', 'Submitted', 'Approved', 'Invoiced', 'Paid', 'Rejected'));

-- invoices更新日時自動更新
create or replace function update_updated_at_invoices()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_invoices_updated_at
  before update on invoices
  for each row execute function update_updated_at_invoices();

-- invoice_items: 明細（距離・件数など元データ）
create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  delivery_date date,                             -- 配送日
  description text not null,
  quantity numeric not null default 1,            -- 件数 or 距離
  unit text not null default 'stop',              -- stop|km|hour|other
  unit_price integer not null default 0,          -- 単価(円)
  amount integer not null default 0,              -- 小計(円)
  is_overtime boolean default false,              -- 時間外フラグ
  is_special boolean default false,               -- 特殊料金フラグ
  vehicle_no text,                                -- 車両番号
  driver_name text,                               -- ドライバー名
  memo text,
  meta jsonb default '{}'::jsonb,                 -- 柔軟なデータ格納用
  created_at timestamptz default now()
);

-- RLS有効化 - invoice_items
alter table invoice_items enable row level security;

-- 単位制約
alter table invoice_items add constraint chk_unit 
  check (unit in ('stop', 'km', 'hour', 'other'));

-- approvals: 承認イベント
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  approver_role text not null,                    -- field|manager|accounting
  approver_email text not null,
  action text not null,                           -- approve|reject|request_change
  comment text,
  previous_status text,
  new_status text,
  approved_at timestamptz default now()
);

-- RLS有効化 - approvals
alter table approvals enable row level security;

-- 承認アクション制約
alter table approvals add constraint chk_action 
  check (action in ('approve', 'reject', 'request_change'));

-- 承認者ロール制約
alter table approvals add constraint chk_approver_role 
  check (approver_role in ('field', 'manager', 'accounting'));

-- audit_logs: 監査ログ
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  operation text not null,                        -- INSERT|UPDATE|DELETE
  old_values jsonb,
  new_values jsonb,
  changed_by text not null,                       -- ユーザーID/メール
  changed_at timestamptz default now(),
  user_agent text,
  ip_address inet,
  request_id text                                 -- 既存のx-request-id連携
);

-- RLS有効化 - audit_logs
alter table audit_logs enable row level security;

-- 操作制約
alter table audit_logs add constraint chk_operation 
  check (operation in ('INSERT', 'UPDATE', 'DELETE'));

-- インデックス作成
create index idx_partners_active on partners (is_active);
create index idx_partners_billing_code on partners (billing_code);

create index idx_rate_cards_partner_effective 
  on rate_cards (partner_id, effective_from, effective_to);

create index idx_invoices_partner_period 
  on invoices (partner_id, period_start, period_end);
create index idx_invoices_status on invoices (status);
create index idx_invoices_invoice_no on invoices (invoice_no);

create index idx_invoice_items_invoice on invoice_items (invoice_id);
create index idx_invoice_items_date on invoice_items (delivery_date);

create index idx_approvals_invoice on approvals (invoice_id);
create index idx_approvals_approver on approvals (approver_email);

create index idx_audit_logs_table_record 
  on audit_logs (table_name, record_id);
create index idx_audit_logs_changed_at on audit_logs (changed_at);
create index idx_audit_logs_changed_by on audit_logs (changed_by);

-- ビュー: v_invoice_totals (請求書集計)
create or replace view v_invoice_totals as
select 
  i.id,
  i.invoice_no,
  p.name as partner_name,
  p.billing_code,
  i.period_start,
  i.period_end,
  i.status,
  count(ii.id) as item_count,
  sum(ii.quantity) filter (where ii.unit = 'stop') as total_stops,
  sum(ii.quantity) filter (where ii.unit = 'km') as total_km,
  sum(ii.quantity) filter (where ii.unit = 'hour') as total_hours,
  sum(ii.amount) as items_subtotal,
  i.subtotal,
  i.tax,
  i.total,
  i.created_at,
  i.updated_at
from invoices i
join partners p on p.id = i.partner_id
left join invoice_items ii on ii.invoice_id = i.id
group by i.id, p.name, p.billing_code;

-- 関数: fn_compute_invoice_total (請求総額計算)
create or replace function fn_compute_invoice_total(
  p_invoice_id uuid
) returns table (
  subtotal integer,
  tax integer,
  total integer
) language plpgsql as $$
declare
  v_rate_card rate_cards%rowtype;
  v_items_total integer := 0;
  v_base_fee integer := 0;
  v_tax_rate numeric := 0.10;
  v_subtotal integer := 0;
  v_tax integer := 0;
  v_total integer := 0;
begin
  -- 請求書のrate_card取得
  select rc.* into v_rate_card
  from invoices i
  join rate_cards rc on rc.id = i.rate_card_id
  where i.id = p_invoice_id;
  
  if found then
    v_base_fee := v_rate_card.base_fee;
    v_tax_rate := v_rate_card.tax_rate;
  end if;

  -- 明細合計計算
  select 
    coalesce(sum(
      case 
        when ii.unit = 'stop' then ii.quantity * v_rate_card.per_stop
        when ii.unit = 'km' then ii.quantity * v_rate_card.per_km
        else ii.amount
      end
    ), 0) into v_items_total
  from invoice_items ii
  where ii.invoice_id = p_invoice_id;

  -- 税抜合計 = 基本料金 + 明細合計
  v_subtotal := v_base_fee + v_items_total;
  
  -- 消費税計算（円未満切り捨て）
  v_tax := floor(v_subtotal * v_tax_rate);
  
  -- 税込合計
  v_total := v_subtotal + v_tax;

  return query select v_subtotal, v_tax, v_total;
end;
$$;

-- 関数: fn_get_active_rate_card (有効な単価表取得)
create or replace function fn_get_active_rate_card(
  p_partner_id uuid,
  p_date date default current_date
) returns uuid language plpgsql as $$
declare
  v_rate_card_id uuid;
begin
  select id into v_rate_card_id
  from rate_cards
  where partner_id = p_partner_id
    and effective_from <= p_date
    and (effective_to is null or effective_to >= p_date)
    and is_default = true
  limit 1;
  
  if not found then
    -- デフォルトがなければ最新の有効なものを取得
    select id into v_rate_card_id
    from rate_cards
    where partner_id = p_partner_id
      and effective_from <= p_date
      and (effective_to is null or effective_to >= p_date)
    order by effective_from desc
    limit 1;
  end if;

  return v_rate_card_id;
end;
$$;

-- サンプルデータ（テスト用）
insert into partners (name, billing_code, email, phone, closing_day) values
('ABC運輸株式会社', 'ABC001', 'billing@abc-transport.co.jp', '03-1234-5678', 31),
('DEF物流', 'DEF002', 'accounts@def-logistics.com', '06-9876-5432', 20),
('GHI配送サービス', 'GHI003', 'invoice@ghi-delivery.jp', '052-555-1234', 15)
on conflict (billing_code) do nothing;

-- サンプル単価表
insert into rate_cards (partner_id, name, base_fee, per_stop, per_km, tax_rate, is_default)
select p.id, 'デフォルト料金', 10000, 500, 100, 0.10, true
from partners p where p.billing_code = 'ABC001'
on conflict do nothing;

insert into rate_cards (partner_id, name, base_fee, per_stop, per_km, tax_rate, is_default)
select p.id, 'デフォルト料金', 8000, 400, 120, 0.10, true
from partners p where p.billing_code = 'DEF002'
on conflict do nothing;

-- コメント追加
comment on table partners is '取引先マスタ';
comment on table rate_cards is '単価表（距離・件数・固定費の複合料金）';
comment on table invoices is '請求書';
comment on table invoice_items is '請求明細';
comment on table approvals is '承認イベント';
comment on table audit_logs is '監査ログ';

comment on view v_invoice_totals is '請求書集計ビュー';
comment on function fn_compute_invoice_total(uuid) is '請求総額計算関数';
comment on function fn_get_active_rate_card(uuid, date) is '有効な単価表取得関数';